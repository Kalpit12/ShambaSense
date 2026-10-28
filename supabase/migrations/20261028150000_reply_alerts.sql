-- Reply alerts (architecture.md §10). The farmer's phone gets a notification when an agronomist
-- answers a case or asks for another photo, and at 08:00 Nairobi time on the day a follow-up photo
-- is due. Alerts go through Expo's push service; pg_net sends them after the transaction commits, so
-- a slow or failed send never holds up a review.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
end $$;

-- One row per phone. A token moves to whoever signs in on that phone last.
create table public.push_tokens (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[^\]]+\]$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'android' check (platform in ('android', 'ios')),
  language text not null default 'sw' check (language in ('en', 'sw')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_tokens_user_id_idx on public.push_tokens (user_id);
-- No client reads or writes the table; the two functions below do.
alter table public.push_tokens enable row level security;

create function public.register_push_token(p_token text, p_platform text, p_language text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  insert into public.push_tokens (token, user_id, platform, language)
  values (p_token, auth.uid(), case when p_platform = 'ios' then 'ios' else 'android' end, case when p_language = 'en' then 'en' else 'sw' end)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, language = excluded.language, last_seen_at = now();
end $$;

-- Signing out stops alerts on that phone.
create function public.forget_push_token(p_token text) returns void
language sql volatile security definer set search_path = '' as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

-- Sends one alert to every phone of a user, in the language each phone uses. Internal only.
create function public.send_push(p_user uuid, p_title jsonb, p_body jsonb, p_data jsonb) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', p_title ->> t.language,
    'body', p_body ->> t.language,
    'data', p_data,
    'sound', 'default',
    'channelId', 'replies',
    'priority', 'high'))
  into msgs
  from public.push_tokens t where t.user_id = p_user;
  if msgs is null then return 0; end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := msgs,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  );
  return jsonb_array_length(msgs);
exception when others then
  -- No pg_net, or the queue refused it: the farmer still sees the answer next time the app syncs.
  raise warning 'push not sent: %', sqlerrm;
  return 0;
end $$;

create function public.crop_word(p_crop text, p_lang text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(
    case p_lang
      when 'sw' then ('{"tomatoes":"nyanya","maize":"mahindi","beans":"maharagwe","kale":"sukuma wiki","potatoes":"viazi","cabbage":"kabichi"}'::jsonb) ->> p_crop
      else ('{"tomatoes":"tomato","maize":"maize","beans":"bean","kale":"sukuma wiki","potatoes":"potato","cabbage":"cabbage"}'::jsonb) ->> p_crop
    end,
    p_crop)
$$;

-- An agronomist's answer or photo request on a case: tell the farmer.
create function public.alert_farmer_on_reply() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  farmer uuid;
  check_id uuid;
  crop text;
  excerpt text := left(regexp_replace(coalesce(new.body, ''), '\s+', ' ', 'g'), 120);
begin
  if new.actor_kind <> 'agronomist' or new.kind not in ('review_agree', 'review_adjust', 'review_reject', 'request_photos') then
    return new;
  end if;
  select f.owner_id, i.origin_check_id, c.crop_claimed into farmer, check_id, crop
  from public.issues i join public.farms f on f.id = i.farm_id left join public.crop_checks c on c.id = i.origin_check_id
  where i.id = new.issue_id;
  if farmer is null then return new; end if;

  if new.kind = 'request_photos' then
    perform public.send_push(farmer,
      jsonb_build_object('en', 'Your agronomist needs another photo', 'sw', 'Mtaalamu anahitaji picha nyingine'),
      jsonb_build_object('en', 'About your ' || public.crop_word(crop, 'en') || ' check: ' || excerpt,
                         'sw', 'Kuhusu ukaguzi wako wa ' || public.crop_word(crop, 'sw') || ': ' || excerpt),
      jsonb_build_object('checkId', check_id, 'kind', 'request_photos'));
  else
    perform public.send_push(farmer,
      jsonb_build_object('en', 'Your agronomist replied', 'sw', 'Mtaalamu amekujibu'),
      jsonb_build_object('en', 'About your ' || public.crop_word(crop, 'en') || ' check: ' || excerpt,
                         'sw', 'Kuhusu ukaguzi wako wa ' || public.crop_word(crop, 'sw') || ': ' || excerpt),
      jsonb_build_object('checkId', check_id, 'kind', 'reply'));
  end if;
  return new;
end $$;

create trigger alert_farmer_on_reply after insert on public.issue_events
  for each row execute function public.alert_farmer_on_reply();

-- Every morning: farmers whose follow-up photo is due today. Returns how many alerts went out.
create function public.send_follow_up_reminders() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select f.owner_id, i.origin_check_id, c.crop_claimed
    from public.issues i
    join public.farms f on f.id = i.farm_id
    left join public.crop_checks c on c.id = i.origin_check_id
    where i.follow_up_due_on = (now() at time zone 'Africa/Nairobi')::date
      and i.status in ('action_given', 'monitoring', 'waiting_farmer')
  loop
    n := n + public.send_push(r.owner_id,
      jsonb_build_object('en', 'Time for a follow-up photo', 'sw', 'Ni wakati wa picha ya ufuatiliaji'),
      jsonb_build_object('en', 'Take a new photo of the same ' || public.crop_word(r.crop_claimed, 'en') || ' plants so your agronomist can see if they are getting better.',
                         'sw', 'Piga picha mpya ya mimea ile ile ya ' || public.crop_word(r.crop_claimed, 'sw') || ' ili mtaalamu aone kama inaendelea vizuri.'),
      jsonb_build_object('checkId', r.origin_check_id, 'kind', 'follow_up_due'));
  end loop;
  return n;
end $$;

revoke execute on function public.send_push(uuid, jsonb, jsonb, jsonb), public.alert_farmer_on_reply(),
  public.send_follow_up_reminders() from public, anon, authenticated;
revoke execute on function public.register_push_token(text, text, text), public.forget_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text, text), public.forget_push_token(text) to authenticated;

-- 05:00 UTC is 08:00 in Nairobi.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('follow-up-reminders', '0 5 * * *', 'select public.send_follow_up_reminders()');
  end if;
end $$;

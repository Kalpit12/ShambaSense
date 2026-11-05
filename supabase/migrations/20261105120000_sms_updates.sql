-- SMS case updates (architecture.md §10, Phase 4). A farmer who turns them on in Profile gets a short
-- text in their language when an agronomist answers a case, asks for another photo, or a follow-up
-- photo is due. It reaches farmers who are out of data, where a push alert never arrives.
--
-- Messages wait in `sms_outbox`. The `send-updates` Edge Function sends them through Africa's
-- Talking, the same account as sign-in codes, and Africa's Talking reports back whether each one was
-- delivered. Nothing goes out until that function is deployed and scheduled (supabase/README.md).

create table public.sms_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  phone text not null check (phone ~ '^\+[0-9]{9,15}$'),
  kind text not null check (kind in ('reply', 'request_photos', 'follow_up_due')),
  issue_id uuid references public.issues (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 160),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'expired', 'skipped')),
  -- No texts at night: a reply saved after 21:00 Nairobi time waits until 07:00.
  send_after timestamptz not null default now(),
  attempts int not null default 0,
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);
create index sms_outbox_due_idx on public.sms_outbox (send_after) where status = 'queued';
create index sms_outbox_user_idx on public.sms_outbox (user_id, created_at desc);
create index sms_outbox_issue_id_idx on public.sms_outbox (issue_id);
create unique index sms_outbox_provider_id_idx on public.sms_outbox (provider_id) where provider_id is not null;
-- Only the sender (service role) reads or writes the outbox. Farmers see their own texts' status.
alter table public.sms_outbox enable row level security;
create policy "farmer reads own texts" on public.sms_outbox for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.sms_outbox from anon, authenticated;

-- One switch to stop all SMS updates, for example if the SMS budget runs out. Each text costs about
-- KES 1, and no farmer gets more than three a day.
insert into public.feature_flags (key, enabled) values ('sms_updates', true) on conflict (key) do nothing;

-- Plain ASCII keeps a text to one 160-character GSM message.
create function public.sms_text(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(
    translate(coalesce(p, ''), '‘’“”–—', '''''""--'),
    '\s+', ' ', 'g'), '[^ -~]', '', 'g'), ' {2,}', ' ', 'g'))
$$;

-- When a text queued now may go out: straight away by day, 07:00 Nairobi time by night.
create function public.sms_send_after(p_at timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  select case
    when extract(hour from p_at at time zone 'Africa/Nairobi') >= 21
      then ((p_at at time zone 'Africa/Nairobi')::date + 1 + time '07:00') at time zone 'Africa/Nairobi'
    when extract(hour from p_at at time zone 'Africa/Nairobi') < 7
      then ((p_at at time zone 'Africa/Nairobi')::date + time '07:00') at time zone 'Africa/Nairobi'
    else p_at
  end
$$;

-- Queues one text for a farmer who asked for them, in the farmer's language. `p_detail` is the
-- agronomist's words, cut to fit. Returns whether a text was queued. Internal only.
create function public.queue_sms(p_user uuid, p_kind text, p_issue uuid, p_lead jsonb, p_detail text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  lang text;
  phone text;
  lead text;
  detail text := public.sms_text(p_detail);
  msg text;
  today_count int;
begin
  if not coalesce((select enabled from public.feature_flags where key = 'sms_updates'), false) then return false; end if;
  select p.language, u.phone into lang, phone
  from public.profiles p join auth.users u on u.id = p.user_id
  where p.user_id = p_user and p.sms_updates_opt_in;
  if phone is null or btrim(phone) = '' then return false; end if;
  phone := '+' || ltrim(btrim(phone), '+');
  if phone !~ '^\+[0-9]{9,15}$' then return false; end if;

  -- A cap per Nairobi day, so a busy case cannot run up the bill.
  select count(*) into today_count from public.sms_outbox o
  where o.user_id = p_user and o.status <> 'skipped'
    and (o.created_at at time zone 'Africa/Nairobi')::date = (now() at time zone 'Africa/Nairobi')::date;
  if today_count >= 3 then return false; end if;
  -- One follow-up reminder per case.
  if p_kind = 'follow_up_due' and exists (
    select 1 from public.sms_outbox o where o.issue_id = p_issue and o.kind = 'follow_up_due' and o.status <> 'skipped') then
    return false;
  end if;

  lead := 'ShambaSense: ' || public.sms_text(p_lead ->> lang);
  if detail = '' then
    msg := lead;
  elsif char_length(lead) + 3 + char_length(detail) <= 160 then
    msg := lead || ' "' || detail || '"';
  else
    msg := lead || ' "' || rtrim(left(detail, 160 - char_length(lead) - 6)) || '..."';
  end if;
  insert into public.sms_outbox (user_id, phone, kind, issue_id, body, send_after)
  values (p_user, phone, p_kind, p_issue, left(msg, 160), public.sms_send_after(now()));
  return true;
end $$;

-- An agronomist's answer or photo request on a case: text the farmer too.
create function public.sms_farmer_on_reply() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  farmer uuid;
  crop text;
begin
  if new.actor_kind <> 'agronomist' or new.kind not in ('review_agree', 'review_adjust', 'review_reject', 'request_photos') then
    return new;
  end if;
  select f.owner_id, c.crop_claimed into farmer, crop
  from public.issues i join public.farms f on f.id = i.farm_id left join public.crop_checks c on c.id = i.origin_check_id
  where i.id = new.issue_id;
  if farmer is null then return new; end if;
  if new.kind = 'request_photos' then
    perform public.queue_sms(farmer, 'request_photos', new.issue_id,
      jsonb_build_object(
        'en', 'Your agronomist needs another photo of your ' || public.crop_word(crop, 'en') || '. Open the app to send it.',
        'sw', 'Mtaalamu anahitaji picha nyingine ya ' || public.crop_word(crop, 'sw') || '. Fungua programu kuituma.'),
      new.body);
  else
    perform public.queue_sms(farmer, 'reply', new.issue_id,
      jsonb_build_object(
        'en', 'Your agronomist answered your ' || public.crop_word(crop, 'en') || ' check.',
        'sw', 'Mtaalamu amejibu ukaguzi wako wa ' || public.crop_word(crop, 'sw') || '.'),
      new.body);
  end if;
  return new;
exception when others then
  -- A text that cannot be queued must never stop the review being saved.
  raise warning 'sms not queued: %', sqlerrm;
  return new;
end $$;

create trigger sms_farmer_on_reply after insert on public.issue_events
  for each row execute function public.sms_farmer_on_reply();

-- Every morning, after the push reminders: text farmers whose follow-up photo is due today.
create function public.queue_follow_up_sms() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select i.id, f.owner_id, c.crop_claimed
    from public.issues i
    join public.farms f on f.id = i.farm_id
    left join public.crop_checks c on c.id = i.origin_check_id
    where i.follow_up_due_on = (now() at time zone 'Africa/Nairobi')::date
      and i.status in ('action_given', 'monitoring', 'waiting_farmer')
  loop
    if public.queue_sms(r.owner_id, 'follow_up_due', r.id,
      jsonb_build_object(
        'en', 'Time for a follow-up photo. Take a new photo of the same ' || public.crop_word(r.crop_claimed, 'en') || ' plants in the app.',
        'sw', 'Ni wakati wa picha ya ufuatiliaji. Piga picha mpya ya mimea ile ile ya ' || public.crop_word(r.crop_claimed, 'sw') || ' kwenye programu.'),
      null) then
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- The farmer's switch in Profile. Keeps a consent record (Data Protection Act) and the language the
-- texts are written in. Returns the new setting.
create function public.set_sms_updates(p_on boolean, p_language text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  update public.profiles
  set sms_updates_opt_in = p_on,
      language = case when p_language in ('en', 'sw') then p_language else language end,
      updated_at = now()
  where user_id = auth.uid();
  if not found then raise exception 'no profile'; end if;
  if p_on then
    if not exists (select 1 from public.consents where user_id = auth.uid() and kind = 'sms_updates' and withdrawn_at is null) then
      insert into public.consents (user_id, kind, version) values (auth.uid(), 'sms_updates', '2026-11');
    end if;
  else
    update public.consents set withdrawn_at = now() where user_id = auth.uid() and kind = 'sms_updates' and withdrawn_at is null;
    -- Texts still waiting are not sent.
    update public.sms_outbox set status = 'skipped', updated_at = now() where user_id = auth.uid() and status = 'queued';
  end if;
  return p_on;
end $$;

create function public.my_sms_updates() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select sms_updates_opt_in from public.profiles where user_id = auth.uid()), false)
$$;

-- The sender takes a batch of due texts and marks them as being sent, so two runs never send one
-- text twice. Texts older than a day are dropped: a late answer is in the app by then.
create function public.claim_sms_batch(p_limit int default 50) returns setof public.sms_outbox
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.sms_outbox set status = 'expired', updated_at = now()
  where status = 'queued' and created_at < now() - interval '24 hours';
  -- A run that died mid-send leaves rows in 'sending'; retry them after ten minutes.
  update public.sms_outbox set status = 'queued', updated_at = now()
  where status = 'sending' and updated_at < now() - interval '10 minutes' and attempts < 3;
  return query
  update public.sms_outbox o set status = 'sending', attempts = o.attempts + 1, updated_at = now()
  where o.id in (
    select id from public.sms_outbox
    where status = 'queued' and send_after <= now()
    order by send_after
    limit greatest(1, least(p_limit, 200))
    for update skip locked)
  returning o.*;
end $$;

-- Results from the sender and from Africa's Talking delivery reports.
create function public.mark_sms(p_id uuid, p_status text, p_provider_id text, p_error text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_status not in ('queued', 'sent', 'failed') then raise exception 'bad status'; end if;
  update public.sms_outbox set
    status = case when p_status = 'queued' and attempts >= 3 then 'failed' else p_status end,
    provider_id = coalesce(p_provider_id, provider_id),
    error = left(p_error, 300),
    sent_at = case when p_status = 'sent' then now() else sent_at end,
    send_after = case when p_status = 'queued' then now() + interval '5 minutes' else send_after end,
    updated_at = now()
  where id = p_id;
end $$;

create function public.sms_delivery_report(p_provider_id text, p_status text, p_reason text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.sms_outbox set
    status = case when p_status = 'Success' then 'delivered'
                  when p_status in ('Failed', 'Rejected') then 'failed'
                  else status end,
    error = case when p_status in ('Failed', 'Rejected') then left(coalesce(p_reason, p_status), 300) else error end,
    updated_at = now()
  where provider_id = p_provider_id;
  return found;
end $$;

revoke execute on function public.queue_sms(uuid, text, uuid, jsonb, text), public.sms_farmer_on_reply(),
  public.queue_follow_up_sms(), public.claim_sms_batch(int), public.mark_sms(uuid, text, text, text),
  public.sms_delivery_report(text, text, text) from public, anon, authenticated;
grant execute on function public.claim_sms_batch(int), public.mark_sms(uuid, text, text, text),
  public.sms_delivery_report(text, text, text) to service_role;
revoke execute on function public.set_sms_updates(boolean, text), public.my_sms_updates() from public, anon;
grant execute on function public.set_sms_updates(boolean, text), public.my_sms_updates() to authenticated;

-- 05:00 UTC is 08:00 in Nairobi, the same time as the push reminders.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('follow-up-sms', '0 5 * * *', 'select public.queue_follow_up_sms()');
  end if;
end $$;

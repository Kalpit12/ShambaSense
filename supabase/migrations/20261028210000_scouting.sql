-- Scouting rounds (design.md §10 "Scouting / Tasks"). A team member walks a plot, checks a number of
-- plants, and counts how many show each pest or disease. The dashboard adds these up by ward so an
-- outbreak shows before farmers start sending crop checks about it.
-- Reports belong to the co-op. Farmers do not read them; the team writes them through save_scouting.

create table public.scouting_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  farmer_id uuid not null references auth.users (id) on delete cascade,
  plot_id uuid references public.plots (id) on delete set null,
  -- The visit this round was part of, if any.
  task_id uuid references public.tasks (id) on delete set null,
  crop text not null check (crop in ('tomatoes', 'maize', 'beans', 'kale', 'potatoes', 'cabbage')),
  observed_on date not null,
  plants_checked integer not null check (plants_checked between 1 and 1000),
  note text check (note is null or char_length(note) <= 1000),
  scout_id uuid references auth.users (id) on delete set null,
  scout_name text,
  created_at timestamptz not null default now()
);

create table public.scouting_findings (
  report_id uuid not null references public.scouting_reports (id) on delete cascade,
  cause_id text not null references public.causes (id),
  plants_affected integer not null check (plants_affected >= 1),
  severity text not null check (severity in ('low', 'medium', 'high')),
  primary key (report_id, cause_id)
);

create index scouting_org_day on public.scouting_reports (org_id, observed_on desc);

alter table public.scouting_reports enable row level security;
alter table public.scouting_findings enable row level security;

create policy "members read scouting" on public.scouting_reports for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy "members read findings" on public.scouting_findings for select to authenticated
  using (exists (select 1 from public.scouting_reports r where r.id = report_id and r.org_id in (select public.my_org_ids())));

-- Logs one round. p_findings is a list of {cause_id, plants_affected, severity}; an empty list means
-- the plants looked healthy. With p_task, the visit it belongs to is marked done with a summary.
create function public.save_scouting(
  p_org uuid, p_farmer uuid, p_plot uuid, p_crop text, p_observed_on date,
  p_plants_checked integer, p_note text, p_findings jsonb, p_task uuid
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
  v_name text;
  f jsonb;
  v_summary text;
begin
  perform public.task_writer(p_org);
  if not exists (select 1 from public.org_farmer_links where org_id = p_org and farmer_id = p_farmer and status = 'active') then
    raise exception 'farmer_not_linked' using errcode = '42501';
  end if;
  if p_plot is not null and not exists (
    select 1 from public.plots pl join public.farms fa on fa.id = pl.farm_id where pl.id = p_plot and fa.owner_id = p_farmer) then
    raise exception 'plot is not this farmer''s' using errcode = '22023';
  end if;
  if p_observed_on is null or p_observed_on > (now() at time zone 'Africa/Nairobi')::date + 1 then
    raise exception 'bad_date' using errcode = '22023';
  end if;
  if p_task is not null and not exists (
    select 1 from public.tasks where id = p_task and org_id = p_org and farmer_id = p_farmer and kind = 'visit') then
    raise exception 'visit is not this farmer''s' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_findings, '[]'::jsonb)) <> 'array' then raise exception 'bad findings' using errcode = '22023'; end if;
  select display_name into v_name from public.org_members where org_id = p_org and user_id = auth.uid();

  insert into public.scouting_reports (org_id, farmer_id, plot_id, task_id, crop, observed_on, plants_checked, note, scout_id, scout_name)
  values (p_org, p_farmer, p_plot, p_task, p_crop, p_observed_on, p_plants_checked, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), v_name)
  returning id into v_id;

  for f in select * from jsonb_array_elements(coalesce(p_findings, '[]'::jsonb)) loop
    if (f ->> 'plants_affected')::int > p_plants_checked then
      raise exception 'more_affected_than_checked' using errcode = '22023';
    end if;
    insert into public.scouting_findings (report_id, cause_id, plants_affected, severity)
    values (v_id, f ->> 'cause_id', (f ->> 'plants_affected')::int, f ->> 'severity');
  end loop;

  if p_task is not null then
    select coalesce(string_agg(c.name_en || ' ' || sf.plants_affected || '/' || p_plants_checked, ', ' order by sf.plants_affected desc), 'No pests or disease found')
      into v_summary
      from public.scouting_findings sf join public.causes c on c.id = sf.cause_id where sf.report_id = v_id;
    v_summary := 'Scouted ' || p_plants_checked || ' plants: ' || v_summary || '.' || coalesce(' ' || nullif(btrim(coalesce(p_note, '')), ''), '');
    update public.tasks set status = 'done', done_at = coalesce(done_at, now()), done_by = coalesce(done_by, 'team'),
      outcome = left(v_summary, 1000)
      where id = p_task and status not in ('done', 'cancelled');
  end if;

  insert into public.audit_log (actor_id, org_id, action, target_table, target_id)
    values (auth.uid(), p_org, 'scouting_log', 'scouting_reports', v_id);
  return v_id;
end $$;

-- The person who logged a round, or an admin, can remove it (a wrong farm, a test entry).
create function public.delete_scouting(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare r public.scouting_reports;
begin
  select * into r from public.scouting_reports where id = p_id;
  if not found then raise exception 'report not found' using errcode = 'P0002'; end if;
  if r.scout_id is distinct from auth.uid() and not public.is_org_admin(r.org_id) then
    raise exception 'only the scout or an admin removes a report' using errcode = '42501';
  end if;
  delete from public.scouting_reports where id = p_id;
  insert into public.audit_log (actor_id, org_id, action, target_table, target_id)
    values (auth.uid(), r.org_id, 'scouting_delete', 'scouting_reports', p_id);
end $$;

-- The Scouting page: rounds since a day, with the farmer, ward, plot and findings.
create function public.org_scouting(p_org uuid, p_since date)
returns table (
  id uuid, farmer_id uuid, farmer_name text, ward text, plot_id uuid, plot_name text, task_id uuid, crop text,
  observed_on date, plants_checked integer, note text, scout_id uuid, scout_name text, created_at timestamptz, findings jsonb
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.farmer_id, coalesce(p.display_name, 'Farmer'), coalesce(nullif(p.ward, ''), fa.ward, 'Ward not set'),
    r.plot_id, pl.name, r.task_id, r.crop, r.observed_on, r.plants_checked, r.note, r.scout_id, r.scout_name, r.created_at,
    coalesce((select jsonb_agg(jsonb_build_object('cause_id', sf.cause_id, 'plants_affected', sf.plants_affected, 'severity', sf.severity)
      order by sf.plants_affected desc) from public.scouting_findings sf where sf.report_id = r.id), '[]'::jsonb)
  from public.scouting_reports r
  left join public.profiles p on p.user_id = r.farmer_id
  left join lateral (select ff.ward from public.farms ff where ff.owner_id = r.farmer_id order by ff.created_at limit 1) fa on true
  left join public.plots pl on pl.id = r.plot_id
  where r.org_id = p_org and public.member_role(p_org) is not null and r.observed_on >= coalesce(p_since, '-infinity'::date)
  order by r.observed_on desc, r.created_at desc
  limit 2000
$$;

revoke execute on function public.save_scouting(uuid, uuid, uuid, text, date, integer, text, jsonb, uuid), public.delete_scouting(uuid),
  public.org_scouting(uuid, date) from public, anon;
grant execute on function public.save_scouting(uuid, uuid, uuid, text, date, integer, text, jsonb, uuid), public.delete_scouting(uuid),
  public.org_scouting(uuid, date) to authenticated;

-- Demo: two weeks of rounds on Juma's farm, so the page has something to show.
do $$
declare
  juma uuid := (select id from auth.users where email = 'farmer.254712345678@example.com');
  wanjiru uuid := (select id from auth.users where email = 'agronomist.demo@example.com');
  demo uuid := '00000000-0000-4000-8000-00000000d000';
  today date := (now() at time zone 'Africa/Nairobi')::date;
  r uuid;
begin
  if juma is null or wanjiru is null or exists (select 1 from public.scouting_reports where org_id = demo)
    or not exists (select 1 from public.org_farmer_links where org_id = demo and farmer_id = juma and status = 'active') then
    return;
  end if;
  insert into public.scouting_reports (org_id, farmer_id, crop, observed_on, plants_checked, note, scout_id, scout_name)
    values (demo, juma, 'tomatoes', today - 12, 20, 'Lower leaves only.', wanjiru, 'Wanjiru K.') returning id into r;
  insert into public.scouting_findings values (r, 'early_blight', 3, 'low');
  insert into public.scouting_reports (org_id, farmer_id, crop, observed_on, plants_checked, note, scout_id, scout_name)
    values (demo, juma, 'tomatoes', today - 5, 20, 'Spreading after the rain.', wanjiru, 'Wanjiru K.') returning id into r;
  insert into public.scouting_findings values (r, 'early_blight', 7, 'medium'), (r, 'tuta', 2, 'low');
  insert into public.scouting_reports (org_id, farmer_id, crop, observed_on, plants_checked, scout_id, scout_name)
    values (demo, juma, 'maize', today - 5, 30, wanjiru, 'Wanjiru K.') returning id into r;
  insert into public.scouting_findings values (r, 'fall_armyworm', 9, 'medium');
end $$;

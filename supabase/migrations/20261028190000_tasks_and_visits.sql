-- Tasks and field visits (architecture.md §5, design.md §10 "Scouting / Tasks").
-- * A farmer task is something the co-op asks a farmer to do on their farm by a date. It shows on
--   the farmer's Home, and the farmer marks it done, even offline.
-- * A visit is a team member going to a farm. The farmer sees when, not the team's notes.
-- Staff change tasks only through the functions below; farmers read theirs through my_tasks(), so
-- the team's notes on a visit never reach the phone.

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  kind text not null check (kind in ('farmer', 'visit')),
  farmer_id uuid not null references auth.users (id) on delete cascade,
  plot_id uuid references public.plots (id) on delete set null,
  issue_id uuid references public.issues (id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  -- Farmer tasks: what to do, shown to the farmer. Visits: the team's own note.
  note text check (note is null or char_length(note) <= 500),
  due_on date not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'blocked', 'done', 'cancelled')),
  assignee_id uuid references auth.users (id) on delete set null,
  assignee_name text,
  created_by uuid references auth.users (id) on delete set null,
  created_by_name text,
  done_at timestamptz,
  done_by text check (done_by is null or done_by in ('farmer', 'team')),
  -- What happened: the visit report, or why a task was blocked or cancelled. Team only.
  outcome text check (outcome is null or char_length(outcome) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'done') = (done_at is not null))
);

create index tasks_org_due on public.tasks (org_id, status, due_on);
create index tasks_farmer on public.tasks (farmer_id, due_on);

create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

alter table public.tasks enable row level security;

-- Team members read their co-op's tasks. Nobody writes the table directly.
create policy "members read tasks" on public.tasks for select to authenticated
  using (org_id in (select public.my_org_ids()));

-- Who plans visits and gives tasks: everyone on the team except viewers.
create function public.task_writer(p_org uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare r text := public.member_role(p_org);
begin
  if r is null or r = 'viewer' then
    raise exception 'only the co-op team plans tasks' using errcode = '42501';
  end if;
  return r;
end $$;

-- Creates a task (p_id null) or changes one. The farmer must be linked to the co-op now, and the
-- plot and case must be theirs. The person it is assigned to defaults to whoever saves it.
create function public.save_task(
  p_id uuid, p_org uuid, p_kind text, p_farmer uuid, p_plot uuid, p_issue uuid,
  p_title text, p_note text, p_due date, p_assignee uuid
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  t public.tasks;
  v_assignee uuid := coalesce(p_assignee, auth.uid());
  v_name text;
  v_title text := nullif(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_id is not null then
    select * into t from public.tasks where id = p_id for update;
    if not found then raise exception 'task not found' using errcode = 'P0002'; end if;
    p_org := t.org_id; p_kind := t.kind; p_farmer := t.farmer_id;
  end if;
  perform public.task_writer(p_org);
  if p_kind not in ('farmer', 'visit') then raise exception 'bad kind' using errcode = '22023'; end if;
  if v_title is null then raise exception 'title_required' using errcode = '22023'; end if;
  if p_due is null then raise exception 'due_required' using errcode = '22023'; end if;
  if not exists (select 1 from public.org_farmer_links where org_id = p_org and farmer_id = p_farmer and status = 'active') then
    raise exception 'farmer_not_linked' using errcode = '42501';
  end if;
  if p_plot is not null and not exists (
    select 1 from public.plots pl join public.farms f on f.id = pl.farm_id where pl.id = p_plot and f.owner_id = p_farmer) then
    raise exception 'plot is not this farmer''s' using errcode = '22023';
  end if;
  if p_issue is not null and not exists (
    select 1 from public.issues i join public.farms f on f.id = i.farm_id where i.id = p_issue and f.owner_id = p_farmer) then
    raise exception 'case is not this farmer''s' using errcode = '22023';
  end if;
  select display_name into v_name from public.org_members where org_id = p_org and user_id = v_assignee and role <> 'viewer';
  if v_name is null then raise exception 'assignee is not on the team' using errcode = '22023'; end if;

  if p_id is null then
    insert into public.tasks (org_id, kind, farmer_id, plot_id, issue_id, title, note, due_on, assignee_id, assignee_name, created_by, created_by_name)
    values (p_org, p_kind, p_farmer, p_plot, p_issue, v_title, v_note, p_due, v_assignee, v_name, auth.uid(),
      (select display_name from public.org_members where org_id = p_org and user_id = auth.uid()))
    returning * into t;
  else
    if t.status in ('done', 'cancelled') then raise exception 'task_closed' using errcode = '22023'; end if;
    update public.tasks
      set plot_id = p_plot, issue_id = p_issue, title = v_title, note = v_note, due_on = p_due, assignee_id = v_assignee, assignee_name = v_name
      where id = p_id returning * into t;
  end if;
  insert into public.audit_log (actor_id, org_id, action, target_table, target_id)
    values (auth.uid(), p_org, case when p_id is null then 'task_create' else 'task_update' end, 'tasks', t.id);
  return t.id;
end $$;

-- Moves a task along: open → in progress → blocked → done, or cancels it. Done and cancelled can
-- be reopened. The outcome is the visit report, or why it was blocked or cancelled.
create function public.set_task_status(p_id uuid, p_status text, p_outcome text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_id for update;
  if not found then raise exception 'task not found' using errcode = 'P0002'; end if;
  perform public.task_writer(t.org_id);
  if p_status not in ('open', 'in_progress', 'blocked', 'done', 'cancelled') then raise exception 'bad status' using errcode = '22023'; end if;
  update public.tasks set
    status = p_status,
    done_at = case when p_status = 'done' then coalesce(t.done_at, now()) end,
    done_by = case when p_status = 'done' then coalesce(t.done_by, 'team') end,
    outcome = coalesce(nullif(btrim(coalesce(p_outcome, '')), ''), t.outcome)
  where id = p_id;
  insert into public.audit_log (actor_id, org_id, action, target_table, target_id)
    values (auth.uid(), t.org_id, 'task_' || p_status, 'tasks', p_id);
end $$;

-- The Tasks page: each task with the farmer, plot and case it is about.
create function public.org_tasks(p_org uuid)
returns table (
  id uuid, kind text, farmer_id uuid, farmer_name text, phone text, ward text, plot_id uuid, plot_name text,
  issue_id uuid, issue_code text, title text, note text, due_on date, status text, assignee_id uuid, assignee_name text,
  created_by_name text, done_at timestamptz, done_by text, outcome text, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select t.id, t.kind, t.farmer_id, coalesce(p.display_name, 'Farmer'), u.phone::text, coalesce(p.ward, f.ward),
    t.plot_id, pl.name, t.issue_id, i.code, t.title, t.note, t.due_on, t.status, t.assignee_id, t.assignee_name,
    t.created_by_name, t.done_at, t.done_by, t.outcome, t.created_at, t.updated_at
  from public.tasks t
  join auth.users u on u.id = t.farmer_id
  left join public.profiles p on p.user_id = t.farmer_id
  left join lateral (select ff.ward from public.farms ff where ff.owner_id = t.farmer_id order by ff.created_at limit 1) f on true
  left join public.plots pl on pl.id = t.plot_id
  left join public.issues i on i.id = t.issue_id
  where t.org_id = p_org and public.member_role(p_org) is not null
  order by (t.status in ('done', 'cancelled')), t.due_on, t.created_at
  limit 1000
$$;

-- Farmer side --------------------------------------------------------------------------------

-- What the phone keeps: open tasks and visits from co-ops the farmer is still in, and those done
-- in the last 30 days. A visit's note and every outcome stay with the team.
create function public.my_tasks()
returns table (
  id uuid, kind text, coop_name text, plot_id uuid, issue_id uuid, title text, note text,
  due_on date, status text, assignee_name text, done_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select t.id, t.kind, o.name, t.plot_id, t.issue_id, t.title, case when t.kind = 'farmer' then t.note end,
    t.due_on, t.status, t.assignee_name, t.done_at, t.updated_at
  from public.tasks t
  join public.orgs o on o.id = t.org_id
  join public.org_farmer_links l on l.org_id = t.org_id and l.farmer_id = t.farmer_id and l.status = 'active'
  where t.farmer_id = auth.uid()
    and t.status <> 'cancelled'
    and (t.status <> 'done' or t.done_at > now() - interval '30 days')
  order by t.due_on
  limit 200
$$;

-- The farmer ticks a task off, or unticks it. p_at is when they did it on the phone, which may be
-- days before the phone had signal; a time in the future is taken as now.
create function public.farmer_set_task_done(p_id uuid, p_done boolean, p_at timestamptz) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_id and farmer_id = auth.uid() and kind = 'farmer' for update;
  if not found then raise exception 'task not found' using errcode = 'P0002'; end if;
  if t.status = 'cancelled' then return; end if;
  if p_done then
    if t.status = 'done' then return; end if;
    update public.tasks set status = 'done', done_at = least(coalesce(p_at, now()), now()), done_by = 'farmer' where id = p_id;
  else
    if t.status <> 'done' or t.done_by <> 'farmer' then return; end if;
    update public.tasks set status = 'open', done_at = null, done_by = null where id = p_id;
  end if;
end $$;

-- Alerts ---------------------------------------------------------------------------------------

create function public.alert_farmer_on_task() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  en text := to_char(new.due_on, 'FMDy FMDD Mon');
  sw text := (array['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'])[extract(dow from new.due_on)::int + 1]
    || ' ' || extract(day from new.due_on)::int;
begin
  if new.kind = 'farmer' then
    perform public.send_push(new.farmer_id,
      jsonb_build_object('en', 'New task from your co-op', 'sw', 'Kazi mpya kutoka kwa chama chako'),
      jsonb_build_object('en', new.title || ' · by ' || en, 'sw', new.title || ' · kufikia ' || sw),
      jsonb_build_object('taskId', new.id, 'kind', 'task'));
  else
    perform public.send_push(new.farmer_id,
      jsonb_build_object('en', 'Farm visit planned', 'sw', 'Ziara ya shamba imepangwa'),
      jsonb_build_object('en', coalesce(new.assignee_name, 'Your agronomist') || ' will visit your farm on ' || en || '.',
                         'sw', coalesce(new.assignee_name, 'Mtaalamu wako') || ' atatembelea shamba lako ' || sw || '.'),
      jsonb_build_object('taskId', new.id, 'kind', 'visit'));
  end if;
  return new;
end $$;

create trigger alert_farmer_on_task after insert on public.tasks
  for each row execute function public.alert_farmer_on_task();

-- Every morning: farmer tasks due today, and visits happening today.
create function public.send_task_reminders() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  r record;
  n int := 0;
  today date := (now() at time zone 'Africa/Nairobi')::date;
begin
  for r in
    select t.* from public.tasks t
    join public.org_farmer_links l on l.org_id = t.org_id and l.farmer_id = t.farmer_id and l.status = 'active'
    where t.due_on = today and t.status in ('open', 'in_progress')
  loop
    if r.kind = 'farmer' then
      n := n + public.send_push(r.farmer_id,
        jsonb_build_object('en', 'Task for today', 'sw', 'Kazi ya leo'),
        jsonb_build_object('en', r.title, 'sw', r.title),
        jsonb_build_object('taskId', r.id, 'kind', 'task'));
    else
      n := n + public.send_push(r.farmer_id,
        jsonb_build_object('en', 'Farm visit today', 'sw', 'Ziara ya shamba leo'),
        jsonb_build_object('en', coalesce(r.assignee_name, 'Your agronomist') || ' plans to visit your farm today.',
                           'sw', coalesce(r.assignee_name, 'Mtaalamu wako') || ' anapanga kutembelea shamba lako leo.'),
        jsonb_build_object('taskId', r.id, 'kind', 'visit'));
    end if;
  end loop;
  return n;
end $$;

revoke execute on function public.task_writer(uuid), public.alert_farmer_on_task(), public.send_task_reminders() from public, anon, authenticated;
revoke execute on function public.save_task(uuid, uuid, text, uuid, uuid, uuid, text, text, date, uuid), public.set_task_status(uuid, text, text),
  public.org_tasks(uuid), public.my_tasks(), public.farmer_set_task_done(uuid, boolean, timestamptz) from public, anon;
grant execute on function public.save_task(uuid, uuid, text, uuid, uuid, uuid, text, text, date, uuid), public.set_task_status(uuid, text, text),
  public.org_tasks(uuid), public.my_tasks(), public.farmer_set_task_done(uuid, boolean, timestamptz) to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('task-reminders', '5 5 * * *', 'select public.send_task_reminders()');
  end if;
end $$;

-- Demo: a task and a visit for Juma from the demo co-op, so both sides have something to show.
do $$
declare
  juma uuid := (select id from auth.users where email = 'farmer.254712345678@example.com');
  wanjiru uuid := (select id from auth.users where email = 'agronomist.demo@example.com');
  demo uuid := '00000000-0000-4000-8000-00000000d000';
  today date := (now() at time zone 'Africa/Nairobi')::date;
begin
  if juma is null or wanjiru is null or exists (select 1 from public.tasks where org_id = demo)
    or not exists (select 1 from public.org_farmer_links where org_id = demo and farmer_id = juma and status = 'active') then
    return;
  end if;
  insert into public.tasks (org_id, kind, farmer_id, title, note, due_on, assignee_id, assignee_name, created_by, created_by_name) values
    (demo, 'farmer', juma, 'Remove spotted lower leaves on the tomatoes', 'Carry them out of the field and burn or bury them. Then send a new photo.', today + 1, wanjiru, 'Wanjiru K.', wanjiru, 'Wanjiru K.'),
    (demo, 'visit', juma, 'Check tomatoes and maize', 'Look for blight spread and fall armyworm damage.', today + 3, wanjiru, 'Wanjiru K.', wanjiru, 'Wanjiru K.');
end $$;

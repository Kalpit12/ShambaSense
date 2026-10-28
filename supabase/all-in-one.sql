-- ShambaSense database setup: all migrations in order. Paste into Supabase → SQL Editor → Run, once, on an empty project.

-- ==== 20261027200000_core_tables.sql ====
-- ShambaSense core schema (architecture.md §5). Ids are UUIDv7 made on the phone, so every row keeps
-- its id while offline and retries are idempotent. Timestamps are UTC; apps show Africa/Nairobi.

create extension if not exists pgcrypto;

-- 5.1 Identity and tenancy -------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  language text not null default 'sw' check (language in ('en', 'sw')),
  county text,
  ward text,
  sms_updates_opt_in boolean not null default false,
  -- From the first-time questions. Age and gender are optional; gender is only kept with a
  -- 'sensitive_profile' consent row, since the Data Protection Act treats sex as sensitive.
  goals text[] not null default '{}',
  coop_member boolean,
  coop_name text,
  age_band text check (age_band is null or age_band in ('18to24', '25to34', '35to44', '45to54', '55plus')),
  gender text check (gender is null or gender in ('woman', 'man')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('coop', 'ngo', 'agribusiness')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'agronomist', 'field_officer', 'viewer')),
  display_name text not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- A farmer owns their data. An org sees a farmer's farms and checks only while a link is active.
create table public.org_farmer_links (
  org_id uuid not null references public.orgs (id) on delete cascade,
  farmer_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'active', 'revoked')),
  consented_at timestamptz,
  scope text not null default 'checks_and_farms',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, farmer_id)
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('terms', 'data_transfer', 'photo_use_for_training', 'sms_updates', 'org_share', 'sensitive_profile')),
  version text not null,
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz
);

-- 5.2 Farm and journal ------------------------------------------------------------------------

create table public.farms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  county text,
  ward text,
  -- First-time answers that describe the farm.
  size_band text check (size_band is null or size_band in ('under1', '1to2', '2to5', 'over5', 'notSure')),
  water_source text check (water_source is null or water_source in ('rain', 'irrigation', 'both')),
  main_crops text[] not null default '{}',
  plot_count text check (plot_count is null or plot_count in ('one', 'two', '3to5', 'over5')),
  livestock text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plots (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  name text not null,
  area numeric check (area is null or area > 0),
  area_unit text not null default 'acres' check (area_unit in ('acres', 'hectares')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crop_cycles (
  id uuid primary key,
  plot_id uuid not null references public.plots (id) on delete cascade,
  crop text not null,
  variety text,
  planted_on date,
  ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Insert-only. A correction is a new row pointing at the old one (corrects_event_id).
create table public.journal_events (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  plot_id uuid references public.plots (id) on delete set null,
  cycle_id uuid references public.crop_cycles (id) on delete set null,
  kind text not null check (kind in ('work', 'input', 'expense', 'harvest', 'sale', 'check')),
  occurred_on date not null,
  quantity numeric,
  unit text check (unit is null or unit in ('kg', 'g', 'L', 'bags', 'crates', 'pieces')),
  amount_kes numeric check (amount_kes is null or amount_kes >= 0),
  note text not null default '',
  corrects_event_id uuid references public.journal_events (id),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 5.3 Crop checks and issues ------------------------------------------------------------------

create table public.crop_checks (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  plot_id uuid references public.plots (id) on delete set null,
  cycle_id uuid references public.crop_cycles (id) on delete set null,
  crop_claimed text not null,
  symptoms text[] not null default '{}' check (cardinality(symptoms) <= 3),
  context_note text,
  captured_at timestamptz not null,
  parent_check_id uuid references public.crop_checks (id) on delete set null,
  kind text not null default 'initial' check (kind in ('initial', 'follow_up')),
  status text not null default 'uploaded' check (status in ('queued', 'uploaded', 'processing', 'done', 'failed')),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  check_id uuid references public.crop_checks (id) on delete cascade,
  issue_event_id uuid,
  journal_event_id uuid references public.journal_events (id) on delete cascade,
  kind text not null default 'photo' check (kind in ('photo', 'voice')),
  storage_path text not null unique,
  bytes integer check (bytes is null or bytes <= 2097152),
  sha256 text,
  width integer,
  height integer,
  upload_state text not null default 'pending' check (upload_state in ('pending', 'uploaded', 'failed')),
  created_at timestamptz not null default now()
);

-- Written by the diagnosis worker (service role). No numeric confidence reaches the phone: `raw`
-- is revoked from every client role below.
create table public.check_results (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null unique references public.crop_checks (id) on delete cascade,
  model_version text not null,
  state text not null check (state in ('possible_match', 'needs_more_information', 'expert_review_required', 'unsupported_crop')),
  observed text[] not null default '{}',
  causes jsonb not null default '[]',  -- [{ "cause_id": "...", "likelihood": "more_likely" | "possible" }]
  reference_case_id uuid,
  guide_ids uuid[] not null default '{}',
  raw jsonb,
  created_at timestamptz not null default now()
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  farm_id uuid not null references public.farms (id) on delete cascade,
  plot_id uuid references public.plots (id) on delete set null,
  origin_check_id uuid references public.crop_checks (id) on delete set null,
  title text not null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'in_review', 'waiting_farmer', 'action_given', 'monitoring', 'closed')),
  assignee_id uuid references auth.users (id) on delete set null,
  follow_up_due_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence public.issue_code_seq start 100;

-- Append-only history. Human fields are only written by human events (R6); AI suggestions are
-- actor_kind = 'ai' and the dashboard shows them dashed.
create table public.issue_events (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  actor_kind text not null check (actor_kind in ('farmer', 'agronomist', 'system', 'ai')),
  actor_name text,
  kind text not null check (kind in ('created', 'comment', 'review_agree', 'review_adjust', 'review_reject', 'request_photos', 'status_change', 'follow_up_result')),
  body text,
  cause_ids text[] not null default '{}',
  guide_ids uuid[] not null default '{}',
  status text,
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.media
  add constraint media_issue_event_fk foreign key (issue_event_id) references public.issue_events (id) on delete cascade;

-- 5.4 Knowledge -------------------------------------------------------------------------------

create table public.causes (
  id text primary key,
  crop text not null,
  latin_name text,
  name_en text not null,
  name_sw text not null,
  category text not null check (category in ('disease', 'pest', 'nutrient', 'abiotic'))
);

-- Only reviewed guides are ever shown. Guides that mention chemicals stay hidden from farmers
-- while the chemical_recommendations flag is off (R5).
create table public.guides (
  id uuid primary key default gen_random_uuid(),
  cause_id text not null references public.causes (id),
  language text not null check (language in ('en', 'sw')),
  region text,
  version integer not null default 1,
  body_md text not null,
  reviewer_id uuid references auth.users (id),
  reviewed_on date,
  contains_chemical boolean not null default false
);

-- 5.5 Platform --------------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  org_id uuid,
  action text not null,
  target_table text not null,
  target_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table public.feature_flags (
  key text primary key,
  enabled boolean not null default false
);
insert into public.feature_flags (key, enabled) values ('chemical_recommendations', false);

-- Indexes for the paths the apps read.
create index on public.farms (owner_id);
create index on public.plots (farm_id);
create index on public.crop_cycles (plot_id);
create index on public.journal_events (farm_id, occurred_on desc);
create index on public.crop_checks (farm_id, captured_at desc);
create index on public.media (check_id);
create index on public.issues (status, severity, created_at);
create index on public.issues (farm_id);
create index on public.issue_events (issue_id, created_at);
create index on public.org_farmer_links (farmer_id) where status = 'active';
create index on public.org_members (user_id);

-- updated_at bookkeeping.
create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'orgs', 'org_farmer_links', 'farms', 'plots', 'crop_cycles', 'crop_checks', 'issues'] loop
    execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- Sign-up puts name, county and language in the user's metadata; this copies them into profiles.
create function public.profile_for_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name, county, language)
  values (
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'county',
    case when new.raw_user_meta_data ->> 'language' = 'en' then 'en' else 'sw' end
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger profile_for_new_user after insert on auth.users
  for each row execute function public.profile_for_new_user();

-- ==== 20261027200100_access_rules.sql ====
-- Row-level security (architecture.md §5.6, in words):
-- * A farmer reads and writes their own rows, through the farm chain.
-- * An org member reads farms, checks, results, issues and media of farmers with an ACTIVE link to
--   one of their orgs. Agronomists and field officers change issues only through the functions in
--   the next migration, which check the role and write an audit line.
-- * No client role reads check_results.raw.

-- Helpers. SECURITY DEFINER so policies can look across tables without recursing through RLS.
create function public.owns_farm(p_farm uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.farms f where f.id = p_farm and f.owner_id = auth.uid());
$$;

create function public.org_sees_farmer(p_farmer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.org_farmer_links l
    join public.org_members m on m.org_id = l.org_id and m.user_id = auth.uid()
    where l.farmer_id = p_farmer and l.status = 'active'
  );
$$;

create function public.org_sees_farm(p_farm uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.farms f where f.id = p_farm and public.org_sees_farmer(f.owner_id));
$$;

create function public.can_read_farm(p_farm uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.owns_farm(p_farm) or public.org_sees_farm(p_farm);
$$;

create function public.my_org_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select org_id from public.org_members where user_id = auth.uid();
$$;

-- Enable RLS everywhere. A table without it is a bug (CI checks this).
do $$
declare t text;
begin
  foreach t in array array['profiles', 'orgs', 'org_members', 'org_farmer_links', 'consents', 'farms', 'plots', 'crop_cycles',
    'journal_events', 'crop_checks', 'media', 'check_results', 'issues', 'issue_events', 'causes', 'guides', 'audit_log', 'feature_flags'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- profiles
create policy "own profile" on public.profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "linked orgs read profile" on public.profiles for select to authenticated
  using (public.org_sees_farmer(user_id));

-- orgs, members, links
create policy "members read org" on public.orgs for select to authenticated
  using (id in (select public.my_org_ids()));
create policy "members read team" on public.org_members for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy "farmer reads own links" on public.org_farmer_links for select to authenticated
  using (farmer_id = auth.uid() or org_id in (select public.my_org_ids()));
-- A farmer accepts or revokes a link; revoking removes access at once.
create policy "farmer answers link" on public.org_farmer_links for update to authenticated
  using (farmer_id = auth.uid()) with check (farmer_id = auth.uid());
create policy "farmers see org names for their links" on public.orgs for select to authenticated
  using (exists (select 1 from public.org_farmer_links l where l.org_id = id and l.farmer_id = auth.uid()));

-- consents
create policy "own consents" on public.consents for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- farms
create policy "owner farms" on public.farms for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "linked orgs read farms" on public.farms for select to authenticated
  using (public.org_sees_farmer(owner_id));

-- plots and crop cycles
create policy "owner plots" on public.plots for all to authenticated
  using (public.owns_farm(farm_id)) with check (public.owns_farm(farm_id));
create policy "linked orgs read plots" on public.plots for select to authenticated
  using (public.org_sees_farm(farm_id));
create policy "owner cycles" on public.crop_cycles for all to authenticated
  using (exists (select 1 from public.plots p where p.id = plot_id and public.owns_farm(p.farm_id)))
  with check (exists (select 1 from public.plots p where p.id = plot_id and public.owns_farm(p.farm_id)));
create policy "linked orgs read cycles" on public.crop_cycles for select to authenticated
  using (exists (select 1 from public.plots p where p.id = plot_id and public.org_sees_farm(p.farm_id)));

-- journal: insert-only for the owner. No update or delete policy exists, so both are refused.
create policy "owner reads journal" on public.journal_events for select to authenticated
  using (public.can_read_farm(farm_id));
create policy "owner adds journal" on public.journal_events for insert to authenticated
  with check (created_by = auth.uid() and public.owns_farm(farm_id));

-- crop checks: the owner inserts; status is moved on by the server.
create policy "read checks" on public.crop_checks for select to authenticated
  using (public.can_read_farm(farm_id));
create policy "owner adds checks" on public.crop_checks for insert to authenticated
  with check (created_by = auth.uid() and public.owns_farm(farm_id) and status in ('queued', 'uploaded'));

-- media
create policy "read media" on public.media for select to authenticated
  using (owner_id = auth.uid() or public.org_sees_farmer(owner_id));
create policy "owner adds media" on public.media for insert to authenticated
  with check (owner_id = auth.uid());
create policy "owner marks upload" on public.media for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- check results: read-only for clients, and never the raw scores.
create policy "read results" on public.check_results for select to authenticated
  using (exists (select 1 from public.crop_checks c where c.id = check_id and public.can_read_farm(c.farm_id)));
revoke select on public.check_results from anon, authenticated;
grant select (id, check_id, model_version, state, observed, causes, reference_case_id, guide_ids, created_at)
  on public.check_results to authenticated;

-- issues and their history: read here, written through functions only.
create policy "read issues" on public.issues for select to authenticated
  using (public.can_read_farm(farm_id));
create policy "read issue events" on public.issue_events for select to authenticated
  using (exists (select 1 from public.issues i where i.id = issue_id and public.can_read_farm(i.farm_id)));

-- knowledge
create policy "anyone reads causes" on public.causes for select to anon, authenticated using (true);
create policy "reviewed guides" on public.guides for select to authenticated
  using (
    reviewed_on is not null
    and (not contains_chemical
      or exists (select 1 from public.feature_flags f where f.key = 'chemical_recommendations' and f.enabled)
      or exists (select 1 from public.org_members m where m.user_id = auth.uid()))
  );
create policy "read flags" on public.feature_flags for select to authenticated using (true);

-- audit_log has no client policy: only the service role and the functions below write or read it.

-- ==== 20261027200200_issue_functions.sql ====
-- Review actions and the farmer's "Ask an agronomist" (architecture.md §3.3 condition 4, §6.4).
-- Each checks who is calling, appends to issue_events, and writes an audit line.

-- Replies that mention a dose pattern or a product are flagged for a second look, not blocked.
create function public.reply_flagged(p_body text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_body, '') ~* '\d+([.,]\d+)?\s*(ml|g|kg|l|litres?|liters?|cc)\s*(/|per)\s*\d*\s*(l|litres?|liters?|ha|hectares?|acres?|knapsacks?|pumps?|debe)\M'
      or coalesce(p_body, '') ~* '(mancozeb|metalaxyl|ridomil|chlorothalonil|copper oxychloride|cypermethrin|lambda-cyhalothrin|chlorpyrifos|emamectin|abamectin|imidacloprid|duduthrin)';
$$;

-- The caller's reviewing role for an issue's farm, or null.
create function public.reviewer_role(p_farm uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role
  from public.farms f
  join public.org_farmer_links l on l.farmer_id = f.owner_id and l.status = 'active'
  join public.org_members m on m.org_id = l.org_id and m.user_id = auth.uid()
  where f.id = p_farm and m.role in ('owner', 'admin', 'agronomist', 'field_officer')
  order by case m.role when 'agronomist' then 0 when 'field_officer' then 1 else 2 end
  limit 1;
$$;

create function public.reviewer_name() returns text
language sql stable security definer set search_path = '' as $$
  select display_name from public.org_members where user_id = auth.uid() limit 1;
$$;

create function public.next_issue_code() returns text
language sql volatile security definer set search_path = '' as $$
  select 'ISS-' || lpad(nextval('public.issue_code_seq')::text, 4, '0');
$$;

-- Farmer: send a check to an agronomist. Returns the issue (an existing one if already asked).
create function public.ask_agronomist(p_check uuid) returns public.issues
language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.crop_checks;
  result public.issues;
begin
  select * into c from public.crop_checks where id = p_check;
  if c.id is null or not public.owns_farm(c.farm_id) then
    raise exception 'check not found' using errcode = '42501';
  end if;
  select * into result from public.issues where origin_check_id = p_check;
  if result.id is not null then
    return result;
  end if;
  insert into public.issues (code, farm_id, plot_id, origin_check_id, title)
  values (public.next_issue_code(), c.farm_id, c.plot_id, c.id,
          'Crop check · ' || c.crop_claimed || coalesce(' · ' || nullif(array_to_string(c.symptoms, ', '), ''), ''))
  returning * into result;
  insert into public.issue_events (issue_id, actor_id, actor_kind, kind, body)
  values (result.id, auth.uid(), 'farmer', 'created', 'Asked an agronomist from the result screen.');
  return result;
end $$;

-- Agronomist: agree, adjust, reject or ask for photos, with the message the farmer reads.
create function public.review_issue(p_issue uuid, p_kind text, p_cause_ids text[], p_body text, p_follow_up_days integer default null)
returns public.issue_events
language plpgsql volatile security definer set search_path = '' as $$
declare
  i public.issues;
  role text;
  ev public.issue_events;
begin
  select * into i from public.issues where id = p_issue for update;
  if i.id is null then
    raise exception 'issue not found' using errcode = '42501';
  end if;
  role := public.reviewer_role(i.farm_id);
  if role is null then
    raise exception 'not allowed to review this issue' using errcode = '42501';
  end if;
  if p_kind not in ('review_agree', 'review_adjust', 'review_reject', 'request_photos') then
    raise exception 'unknown review kind %', p_kind;
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'a message to the farmer is required';
  end if;
  if p_kind in ('review_agree', 'review_adjust') and coalesce(cardinality(p_cause_ids), 0) = 0 then
    raise exception 'pick at least one cause';
  end if;
  if exists (select 1 from unnest(coalesce(p_cause_ids, '{}')) id where id not in (select c.id from public.causes c)) then
    raise exception 'unknown cause';
  end if;

  insert into public.issue_events (issue_id, actor_id, actor_kind, actor_name, kind, body, cause_ids, flagged)
  values (i.id, auth.uid(), 'agronomist', public.reviewer_name(), p_kind, trim(p_body), coalesce(p_cause_ids, '{}'), public.reply_flagged(p_body))
  returning * into ev;

  update public.issues set
    status = case when p_kind = 'request_photos' then 'waiting_farmer' else 'action_given' end,
    assignee_id = coalesce(assignee_id, auth.uid()),
    follow_up_due_on = case when p_follow_up_days is null then follow_up_due_on else current_date + p_follow_up_days end
  where id = i.id;

  insert into public.audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), p_kind, 'issues', i.id, jsonb_build_object('role', role, 'flagged', ev.flagged, 'causes', p_cause_ids));
  return ev;
end $$;

create function public.set_issue_status(p_issue uuid, p_status text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare i public.issues;
begin
  select * into i from public.issues where id = p_issue for update;
  if i.id is null or public.reviewer_role(i.farm_id) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.issues set status = p_status where id = i.id;
  insert into public.issue_events (issue_id, actor_id, actor_kind, actor_name, kind, status)
  values (i.id, auth.uid(), 'agronomist', public.reviewer_name(), 'status_change', p_status);
  insert into public.audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'status_change', 'issues', i.id, jsonb_build_object('status', p_status));
end $$;

create function public.assign_issue_to_me(p_issue uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare i public.issues;
begin
  select * into i from public.issues where id = p_issue for update;
  if i.id is null or public.reviewer_role(i.farm_id) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.issues set assignee_id = auth.uid(), status = case when status = 'open' then 'in_review' else status end where id = i.id;
  if i.status = 'open' then
    insert into public.issue_events (issue_id, actor_id, actor_kind, actor_name, kind, status)
    values (i.id, auth.uid(), 'agronomist', public.reviewer_name(), 'status_change', 'in_review');
  end if;
  insert into public.audit_log (actor_id, action, target_table, target_id) values (auth.uid(), 'assign', 'issues', i.id);
end $$;

-- When the worker cannot answer, the check becomes an issue on its own.
create function public.issue_from_result() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c public.crop_checks;
  new_issue uuid;
begin
  if new.state <> 'expert_review_required' then
    return new;
  end if;
  select * into c from public.crop_checks where id = new.check_id;
  if exists (select 1 from public.issues where origin_check_id = c.id) then
    return new;
  end if;
  insert into public.issues (code, farm_id, plot_id, origin_check_id, title)
  values (public.next_issue_code(), c.farm_id, c.plot_id, c.id, 'Crop check · ' || c.crop_claimed)
  returning id into new_issue;
  insert into public.issue_events (issue_id, actor_kind, kind, body)
  values (new_issue, 'system', 'created', 'The library could not give an answer, so the check came here.');
  return new;
end $$;

create trigger issue_from_result after insert on public.check_results
  for each row execute function public.issue_from_result();

-- Only signed-in users may call these; RLS-style checks happen inside.
revoke execute on function public.ask_agronomist(uuid), public.review_issue(uuid, text, text[], text, integer),
  public.set_issue_status(uuid, text), public.assign_issue_to_me(uuid), public.next_issue_code() from public, anon;
grant execute on function public.ask_agronomist(uuid), public.review_issue(uuid, text, text[], text, integer),
  public.set_issue_status(uuid, text), public.assign_issue_to_me(uuid) to authenticated;

-- ==== 20261027200300_storage_and_causes.sql ====
-- Private photo bucket. Each farmer writes under a folder named by their user id:
-- check-photos/<user id>/<check id>.jpg. Signed URLs only; nothing is public (architecture.md §9).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('check-photos', 'check-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "farmer uploads own photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'check-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "farmer reads own photos" on storage.objects for select to authenticated
  using (bucket_id = 'check-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "linked orgs read photos" on storage.objects for select to authenticated
  using (bucket_id = 'check-photos' and public.org_sees_farmer(((storage.foldername(name))[1])::uuid));

-- The closed cause list (§5.4). Kiswahili names need review by a native speaker.
insert into public.causes (id, crop, latin_name, name_en, name_sw, category) values
  ('early_blight', 'tomatoes', 'Alternaria solani', 'Early blight', 'Kuoza kwa majani', 'disease'),
  ('late_blight', 'tomatoes', 'Phytophthora infestans', 'Late blight', 'Ukungu wa nyanya', 'disease'),
  ('septoria', 'tomatoes', 'Septoria lycopersici', 'Septoria leaf spot', 'Madoa madogo ya majani', 'disease'),
  ('tuta', 'tomatoes', 'Tuta absoluta', 'Tomato leaf miner (Tuta)', 'Kipekecha majani ya nyanya (Tuta)', 'pest'),
  ('bacterial_wilt', 'tomatoes', 'Ralstonia solanacearum', 'Bacterial wilt', 'Mnyauko bakteria', 'disease'),
  ('fall_armyworm', 'maize', 'Spodoptera frugiperda', 'Fall armyworm', 'Viwavi jeshi vamizi', 'pest'),
  ('maize_streak', 'maize', null, 'Maize streak virus', 'Ugonjwa wa michirizi ya mahindi', 'disease'),
  ('mln', 'maize', null, 'Maize lethal necrosis', 'Ugonjwa hatari wa mahindi (MLN)', 'disease'),
  ('bean_rust', 'beans', 'Uromyces appendiculatus', 'Bean rust', 'Kutu ya maharagwe', 'disease'),
  ('angular_leaf_spot', 'beans', null, 'Angular leaf spot', 'Madoa ya pembe kwenye majani', 'disease'),
  ('black_rot', 'kale', 'Xanthomonas campestris', 'Black rot', 'Kuoza mweusi', 'disease'),
  ('aphids', 'any', null, 'Aphids', 'Vidukari', 'pest'),
  ('nitrogen', 'any', null, 'Nitrogen shortage', 'Upungufu wa naitrojeni', 'nutrient'),
  ('water_stress', 'any', null, 'Water stress', 'Ukosefu wa maji', 'abiotic')
on conflict (id) do nothing;
-- Fixes from the Supabase advisors after the first deploy.

-- 1. Who may call the SECURITY DEFINER functions.
-- Policy helpers: signed-in users need them because the access rules call them. Nobody signed out does.
revoke execute on function public.owns_farm(uuid), public.org_sees_farmer(uuid), public.org_sees_farm(uuid),
  public.can_read_farm(uuid), public.my_org_ids() from public, anon;
grant execute on function public.owns_farm(uuid), public.org_sees_farmer(uuid), public.org_sees_farm(uuid),
  public.can_read_farm(uuid), public.my_org_ids() to authenticated;

-- Internal pieces: only the issue functions and triggers use these, and those run as the owner.
revoke execute on function public.reviewer_role(uuid), public.reviewer_name(), public.next_issue_code(),
  public.issue_from_result(), public.profile_for_new_user(), public.touch_updated_at()
  from public, anon, authenticated;

-- 2. Evaluate auth.uid() once per query, not once per row.
do $$
declare
  p record;
  q text;
  c text;
  sql text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual ~ 'auth\.uid\(\)' or with_check ~ 'auth\.uid\(\)')
  loop
    q := regexp_replace(p.qual, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'g');
    c := regexp_replace(p.with_check, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'g');
    sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if q is not null then sql := sql || format(' using (%s)', q); end if;
    if c is not null then sql := sql || format(' with check (%s)', c); end if;
    execute sql;
  end loop;
end $$;

-- 3. Indexes for foreign keys used in joins and deletes.
create index if not exists consents_user_id_idx on public.consents (user_id);
create index if not exists crop_checks_created_by_idx on public.crop_checks (created_by);
create index if not exists crop_checks_cycle_id_idx on public.crop_checks (cycle_id);
create index if not exists crop_checks_parent_check_id_idx on public.crop_checks (parent_check_id);
create index if not exists crop_checks_plot_id_idx on public.crop_checks (plot_id);
create index if not exists guides_cause_id_idx on public.guides (cause_id);
create index if not exists guides_reviewer_id_idx on public.guides (reviewer_id);
create index if not exists issue_events_actor_id_idx on public.issue_events (actor_id);
create index if not exists issues_assignee_id_idx on public.issues (assignee_id);
create index if not exists issues_origin_check_id_idx on public.issues (origin_check_id);
create index if not exists issues_plot_id_idx on public.issues (plot_id);
create index if not exists journal_events_corrects_event_id_idx on public.journal_events (corrects_event_id);
create index if not exists journal_events_created_by_idx on public.journal_events (created_by);
create index if not exists journal_events_cycle_id_idx on public.journal_events (cycle_id);
create index if not exists journal_events_plot_id_idx on public.journal_events (plot_id);
create index if not exists media_issue_event_id_idx on public.media (issue_event_id);
create index if not exists media_journal_event_id_idx on public.media (journal_event_id);
create index if not exists media_owner_id_idx on public.media (owner_id);

-- audit_log keeps RLS on with no policies on purpose: only the service role writes or reads it.
-- Demo sign-in for development, while there is no SMS provider or email setup.
-- Every demo account uses the code 123456 in the apps; behind it is a shared password, so anyone
-- with the app can sign in as a demo account. Turn the 'demo_auth' flag off and delete the demo
-- accounts before real farmers use this project.

insert into public.feature_flags (key, enabled) values ('demo_auth', true)
  on conflict (key) do update set enabled = true;

-- The demo co-op every demo farmer is linked to, so the dashboard sees their checks.
insert into public.orgs (id, name, kind)
  values ('00000000-0000-4000-8000-00000000d000', 'ShambaSense demo co-op', 'coop')
  on conflict (id) do nothing;

-- Makes a confirmed email + password user, as GoTrue would. Internal only.
create function public.demo_make_user(p_email text, p_phone text, p_meta jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role, email, phone, encrypted_password, email_confirmed_at, phone_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, phone_change, phone_change_token,
    email_change_token_current, reauthentication_token
  ) values (
    uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, p_phone,
    extensions.crypt('shamba-demo-123456', extensions.gen_salt('bf')), now(), case when p_phone is null then null else now() end,
    '{"provider":"email","providers":["email"]}', p_meta, now(), now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (uid::text, uid, jsonb_build_object('sub', uid::text, 'email', p_email, 'email_verified', true), 'email', now(), now(), now());
  return uid;
end $$;

-- Lets the farmer app create a demo account for a new +254 number. Off when the flag is off.
create function public.demo_sign_up(p_phone text, p_name text, p_county text, p_language text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_digits text := ltrim(p_phone, '+');
  v_email text := 'farmer.' || ltrim(p_phone, '+') || '@example.com';
  uid uuid;
begin
  if not coalesce((select enabled from public.feature_flags where key = 'demo_auth'), false) then
    raise exception 'demo sign-in is off';
  end if;
  if p_phone !~ '^\+254[17][0-9]{8}$' then raise exception 'invalid phone'; end if;
  if exists (select 1 from auth.users u where u.email = v_email or u.phone = v_digits) then
    raise exception 'account_exists';
  end if;
  uid := public.demo_make_user(v_email, v_digits, jsonb_build_object(
    'display_name', left(p_name, 80), 'county', left(p_county, 40),
    'language', case when p_language = 'en' then 'en' else 'sw' end, 'phone', p_phone));
  insert into public.org_farmer_links (org_id, farmer_id, status, consented_at)
    values ('00000000-0000-4000-8000-00000000d000', uid, 'active', now());
  return v_email;
end $$;

revoke execute on function public.demo_make_user(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.demo_sign_up(text, text, text, text) from public;
grant execute on function public.demo_sign_up(text, text, text, text) to anon, authenticated;

-- Seed accounts: Juma (farmer, already set up) and Wanjiru (agronomist in the demo co-op).
do $$
declare juma uuid; wanjiru uuid;
begin
  if not exists (select 1 from auth.users where email = 'farmer.254712345678@example.com') then
    juma := public.demo_make_user('farmer.254712345678@example.com', '254712345678', jsonb_build_object(
      'display_name', 'Juma', 'county', 'Nakuru', 'language', 'sw', 'phone', '+254712345678',
      'onboarded_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
    insert into public.farms (owner_id, name, county, ward, size_band, water_source, main_crops, plot_count, livestock)
      values (juma, 'Shamba la Juma', 'Nakuru', 'Njoro', '1to2', 'rain', '{maize,beans,tomatoes}', '3to5', '{cows,chickens}');
    update public.profiles set goals = '{checkCrops,records}', coop_member = true, coop_name = 'ShambaSense demo co-op'
      where user_id = juma;
    insert into public.org_farmer_links (org_id, farmer_id, status, consented_at)
      values ('00000000-0000-4000-8000-00000000d000', juma, 'active', now());
  end if;
  if not exists (select 1 from auth.users where email = 'agronomist.demo@example.com') then
    wanjiru := public.demo_make_user('agronomist.demo@example.com', null, '{"display_name":"Wanjiru K."}');
    insert into public.org_members (org_id, user_id, role, display_name)
      values ('00000000-0000-4000-8000-00000000d000', wanjiru, 'agronomist', 'Wanjiru K.');
  end if;
end $$;

-- Lets the sign-in screen say "no account" before asking for the code, as real SMS sign-in does.
create function public.demo_has_account(p_phone text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from public.feature_flags where key = 'demo_auth'), false)
     and exists (select 1 from auth.users where phone = ltrim(p_phone, '+'))
$$;
revoke execute on function public.demo_has_account(text) from public;
grant execute on function public.demo_has_account(text) to anon, authenticated;
-- Follow-up photos (architecture.md §10, R12). The farmer sends a new photo of the same problem when
-- the agronomist asks for one or the follow-up date comes, and says whether the crop looks better,
-- the same or worse. The case goes back to the agronomist with a before-and-after.

-- How the farmer says the crop looks now, compared with the first photo. Follow-ups only.
alter table public.crop_checks add column outcome text
  check (outcome is null or (kind = 'follow_up' and outcome in ('better', 'same', 'worse')));

-- Which photo a 'follow_up_result' event is about.
alter table public.issue_events add column check_id uuid references public.crop_checks (id) on delete set null;
create index if not exists issue_events_check_id_idx on public.issue_events (check_id);
create index if not exists crop_checks_parent_kind_idx on public.crop_checks (parent_check_id) where kind = 'follow_up';

-- Farmer: hand a follow-up check (already uploaded, parent_check_id = the first check) to the case.
-- Safe to call twice. Returns the issue.
create function public.send_follow_up(p_check uuid) returns public.issues
language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.crop_checks;
  i public.issues;
begin
  select * into c from public.crop_checks where id = p_check;
  if c.id is null or not public.owns_farm(c.farm_id) then
    raise exception 'check not found' using errcode = '42501';
  end if;
  if c.kind <> 'follow_up' or c.parent_check_id is null then
    raise exception 'not a follow-up check';
  end if;
  select * into i from public.issues where origin_check_id = c.parent_check_id for update;
  if i.id is null then
    raise exception 'the first check has no case';
  end if;
  if exists (select 1 from public.issue_events where issue_id = i.id and check_id = c.id) then
    return i;
  end if;

  insert into public.issue_events (issue_id, actor_id, actor_kind, actor_name, kind, body, check_id)
  values (i.id, auth.uid(), 'farmer', (select display_name from public.profiles where user_id = auth.uid()),
          'follow_up_result', c.outcome, c.id);

  -- Back to whoever had it; a closed case reopens because the farmer is still worried.
  update public.issues set
    status = case when assignee_id is null then 'open' else 'in_review' end,
    follow_up_due_on = null
  where id = i.id
  returning * into i;

  insert into public.audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'follow_up_result', 'issues', i.id, jsonb_build_object('check', c.id, 'outcome', c.outcome));
  return i;
end $$;

revoke execute on function public.send_follow_up(uuid) from public, anon;
grant execute on function public.send_follow_up(uuid) to authenticated;

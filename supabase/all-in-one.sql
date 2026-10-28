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

-- ==== 20261027200400_hardening.sql ====
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

-- ==== 20261027200500_demo_sign_in.sql ====
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

-- ==== 20261028100000_follow_up_photos.sql ====
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

-- ==== 20261028120000_coop_setup.sql ====
-- Co-op setup (architecture.md §3.3, §5.1). An org admin adds agronomists and field officers, changes
-- their roles and removes them. Farmers join a co-op with its join code, after agreeing to share their
-- farm and crop checks, and can leave at any time; leaving ends the co-op's access at once.

-- 1. Join codes --------------------------------------------------------------------------------

-- Three letters from the name and four digits, e.g. NJR-4821. Easy to read out on a phone call.
create function public.new_join_code(p_name text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  prefix text := rpad(upper(left(regexp_replace(coalesce(p_name, ''), '[^A-Za-z]', '', 'g'), 3)), 3, 'X');
  code text;
begin
  loop
    code := prefix || '-' || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from public.orgs where public.norm_code(join_code) = public.norm_code(code));
  end loop;
  return code;
end $$;

-- Farmers type codes in any case, with or without the dash.
create function public.norm_code(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g')
$$;

alter table public.orgs add column join_code text;
update public.orgs set join_code = public.new_join_code(name) where join_code is null;
update public.orgs set join_code = 'DEMO-2026' where id = '00000000-0000-4000-8000-00000000d000';
alter table public.orgs alter column join_code set not null;
create unique index orgs_join_code_idx on public.orgs (public.norm_code(join_code));

create function public.org_join_code() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.join_code is null then new.join_code := public.new_join_code(new.name); end if;
  return new;
end $$;
create trigger org_join_code before insert on public.orgs for each row execute function public.org_join_code();

-- 2. Invites -----------------------------------------------------------------------------------

-- An invite waits for someone who has no account yet. Signing in with that email claims it.
create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('admin', 'agronomist', 'field_officer', 'viewer')),
  display_name text not null,
  invited_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index org_invites_open_idx on public.org_invites (org_id, email) where accepted_at is null;
create index org_invites_email_idx on public.org_invites (email) where accepted_at is null;
create index org_invites_invited_by_idx on public.org_invites (invited_by);
alter table public.org_invites enable row level security;

create function public.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members where org_id = p_org and user_id = auth.uid() and role in ('owner', 'admin'));
$$;
revoke execute on function public.is_org_admin(uuid) from public, anon;
grant execute on function public.is_org_admin(uuid) to authenticated;

-- Admins read their org's invites. Every change goes through the functions below.
create policy "admins read invites" on public.org_invites for select to authenticated
  using (public.is_org_admin(org_id));

create function public.member_role(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.org_members where org_id = p_org and user_id = auth.uid();
$$;

create function public.require_admin(p_org uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare r text := public.member_role(p_org);
begin
  if r is null or r not in ('owner', 'admin') then
    raise exception 'only an org admin can do this' using errcode = '42501';
  end if;
  return r;
end $$;

create function public.owner_count(p_org uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.org_members where org_id = p_org and role = 'owner';
$$;

-- 3. Admin functions ---------------------------------------------------------------------------

-- Adds a team member. Someone who already has an account joins at once ('added'); otherwise the
-- invite waits for their first sign-in ('invited'). With demo sign-in on, a new demo account is made
-- straight away and signs in with the demo code.
create function public.invite_member(p_org uuid, p_email text, p_role text, p_name text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  me_role text := public.require_admin(p_org);
  v_email text := lower(trim(p_email));
  v_name text := left(trim(coalesce(p_name, '')), 80);
  uid uuid;
begin
  if p_role not in ('admin', 'agronomist', 'field_officer', 'viewer') then raise exception 'unknown role %', p_role; end if;
  if p_role = 'admin' and me_role <> 'owner' then raise exception 'only an owner can add admins' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'a name is required'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email'; end if;

  select id into uid from auth.users where lower(email) = v_email;
  if uid is null and coalesce((select enabled from public.feature_flags where key = 'demo_auth'), false) then
    uid := public.demo_make_user(v_email, null, jsonb_build_object('display_name', v_name));
  end if;

  if uid is not null then
    if exists (select 1 from public.org_members where org_id = p_org and user_id = uid) then
      raise exception 'already_member';
    end if;
    insert into public.org_members (org_id, user_id, role, display_name) values (p_org, uid, p_role, v_name);
    insert into public.audit_log (actor_id, org_id, action, target_table, target_id, detail)
    values (auth.uid(), p_org, 'member_added', 'org_members', uid, jsonb_build_object('role', p_role, 'email', v_email));
    return 'added';
  end if;

  insert into public.org_invites (org_id, email, role, display_name, invited_by)
  values (p_org, v_email, p_role, v_name, auth.uid())
  on conflict (org_id, email) where accepted_at is null do update set role = excluded.role, display_name = excluded.display_name;
  insert into public.audit_log (actor_id, org_id, action, target_table, detail)
  values (auth.uid(), p_org, 'member_invited', 'org_invites', jsonb_build_object('role', p_role, 'email', v_email));
  return 'invited';
end $$;

create function public.cancel_invite(p_invite uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v public.org_invites;
begin
  select * into v from public.org_invites where id = p_invite and accepted_at is null;
  if v.id is null then return; end if;
  perform public.require_admin(v.org_id);
  delete from public.org_invites where id = v.id;
  insert into public.audit_log (actor_id, org_id, action, target_table, detail)
  values (auth.uid(), v.org_id, 'invite_cancelled', 'org_invites', jsonb_build_object('email', v.email));
end $$;

-- Only an owner gives or takes the owner role, and an org always keeps one owner.
create function public.set_member_role(p_org uuid, p_user uuid, p_role text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  me_role text := public.require_admin(p_org);
  old_role text;
begin
  if p_role not in ('owner', 'admin', 'agronomist', 'field_officer', 'viewer') then raise exception 'unknown role %', p_role; end if;
  select role into old_role from public.org_members where org_id = p_org and user_id = p_user for update;
  if old_role is null then raise exception 'not a member of this org'; end if;
  if old_role = p_role then return; end if;
  if me_role <> 'owner' and (p_role in ('owner', 'admin') or old_role in ('owner', 'admin')) then
    raise exception 'only an owner can change an admin or owner' using errcode = '42501';
  end if;
  if old_role = 'owner' and public.owner_count(p_org) = 1 then raise exception 'last_owner'; end if;
  update public.org_members set role = p_role where org_id = p_org and user_id = p_user;
  insert into public.audit_log (actor_id, org_id, action, target_table, target_id, detail)
  values (auth.uid(), p_org, 'member_role', 'org_members', p_user, jsonb_build_object('from', old_role, 'to', p_role));
end $$;

-- Removes a team member. Cases they were handling go back to the open queue.
create function public.remove_member(p_org uuid, p_user uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  me_role text := public.require_admin(p_org);
  old_role text;
begin
  select role into old_role from public.org_members where org_id = p_org and user_id = p_user for update;
  if old_role is null then return; end if;
  if me_role <> 'owner' and old_role in ('owner', 'admin') then
    raise exception 'only an owner can remove an admin or owner' using errcode = '42501';
  end if;
  if old_role = 'owner' and public.owner_count(p_org) = 1 then raise exception 'last_owner'; end if;
  delete from public.org_members where org_id = p_org and user_id = p_user;
  update public.issues i set assignee_id = null, status = case when i.status = 'in_review' then 'open' else i.status end
  where i.assignee_id = p_user and i.status <> 'closed'
    and exists (select 1 from public.farms f join public.org_farmer_links l on l.farmer_id = f.owner_id
                where f.id = i.farm_id and l.org_id = p_org);
  insert into public.audit_log (actor_id, org_id, action, target_table, target_id, detail)
  values (auth.uid(), p_org, 'member_removed', 'org_members', p_user, jsonb_build_object('role', old_role));
end $$;

-- A new code stops the old one working. Farmers already in the co-op stay in.
create function public.regenerate_join_code(p_org uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare code text;
begin
  perform public.require_admin(p_org);
  code := public.new_join_code((select name from public.orgs where id = p_org));
  update public.orgs set join_code = code where id = p_org;
  insert into public.audit_log (actor_id, org_id, action, target_table, target_id)
  values (auth.uid(), p_org, 'join_code_changed', 'orgs', p_org);
  return code;
end $$;

-- Takes a farmer out of the co-op. Their data stays theirs; the co-op stops seeing it.
create function public.remove_farmer(p_org uuid, p_farmer uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.require_admin(p_org);
  update public.org_farmer_links set status = 'revoked', updated_at = now()
  where org_id = p_org and farmer_id = p_farmer and status <> 'revoked';
  if found then
    insert into public.audit_log (actor_id, org_id, action, target_table, target_id)
    values (auth.uid(), p_org, 'farmer_removed', 'org_farmer_links', p_farmer);
  end if;
end $$;

-- 4. Team and farmer lists ---------------------------------------------------------------------

-- Team list with sign-in emails, for any member of the org.
create function public.org_team(p_org uuid)
returns table (user_id uuid, display_name text, role text, email text, joined_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.display_name, m.role, u.email::text, m.created_at, u.last_sign_in_at
  from public.org_members m join auth.users u on u.id = m.user_id
  where m.org_id = p_org and public.member_role(p_org) is not null
  order by case m.role when 'owner' then 0 when 'admin' then 1 when 'agronomist' then 2 when 'field_officer' then 3 else 4 end, m.display_name
$$;

-- Farmers with an active link, with a summary of their farm and checks, for any member of the org.
create function public.org_farmers(p_org uuid)
returns table (
  farmer_id uuid, display_name text, phone text, language text, county text, ward text,
  farm_name text, size_band text, water_source text, main_crops text[], plots bigint,
  checks bigint, open_cases bigint, last_check_at timestamptz, joined_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    l.farmer_id, p.display_name, u.phone::text, p.language, coalesce(p.county, f.county), coalesce(p.ward, f.ward),
    f.name, f.size_band, f.water_source, f.main_crops,
    (select count(*) from public.plots pl join public.farms ff on ff.id = pl.farm_id where ff.owner_id = l.farmer_id),
    (select count(*) from public.crop_checks c join public.farms ff on ff.id = c.farm_id where ff.owner_id = l.farmer_id),
    (select count(*) from public.issues i join public.farms ff on ff.id = i.farm_id where ff.owner_id = l.farmer_id and i.status <> 'closed'),
    (select max(c.captured_at) from public.crop_checks c join public.farms ff on ff.id = c.farm_id where ff.owner_id = l.farmer_id),
    coalesce(l.consented_at, l.created_at)
  from public.org_farmer_links l
  join auth.users u on u.id = l.farmer_id
  left join public.profiles p on p.user_id = l.farmer_id
  left join lateral (select * from public.farms ff where ff.owner_id = l.farmer_id order by ff.created_at limit 1) f on true
  where l.org_id = p_org and l.status = 'active' and public.member_role(p_org) is not null
  order by coalesce(l.consented_at, l.created_at) desc
$$;

-- 5. Signing in and setting up -----------------------------------------------------------------

-- Called by the dashboard after sign-in: turns open invites for this email into memberships.
create function public.claim_invites() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := (select lower(email) from auth.users where id = auth.uid());
  v record;
  n int := 0;
begin
  if v_email is null then return 0; end if;
  for v in select * from public.org_invites where email = v_email and accepted_at is null for update loop
    insert into public.org_members (org_id, user_id, role, display_name)
    values (v.org_id, auth.uid(), v.role, v.display_name) on conflict do nothing;
    update public.org_invites set accepted_at = now() where id = v.id;
    insert into public.audit_log (actor_id, org_id, action, target_table, target_id, detail)
    values (auth.uid(), v.org_id, 'invite_accepted', 'org_invites', v.id, jsonb_build_object('role', v.role));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Someone with a dashboard account and no org starts one and becomes its owner.
create function public.create_org(p_name text, p_kind text, p_my_name text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or (select email from auth.users where id = auth.uid()) is null then
    raise exception 'sign in with an email first' using errcode = '42501';
  end if;
  if exists (select 1 from public.org_members where user_id = auth.uid()) then raise exception 'already in an org'; end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_my_name), '') = '' then raise exception 'a name is required'; end if;
  insert into public.orgs (name, kind) values (left(trim(p_name), 80), coalesce(nullif(p_kind, ''), 'coop')) returning id into v_id;
  insert into public.org_members (org_id, user_id, role, display_name) values (v_id, auth.uid(), 'owner', left(trim(p_my_name), 80));
  insert into public.audit_log (actor_id, org_id, action, target_table, target_id) values (auth.uid(), v_id, 'org_created', 'orgs', v_id);
  return v_id;
end $$;

-- 6. Farmer side -------------------------------------------------------------------------------

-- Looks a code up so the app can show the co-op's name before the farmer agrees. Wrong codes count
-- towards the same hourly limit as joining.
create function public.find_org_by_code(p_code text) returns table (id uuid, name text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if (select count(*) from public.audit_log a where a.actor_id = auth.uid() and a.action = 'join_code_wrong'
      and a.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_tries';
  end if;
  return query select g.id, g.name from public.orgs g where public.norm_code(g.join_code) = public.norm_code(p_code);
  if not found then
    insert into public.audit_log (actor_id, action, target_table) values (auth.uid(), 'join_code_wrong', 'orgs');
  end if;
end $$;

-- Joins with a code. Records the farmer's agreement to share. Returns the co-op, or nothing when
-- the code matches none. More than 10 wrong codes in an hour locks joining for that hour.
create function public.join_org(p_code text) returns table (id uuid, name text)
language plpgsql volatile security definer set search_path = '' as $$
declare o public.orgs;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if (select count(*) from public.audit_log a where a.actor_id = auth.uid() and a.action = 'join_code_wrong'
      and a.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_tries';
  end if;
  select * into o from public.orgs g where public.norm_code(g.join_code) = public.norm_code(p_code);
  if o.id is null then
    insert into public.audit_log (actor_id, action, target_table) values (auth.uid(), 'join_code_wrong', 'orgs');
    return;
  end if;
  if exists (select 1 from public.org_members m where m.org_id = o.id and m.user_id = auth.uid()) then
    raise exception 'staff_account';
  end if;
  insert into public.org_farmer_links (org_id, farmer_id, status, consented_at)
  values (o.id, auth.uid(), 'active', now())
  on conflict (org_id, farmer_id) do update set status = 'active', consented_at = now(), updated_at = now();
  insert into public.consents (user_id, kind, version) values (auth.uid(), 'org_share', '2026-10');
  insert into public.audit_log (actor_id, org_id, action, target_table, target_id)
  values (auth.uid(), o.id, 'farmer_joined', 'org_farmer_links', auth.uid());
  return query select o.id, o.name;
end $$;

-- Leaves a co-op: the link is revoked at once, and the sharing agreement is withdrawn when no
-- other co-op still has one.
create function public.leave_org(p_org uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.org_farmer_links set status = 'revoked', updated_at = now()
  where org_id = p_org and farmer_id = auth.uid() and status <> 'revoked';
  if not found then return; end if;
  if not exists (select 1 from public.org_farmer_links where farmer_id = auth.uid() and status = 'active') then
    update public.consents set withdrawn_at = now() where user_id = auth.uid() and kind = 'org_share' and withdrawn_at is null;
  end if;
  insert into public.audit_log (actor_id, org_id, action, target_table, target_id)
  values (auth.uid(), p_org, 'farmer_left', 'org_farmer_links', auth.uid());
end $$;

-- The farmer's co-ops, with when they joined.
create function public.my_coops() returns table (id uuid, name text, kind text, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, o.kind, coalesce(l.consented_at, l.created_at)
  from public.org_farmer_links l join public.orgs o on o.id = l.org_id
  where l.farmer_id = auth.uid() and l.status = 'active'
  order by 4
$$;

-- 7. Grants ------------------------------------------------------------------------------------

revoke execute on function public.new_join_code(text), public.org_join_code(), public.member_role(uuid),
  public.require_admin(uuid), public.owner_count(uuid) from public, anon, authenticated;
revoke execute on function
  public.invite_member(uuid, text, text, text), public.cancel_invite(uuid), public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid), public.regenerate_join_code(uuid), public.remove_farmer(uuid, uuid),
  public.org_team(uuid), public.org_farmers(uuid), public.claim_invites(), public.create_org(text, text, text),
  public.find_org_by_code(text), public.join_org(text), public.leave_org(uuid), public.my_coops()
  from public, anon;
grant execute on function
  public.invite_member(uuid, text, text, text), public.cancel_invite(uuid), public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid), public.regenerate_join_code(uuid), public.remove_farmer(uuid, uuid),
  public.org_team(uuid), public.org_farmers(uuid), public.claim_invites(), public.create_org(text, text, text),
  public.find_org_by_code(text), public.join_org(text), public.leave_org(uuid), public.my_coops()
  to authenticated;

-- 8. Demo seed: an owner for the demo co-op ----------------------------------------------------

do $$
declare amina uuid;
begin
  if exists (select 1 from public.orgs where id = '00000000-0000-4000-8000-00000000d000')
     and not exists (select 1 from auth.users where email = 'admin.demo@example.com') then
    amina := public.demo_make_user('admin.demo@example.com', null, '{"display_name":"Amina O."}');
    insert into public.org_members (org_id, user_id, role, display_name)
      values ('00000000-0000-4000-8000-00000000d000', amina, 'owner', 'Amina O.');
  end if;
end $$;

-- ==== 20261028150000_reply_alerts.sql ====
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

-- ==== 20261028170000_guides_editor.sql ====
-- Knowledge base (architecture.md §5.4, R5, R6). Agronomists write short crop guides in English and
-- Kiswahili in the dashboard. A guide reaches farmers only after a second person on the team reviews
-- it, and a guide that names a product or a dose stays hidden from farmers while the
-- chemical_recommendations flag is off. Each published change is a new version; the old one retires.

alter table public.guides
  add column org_id uuid references public.orgs (id) on delete cascade,
  add column title text not null default '',
  add column steps text[] not null default '{}',
  add column warning text,
  add column status text not null default 'draft' check (status in ('draft', 'in_review', 'published', 'retired')),
  add column author_id uuid references auth.users (id) on delete set null,
  add column author_name text,
  add column reviewer_name text,
  add column review_note text,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add column published_at timestamptz,
  alter column body_md set default '',
  add constraint guides_published_reviewed check (status not in ('published', 'retired') or reviewed_on is not null),
  add constraint guides_steps_count check (cardinality(steps) <= 8);

-- One live version and at most one open draft per guide.
create unique index guides_one_published on public.guides (coalesce(org_id, '00000000-0000-0000-0000-000000000000'), cause_id, language, coalesce(region, ''))
  where status = 'published';
create unique index guides_one_open on public.guides (coalesce(org_id, '00000000-0000-0000-0000-000000000000'), cause_id, language, coalesce(region, ''))
  where status in ('draft', 'in_review');
create index guides_org_id_idx on public.guides (org_id);
create index guides_author_id_idx on public.guides (author_id);

drop policy "reviewed guides" on public.guides;
-- Farmers: published guides from ShambaSense and from co-ops they belong to.
create policy "farmers read published guides" on public.guides for select to authenticated
  using (
    status = 'published'
    and (org_id is null or exists (select 1 from public.org_farmer_links l
                                   where l.org_id = guides.org_id and l.farmer_id = (select auth.uid()) and l.status = 'active'))
    and (not contains_chemical or exists (select 1 from public.feature_flags f where f.key = 'chemical_recommendations' and f.enabled))
  );
-- Team members: every version of their org's guides, and ShambaSense's published ones.
create policy "members read guides" on public.guides for select to authenticated
  using (org_id in (select public.my_org_ids()) or (org_id is null and status = 'published' and exists (select 1 from public.org_members m where m.user_id = (select auth.uid()))));

-- Who may write and review guides for an org.
create function public.guide_writer(p_org uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare r text := public.member_role(p_org);
begin
  if r is null or r not in ('owner', 'admin', 'agronomist') then
    raise exception 'only agronomists and admins write guides' using errcode = '42501';
  end if;
  return r;
end $$;

create function public.guide_flagged(p_title text, p_steps text[], p_warning text) returns boolean
language sql immutable set search_path = '' as $$
  select public.reply_flagged(coalesce(p_title, '') || ' ' || array_to_string(coalesce(p_steps, '{}'), ' ') || ' ' || coalesce(p_warning, ''))
$$;

-- Creates a draft (p_id null) or changes one. Changing a guide that is waiting for review sends it
-- back to draft, so the reviewer always approves the text they read.
create function public.save_guide(p_id uuid, p_org uuid, p_cause text, p_language text, p_title text, p_steps text[], p_warning text)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  g public.guides;
  v_steps text[] := array(select trim(s) from unnest(coalesce(p_steps, '{}')) s where trim(s) <> '');
  v_title text := left(trim(coalesce(p_title, '')), 120);
  v_warning text := nullif(left(trim(coalesce(p_warning, '')), 300), '');
  v_id uuid;
begin
  if v_title = '' then raise exception 'a title is required'; end if;
  if cardinality(v_steps) = 0 then raise exception 'add at least one step'; end if;
  if cardinality(v_steps) > 8 then raise exception 'at most 8 steps'; end if;
  if exists (select 1 from unnest(v_steps) s where length(s) > 300) then raise exception 'keep each step under 300 characters'; end if;

  if p_id is null then
    perform public.guide_writer(p_org);
    if p_language not in ('en', 'sw') then raise exception 'unknown language'; end if;
    if not exists (select 1 from public.causes where id = p_cause) then raise exception 'unknown cause'; end if;
    if exists (select 1 from public.guides where org_id = p_org and cause_id = p_cause and language = p_language and region is null and status in ('draft', 'in_review')) then
      raise exception 'draft_exists';
    end if;
    insert into public.guides (org_id, cause_id, language, version, title, steps, warning, contains_chemical, author_id, author_name)
    values (p_org, p_cause, p_language,
            coalesce((select max(version) from public.guides where org_id = p_org and cause_id = p_cause and language = p_language and region is null), 0) + 1,
            v_title, v_steps, v_warning, public.guide_flagged(v_title, v_steps, v_warning), auth.uid(), public.reviewer_name())
    returning id into v_id;
    insert into public.audit_log (actor_id, org_id, action, target_table, target_id) values (auth.uid(), p_org, 'guide_created', 'guides', v_id);
    return v_id;
  end if;

  select * into g from public.guides where id = p_id for update;
  if g.id is null or g.org_id is null then raise exception 'guide not found'; end if;
  perform public.guide_writer(g.org_id);
  if g.status not in ('draft', 'in_review') then raise exception 'a published guide changes through a new version'; end if;
  update public.guides set title = v_title, steps = v_steps, warning = v_warning,
    contains_chemical = public.guide_flagged(v_title, v_steps, v_warning), status = 'draft', updated_at = now()
  where id = g.id;
  return g.id;
end $$;

-- A new draft from the live version, for changes after publishing.
create function public.new_guide_version(p_id uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare g public.guides; v_id uuid;
begin
  select * into g from public.guides where id = p_id;
  if g.id is null or g.org_id is null then raise exception 'guide not found'; end if;
  perform public.guide_writer(g.org_id);
  select id into v_id from public.guides where org_id = g.org_id and cause_id = g.cause_id and language = g.language
    and coalesce(region, '') = coalesce(g.region, '') and status in ('draft', 'in_review');
  if v_id is not null then return v_id; end if;
  insert into public.guides (org_id, cause_id, language, region, version, title, steps, warning, contains_chemical, author_id, author_name)
  values (g.org_id, g.cause_id, g.language, g.region,
          (select max(version) from public.guides where org_id = g.org_id and cause_id = g.cause_id and language = g.language and coalesce(region, '') = coalesce(g.region, '')) + 1,
          g.title, g.steps, g.warning, g.contains_chemical, auth.uid(), public.reviewer_name())
  returning id into v_id;
  return v_id;
end $$;

create function public.submit_guide(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare g public.guides;
begin
  select * into g from public.guides where id = p_id for update;
  if g.id is null or g.org_id is null then raise exception 'guide not found'; end if;
  perform public.guide_writer(g.org_id);
  if g.status <> 'draft' then return; end if;
  update public.guides set status = 'in_review', review_note = null, updated_at = now() where id = g.id;
  insert into public.audit_log (actor_id, org_id, action, target_table, target_id) values (auth.uid(), g.org_id, 'guide_submitted', 'guides', g.id);
end $$;

-- A second person approves (the live version retires) or sends it back with a note.
create function public.review_guide(p_id uuid, p_approve boolean, p_note text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare g public.guides;
begin
  select * into g from public.guides where id = p_id for update;
  if g.id is null or g.org_id is null then raise exception 'guide not found'; end if;
  perform public.guide_writer(g.org_id);
  if g.status <> 'in_review' then raise exception 'this guide is not waiting for review'; end if;
  if g.author_id = auth.uid() then raise exception 'own_guide'; end if;
  if p_approve then
    update public.guides set status = 'retired', updated_at = now()
    where org_id = g.org_id and cause_id = g.cause_id and language = g.language and coalesce(region, '') = coalesce(g.region, '') and status = 'published';
    update public.guides set status = 'published', reviewer_id = auth.uid(), reviewer_name = public.reviewer_name(),
      reviewed_on = (now() at time zone 'Africa/Nairobi')::date, published_at = now(), review_note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now()
    where id = g.id;
  else
    if coalesce(trim(p_note), '') = '' then raise exception 'say what to change'; end if;
    update public.guides set status = 'draft', review_note = trim(p_note), updated_at = now() where id = g.id;
  end if;
  insert into public.audit_log (actor_id, org_id, action, target_table, target_id, detail)
  values (auth.uid(), g.org_id, case when p_approve then 'guide_published' else 'guide_sent_back' end, 'guides', g.id, jsonb_build_object('version', g.version));
end $$;

-- Takes a guide off farmers' phones, or deletes a draft nobody needs.
create function public.retire_guide(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare g public.guides;
begin
  select * into g from public.guides where id = p_id for update;
  if g.id is null or g.org_id is null then raise exception 'guide not found'; end if;
  perform public.guide_writer(g.org_id);
  if g.status = 'published' then
    update public.guides set status = 'retired', updated_at = now() where id = g.id;
  elsif g.status in ('draft', 'in_review') then
    delete from public.guides where id = g.id;
  end if;
  insert into public.audit_log (actor_id, org_id, action, target_table, target_id) values (auth.uid(), g.org_id, 'guide_retired', 'guides', g.id);
end $$;

revoke execute on function public.guide_writer(uuid) from public, anon, authenticated;
revoke execute on function public.save_guide(uuid, uuid, text, text, text, text[], text), public.new_guide_version(uuid),
  public.submit_guide(uuid), public.review_guide(uuid, boolean, text), public.retire_guide(uuid) from public, anon;
grant execute on function public.save_guide(uuid, uuid, text, text, text, text[], text), public.new_guide_version(uuid),
  public.submit_guide(uuid), public.review_guide(uuid, boolean, text), public.retire_guide(uuid) to authenticated;

-- Demo: the app's starter guides, waiting for the demo co-op's agronomists to review them.
insert into public.guides (org_id, cause_id, language, title, steps, warning, status, author_name)
select '00000000-0000-4000-8000-00000000d000', s.cause_id, s.language, s.title, s.steps, s.warning, 'in_review', 'ShambaSense'
from (values
    ('early_blight', 'en', 'Early blight on tomatoes', array['Pick off the lowest leaves with spots and carry them out of the field.', 'Water at the base of the plant in the morning. Keep the leaves dry.', 'Put dry grass or mulch under the plants so soil does not splash onto the leaves.', 'Next season, plant tomatoes and potatoes in a different place.'], 'Ask an agronomist if it keeps spreading after a week, or reaches the fruit.'),
    ('late_blight', 'en', 'Late blight on tomatoes', array['Act today. Late blight can spread across a plot in a few days.', 'Pull out plants with many dark patches. Bury or burn them away from the field. Do not compost them.', 'Do not work among the plants while they are wet.', 'Ask an agronomist how to protect the plants that are still healthy.'], 'Ask an agronomist today if more than a few plants have dark patches.'),
    ('septoria', 'en', 'Septoria leaf spot on tomatoes', array['Remove the lower leaves with spots and carry them out of the field.', 'Stake the plants and remove extra side shoots so air moves through.', 'Water at the base of the plant, not over the leaves.', 'Next season, plant tomatoes in a different place.'], 'Ask an agronomist if it keeps spreading after a week, or reaches the fruit.'),
    ('tuta', 'en', 'Tomato leaf miner (Tuta)', array['Pick the leaves and fruit with mines and destroy them. Do not leave them in the field.', 'Hang sticky or pheromone traps to see how many moths there are.', 'After harvest, pull out and destroy the old tomato plants.', 'Ask an agronomist if the damage keeps spreading.'], 'Ask an agronomist if it keeps spreading after a week, or reaches the fruit.'),
    ('early_blight', 'sw', 'Kuoza kwa majani kwenye nyanya', array['Ondoa majani ya chini yenye madoa na uyapeleke nje ya shamba.', 'Mwagilia kwenye shina asubuhi. Usiloweshe majani.', 'Weka nyasi kavu au matandazo chini ya mimea ili udongo usirukie majani.', 'Msimu ujao, panda nyanya na viazi mahali tofauti.'], 'Uliza mtaalamu kama unaendelea kuenea baada ya wiki moja, au ukifika kwenye matunda.'),
    ('late_blight', 'sw', 'Ukungu wa nyanya', array['Chukua hatua leo. Ugonjwa huu unaweza kuenea shamba lote kwa siku chache.', 'Ng’oa mimea yenye mabaka mengi meusi. Ifukie au ichome mbali na shamba. Usiiweke kwenye mboji.', 'Usifanye kazi katikati ya mimea ikiwa bado imelowa.', 'Uliza mtaalamu jinsi ya kulinda mimea ambayo bado ni mizima.'], 'Uliza mtaalamu leo kama mimea mingi ina mabaka meusi.'),
    ('septoria', 'sw', 'Madoa madogo ya majani kwenye nyanya', array['Ondoa majani ya chini yenye madoa na uyapeleke nje ya shamba.', 'Weka miti ya kushikilia mimea na upunguze machipukizi ya pembeni ili hewa ipite.', 'Mwagilia kwenye shina, si juu ya majani.', 'Msimu ujao, panda nyanya mahali tofauti.'], 'Uliza mtaalamu kama unaendelea kuenea baada ya wiki moja, au ukifika kwenye matunda.'),
    ('tuta', 'sw', 'Kipekecha majani ya nyanya (Tuta)', array['Chuma majani na matunda yaliyoathirika na uyaharibu. Usiyaache shambani.', 'Tundika mitego ya gundi au ya harufu ili uone idadi ya nondo.', 'Baada ya mavuno, ng’oa na uharibu mimea ya zamani ya nyanya.', 'Uliza mtaalamu ikiwa uharibifu unaendelea kuenea.'], 'Uliza mtaalamu kama unaendelea kuenea baada ya wiki moja, au ukifika kwenye matunda.')

) as s (cause_id, language, title, steps, warning)
where exists (select 1 from public.orgs where id = '00000000-0000-4000-8000-00000000d000')
on conflict do nothing;

-- ==== 20261028190000_tasks_and_visits.sql ====
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

-- ==== 20261028210000_scouting.sql ====
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

-- ==== 20261028230000_sms_sign_in.sql ====
-- Real SMS sign-in next to the demo accounts. Codes go out through the Send SMS hook
-- (functions/send-sms, Africa's Talking). The 'sms_auth' flag turns it on for new numbers;
-- demo accounts (farmer.<number>@example.com) keep signing in with 123456 while 'demo_auth' is on.

insert into public.feature_flags (key, enabled) values ('sms_auth', false)
  on conflict (key) do nothing;

-- How the farmer app signs in this number: 'demo' (code 123456, nothing sent) or 'sms' (a real code).
create function public.sign_in_mode(p_phone text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when coalesce((select enabled from public.feature_flags where key = 'demo_auth'), false)
      and exists (select 1 from auth.users where email = 'farmer.' || ltrim(p_phone, '+') || '@example.com') then 'demo'
    when coalesce((select enabled from public.feature_flags where key = 'sms_auth'), false) then 'sms'
    when coalesce((select enabled from public.feature_flags where key = 'demo_auth'), false) then 'demo'
    else 'sms'
  end
$$;
revoke execute on function public.sign_in_mode(text) from public;
grant execute on function public.sign_in_mode(text) to anon, authenticated;

-- ==== 20261028233000_app_errors.sql ====
-- Error tracking without another service: both apps send crashes and failed calls here, and the team
-- reads them in Supabase (Table Editor → app_errors).
-- No client reads this table. Writes go through log_app_error, which trims and caps them.

create table public.app_errors (
  id bigint generated always as identity primary key,
  app text not null check (app in ('farmer', 'dashboard')),
  version text,
  platform text,
  user_id uuid default auth.uid(),
  message text not null,
  stack text,
  context jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index app_errors_day on public.app_errors (created_at desc);
alter table public.app_errors enable row level security;

create function public.log_app_error(p_app text, p_version text, p_platform text, p_message text, p_stack text, p_context jsonb)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_app not in ('farmer', 'dashboard') or coalesce(btrim(p_message), '') = '' then return; end if;
  -- A loop on one phone must not fill the table: 50 an hour per signed-in user, 500 an hour for
  -- everyone not signed in, then the rest are dropped.
  if auth.uid() is not null then
    if (select count(*) from public.app_errors where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 50 then return; end if;
  elsif (select count(*) from public.app_errors where user_id is null and created_at > now() - interval '1 hour') >= 500 then
    return;
  end if;
  insert into public.app_errors (app, version, platform, message, stack, context)
  values (p_app, left(p_version, 40), left(p_platform, 40), left(p_message, 1000), left(p_stack, 4000),
          case when jsonb_typeof(p_context) = 'object' and length(p_context::text) <= 4000 then p_context else '{}'::jsonb end);
end $$;

revoke execute on function public.log_app_error(text, text, text, text, text, jsonb) from public;
grant execute on function public.log_app_error(text, text, text, text, text, jsonb) to anon, authenticated;

-- Keep 90 days.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('app-errors-cleanup', '15 3 * * *', 'delete from public.app_errors where created_at < now() - interval ''90 days''');
  end if;
end $$;

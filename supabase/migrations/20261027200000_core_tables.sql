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

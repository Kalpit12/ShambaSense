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

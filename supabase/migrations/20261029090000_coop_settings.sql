-- Co-op settings (design.md §10). Admins keep the co-op's details: its name, type, home county, a phone
-- number farmers can call, and the crops it works with. Every member sets the name farmers see on
-- their replies. Farmers see the co-op's phone number in the app's Profile.

-- 1. Columns -----------------------------------------------------------------------------------

-- The crops with photo checks and guides. A co-op narrows the dashboard to the ones it works with.
alter table public.orgs
  add column county text check (county is null or length(county) between 2 and 40),
  add column contact_phone text check (contact_phone is null or contact_phone ~ '^\+254[17][0-9]{8}$'),
  add column crops text[] not null default array['tomatoes', 'maize', 'beans', 'kale', 'cabbage', 'potatoes']
    check (cardinality(crops) between 1 and 6 and crops <@ array['tomatoes', 'maize', 'beans', 'kale', 'cabbage', 'potatoes']);

update public.orgs set county = 'Nakuru'
  where id = '00000000-0000-4000-8000-00000000d000' and county is null;

-- 2. Admin: save the co-op's details ----------------------------------------------------------

-- Phone numbers come in as people type them (0712 345 678, +254 712 345 678) and are kept as +2547....
create function public.update_org_settings(p_org uuid, p_name text, p_kind text, p_county text, p_contact_phone text, p_crops text[])
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  digits text := regexp_replace(coalesce(p_contact_phone, ''), '[^0-9]', '', 'g');
  v_phone text;
  v_crops text[];
begin
  perform public.require_admin(p_org);
  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'name_length' using errcode = '22023'; end if;
  if p_kind not in ('coop', 'ngo', 'agribusiness') then raise exception 'bad_kind' using errcode = '22023'; end if;
  if digits = '' then v_phone := null;
  elsif digits ~ '^0[17][0-9]{8}$' then v_phone := '+254' || substr(digits, 2);
  elsif digits ~ '^254[17][0-9]{8}$' then v_phone := '+' || digits;
  elsif digits ~ '^[17][0-9]{8}$' then v_phone := '+254' || digits;
  else raise exception 'bad_phone' using errcode = '22023';
  end if;
  select array_agg(distinct c order by c) into v_crops from unnest(coalesce(p_crops, '{}')) c;
  if v_crops is null then raise exception 'no_crops' using errcode = '22023'; end if;
  if not v_crops <@ array['tomatoes', 'maize', 'beans', 'kale', 'cabbage', 'potatoes'] then
    raise exception 'bad_crop' using errcode = '22023';
  end if;

  update public.orgs
     set name = v_name, kind = p_kind, county = nullif(trim(coalesce(p_county, '')), ''), contact_phone = v_phone,
         crops = v_crops, updated_at = now()
   where id = p_org;
  insert into public.audit_log (actor_id, org_id, action, target_table, target_id, detail)
  values (auth.uid(), p_org, 'org_settings_saved', 'orgs', p_org,
          jsonb_build_object('name', v_name, 'kind', p_kind, 'county', p_county, 'crops', v_crops));
end $$;

-- 3. Any member: the name farmers see on replies ----------------------------------------------

create function public.set_my_display_name(p_org uuid, p_name text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_name text := trim(coalesce(p_name, ''));
begin
  if length(v_name) < 2 or length(v_name) > 60 then raise exception 'name_length' using errcode = '22023'; end if;
  update public.org_members set display_name = v_name where org_id = p_org and user_id = auth.uid();
  if not found then raise exception 'not a member of this org' using errcode = '42501'; end if;
end $$;

-- 4. Farmers: the co-op's phone number --------------------------------------------------------

drop function public.my_coops();
create function public.my_coops() returns table (id uuid, name text, kind text, joined_at timestamptz, contact_phone text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, o.kind, coalesce(l.consented_at, l.created_at), o.contact_phone
  from public.org_farmer_links l join public.orgs o on o.id = l.org_id
  where l.farmer_id = auth.uid() and l.status = 'active'
  order by 4
$$;

-- 5. Grants ------------------------------------------------------------------------------------

revoke execute on function public.update_org_settings(uuid, text, text, text, text, text[]), public.set_my_display_name(uuid, text),
  public.my_coops() from public, anon;
grant execute on function public.update_org_settings(uuid, text, text, text, text, text[]), public.set_my_display_name(uuid, text),
  public.my_coops() to authenticated;

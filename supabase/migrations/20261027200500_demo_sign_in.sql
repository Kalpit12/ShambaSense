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

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

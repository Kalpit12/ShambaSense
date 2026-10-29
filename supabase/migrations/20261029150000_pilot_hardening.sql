-- Pilot hardening, from the launch review (Supabase advisors, 29 Oct 2026).

-- 1. Once real SMS sign-in is on, nobody can make new demo accounts. Otherwise anyone could call
--    demo_sign_up with a farmer's number before the farmer joins, and that number would then sign
--    in with the shared demo code. Existing demo accounts keep working until demo_auth is off.
create or replace function public.demo_sign_up(p_phone text, p_name text, p_county text, p_language text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_digits text := ltrim(p_phone, '+');
  v_email text := 'farmer.' || ltrim(p_phone, '+') || '@example.com';
  uid uuid;
begin
  if not coalesce((select enabled from public.feature_flags where key = 'demo_auth'), false)
     or coalesce((select enabled from public.feature_flags where key = 'sms_auth'), false) then
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

-- 2. Indexes for the foreign keys the advisor found without one. They keep deletes of a farmer, plot,
--    task or team member fast as the pilot's data grows.
create index if not exists scouting_findings_cause_id_idx on public.scouting_findings (cause_id);
create index if not exists scouting_reports_farmer_id_idx on public.scouting_reports (farmer_id);
create index if not exists scouting_reports_plot_id_idx on public.scouting_reports (plot_id);
create index if not exists scouting_reports_scout_id_idx on public.scouting_reports (scout_id);
create index if not exists scouting_reports_task_id_idx on public.scouting_reports (task_id);
create index if not exists tasks_assignee_id_idx on public.tasks (assignee_id);
create index if not exists tasks_created_by_idx on public.tasks (created_by);
create index if not exists tasks_issue_id_idx on public.tasks (issue_id);
create index if not exists tasks_plot_id_idx on public.tasks (plot_id);

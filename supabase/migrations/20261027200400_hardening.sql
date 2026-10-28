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

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

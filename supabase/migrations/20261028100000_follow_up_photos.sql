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

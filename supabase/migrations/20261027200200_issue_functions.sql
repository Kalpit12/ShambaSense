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

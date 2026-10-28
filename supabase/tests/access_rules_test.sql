-- Signs in as each role and checks what it can and cannot see or do (architecture.md §5.6).
-- Run on a fresh database after supabase-stub.sql and the migrations. Any failed check raises.
\set ON_ERROR_STOP on

insert into auth.users (id, phone, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '+254712345678', '{"display_name": "Juma", "county": "Nakuru", "language": "sw"}');  -- farmer A, linked to the co-op
insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-00000000000b', '+254700000002'),  -- farmer B, not linked
  ('00000000-0000-0000-0000-0000000000c1', null);             -- agronomist at the co-op
insert into public.orgs (id, name, kind) values ('00000000-0000-0000-0000-0000000000f1', 'Njoro Growers Co-op', 'coop');
insert into public.org_members values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', 'agronomist', 'Wanjiru K.');
insert into public.org_farmer_links (org_id, farmer_id, status, consented_at)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'active', now());

create function pg_temp.as_user(id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', id, false);
  execute 'set role authenticated';
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;

-- Farmer A writes a farm, plot, journal entry and a check.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select display_name from public.profiles) = 'Juma', 'sign-up metadata becomes the profile');
update public.profiles set goals = '{checkCrops}', gender = 'woman';
insert into public.consents (user_id, kind, version) values ('00000000-0000-0000-0000-00000000000a', 'sensitive_profile', '2026-10');
select pg_temp.check((select gender from public.profiles) = 'woman', 'farmer saves first-time answers');
insert into public.farms (id, name, county, ward, size_band, main_crops) values ('10000000-0000-0000-0000-000000000001', 'Shamba la Juma', 'Nakuru', 'Njoro', '1to2', '{maize,tomatoes}');
insert into public.plots (id, farm_id, name, area) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Tomatoes by the tank', 0.25);
insert into public.journal_events (id, farm_id, plot_id, kind, occurred_on, amount_kes, note)
  values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'sale', current_date, 1500, 'Sukuma');
insert into public.crop_checks (id, farm_id, plot_id, crop_claimed, symptoms, captured_at)
  values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'tomatoes', '{spots}', now());
select pg_temp.check((select count(*) from public.farms) = 1, 'farmer A sees own farm');

update public.journal_events set amount_kes = 9 where id = '30000000-0000-0000-0000-000000000001';
select pg_temp.check((select amount_kes from public.journal_events) = 1500, 'journal update is refused (insert-only)');
delete from public.journal_events;
select pg_temp.check((select count(*) from public.journal_events) = 1, 'journal delete is refused');

do $$ begin
  insert into public.farms (id, owner_id, name) values ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000b', 'Fake');
  raise exception 'FAILED: farmer A created a farm for farmer B';
exception when insufficient_privilege then raise notice 'ok: cannot create a farm for someone else';
end $$;

-- Farmer B sees nothing of A's.
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.farms) = 0 and (select count(*) from public.crop_checks) = 0, 'farmer B cannot see farmer A');

-- The worker (service role, here the superuser) writes a result with raw scores.
reset role;
insert into public.check_results (check_id, model_version, state, causes, raw)
  values ('40000000-0000-0000-0000-000000000001', 'tomato-2026.10', 'possible_match', '[{"cause_id":"early_blight","likelihood":"more_likely"}]', '{"scores":[0.81]}');

-- Agronomist at the linked co-op sees A's farm, check and result, but never the raw scores.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check((select count(*) from public.crop_checks) = 1, 'linked agronomist sees the check');
select pg_temp.check((select state from public.check_results) = 'possible_match', 'agronomist reads the result');
do $$ begin
  perform raw from public.check_results;
  raise exception 'FAILED: raw scores readable';
exception when insufficient_privilege then raise notice 'ok: raw scores are not readable';
end $$;
do $$ begin
  insert into public.issue_events (issue_id, actor_kind, kind) values (gen_random_uuid(), 'agronomist', 'comment');
  raise exception 'FAILED: direct insert into issue_events';
exception when insufficient_privilege then raise notice 'ok: issue_events only through functions';
end $$;

-- Farmer A asks an agronomist; asking twice returns the same issue.
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select (public.ask_agronomist('40000000-0000-0000-0000-000000000001')).code) = (select (public.ask_agronomist('40000000-0000-0000-0000-000000000001')).code), 'asking twice gives one issue');
do $$ begin
  perform public.review_issue((select id from public.issues), 'review_agree', '{early_blight}', 'Looks fine');
  raise exception 'FAILED: farmer reviewed an issue';
exception when insufficient_privilege then raise notice 'ok: farmer cannot review';
end $$;

-- Agronomist reviews; a dose in the reply is flagged.
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check((public.review_issue((select id from public.issues), 'review_agree', '{early_blight}', 'Remove lower leaves. Spray 50 ml/20 L.', 3)).flagged, 'dose in a reply is flagged');
select pg_temp.check((select status from public.issues) = 'action_given' and (select follow_up_due_on from public.issues) = current_date + 3, 'review moves the issue on');
do $$ begin
  perform public.review_issue((select id from public.issues), 'review_adjust', '{not_a_cause}', 'x');
  raise exception 'FAILED: unknown cause accepted';
exception when raise_exception then raise notice 'ok: unknown cause refused';
end $$;

-- Farmer A reads the agronomist's answer.
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.issue_events where kind = 'review_agree') = 1, 'farmer reads the answer');

-- Farmer A sends a follow-up photo; the case goes back to the agronomist with the outcome.
insert into public.crop_checks (id, farm_id, plot_id, crop_claimed, captured_at, kind, parent_check_id, outcome)
  values ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
          'tomatoes', now(), 'follow_up', '40000000-0000-0000-0000-000000000001', 'better');
select pg_temp.check((public.send_follow_up('40000000-0000-0000-0000-000000000003')).id = (public.send_follow_up('40000000-0000-0000-0000-000000000003')).id, 'follow-up twice gives one event');
select pg_temp.check((select count(*) from public.issue_events where kind = 'follow_up_result' and body = 'better') = 1
  and (select status from public.issues where origin_check_id = '40000000-0000-0000-0000-000000000001') = 'in_review'
  and (select follow_up_due_on from public.issues where origin_check_id = '40000000-0000-0000-0000-000000000001') is null, 'follow-up reopens the case');
do $$ begin
  insert into public.crop_checks (id, farm_id, crop_claimed, captured_at, outcome)
    values ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'tomatoes', now(), 'worse');
  raise exception 'FAILED: outcome on a first check';
exception when check_violation then raise notice 'ok: outcome only on follow-ups';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  perform public.send_follow_up('40000000-0000-0000-0000-000000000003');
  raise exception 'FAILED: farmer B sent A''s follow-up';
exception when insufficient_privilege then raise notice 'ok: only the owner sends a follow-up';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check((select count(*) from public.crop_checks where parent_check_id is not null) = 1, 'agronomist sees the follow-up photo');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');

-- Revoking the link removes the co-op's access at once.
update public.org_farmer_links set status = 'revoked' where farmer_id = '00000000-0000-0000-0000-00000000000a';
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check((select count(*) from public.crop_checks) = 0 and (select count(*) from public.issues) = 0, 'revoked link hides the farm');

-- A result the library cannot answer opens an issue by itself.
reset role;
insert into public.crop_checks (id, farm_id, crop_claimed, captured_at, created_by)
  values ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'tomatoes', now(), '00000000-0000-0000-0000-00000000000a');
insert into public.check_results (check_id, model_version, state) values ('40000000-0000-0000-0000-000000000002', 'tomato-2026.10', 'expert_review_required');
select pg_temp.check((select count(*) from public.issues where origin_check_id = '40000000-0000-0000-0000-000000000002') = 1, 'no-answer result opens an issue');

-- Co-op setup: team roles, invites, join codes.
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c2', 'owner@njoro.example');
insert into public.org_members values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c2', 'owner', 'Owner N.');
update public.orgs set join_code = 'NJR-1234' where id = '00000000-0000-0000-0000-0000000000f1';
update public.feature_flags set enabled = false where key = 'demo_auth';

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
do $$ begin
  perform public.invite_member('00000000-0000-0000-0000-0000000000f1', 'x@y.example', 'agronomist', 'X');
  raise exception 'FAILED: agronomist invited someone';
exception when insufficient_privilege then raise notice 'ok: only admins invite';
end $$;
select pg_temp.check((select count(*) from public.org_team('00000000-0000-0000-0000-0000000000f1')) = 2, 'members see the team');

reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check(public.invite_member('00000000-0000-0000-0000-0000000000f1', ' Chebet@Njoro.example ', 'field_officer', 'Chebet') = 'invited', 'new email waits as an invite');
select pg_temp.check((select count(*) from public.org_invites) = 1, 'admin sees the invite');
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c3', 'chebet@njoro.example');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select pg_temp.check(public.claim_invites() = 1 and public.claim_invites() = 0, 'claim runs once');
reset role;
select pg_temp.check((select role from public.org_members where user_id = '00000000-0000-0000-0000-0000000000c3') = 'field_officer', 'signing in claims the invite');
update public.feature_flags set enabled = true where key = 'demo_auth';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check(public.invite_member('00000000-0000-0000-0000-0000000000f1', 'otieno@njoro.example', 'agronomist', 'Otieno M.') = 'added', 'demo mode makes the account at once');
select public.set_member_role('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', 'admin');
do $$ begin
  perform public.set_member_role('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c2', 'admin');
  raise exception 'FAILED: last owner demoted';
exception when raise_exception then
  if sqlerrm <> 'last_owner' then raise; end if;
  raise notice 'ok: the last owner stays';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
do $$ begin
  perform public.set_member_role('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c3', 'owner');
  raise exception 'FAILED: admin made an owner';
exception when insufficient_privilege then raise notice 'ok: only owners give the owner role';
end $$;
select public.remove_member('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c3');
select pg_temp.check((select count(*) from public.org_members where org_id = '00000000-0000-0000-0000-0000000000f1') = 3, 'admin removes a field officer');

-- Farmer B joins with the code, shows in the co-op's farmer list, then leaves.
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.join_org('NJR-9999')) = 0, 'wrong code joins nothing');
select pg_temp.check((select name from public.find_org_by_code('njr-1234')) = 'Njoro Growers Co-op' and (select count(*) from public.my_coops()) = 0, 'looking up a code shows the name without joining');
select pg_temp.check((select name from public.join_org(' njr1234 ')) = 'Njoro Growers Co-op', 'code works in any case, without the dash');
select pg_temp.check((select count(*) from public.my_coops()) = 1 and (select count(*) from public.consents where kind = 'org_share' and withdrawn_at is null) = 1, 'joining records the agreement');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check((select phone from public.org_farmers('00000000-0000-0000-0000-0000000000f1')) = '+254700000002', 'co-op sees the new farmer');
select pg_temp.check((select count(*) from public.org_farmers('00000000-0000-4000-8000-00000000d000')) = 0 and (select count(*) from public.org_team('00000000-0000-4000-8000-00000000d000')) = 0, 'other orgs stay hidden');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.leave_org('00000000-0000-0000-0000-0000000000f1');
select pg_temp.check((select count(*) from public.my_coops()) = 0 and (select count(*) from public.consents where kind = 'org_share' and withdrawn_at is null) = 0, 'leaving withdraws the agreement');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check((select count(*) from public.org_farmers('00000000-0000-0000-0000-0000000000f1')) = 0, 'a farmer who left is gone from the list');
select pg_temp.check(public.norm_code(public.regenerate_join_code('00000000-0000-0000-0000-0000000000f1')) <> 'NJR1234', 'admin changes the code');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.join_org('NJR-1234')) = 0, 'the old code stops working');
reset role;

-- Reply alerts: the farmer's phone hears about an answer, in the phone's language.
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.register_push_token('ExponentPushToken[aaa]', 'android', 'en');
select public.register_push_token('ExponentPushToken[aaa]', 'android', 'en');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.forget_push_token('ExponentPushToken[aaa]');
do $$ begin
  perform public.register_push_token('not a token', 'android', 'sw');
  raise exception 'FAILED: bad token saved';
exception when check_violation then raise notice 'ok: only Expo tokens are saved';
end $$;
reset role;
select pg_temp.check((select count(*) from public.push_tokens where user_id = '00000000-0000-0000-0000-00000000000a') = 1, 'a phone registers once, and others cannot remove it');
delete from net.sent;
insert into public.issue_events (issue_id, actor_kind, actor_name, kind, body)
  values ((select id from public.issues where origin_check_id = '40000000-0000-0000-0000-000000000001'), 'agronomist', 'Wanjiru K.', 'review_agree', 'Remove the lower leaves   and burn them.');
select pg_temp.check((select body -> 0 ->> 'title' from net.sent) = 'Your agronomist replied'
  and (select body -> 0 ->> 'body' from net.sent) = 'About your tomato check: Remove the lower leaves and burn them.'
  and (select body -> 0 -> 'data' ->> 'checkId' from net.sent) = '40000000-0000-0000-0000-000000000001', 'an answer sends an alert to the farmer');
insert into public.issue_events (issue_id, actor_kind, actor_name, kind, body)
  values ((select id from public.issues where origin_check_id = '40000000-0000-0000-0000-000000000001'), 'farmer', 'Juma', 'comment', 'Asante');
select pg_temp.check((select count(*) from net.sent) = 1, 'farmer events send no alert');
update public.push_tokens set language = 'sw';
update public.issues set follow_up_due_on = (now() at time zone 'Africa/Nairobi')::date, status = 'action_given' where origin_check_id = '40000000-0000-0000-0000-000000000001';
select pg_temp.check(public.send_follow_up_reminders() = 1, 'due follow-ups get a morning reminder');
select pg_temp.check((select body -> 0 ->> 'title' from net.sent order by id desc limit 1) = 'Ni wakati wa picha ya ufuatiliaji', 'the reminder is in the phone''s language');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  perform public.send_follow_up_reminders();
  raise exception 'FAILED: a farmer ran the reminders';
exception when insufficient_privilege then raise notice 'ok: only the scheduler sends reminders';
end $$;
reset role;

-- Knowledge base: a guide reaches farmers only after someone else reviews it.
reset role;
update public.org_farmer_links set status = 'active' where farmer_id = '00000000-0000-0000-0000-00000000000b' and org_id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select set_config('test.guide', public.save_guide(null, '00000000-0000-0000-0000-0000000000f1', 'early_blight', 'en', ' Early blight ', array['Remove the lowest leaves.', '  '], null)::text, false);
select pg_temp.check((select cardinality(steps) from public.guides where id = current_setting('test.guide')::uuid) = 1
  and (select status from public.guides where id = current_setting('test.guide')::uuid) = 'draft', 'a new guide starts as a draft');
select public.submit_guide(current_setting('test.guide')::uuid);
do $$ begin
  perform public.review_guide(current_setting('test.guide')::uuid, true, null);
  raise exception 'FAILED: author approved own guide';
exception when raise_exception then
  if sqlerrm <> 'own_guide' then raise; end if;
  raise notice 'ok: nobody approves their own guide';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.guides where org_id = '00000000-0000-0000-0000-0000000000f1') = 0, 'farmers do not see guides waiting for review');
do $$ begin
  perform public.save_guide(null, '00000000-0000-0000-0000-0000000000f1', 'septoria', 'en', 'x', array['y'], null);
  raise exception 'FAILED: farmer wrote a guide';
exception when insufficient_privilege then raise notice 'ok: farmers cannot write guides';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select public.review_guide(current_setting('test.guide')::uuid, true, null);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select title from public.guides where org_id = '00000000-0000-0000-0000-0000000000f1') = 'Early blight', 'a reviewed guide reaches the co-op''s farmers');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select set_config('test.guide2', public.new_guide_version(current_setting('test.guide')::uuid)::text, false);
select public.save_guide(current_setting('test.guide2')::uuid, null, null, null, 'Early blight', array['Spray mancozeb 50 ml per 20 L.'], null);
select pg_temp.check((select contains_chemical and version = 2 from public.guides where id = current_setting('test.guide2')::uuid), 'a dose in a guide is flagged');
select public.submit_guide(current_setting('test.guide2')::uuid);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select public.review_guide(current_setting('test.guide2')::uuid, true, 'ok');
select pg_temp.check((select status from public.guides where id = current_setting('test.guide')::uuid) = 'retired', 'publishing a new version retires the old one');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.guides where org_id = '00000000-0000-0000-0000-0000000000f1') = 0, 'guides with chemicals stay hidden from farmers');
select pg_temp.check((select count(*) from public.guides where org_id = '00000000-0000-4000-8000-00000000d000') = 0, 'farmers do not see other co-ops'' guides');
reset role;

-- Tasks and visits: the team plans them, the farmer sees and ticks off their own.
reset role;
update public.org_farmer_links set status = 'active' where farmer_id = '00000000-0000-0000-0000-00000000000a';
delete from net.sent;
insert into public.plots (id, farm_id, name) select '70000000-0000-0000-0000-000000000001', id, 'B plot' from public.farms where owner_id = '00000000-0000-0000-0000-00000000000b' limit 1;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select set_config('test.task', public.save_task(null, '00000000-0000-0000-0000-0000000000f1', 'farmer', '00000000-0000-0000-0000-00000000000a', null, null,
  '  Remove the   lower leaves ', 'Burn them.', current_date + 1, null)::text, false);
select set_config('test.visit', public.save_task(null, '00000000-0000-0000-0000-0000000000f1', 'visit', '00000000-0000-0000-0000-00000000000a', null, null,
  'Check tomatoes', 'Bring traps.', current_date, null)::text, false);
select pg_temp.check((select title || '|' || assignee_name from public.tasks where id = current_setting('test.task')::uuid) = 'Remove the lower leaves|Wanjiru K.', 'a task is saved, assigned to whoever made it');
select pg_temp.check((select count(*) from public.org_tasks('00000000-0000-0000-0000-0000000000f1')) = 2, 'the team sees its tasks');
do $$ begin
  perform public.save_task(null, '00000000-0000-0000-0000-0000000000f1', 'farmer', '00000000-0000-0000-0000-0000000000c2', null, null, 'x', null, current_date, null);
  raise exception 'FAILED: task for someone not linked';
exception when insufficient_privilege then raise notice 'ok: tasks only go to linked farmers';
end $$;
do $$ begin
  perform public.save_task(null, '00000000-0000-0000-0000-0000000000f1', 'farmer', '00000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000001', null, 'x', null, current_date, null);
  raise exception 'FAILED: task on another farmer''s plot';
exception when invalid_parameter_value then raise notice 'ok: a task''s plot must be the farmer''s';
end $$;
reset role;
select pg_temp.check((select count(*) from net.sent) = 2 and (select body -> 0 ->> 'title' from net.sent order by id limit 1) = 'Kazi mpya kutoka kwa chama chako', 'a new task alerts the farmer in their language');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.tasks) = 0, 'farmers do not read the tasks table');
select pg_temp.check((select count(*) from public.my_tasks()) = 2, 'the farmer gets their task and visit');
select pg_temp.check((select note from public.my_tasks() where kind = 'visit') is null, 'the team''s visit note stays off the phone');
select public.farmer_set_task_done(current_setting('test.task')::uuid, true, now() - interval '2 days');
select public.farmer_set_task_done(current_setting('test.task')::uuid, true, now());
do $$ begin
  perform public.farmer_set_task_done(current_setting('test.visit')::uuid, true, now());
  raise exception 'FAILED: farmer closed a visit';
exception when no_data_found then raise notice 'ok: farmers cannot close visits';
end $$;
do $$ begin
  perform public.save_task(current_setting('test.task')::uuid, null, null, null, null, null, 'x', null, current_date, null);
  raise exception 'FAILED: farmer changed a task';
exception when insufficient_privilege then raise notice 'ok: farmers cannot change tasks';
end $$;
reset role;
select pg_temp.check((select done_by = 'farmer' and done_at < now() - interval '1 day' from public.tasks where id = current_setting('test.task')::uuid), 'ticking off offline keeps when it was done, once');
select pg_temp.check(public.send_task_reminders() = 1, 'today''s visit gets a morning reminder');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select public.set_task_status(current_setting('test.visit')::uuid, 'done', 'Blight on 3 plants, removed them.');
select pg_temp.check((select status || '|' || done_by || '|' || outcome from public.tasks where id = current_setting('test.visit')::uuid) = 'done|team|Blight on 3 plants, removed them.', 'a visit is closed with a report');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.my_tasks()) = 0, 'other farmers see none of it');
reset role;
update public.org_farmer_links set status = 'revoked' where farmer_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.my_tasks()) = 0, 'leaving the co-op takes its tasks off the phone');
reset role;
update public.org_farmer_links set status = 'active' where farmer_id = '00000000-0000-0000-0000-00000000000a';

-- Scouting: the team logs counts per plot; farmers never read them.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select set_config('test.visit2', public.save_task(null, '00000000-0000-0000-0000-0000000000f1', 'visit', '00000000-0000-0000-0000-00000000000a', null, null,
  'Scout tomatoes', null, current_date, null)::text, false);
select set_config('test.scout', public.save_scouting('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', null, 'tomatoes', current_date, 20, ' After rain ',
  '[{"cause_id": "early_blight", "plants_affected": 6, "severity": "medium"}, {"cause_id": "tuta", "plants_affected": 1, "severity": "low"}]', current_setting('test.visit2')::uuid)::text, false);
select pg_temp.check((select jsonb_array_length(findings) from public.org_scouting('00000000-0000-0000-0000-0000000000f1', null) where id = current_setting('test.scout')::uuid) = 2, 'a round is logged with its findings');
select pg_temp.check((select status || '|' || outcome from public.tasks where id = current_setting('test.visit2')::uuid) = 'done|Scouted 20 plants: Early blight 6/20, Tomato leaf miner (Tuta) 1/20. After rain', 'logging from a visit closes it with a summary');
do $$ begin
  perform public.save_scouting('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', null, 'tomatoes', current_date, 5,
    null, '[{"cause_id": "septoria", "plants_affected": 9, "severity": "low"}]', null);
  raise exception 'FAILED: more affected than checked';
exception when invalid_parameter_value then raise notice 'ok: affected plants cannot exceed plants checked';
end $$;
select pg_temp.check((select count(*) from public.scouting_reports where org_id = '00000000-0000-0000-0000-0000000000f1') = 1, 'a refused round leaves nothing behind');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.scouting_reports) = 0 and (select count(*) from public.scouting_findings) = 0, 'farmers do not read scouting');
do $$ begin
  perform public.save_scouting('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', null, 'tomatoes', current_date, 5, null, '[]', null);
  raise exception 'FAILED: farmer logged scouting';
exception when insufficient_privilege then raise notice 'ok: farmers cannot log scouting';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select public.delete_scouting(current_setting('test.scout')::uuid);
select pg_temp.check((select count(*) from public.scouting_findings) = 0, 'removing a round removes its findings');
reset role;

-- Sign-in mode: demo accounts keep the demo code; new numbers get a real SMS once it is on.
select pg_temp.check(public.sign_in_mode('+254712345678') = 'demo' and public.sign_in_mode('+254700000999') = 'demo', 'demo mode while SMS is off');
update public.feature_flags set enabled = true where key = 'sms_auth';
select pg_temp.check(public.sign_in_mode('+254712345678') = 'demo' and public.sign_in_mode('+254700000999') = 'sms', 'new numbers get a real code once SMS is on');
update public.feature_flags set enabled = false where key = 'demo_auth';
select pg_temp.check(public.sign_in_mode('+254712345678') = 'sms', 'demo accounts need a real code once demo sign-in is off');
update public.feature_flags set enabled = true where key = 'demo_auth';
update public.feature_flags set enabled = false where key = 'sms_auth';

-- Error log: anyone can write a trimmed line, nobody reads it back.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.log_app_error('farmer', '1.0', 'web', repeat('x', 5000), null, '{"screen":"home"}');
select public.log_app_error('nonsense', '1.0', 'web', 'dropped', null, '{}');
select pg_temp.check((select count(*) from public.app_errors) = 0, 'farmers cannot read the error log');
reset role;
select pg_temp.check((select count(*) from public.app_errors) = 1 and (select length(message) from public.app_errors) = 1000
  and (select user_id from public.app_errors) = '00000000-0000-0000-0000-00000000000a', 'errors are logged trimmed, with the user');

-- Every public table has RLS on.
select pg_temp.check(not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity), 'RLS is on for every table');

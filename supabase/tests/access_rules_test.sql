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

-- Every public table has RLS on.
select pg_temp.check(not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity), 'RLS is on for every table');

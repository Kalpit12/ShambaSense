-- Knowledge base (architecture.md §5.4, R5, R6). Agronomists write short crop guides in English and
-- Kiswahili in the dashboard. A guide reaches farmers only after a second person on the team reviews
-- it, and a guide that names a product or a dose stays hidden from farmers while the
-- chemical_recommendations flag is off. Each published change is a new version; the old one retires.

alter table public.guides
  add column org_id uuid references public.orgs (id) on delete cascade,
  add column title text not null default '',
  add column steps text[] not null default '{}',
  add column warning text,
  add column status text not null default 'draft' check (status in ('draft', 'in_review', 'published', 'retired')),
  add column author_id uuid references auth.users (id) on delete set null,
  add column author_name text,
  add column reviewer_name text,
  add column review_note text,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add column published_at timestamptz,
  alter column body_md set default '',
  add constraint guides_published_reviewed check (status not in ('published', 'retired') or reviewed_on is not null),
  add constraint guides_steps_count check (cardinality(steps) <= 8);

-- One live version and at most one open draft per guide.
create unique index guides_one_published on public.guides (coalesce(org_id, '00000000-0000-0000-0000-000000000000'), cause_id, language, coalesce(region, ''))
  where status = 'published';
create unique index guides_one_open on public.guides (coalesce(org_id, '00000000-0000-0000-0000-000000000000'), cause_id, language, coalesce(region, ''))
  where status in ('draft', 'in_review');
create index guides_org_id_idx on public.guides (org_id);
create index guides_author_id_idx on public.guides (author_id);

drop policy "reviewed guides" on public.guides;
-- Farmers: published guides from ShambaSense and from co-ops they belong to.
create policy "farmers read published guides" on public.guides for select to authenticated
  using (
    status = 'published'
    and (org_id is null or exists (select 1 from public.org_farmer_links l
                                   where l.org_id = guides.org_id and l.farmer_id = (select auth.uid()) and l.status = 'active'))
    and (not contains_chemical or exists (select 1 from public.feature_flags f where f.key = 'chemical_recommendations' and f.enabled))
  );
-- Team members: every version of their org's guides, and ShambaSense's published ones.
create policy "members read guides" on public.guides for select to authenticated
  using (org_id in (select public.my_org_ids()) or (org_id is null and status = 'published' and exists (select 1 from public.org_members m where m.user_id = (select auth.uid()))));

-- Who may write and review guides for an org.
create function public.guide_writer(p_org uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare r text := public.member_role(p_org);
begin
  if r is null or r not in ('owner', 'admin', 'agronomist') then
    raise exception 'only agronomists and admins write guides' using errcode = '42501';
  end if;
  return r;
end $$;

create function public.guide_flagged(p_title text, p_steps text[], p_warning text) returns boolean
language sql immutable set search_path = '' as $$
  select public.reply_flagged(coalesce(p_title, '') || ' ' || array_to_string(coalesce(p_steps, '{}'), ' ') || ' ' || coalesce(p_warning, ''))
$$;

-- Creates a draft (p_id null) or changes one. Changing a guide that is waiting for review sends it
-- back to draft, so the reviewer always approves the text they read.
create function public.save_guide(p_id uuid, p_org uuid, p_cause text, p_language text, p_title text, p_steps text[], p_warning text)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  g public.guides;
  v_steps text[] := array(select trim(s) from unnest(coalesce(p_steps, '{}')) s where trim(s) <> '');
  v_title text := left(trim(coalesce(p_title, '')), 120);
  v_warning text := nullif(left(trim(coalesce(p_warning, '')), 300), '');
  v_id uuid;
begin
  if v_title = '' then raise exception 'a title is required'; end if;
  if cardinality(v_steps) = 0 then raise exception 'add at least one step'; end if;
  if cardinality(v_steps) > 8 then raise exception 'at most 8 steps'; end if;
  if exists (select 1 from unnest(v_steps) s where length(s) > 300) then raise exception 'keep each step under 300 characters'; end if;

  if p_id is null then
    perform public.guide_writer(p_org);
    if p_language not in ('en', 'sw') then raise exception 'unknown language'; end if;
    if not exists (select 1 from public.causes where id = p_cause) then raise exception 'unknown cause'; end if;
    if exists (select 1 from public.guides where org_id = p_org and cause_id = p_cause and language = p_language and region is null and status in ('draft', 'in_review')) then
      raise exception 'draft_exists';
    end if;
    insert into public.guides (org_id, cause_id, language, version, title, steps, warning, contains_chemical, author_id, author_name)
    values (p_org, p_cause, p_language,
            coalesce((select max(version) from public.guides where org_id = p_org and cause_id = p_cause and language = p_language and region is null), 0) + 1,
            v_title, v_steps, v_warning, public.guide_flagged(v_title, v_steps, v_warning), auth.uid(), public.reviewer_name())
    returning id into v_id;
    insert into public.audit_log (actor_id, org_id, action, target_table, target_id) values (auth.uid(), p_org, 'guide_created', 'guides', v_id);
    return v_id;
  end if;

  select * into g from public.guides where id = p_id for update;
  if g.id is null or g.org_id is null then raise exception 'guide not found'; end if;
  perform public.guide_writer(g.org_id);
  if g.status not in ('draft', 'in_review') then raise exception 'a published guide changes through a new version'; end if;
  update public.guides set title = v_title, steps = v_steps, warning = v_warning,
    contains_chemical = public.guide_flagged(v_title, v_steps, v_warning), status = 'draft', updated_at = now()
  where id = g.id;
  return g.id;
end $$;

-- A new draft from the live version, for changes after publishing.
create function public.new_guide_version(p_id uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare g public.guides; v_id uuid;
begin
  select * into g from public.guides where id = p_id;
  if g.id is null or g.org_id is null then raise exception 'guide not found'; end if;
  perform public.guide_writer(g.org_id);
  select id into v_id from public.guides where org_id = g.org_id and cause_id = g.cause_id and language = g.language
    and coalesce(region, '') = coalesce(g.region, '') and status in ('draft', 'in_review');
  if v_id is not null then return v_id; end if;
  insert into public.guides (org_id, cause_id, language, region, version, title, steps, warning, contains_chemical, author_id, author_name)
  values (g.org_id, g.cause_id, g.language, g.region,
          (select max(version) from public.guides where org_id = g.org_id and cause_id = g.cause_id and language = g.language and coalesce(region, '') = coalesce(g.region, '')) + 1,
          g.title, g.steps, g.warning, g.contains_chemical, auth.uid(), public.reviewer_name())
  returning id into v_id;
  return v_id;
end $$;

create function public.submit_guide(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare g public.guides;
begin
  select * into g from public.guides where id = p_id for update;
  if g.id is null or g.org_id is null then raise exception 'guide not found'; end if;
  perform public.guide_writer(g.org_id);
  if g.status <> 'draft' then return; end if;
  update public.guides set status = 'in_review', review_note = null, updated_at = now() where id = g.id;
  insert into public.audit_log (actor_id, org_id, action, target_table, target_id) values (auth.uid(), g.org_id, 'guide_submitted', 'guides', g.id);
end $$;

-- A second person approves (the live version retires) or sends it back with a note.
create function public.review_guide(p_id uuid, p_approve boolean, p_note text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare g public.guides;
begin
  select * into g from public.guides where id = p_id for update;
  if g.id is null or g.org_id is null then raise exception 'guide not found'; end if;
  perform public.guide_writer(g.org_id);
  if g.status <> 'in_review' then raise exception 'this guide is not waiting for review'; end if;
  if g.author_id = auth.uid() then raise exception 'own_guide'; end if;
  if p_approve then
    update public.guides set status = 'retired', updated_at = now()
    where org_id = g.org_id and cause_id = g.cause_id and language = g.language and coalesce(region, '') = coalesce(g.region, '') and status = 'published';
    update public.guides set status = 'published', reviewer_id = auth.uid(), reviewer_name = public.reviewer_name(),
      reviewed_on = (now() at time zone 'Africa/Nairobi')::date, published_at = now(), review_note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now()
    where id = g.id;
  else
    if coalesce(trim(p_note), '') = '' then raise exception 'say what to change'; end if;
    update public.guides set status = 'draft', review_note = trim(p_note), updated_at = now() where id = g.id;
  end if;
  insert into public.audit_log (actor_id, org_id, action, target_table, target_id, detail)
  values (auth.uid(), g.org_id, case when p_approve then 'guide_published' else 'guide_sent_back' end, 'guides', g.id, jsonb_build_object('version', g.version));
end $$;

-- Takes a guide off farmers' phones, or deletes a draft nobody needs.
create function public.retire_guide(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare g public.guides;
begin
  select * into g from public.guides where id = p_id for update;
  if g.id is null or g.org_id is null then raise exception 'guide not found'; end if;
  perform public.guide_writer(g.org_id);
  if g.status = 'published' then
    update public.guides set status = 'retired', updated_at = now() where id = g.id;
  elsif g.status in ('draft', 'in_review') then
    delete from public.guides where id = g.id;
  end if;
  insert into public.audit_log (actor_id, org_id, action, target_table, target_id) values (auth.uid(), g.org_id, 'guide_retired', 'guides', g.id);
end $$;

revoke execute on function public.guide_writer(uuid) from public, anon, authenticated;
revoke execute on function public.save_guide(uuid, uuid, text, text, text, text[], text), public.new_guide_version(uuid),
  public.submit_guide(uuid), public.review_guide(uuid, boolean, text), public.retire_guide(uuid) from public, anon;
grant execute on function public.save_guide(uuid, uuid, text, text, text, text[], text), public.new_guide_version(uuid),
  public.submit_guide(uuid), public.review_guide(uuid, boolean, text), public.retire_guide(uuid) to authenticated;

-- Demo: the app's starter guides, waiting for the demo co-op's agronomists to review them.
insert into public.guides (org_id, cause_id, language, title, steps, warning, status, author_name)
select '00000000-0000-4000-8000-00000000d000', s.cause_id, s.language, s.title, s.steps, s.warning, 'in_review', 'ShambaSense'
from (values
    ('early_blight', 'en', 'Early blight on tomatoes', array['Pick off the lowest leaves with spots and carry them out of the field.', 'Water at the base of the plant in the morning. Keep the leaves dry.', 'Put dry grass or mulch under the plants so soil does not splash onto the leaves.', 'Next season, plant tomatoes and potatoes in a different place.'], 'Ask an agronomist if it keeps spreading after a week, or reaches the fruit.'),
    ('late_blight', 'en', 'Late blight on tomatoes', array['Act today. Late blight can spread across a plot in a few days.', 'Pull out plants with many dark patches. Bury or burn them away from the field. Do not compost them.', 'Do not work among the plants while they are wet.', 'Ask an agronomist how to protect the plants that are still healthy.'], 'Ask an agronomist today if more than a few plants have dark patches.'),
    ('septoria', 'en', 'Septoria leaf spot on tomatoes', array['Remove the lower leaves with spots and carry them out of the field.', 'Stake the plants and remove extra side shoots so air moves through.', 'Water at the base of the plant, not over the leaves.', 'Next season, plant tomatoes in a different place.'], 'Ask an agronomist if it keeps spreading after a week, or reaches the fruit.'),
    ('tuta', 'en', 'Tomato leaf miner (Tuta)', array['Pick the leaves and fruit with mines and destroy them. Do not leave them in the field.', 'Hang sticky or pheromone traps to see how many moths there are.', 'After harvest, pull out and destroy the old tomato plants.', 'Ask an agronomist if the damage keeps spreading.'], 'Ask an agronomist if it keeps spreading after a week, or reaches the fruit.'),
    ('early_blight', 'sw', 'Kuoza kwa majani kwenye nyanya', array['Ondoa majani ya chini yenye madoa na uyapeleke nje ya shamba.', 'Mwagilia kwenye shina asubuhi. Usiloweshe majani.', 'Weka nyasi kavu au matandazo chini ya mimea ili udongo usirukie majani.', 'Msimu ujao, panda nyanya na viazi mahali tofauti.'], 'Uliza mtaalamu kama unaendelea kuenea baada ya wiki moja, au ukifika kwenye matunda.'),
    ('late_blight', 'sw', 'Ukungu wa nyanya', array['Chukua hatua leo. Ugonjwa huu unaweza kuenea shamba lote kwa siku chache.', 'Ng’oa mimea yenye mabaka mengi meusi. Ifukie au ichome mbali na shamba. Usiiweke kwenye mboji.', 'Usifanye kazi katikati ya mimea ikiwa bado imelowa.', 'Uliza mtaalamu jinsi ya kulinda mimea ambayo bado ni mizima.'], 'Uliza mtaalamu leo kama mimea mingi ina mabaka meusi.'),
    ('septoria', 'sw', 'Madoa madogo ya majani kwenye nyanya', array['Ondoa majani ya chini yenye madoa na uyapeleke nje ya shamba.', 'Weka miti ya kushikilia mimea na upunguze machipukizi ya pembeni ili hewa ipite.', 'Mwagilia kwenye shina, si juu ya majani.', 'Msimu ujao, panda nyanya mahali tofauti.'], 'Uliza mtaalamu kama unaendelea kuenea baada ya wiki moja, au ukifika kwenye matunda.'),
    ('tuta', 'sw', 'Kipekecha majani ya nyanya (Tuta)', array['Chuma majani na matunda yaliyoathirika na uyaharibu. Usiyaache shambani.', 'Tundika mitego ya gundi au ya harufu ili uone idadi ya nondo.', 'Baada ya mavuno, ng’oa na uharibu mimea ya zamani ya nyanya.', 'Uliza mtaalamu ikiwa uharibifu unaendelea kuenea.'], 'Uliza mtaalamu kama unaendelea kuenea baada ya wiki moja, au ukifika kwenye matunda.')

) as s (cause_id, language, title, steps, warning)
where exists (select 1 from public.orgs where id = '00000000-0000-4000-8000-00000000d000')
on conflict do nothing;

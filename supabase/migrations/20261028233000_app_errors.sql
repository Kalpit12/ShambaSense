-- Error tracking without another service: both apps send crashes and failed calls here, and the team
-- reads them in Supabase (Table Editor → app_errors).
-- No client reads this table. Writes go through log_app_error, which trims and caps them.

create table public.app_errors (
  id bigint generated always as identity primary key,
  app text not null check (app in ('farmer', 'dashboard')),
  version text,
  platform text,
  user_id uuid default auth.uid(),
  message text not null,
  stack text,
  context jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index app_errors_day on public.app_errors (created_at desc);
alter table public.app_errors enable row level security;

create function public.log_app_error(p_app text, p_version text, p_platform text, p_message text, p_stack text, p_context jsonb)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_app not in ('farmer', 'dashboard') or coalesce(btrim(p_message), '') = '' then return; end if;
  -- A loop on one phone must not fill the table: 50 an hour per signed-in user, 500 an hour for
  -- everyone not signed in, then the rest are dropped.
  if auth.uid() is not null then
    if (select count(*) from public.app_errors where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 50 then return; end if;
  elsif (select count(*) from public.app_errors where user_id is null and created_at > now() - interval '1 hour') >= 500 then
    return;
  end if;
  insert into public.app_errors (app, version, platform, message, stack, context)
  values (p_app, left(p_version, 40), left(p_platform, 40), left(p_message, 1000), left(p_stack, 4000),
          case when jsonb_typeof(p_context) = 'object' and length(p_context::text) <= 4000 then p_context else '{}'::jsonb end);
end $$;

revoke execute on function public.log_app_error(text, text, text, text, text, jsonb) from public;
grant execute on function public.log_app_error(text, text, text, text, text, jsonb) to anon, authenticated;

-- Keep 90 days.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('app-errors-cleanup', '15 3 * * *', 'delete from public.app_errors where created_at < now() - interval ''90 days''');
  end if;
end $$;

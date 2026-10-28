-- Minimal stand-in for Supabase's auth and storage schemas, only for testing migrations on plain
-- Postgres. Never applied to a real project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key, instance_id uuid, aud text, role text, phone text unique, email text, encrypted_password text,
  email_confirmed_at timestamptz, phone_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb default '{}',
  created_at timestamptz, updated_at timestamptz, last_sign_in_at timestamptz, confirmation_token text, recovery_token text, email_change_token_new text,
  email_change text, phone_change text, phone_change_token text, email_change_token_current text, reauthentication_token text
);
create table auth.identities (
  id uuid primary key default gen_random_uuid(), provider_id text not null, user_id uuid not null references auth.users (id) on delete cascade,
  identity_data jsonb not null, provider text not null, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
);
create schema extensions;
create extension pgcrypto schema extensions;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to authenticated;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- pg_net stand-in: records what would be sent.
create schema net;
create table net.sent (id bigserial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$ insert into net.sent (url, body, headers) values (url, body, headers) returning id $$;

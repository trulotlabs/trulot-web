-- Isolated capture for the temporary pre-launch homepage.
-- Public visitors may insert a bounded request but cannot read any submissions.

do $migration_guard$
declare
  existing_table regclass := to_regclass('public.early_access_requests');
begin
  if existing_table is not null
    and obj_description(existing_table, 'pg_class') is distinct from
      'Owned by TruLot migration 20260821154859_temporary_prelaunch_early_access'
  then
    raise exception
      'public.early_access_requests already exists and is not owned by this migration';
  end if;
end
$migration_guard$;

create table if not exists public.early_access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  property_question text,
  source text not null default 'temporary-prelaunch-homepage',
  created_at timestamptz not null default now(),
  constraint early_access_email_length
    check (char_length(email) between 3 and 254),
  constraint early_access_email_normalized
    check (email = lower(btrim(email))),
  constraint early_access_email_shape
    check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint early_access_property_question_length
    check (property_question is null or char_length(property_question) <= 500),
  constraint early_access_source_fixed
    check (source = 'temporary-prelaunch-homepage')
);

comment on table public.early_access_requests is
  'Owned by TruLot migration 20260821154859_temporary_prelaunch_early_access';

create unique index if not exists early_access_requests_email_unique
  on public.early_access_requests (lower(email));

alter table public.early_access_requests enable row level security;

revoke all on table public.early_access_requests
  from public, anon, authenticated, service_role;
grant insert (email, property_question)
  on table public.early_access_requests to anon;
grant select on table public.early_access_requests to service_role;

drop policy if exists "Anonymous visitors can request early access"
  on public.early_access_requests;

create policy "Anonymous visitors can request early access"
  on public.early_access_requests
  for insert
  to anon
  with check (
    source = 'temporary-prelaunch-homepage'
    and char_length(email) between 3 and 254
    and email = lower(btrim(email))
    and (property_question is null or char_length(property_question) <= 500)
  );

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

create table public.ctcac_gis_v1 (
  id bigint generated always as identity primary key,
  geojson jsonb,
  properties jsonb,
  source_layer text,
  created_at timestamptz default now(),
  geom extensions.geometry(Geometry, 4326)
);

create table public.parcel_page_api_v2 (
  apn_norm text primary key,
  address text,
  city text,
  state text,
  zone_name text,
  zone_family text,
  base_zone text,
  lot_area_sqft numeric,
  nearby_active_count bigint default 0,
  has_nearby_active_project boolean default false,
  slug text,
  status_label text,
  generated_at timestamptz default now(),
  geom extensions.geometry(Point, 4326),
  situs_zip text,
  lat double precision,
  lng double precision
);

create table public.parcel_permit_terminal_v2 (
  apn_norm text,
  record_id text unique,
  parent_record_id text,
  record_number text,
  record_type text,
  status text,
  normalized_stage text,
  opened_date date,
  issued_date date,
  finaled_date date,
  completed_date date,
  expired_date date,
  last_activity_date date,
  stale_flag boolean,
  hierarchy_role text,
  address_full text,
  applicant_name text,
  description text,
  permit_source text,
  project_id text,
  job_id text,
  approval_scope text,
  project_scope text,
  project_title text
);

create table public.parcel_primary_project_v1 (
  apn_norm text primary key,
  primary_project_tier integer,
  has_building_project boolean,
  generated_at timestamptz default now(),
  project_momentum_label text
);

create table public.sda_official (
  id bigint generated always as identity primary key,
  geojson jsonb,
  properties jsonb,
  source_layer text,
  created_at timestamptz default now(),
  geom extensions.geometry(Geometry, 4326)
);

create table public.tpa_official (
  id bigint generated always as identity primary key,
  geojson jsonb,
  properties jsonb,
  source_layer text,
  created_at timestamptz default now(),
  geom extensions.geometry(Geometry, 4326)
);

create or replace function public.check_parcel_overlays(p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
security definer
as $$
declare
  pt extensions.geometry;
  in_tpa boolean := false;
  in_sda boolean := false;
  in_ctcac boolean := false;
begin
  pt := st_setsrid(st_makepoint(p_lng, p_lat), 4326);

  select exists (
    select 1 from tpa_official
    where st_contains(st_setsrid(st_geomfromgeojson(geojson::text), 4326), pt)
  ) into in_tpa;

  select exists (
    select 1 from sda_official
    where st_contains(st_setsrid(st_geomfromgeojson(geojson::text), 4326), pt)
  ) into in_sda;

  select exists (
    select 1 from ctcac_gis_v1
    where st_contains(st_setsrid(st_geomfromgeojson(geojson::text), 4326), pt)
  ) into in_ctcac;

  return jsonb_build_object('tpa', in_tpa, 'sda', in_sda, 'ctcac', in_ctcac);
end;
$$;

create or replace function public.get_opportunity_feed(min_lot_sf integer default 4000, max_lot_sf integer default 20000, limit_n integer default 50)
returns table(apn_norm text, address text, city text, base_zone text, zone_family text, lot_area_sqft numeric, nearby_active_count bigint, has_nearby_active_project boolean, score integer)
language sql
security definer
as $$
  with condo_prefixes as (
    select left(apn_norm, 7) as prefix
    from public.parcel_page_api_v2
    group by left(apn_norm, 7)
    having count(*) >= 5
  ),
  candidates as (
    select
      p.apn_norm, p.address, p.city, p.base_zone, p.zone_family,
      p.lot_area_sqft, p.nearby_active_count, p.has_nearby_active_project,
      3
      + case when p.lot_area_sqft >= 5000 then 2 else 0 end
      + case when p.has_nearby_active_project then 2 else 0 end
      + 1 as score
    from public.parcel_page_api_v2 p
    where p.status_label = 'No recent activity'
      and p.zone_family in ('RS', 'RM')
      and p.lot_area_sqft between min_lot_sf and max_lot_sf
      and p.address not ilike '% unit %'
      and p.address not ilike '% apt %'
      and p.address not ilike '% spc %'
      and p.address not ilike '%#%'
      and left(p.apn_norm, 7) not in (select prefix from condo_prefixes)
  )
  select * from candidates
  order by score desc, lot_area_sqft desc
  limit limit_n;
$$;

create or replace function public.trulot_extract_apn_candidates(raw text)
returns text[]
language sql
immutable
as $$
  with matches as (
    select regexp_replace(match_text[1], '\D', '', 'g') as digits
    from regexp_matches(coalesce(raw, ''), '(\d{3}-\d{3}-\d{2}-\d{2}|\d{10,11})', 'g') as m(match_text)
  ),
  candidates as (
    select digits as candidate from matches where length(digits) = 10
    union
    select digits from matches where length(digits) = 11
    union
    select left(digits, 10) from matches where length(digits) = 11
  )
  select coalesce(array_agg(distinct candidate), array[]::text[])
  from candidates
  where candidate <> '';
$$;

create or replace function public.trulot_normalize_address_key(raw text)
returns text
language sql
immutable
as $$
  with base as (
    select trim(split_part(coalesce(raw, ''), ',', 1)) as street
  ),
  normalized as (
    select lower(regexp_replace(street, '\s+', ' ', 'g')) as key
    from base
  )
  select nullif(trim(key), '')
  from normalized;
$$;

create or replace function public.trulot_normalize_apn_digits(raw text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(raw, ''), '\D', '', 'g');
$$;

create or replace function public.update_nearby_activity_v2()
returns text
language plpgsql
security definer
as $$
declare
  rows_updated integer;
begin
  update public.parcel_page_api_v2 api
  set
    nearby_active_count = coalesce(pf.active_count, 0),
    has_nearby_active_project = coalesce(pf.active_count, 0) >= 2
  from (
    select
      p.prefix,
      coalesce(a.active_count, 0) as active_count
    from (
      select distinct left(apn_norm, 6) as prefix from public.parcel_page_api_v2
    ) p
    left join (
      select left(apn_norm, 6) as prefix, count(*) as active_count
      from public.parcel_primary_project_v1
      where project_momentum_label in ('Active', 'Awaiting Issuance')
      group by left(apn_norm, 6)
    ) a on p.prefix = a.prefix
  ) pf
  where left(api.apn_norm, 6) = pf.prefix;

  get diagnostics rows_updated = row_count;
  return 'Updated ' || rows_updated || ' parcels';
end;
$$;

create or replace view public.trulot_permit_parcel_link_v1 as
with permit_base as (
  select
    p.apn_norm,
    p.record_id,
    p.parent_record_id,
    p.record_number,
    p.record_type,
    p.status,
    p.normalized_stage,
    p.opened_date,
    p.issued_date,
    p.finaled_date,
    p.completed_date,
    p.expired_date,
    p.last_activity_date,
    p.stale_flag,
    p.hierarchy_role,
    p.address_full,
    p.applicant_name,
    p.description,
    p.permit_source,
    p.project_id,
    p.job_id,
    p.approval_scope,
    p.project_scope,
    p.project_title,
    public.trulot_normalize_apn_digits(p.apn_norm) as permit_apn_digits,
    public.trulot_extract_apn_candidates(concat_ws(' ', p.apn_norm, p.description, p.project_scope, p.approval_scope, p.project_title)) as apn_candidates,
    public.trulot_normalize_address_key(p.address_full) as permit_address_key
  from public.parcel_permit_terminal_v2 p
),
parcel_base as (
  select
    p.apn_norm,
    p.address,
    p.situs_zip,
    public.trulot_normalize_apn_digits(p.apn_norm) as parcel_apn_digits,
    public.trulot_normalize_address_key(p.address) as parcel_address_key
  from public.parcel_page_api_v2 p
)
select
  permit.record_id,
  permit.record_number,
  permit.record_type,
  permit.status,
  permit.normalized_stage,
  permit.opened_date,
  permit.issued_date,
  permit.finaled_date,
  permit.completed_date,
  permit.expired_date,
  permit.last_activity_date,
  permit.stale_flag,
  permit.hierarchy_role,
  permit.address_full,
  permit.applicant_name,
  permit.description,
  permit.permit_source,
  permit.project_id,
  permit.job_id,
  permit.approval_scope,
  permit.project_scope,
  permit.project_title,
  permit.apn_norm,
  permit.permit_apn_digits,
  permit.apn_candidates,
  coalesce(exact_match.apn_norm, parsed_match.apn_norm, address_match.matched_parcel_apn_norm) as matched_parcel_apn_norm,
  coalesce(exact_match.address, parsed_match.address, address_match.matched_parcel_address) as matched_parcel_address,
  case
    when exact_match.apn_norm is not null then 'exact_apn'
    when parsed_match.apn_norm is not null then 'parsed_apn'
    when address_match.parcel_count = 1 then 'address_match'
    else 'unmatched'
  end as linkage_confidence,
  case
    when exact_match.apn_norm is not null then true
    when parsed_match.apn_norm is not null then true
    else false
  end as eligible_for_direct_timeline
from (((permit_base permit
  left join parcel_base exact_match on permit.permit_apn_digits = exact_match.parcel_apn_digits)
  left join lateral (
    select parcel.apn_norm, parcel.address
    from parcel_base parcel
    where parcel.parcel_apn_digits = any (permit.apn_candidates)
      and (exact_match.apn_norm is null or parcel.apn_norm <> exact_match.apn_norm)
    order by parcel.apn_norm
    limit 1
  ) parsed_match on true)
  left join lateral (
    select min(parcel.apn_norm) as matched_parcel_apn_norm,
      min(parcel.address) as matched_parcel_address,
      count(*) as parcel_count
    from parcel_base parcel
    where permit.permit_address_key is not null
      and permit.permit_address_key = parcel.parcel_address_key
  ) address_match on true);

create or replace view public.trulot_permit_linkage_report_v1 as
select
  count(*) as total_permits,
  count(*) filter (where linkage_confidence = 'exact_apn') as permits_with_exact_apn,
  count(*) filter (where linkage_confidence = 'parsed_apn') as permits_with_parsed_apn,
  count(*) filter (where linkage_confidence = 'address_match') as permits_matched_by_address,
  count(*) filter (where linkage_confidence = 'unmatched') as unmatched_permits,
  count(distinct matched_parcel_apn_norm) filter (where linkage_confidence in ('exact_apn', 'parsed_apn')) as parcels_with_direct_permit_history,
  round((100.0 * count(*) filter (where linkage_confidence = 'exact_apn')::numeric) / nullif(count(*), 0), 2) as before_match_rate_pct,
  round((100.0 * count(*) filter (where linkage_confidence in ('exact_apn', 'parsed_apn', 'address_match'))::numeric) / nullif(count(*), 0), 2) as after_match_rate_pct
from public.trulot_permit_parcel_link_v1;

create index idx_ctcac_geom on public.ctcac_gis_v1 using gist (geom);
create index idx_parcel_page_api_v2_address_key on public.parcel_page_api_v2 using btree (public.trulot_normalize_address_key(address));
create index idx_parcel_page_api_v2_apn_digits on public.parcel_page_api_v2 using btree (public.trulot_normalize_apn_digits(apn_norm));
create index idx_parcel_permit_terminal_v2_address_key on public.parcel_permit_terminal_v2 using btree (public.trulot_normalize_address_key(address_full));
create index idx_parcel_permit_terminal_v2_apn_digits on public.parcel_permit_terminal_v2 using btree (public.trulot_normalize_apn_digits(apn_norm));
create index idx_sda_geom on public.sda_official using gist (geom);
create index idx_tpa_geom on public.tpa_official using gist (geom);

alter table public.parcel_page_api_v2 enable row level security;
alter table public.parcel_permit_terminal_v2 enable row level security;
alter table public.parcel_primary_project_v1 enable row level security;
alter table public.tpa_official enable row level security;
alter table public.sda_official enable row level security;
alter table public.ctcac_gis_v1 enable row level security;

create policy "public read" on public.parcel_page_api_v2 for select using (true);
create policy "public read permits" on public.parcel_permit_terminal_v2 for select using (true);
create policy "public read primary" on public.parcel_primary_project_v1 for select using (true);

grant usage on schema public to postgres, anon, authenticated, service_role;

grant all on function public.check_parcel_overlays(double precision, double precision) to anon, authenticated, service_role;
grant all on function public.get_opportunity_feed(integer, integer, integer) to anon, authenticated, service_role;
grant all on function public.trulot_extract_apn_candidates(text) to anon, authenticated, service_role;
grant all on function public.trulot_normalize_address_key(text) to anon, authenticated, service_role;
grant all on function public.trulot_normalize_apn_digits(text) to anon, authenticated, service_role;
grant all on function public.update_nearby_activity_v2() to anon, authenticated, service_role;

grant all on table public.ctcac_gis_v1 to anon, authenticated, service_role;
grant all on sequence public.ctcac_gis_v1_id_seq to anon, authenticated, service_role;
grant all on table public.parcel_page_api_v2 to anon, authenticated, service_role;
grant all on table public.parcel_permit_terminal_v2 to anon, authenticated, service_role;
grant all on table public.parcel_primary_project_v1 to anon, authenticated, service_role;
grant all on table public.sda_official to anon, authenticated, service_role;
grant all on sequence public.sda_official_id_seq to anon, authenticated, service_role;
grant all on table public.tpa_official to anon, authenticated, service_role;
grant all on sequence public.tpa_official_id_seq to anon, authenticated, service_role;
grant all on table public.trulot_permit_parcel_link_v1 to anon, authenticated, service_role;
grant all on table public.trulot_permit_linkage_report_v1 to anon, authenticated, service_role;

alter default privileges for role postgres in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to postgres, anon, authenticated, service_role;

-- Packet 45: bounded, private Parcel Lookup V0 materialization and server RPC.
-- This migration is additive. It does not select a serving snapshot, alter Parcel
-- V1, or expose the lookup table to Data API roles.

create or replace function trulot_v2.parcel_lookup_normalize_address_v0(p_input text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $function$
  with cleaned as (
    select btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              upper(normalize(p_input, NFKD)),
              '#', ' UNIT ', 'g'
            ),
            '[^A-Z0-9[:space:]]', ' ', 'g'
          ),
          '[[:space:]]+', ' ', 'g'
        ),
        '( SAN DIEGO( CA)? [0-9]{5}( [0-9]{4})?| CA [0-9]{5}( [0-9]{4})?)$',
        '',
        'g'
      )
    ) as value
  ),
  tokens as (
    select token, ordinal
    from cleaned,
    lateral regexp_split_to_table(value, ' ') with ordinality as split(token, ordinal)
    where token <> ''
  ),
  mapped as (
    select string_agg(
      case token
        when 'NORTH' then 'N' when 'SOUTH' then 'S'
        when 'EAST' then 'E' when 'WEST' then 'W'
        when 'NORTHEAST' then 'NE' when 'NORTHWEST' then 'NW'
        when 'SOUTHEAST' then 'SE' when 'SOUTHWEST' then 'SW'
        when 'STREET' then 'ST' when 'AVENUE' then 'AVE'
        when 'BOULEVARD' then 'BLVD' when 'ROAD' then 'RD'
        when 'DRIVE' then 'DR' when 'COURT' then 'CT'
        when 'PLACE' then 'PL' when 'LANE' then 'LN'
        when 'TERRACE' then 'TER' when 'CIRCLE' then 'CIR'
        when 'HIGHWAY' then 'HWY' when 'PARKWAY' then 'PKWY'
        else token
      end,
      ' ' order by ordinal
    ) as value
    from tokens
  )
  select nullif(
    regexp_replace(value, '(^| )UNIT 0+([0-9]+)( |$)', '\1UNIT \2\3', 'g'),
    ''
  )
  from mapped;
$function$;

revoke all on function trulot_v2.parcel_lookup_normalize_address_v0(text)
  from public, anon, authenticated, service_role;

create table trulot_v2.parcel_lookup_v0 (
  acquisition_id text not null,
  validated_import_run_id uuid not null,
  source_object_id bigint not null,
  apn_norm text not null check (apn_norm ~ '^[0-9]{10}$'),
  apn_display text not null check (apn_display ~ '^[0-9]{3}-[0-9]{3}-[0-9]{2}-[0-9]{2}$'),
  parcel_id bigint not null,
  address text,
  normalized_address text,
  normalized_unit_address text,
  address_search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(normalized_address, '') || ' ' || coalesce(normalized_unit_address, ''))
  ) stored,
  situs_zip text,
  situs_juris text not null check (situs_juris = 'SD'),
  approximate_geometry_area_sqft double precision not null check (approximate_geometry_area_sqft > 0),
  point_on_surface geometry(Point, 4326) not null,
  geometry_sha256 text not null check (geometry_sha256 ~ '^[a-f0-9]{64}$'),
  derived_contract_version text not null
    check (derived_contract_version = 'parcel-lookup-production-v0-p45'),
  primary key (acquisition_id, apn_norm),
  unique (acquisition_id, source_object_id),
  foreign key (validated_import_run_id)
    references trulot_v2.import_run(import_run_id),
  foreign key (acquisition_id, source_object_id)
    references trulot_v2.parcel_base_sangis_v2(acquisition_id, source_object_id)
);

alter table trulot_v2.parcel_lookup_v0 enable row level security;

comment on table trulot_v2.parcel_lookup_v0 is
  'Private Parcel Lookup V0 identity materialization pinned to the validated Parcel V2 acquisition; no zoning, Coastal, structures, standards, compliance, capacity, or feasibility.';
comment on column trulot_v2.parcel_lookup_v0.normalized_address is
  'Derived by parcel_lookup_normalize_address_v0; search-only, not source truth.';
comment on column trulot_v2.parcel_lookup_v0.normalized_unit_address is
  'Derived unit-aware alias; search-only, not source truth.';
comment on column trulot_v2.parcel_lookup_v0.point_on_surface is
  'Display orientation only; not a survey or legal parcel boundary.';

create index parcel_lookup_v0_apn_prefix_idx
  on trulot_v2.parcel_lookup_v0 (acquisition_id, apn_norm text_pattern_ops);
create index parcel_lookup_v0_address_exact_idx
  on trulot_v2.parcel_lookup_v0 (acquisition_id, normalized_address, apn_norm);
create index parcel_lookup_v0_unit_address_exact_idx
  on trulot_v2.parcel_lookup_v0 (acquisition_id, normalized_unit_address, apn_norm);
create index parcel_lookup_v0_address_search_idx
  on trulot_v2.parcel_lookup_v0 using gin (address_search_vector);

revoke all on table trulot_v2.parcel_lookup_v0
  from public, anon, authenticated, service_role;

create or replace function trulot_v2.build_parcel_lookup_v0()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  expected_acquisition constant text := 'sangis-20260924T183743Z';
  expected_run constant uuid := '724ff836-eedc-594e-93c5-c80a63de65f7';
  expected_city_rows constant bigint := 393733;
  source_rows bigint;
  source_apns bigint;
  inserted_rows bigint;
begin
  if not exists (
    select 1
    from trulot_v2.import_run
    where import_run_id = expected_run
      and parcel_acquisition_id = expected_acquisition
      and run_kind = 'PARCEL_ONLY'
      and zoning_acquisition_id is null
      and status = 'VALIDATED'
      and completed_at is not null
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'Parcel Lookup V0 source run is not the pinned validated parcel-only run';
  end if;

  if not exists (
    select 1
    from trulot_v2.parcel_acquisition
    where acquisition_id = expected_acquisition
      and dataset_id = 'parcel_base_sangis_v2'
      and accepted_count = 1088430
      and normalized_rows_sha256 = '95c92f14bf4489946c6632f8032c2e08735b8fec11940cdace69db19c0625868'
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'Parcel Lookup V0 source acquisition seal does not match';
  end if;

  if exists (select 1 from trulot_v2.parcel_lookup_v0) then
    raise exception using
      errcode = 'object_not_in_prerequisite_state',
      message = 'Parcel Lookup V0 materialization is not empty';
  end if;

  select count(*), count(distinct apn_norm)
  into source_rows, source_apns
  from trulot_v2.parcel_base_sangis_v2
  where acquisition_id = expected_acquisition
    and situs_juris = 'SD';

  if source_rows <> expected_city_rows or source_apns <> expected_city_rows then
    raise exception using
      errcode = 'check_violation',
      message = format(
        'Parcel Lookup V0 City source mismatch: rows=%s distinct_apns=%s expected=%s',
        source_rows, source_apns, expected_city_rows
      );
  end if;

  insert into trulot_v2.parcel_lookup_v0 (
    acquisition_id,
    validated_import_run_id,
    source_object_id,
    apn_norm,
    apn_display,
    parcel_id,
    address,
    normalized_address,
    normalized_unit_address,
    situs_zip,
    situs_juris,
    approximate_geometry_area_sqft,
    point_on_surface,
    geometry_sha256,
    derived_contract_version
  )
  select
    source.acquisition_id,
    expected_run,
    source.source_object_id,
    source.apn_norm,
    substr(source.apn_norm, 1, 3) || '-' || substr(source.apn_norm, 4, 3) || '-'
      || substr(source.apn_norm, 7, 2) || '-' || substr(source.apn_norm, 9, 2),
    source.parcel_id,
    case
      when nullif(btrim(source.address), '') is null then null
      when btrim(source.address) ~ '^0+([.]0+)?$' then null
      else btrim(source.address)
    end,
    trulot_v2.parcel_lookup_normalize_address_v0(
      case
        when nullif(btrim(source.address), '') is null then null
        when btrim(source.address) ~ '^0+([.]0+)?$' then null
        else btrim(source.address)
      end
    ),
    trulot_v2.parcel_lookup_normalize_address_v0(
      case
        when nullif(btrim(source.address), '') is null then null
        when btrim(source.address) ~ '^0+([.]0+)?$' then null
        when nullif(btrim(source.situs_components ->> 'situs_suite'), '') is null then btrim(source.address)
        else btrim(source.address) || ' UNIT ' || btrim(source.situs_components ->> 'situs_suite')
      end
    ),
    nullif(btrim(source.situs_zip), ''),
    source.situs_juris,
    source.approximate_geometry_area_sqft,
    source.point_on_surface,
    source.geometry_sha256,
    'parcel-lookup-production-v0-p45'
  from trulot_v2.parcel_base_sangis_v2 source
  where source.acquisition_id = expected_acquisition
    and source.situs_juris = 'SD'
  order by source.apn_norm;

  get diagnostics inserted_rows = row_count;
  if inserted_rows <> expected_city_rows then
    raise exception using
      errcode = 'check_violation',
      message = format('Parcel Lookup V0 inserted %s rows; expected %s', inserted_rows, expected_city_rows);
  end if;

  analyze trulot_v2.parcel_lookup_v0;
  return inserted_rows;
end;
$function$;

revoke all on function trulot_v2.build_parcel_lookup_v0()
  from public, anon, authenticated, service_role;

create or replace function public.parcel_lookup_v0_search(
  p_query text,
  p_query_type text,
  p_limit integer default 10
)
returns table (
  apn text,
  apn_display text,
  address text,
  normalized_address text,
  normalized_unit_address text,
  zip text,
  jurisdiction text,
  longitude double precision,
  latitude double precision,
  approximate_area_sqft double precision
)
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '1500ms'
as $function$
declare
  expected_acquisition constant text := 'sangis-20260924T183743Z';
  bounded_limit integer;
  tsquery_text text;
begin
  if p_query is null or length(p_query) < 2 or length(p_query) > 160 then
    raise exception using errcode = '22023', message = 'invalid lookup query';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'invalid lookup limit';
  end if;
  if p_query_type not in ('EXACT_APN', 'APN_PREFIX', 'EXACT_ADDRESS', 'AUTOCOMPLETE') then
    raise exception using errcode = '22023', message = 'invalid lookup query type';
  end if;

  bounded_limit := case when p_query_type = 'AUTOCOMPLETE' then least(p_limit, 50) else least(p_limit, 11) end;

  if p_query_type = 'EXACT_APN' then
    if p_query !~ '^[0-9]{10}$' then
      raise exception using errcode = '22023', message = 'invalid exact APN';
    end if;
    return query
      select item.apn_norm, item.apn_display, item.address,
        item.normalized_address, item.normalized_unit_address,
        item.situs_zip, item.situs_juris,
        public.st_x(item.point_on_surface), public.st_y(item.point_on_surface),
        item.approximate_geometry_area_sqft
      from trulot_v2.parcel_lookup_v0 item
      where item.acquisition_id = expected_acquisition and item.apn_norm = p_query
      limit bounded_limit;
  elsif p_query_type = 'APN_PREFIX' then
    if p_query !~ '^[0-9]{6,9}$' then
      raise exception using errcode = '22023', message = 'invalid APN prefix';
    end if;
    return query
      select item.apn_norm, item.apn_display, item.address,
        item.normalized_address, item.normalized_unit_address,
        item.situs_zip, item.situs_juris,
        public.st_x(item.point_on_surface), public.st_y(item.point_on_surface),
        item.approximate_geometry_area_sqft
      from trulot_v2.parcel_lookup_v0 item
      where item.acquisition_id = expected_acquisition
        and item.apn_norm like (p_query || '%')
      order by item.apn_norm
      limit bounded_limit;
  elsif p_query_type = 'EXACT_ADDRESS' then
    if p_query !~ '^[A-Z0-9 ]{2,160}$' then
      raise exception using errcode = '22023', message = 'invalid normalized address';
    end if;
    return query
      select item.apn_norm, item.apn_display, item.address,
        item.normalized_address, item.normalized_unit_address,
        item.situs_zip, item.situs_juris,
        public.st_x(item.point_on_surface), public.st_y(item.point_on_surface),
        item.approximate_geometry_area_sqft
      from trulot_v2.parcel_lookup_v0 item
      where item.acquisition_id = expected_acquisition
        and (item.normalized_address = p_query or item.normalized_unit_address = p_query)
      order by item.normalized_unit_address nulls last, item.apn_norm
      limit bounded_limit;
  else
    if p_query !~ '^[A-Z0-9 ]{2,160}$'
      or array_length(regexp_split_to_array(p_query, ' +'), 1) > 12 then
      raise exception using errcode = '22023', message = 'invalid autocomplete query';
    end if;
    select string_agg(quote_literal(token) || ':*', ' & ' order by ordinal)
    into tsquery_text
    from regexp_split_to_table(p_query, ' +') with ordinality as tokens(token, ordinal)
    where token <> '';

    return query
      select item.apn_norm, item.apn_display, item.address,
        item.normalized_address, item.normalized_unit_address,
        item.situs_zip, item.situs_juris,
        public.st_x(item.point_on_surface), public.st_y(item.point_on_surface),
        item.approximate_geometry_area_sqft
      from trulot_v2.parcel_lookup_v0 item
      where item.acquisition_id = expected_acquisition
        and item.address_search_vector @@ to_tsquery('simple', tsquery_text)
      order by item.normalized_address, item.normalized_unit_address nulls last, item.apn_norm
      limit bounded_limit;
  end if;
end;
$function$;

alter function public.parcel_lookup_v0_search(text, text, integer) owner to postgres;
revoke all on function public.parcel_lookup_v0_search(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.parcel_lookup_v0_search(text, text, integer)
  to service_role;

comment on function public.parcel_lookup_v0_search(text, text, integer) is
  'Fixed-shape, bounded server-only Parcel Lookup V0 RPC. No dynamic SQL and no direct table grant.';

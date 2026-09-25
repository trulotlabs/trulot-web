-- Parcel Serving V2 production shadow foundation.
-- Additive and isolated: this migration does not read, replace, or mutate legacy objects.
-- PostGIS must be installed before these objects can be created.

create extension if not exists postgis;
create schema if not exists trulot_v2;

revoke all on schema trulot_v2 from public;

create table if not exists trulot_v2.import_run (
  import_run_id uuid primary key,
  importer_version text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  status text not null check (status in ('LOADING', 'VALIDATED', 'FAILED')),
  materialization_id text not null,
  parcel_acquisition_id text not null,
  zoning_acquisition_id text not null,
  source_artifacts jsonb not null check (jsonb_typeof(source_artifacts) = 'object'),
  observed_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(observed_counts) = 'object'),
  observed_fingerprints jsonb not null default '{}'::jsonb check (jsonb_typeof(observed_fingerprints) = 'object'),
  failure_reason text
);

create table if not exists trulot_v2.parcel_acquisition (
  acquisition_id text primary key,
  dataset_id text not null check (dataset_id = 'parcel_base_sangis_v2'),
  acquired_at timestamptz not null,
  publisher text not null,
  source_url text not null,
  metadata_url text not null,
  source_temporal_extent text,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  metadata_sha256 text not null check (metadata_sha256 ~ '^[a-f0-9]{64}$'),
  normalization_report_sha256 text not null check (normalization_report_sha256 ~ '^[a-f0-9]{64}$'),
  normalized_rows_sha256 text not null check (normalized_rows_sha256 ~ '^[a-f0-9]{64}$'),
  quarantine_rows_sha256 text not null check (quarantine_rows_sha256 ~ '^[a-f0-9]{64}$'),
  source_count integer not null check (source_count > 0),
  accepted_count integer not null check (accepted_count >= 0),
  quarantine_count integer not null check (quarantine_count >= 0),
  native_crs text not null,
  artifact_crs text not null,
  receipt jsonb not null check (jsonb_typeof(receipt) = 'object'),
  check (source_count = accepted_count + quarantine_count)
);

create table if not exists trulot_v2.parcel_base_sangis_v2 (
  acquisition_id text not null references trulot_v2.parcel_acquisition(acquisition_id),
  source_object_id bigint not null check (source_object_id > 0),
  apn_raw text not null,
  apn_norm text not null check (apn_norm ~ '^[0-9]{10}$'),
  parcel_id bigint not null,
  address text,
  situs_components jsonb not null check (jsonb_typeof(situs_components) = 'object'),
  situs_zip text,
  situs_juris text not null,
  geom geometry(Geometry, 4326) not null,
  centroid geometry(Point, 4326) not null,
  point_on_surface geometry(Point, 4326) not null,
  centroid_within boolean not null,
  approximate_geometry_area_sqft double precision not null check (approximate_geometry_area_sqft > 0),
  taxable_acreage double precision,
  geometry_sha256 text not null check (geometry_sha256 ~ '^[a-f0-9]{64}$'),
  primary key (acquisition_id, source_object_id),
  unique (acquisition_id, apn_norm),
  check (st_geometrytype(geom) in ('ST_Polygon', 'ST_MultiPolygon')),
  check (st_ndims(geom) = 2 and not st_isempty(geom) and st_isvalid(geom)),
  check (st_covers(geom, point_on_surface))
);

create index if not exists parcel_base_sangis_v2_apn_idx
  on trulot_v2.parcel_base_sangis_v2(apn_norm);
create index if not exists parcel_base_sangis_v2_parcel_id_idx
  on trulot_v2.parcel_base_sangis_v2(parcel_id);
create index if not exists parcel_base_sangis_v2_juris_idx
  on trulot_v2.parcel_base_sangis_v2(situs_juris);
create index if not exists parcel_base_sangis_v2_geom_idx
  on trulot_v2.parcel_base_sangis_v2 using gist(geom);

create table if not exists trulot_v2.parcel_quarantine (
  acquisition_id text not null references trulot_v2.parcel_acquisition(acquisition_id),
  source_object_id bigint not null,
  apn_raw text,
  apn_norm text,
  rejection_reasons jsonb not null check (jsonb_typeof(rejection_reasons) = 'array' and jsonb_array_length(rejection_reasons) > 0),
  source_geometry_metadata jsonb not null check (jsonb_typeof(source_geometry_metadata) = 'object'),
  source_row_fingerprint text not null check (source_row_fingerprint ~ '^[a-f0-9]{64}$'),
  primary key (acquisition_id, source_object_id)
);

create index if not exists parcel_quarantine_apn_idx
  on trulot_v2.parcel_quarantine(apn_norm);

create table if not exists trulot_v2.zoning_acquisition (
  acquisition_id text primary key,
  dataset_id text not null check (dataset_id = 'base_zoning_city_sd_v2'),
  acquired_at timestamptz not null,
  publisher text not null,
  source_url text not null,
  metadata_url text not null,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  validation_report_sha256 text not null check (validation_report_sha256 ~ '^[a-f0-9]{64}$'),
  accepted_rows_sha256 text not null check (accepted_rows_sha256 ~ '^[a-f0-9]{64}$'),
  quarantine_rows_sha256 text not null check (quarantine_rows_sha256 ~ '^[a-f0-9]{64}$'),
  source_count integer not null check (source_count > 0),
  accepted_count integer not null check (accepted_count >= 0),
  quarantine_count integer not null check (quarantine_count >= 0),
  native_crs text not null,
  artifact_crs text not null,
  receipt jsonb not null check (jsonb_typeof(receipt) = 'object'),
  check (source_count = accepted_count + quarantine_count)
);

create table if not exists trulot_v2.base_zoning_source_v2 (
  acquisition_id text not null references trulot_v2.zoning_acquisition(acquisition_id),
  source_object_id integer not null check (source_object_id > 0),
  zone_code text not null check (zone_code = btrim(zone_code) and zone_code <> ''),
  implementation_date date,
  ordinance_number text,
  source_shape_length double precision,
  source_shape_area_sqft double precision check (source_shape_area_sqft >= 0),
  geom geometry(Geometry, 4326) not null,
  geom_native geometry(Geometry, 2230) not null,
  geometry_sha256 text not null check (geometry_sha256 ~ '^[a-f0-9]{64}$'),
  primary key (acquisition_id, source_object_id),
  check (st_geometrytype(geom) in ('ST_Polygon', 'ST_MultiPolygon')),
  check (st_geometrytype(geom_native) in ('ST_Polygon', 'ST_MultiPolygon')),
  check (st_isvalid(geom) and st_isvalid(geom_native))
);

create index if not exists base_zoning_source_v2_geom_native_idx
  on trulot_v2.base_zoning_source_v2 using gist(geom_native);
create index if not exists base_zoning_source_v2_zone_idx
  on trulot_v2.base_zoning_source_v2(zone_code);

create table if not exists trulot_v2.base_zoning_quarantine (
  acquisition_id text not null references trulot_v2.zoning_acquisition(acquisition_id),
  source_object_id integer not null,
  zone_code text,
  rejection_reasons jsonb not null check (jsonb_typeof(rejection_reasons) = 'array' and jsonb_array_length(rejection_reasons) > 0),
  source_geometry_metadata jsonb not null check (jsonb_typeof(source_geometry_metadata) = 'object'),
  source_row_fingerprint text not null check (source_row_fingerprint ~ '^[a-f0-9]{64}$'),
  primary key (acquisition_id, source_object_id)
);

create table if not exists trulot_v2.base_zoning_mapping_geometry (
  acquisition_id text not null references trulot_v2.zoning_acquisition(acquisition_id),
  source_object_id integer not null,
  zone_code text not null,
  geom_native geometry(Geometry, 2230) not null,
  source_geometry_state text not null check (source_geometry_state in ('VALID_SOURCE', 'EXPLICIT_MAKE_VALID')),
  repair_method text,
  source_area_sqft double precision not null,
  mapping_area_sqft double precision not null,
  absolute_area_delta_sqft double precision not null,
  relative_area_delta_percent double precision not null,
  primary key (acquisition_id, source_object_id),
  check (st_geometrytype(geom_native) in ('ST_Polygon', 'ST_MultiPolygon')),
  check (st_isvalid(geom_native) and not st_isempty(geom_native)),
  check (
    (source_geometry_state = 'VALID_SOURCE' and repair_method is null)
    or
    (source_geometry_state = 'EXPLICIT_MAKE_VALID' and repair_method = 'GEOS_MAKE_VALID_LINEWORK')
  )
);

create index if not exists base_zoning_mapping_geometry_geom_idx
  on trulot_v2.base_zoning_mapping_geometry using gist(geom_native);

create table if not exists trulot_v2.parcel_zone_mapping_v2 (
  parcel_acquisition_id text not null,
  parcel_source_object_id bigint not null,
  apn_norm text not null check (apn_norm ~ '^[0-9]{10}$'),
  parcel_id bigint not null,
  parcel_geometry_sha256 text not null check (parcel_geometry_sha256 ~ '^[a-f0-9]{64}$'),
  zoning_acquisition_id text not null references trulot_v2.zoning_acquisition(acquisition_id),
  mapping_method_version text not null,
  mapping_state text not null check (mapping_state in ('SINGLE_ZONE', 'MULTI_ZONE', 'BOUNDARY_SLIVER', 'UNMAPPED', 'INDETERMINATE')),
  dominant_zone_code text,
  dominant_coverage_percent double precision,
  secondary_coverage_percent double precision,
  total_covered_percent double precision not null,
  uncovered_percent double precision not null,
  distinct_zone_count integer not null check (distinct_zone_count >= 0),
  repaired_source_feature_count integer not null check (repaired_source_feature_count >= 0),
  zone_evidence jsonb not null check (jsonb_typeof(zone_evidence) = 'array'),
  mapping_payload jsonb not null check (jsonb_typeof(mapping_payload) = 'object'),
  primary key (parcel_acquisition_id, parcel_source_object_id),
  unique (parcel_acquisition_id, apn_norm),
  foreign key (parcel_acquisition_id, parcel_source_object_id)
    references trulot_v2.parcel_base_sangis_v2(acquisition_id, source_object_id)
);

create index if not exists parcel_zone_mapping_v2_state_idx
  on trulot_v2.parcel_zone_mapping_v2(mapping_state);
create index if not exists parcel_zone_mapping_v2_zone_idx
  on trulot_v2.parcel_zone_mapping_v2(dominant_zone_code);

create table if not exists trulot_v2.selected_snapshot (
  singleton boolean primary key default true check (singleton),
  parcel_acquisition_id text not null references trulot_v2.parcel_acquisition(acquisition_id),
  zoning_acquisition_id text not null references trulot_v2.zoning_acquisition(acquisition_id),
  import_run_id uuid not null references trulot_v2.import_run(import_run_id)
);

create or replace view trulot_v2.parcel_serving_v2
with (security_invoker = true)
as
select
  p.acquisition_id,
  p.source_object_id,
  p.apn_norm,
  p.parcel_id,
  p.address,
  p.situs_components,
  p.situs_zip,
  p.situs_juris,
  p.geom,
  p.centroid,
  p.point_on_surface,
  p.centroid_within,
  p.approximate_geometry_area_sqft,
  p.taxable_acreage,
  p.geometry_sha256,
  a.native_crs,
  a.artifact_crs
from trulot_v2.parcel_base_sangis_v2 p
join trulot_v2.parcel_acquisition a using(acquisition_id)
join trulot_v2.selected_snapshot selected
  on selected.parcel_acquisition_id = p.acquisition_id
where p.situs_juris = 'SD';

create or replace view trulot_v2.parcel_intelligence_serving_v2
with (security_invoker = true)
as
select
  1::integer as schema_version,
  p.acquisition_id as parcel_acquisition_id,
  p.source_object_id as parcel_source_object_id,
  p.apn_norm,
  p.parcel_id,
  p.address,
  p.situs_components,
  p.situs_zip,
  p.situs_juris as jurisdiction,
  p.geom,
  p.centroid,
  p.point_on_surface,
  p.centroid_within,
  p.approximate_geometry_area_sqft,
  p.taxable_acreage,
  p.geometry_sha256,
  pa.native_crs as parcel_native_crs,
  pa.artifact_crs as parcel_artifact_crs,
  z.zoning_acquisition_id,
  z.mapping_method_version,
  z.mapping_state as zoning_mapping_state,
  z.dominant_zone_code,
  z.dominant_coverage_percent,
  z.secondary_coverage_percent,
  z.total_covered_percent,
  z.uncovered_percent,
  z.distinct_zone_count,
  z.repaired_source_feature_count,
  z.zone_evidence as zoning_evidence,
  jsonb_build_object(
    'parcelAcquisitionId', p.acquisition_id,
    'parcelSourceObjectId', p.source_object_id,
    'parcelArtifactSha256', pa.artifact_sha256,
    'zoningAcquisitionId', z.zoning_acquisition_id,
    'zoningArtifactSha256', za.artifact_sha256,
    'mappingMethodVersion', z.mapping_method_version,
    'importRunId', selected.import_run_id
  ) as provenance
from trulot_v2.selected_snapshot selected
join trulot_v2.parcel_base_sangis_v2 p
  on p.acquisition_id = selected.parcel_acquisition_id
 and p.situs_juris = 'SD'
join trulot_v2.parcel_acquisition pa
  on pa.acquisition_id = p.acquisition_id
join trulot_v2.parcel_zone_mapping_v2 z
  on z.parcel_acquisition_id = p.acquisition_id
 and z.parcel_source_object_id = p.source_object_id
 and z.apn_norm = p.apn_norm
 and z.zoning_acquisition_id = selected.zoning_acquisition_id
join trulot_v2.zoning_acquisition za
  on za.acquisition_id = z.zoning_acquisition_id;

comment on schema trulot_v2 is
  'Private Parcel Serving V2 shadow foundation. No legacy objects, standards, permits, overlays, or capacity logic.';
comment on table trulot_v2.parcel_quarantine is
  'Rejected Parcel Base V2 source rows retained as evidence; never serving data.';
comment on column trulot_v2.parcel_base_sangis_v2.approximate_geometry_area_sqft is
  'Geometry-derived approximate area; not legal lot area.';
comment on column trulot_v2.parcel_base_sangis_v2.taxable_acreage is
  'Source taxable acreage retained separately from geometry-derived area.';
comment on table trulot_v2.parcel_zone_mapping_v2 is
  'Complete Base Zoning V2 parcel mapping evidence; split-zone evidence is never flattened.';

alter table trulot_v2.import_run enable row level security;
alter table trulot_v2.parcel_acquisition enable row level security;
alter table trulot_v2.parcel_base_sangis_v2 enable row level security;
alter table trulot_v2.parcel_quarantine enable row level security;
alter table trulot_v2.zoning_acquisition enable row level security;
alter table trulot_v2.base_zoning_source_v2 enable row level security;
alter table trulot_v2.base_zoning_quarantine enable row level security;
alter table trulot_v2.base_zoning_mapping_geometry enable row level security;
alter table trulot_v2.parcel_zone_mapping_v2 enable row level security;
alter table trulot_v2.selected_snapshot enable row level security;

do $grants$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema trulot_v2 from anon';
    execute 'revoke all on all tables in schema trulot_v2 from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema trulot_v2 from authenticated';
    execute 'revoke all on all tables in schema trulot_v2 from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema trulot_v2 to service_role';
    execute 'grant select on trulot_v2.parcel_acquisition, trulot_v2.parcel_base_sangis_v2, trulot_v2.zoning_acquisition, trulot_v2.parcel_zone_mapping_v2, trulot_v2.selected_snapshot to service_role';
    execute 'grant select on trulot_v2.parcel_serving_v2, trulot_v2.parcel_intelligence_serving_v2 to service_role';
  end if;
end
$grants$;

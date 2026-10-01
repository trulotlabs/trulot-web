-- Packet 44 design artifact only. DO NOT APPLY from this packet.
-- The future bounded implementation must replace the placeholder owner, verify the
-- exact validated acquisition/run, backfill atomically, and run EXPLAIN ANALYZE.

begin;

create table trulot_v2.parcel_lookup_v0 (
  acquisition_id text not null,
  validated_import_run_id uuid not null references trulot_v2.import_run(import_run_id),
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
  derived_contract_version text not null check (derived_contract_version = 'parcel-lookup-production-v0-p44'),
  primary key (acquisition_id, apn_norm),
  unique (acquisition_id, source_object_id),
  foreign key (acquisition_id, source_object_id)
    references trulot_v2.parcel_base_sangis_v2(acquisition_id, source_object_id)
);

alter table trulot_v2.parcel_lookup_v0 enable row level security;

comment on table trulot_v2.parcel_lookup_v0 is
  'Derived City parcel identity search materialization. Contains no zoning, Coastal, structure, compliance, capacity, or feasibility fields.';
comment on column trulot_v2.parcel_lookup_v0.normalized_address is
  'Derived using the versioned Packet 43 normalization contract; not source truth.';
comment on column trulot_v2.parcel_lookup_v0.normalized_unit_address is
  'Derived unit-aware search alias; not source truth.';
comment on column trulot_v2.parcel_lookup_v0.point_on_surface is
  'Source-derived point for display orientation only; not a survey or parcel boundary.';

create index parcel_lookup_v0_apn_prefix_idx
  on trulot_v2.parcel_lookup_v0 (acquisition_id, apn_norm text_pattern_ops);
create index parcel_lookup_v0_acquisition_idx
  on trulot_v2.parcel_lookup_v0 (acquisition_id);
create index parcel_lookup_v0_address_exact_idx
  on trulot_v2.parcel_lookup_v0 (acquisition_id, normalized_address, apn_norm);
create index parcel_lookup_v0_unit_address_exact_idx
  on trulot_v2.parcel_lookup_v0 (acquisition_id, normalized_unit_address, apn_norm);
create index parcel_lookup_v0_address_search_idx
  on trulot_v2.parcel_lookup_v0 using gin (address_search_vector);

revoke all on table trulot_v2.parcel_lookup_v0 from public, anon, authenticated;
revoke all on table trulot_v2.parcel_lookup_v0 from service_role;

-- Exact APN (limit+1 distinguishes a bounded response from accidental overflow).
-- SELECT bounded fields FROM trulot_v2.parcel_lookup_v0
-- WHERE acquisition_id = $1 AND apn_norm = $2 LIMIT 11;

-- APN prefix. $2 is validated as six through nine digits.
-- SELECT bounded fields FROM trulot_v2.parcel_lookup_v0
-- WHERE acquisition_id = $1 AND apn_norm LIKE ($2 || '%')
-- ORDER BY apn_norm LIMIT 11;

-- Exact address. Both aliases are retained so stacked base-address and condo-unit
-- identities remain separate candidates.
-- SELECT bounded fields FROM trulot_v2.parcel_lookup_v0
-- WHERE acquisition_id = $1
--   AND (normalized_address = $2 OR normalized_unit_address = $2)
-- ORDER BY normalized_unit_address NULLS LAST, apn_norm LIMIT 11;

-- Partial/autocomplete candidate retrieval. The server creates a safe prefix
-- tsquery only from normalized alphanumeric tokens, retrieves at most 50 rows,
-- and applies the existing Parcel Lookup V0 ranker before returning at most 10.
-- SELECT bounded fields FROM trulot_v2.parcel_lookup_v0
-- WHERE acquisition_id = $1
--   AND address_search_vector @@ to_tsquery('simple', $2)
-- ORDER BY normalized_address, normalized_unit_address NULLS LAST, apn_norm
-- LIMIT 50;

-- A bounded implementation must use a server-only database/RPC boundary. If an
-- RPC is selected, place only the wrapper in an exposed schema, use SECURITY
-- DEFINER with a fixed search_path, grant EXECUTE only to service_role, and keep
-- the service key on the server. Never expose this table or schema through the
-- Data API, and never grant anon/authenticated direct access.

rollback;

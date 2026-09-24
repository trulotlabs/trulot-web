-- Disposable local rehearsal only. This is not a production migration.
CREATE SCHEMA base_zoning_v2_rehearsal;

CREATE TABLE base_zoning_v2_rehearsal.acquisition (
  acquisition_id text PRIMARY KEY,
  dataset_id text NOT NULL CHECK (dataset_id = 'base_zoning_city_sd_v2'),
  publisher text NOT NULL,
  source_item_id text NOT NULL,
  source_url text NOT NULL,
  acquired_at timestamptz NOT NULL,
  source_modified_at timestamptz NOT NULL,
  artifact_sha256 text NOT NULL CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  artifact_bytes bigint NOT NULL CHECK (artifact_bytes > 0),
  source_count integer NOT NULL CHECK (source_count > 0),
  accepted_count integer NOT NULL CHECK (accepted_count >= 0),
  rejected_count integer NOT NULL CHECK (rejected_count >= 0),
  native_crs text NOT NULL CHECK (native_crs = 'EPSG:2230'),
  artifact_crs text NOT NULL CHECK (artifact_crs = 'EPSG:4326'),
  validator_sha256 text NOT NULL CHECK (validator_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (source_count = accepted_count + rejected_count)
);

CREATE TABLE base_zoning_v2_rehearsal.base_zoning_city_sd_v2 (
  acquisition_id text NOT NULL REFERENCES base_zoning_v2_rehearsal.acquisition,
  source_object_id integer NOT NULL CHECK (source_object_id > 0),
  zone_code text NOT NULL CHECK (zone_code = btrim(zone_code) AND zone_code <> ''),
  implementation_date date,
  ordinance_number text,
  source_shape_length double precision,
  source_shape_area_sqft double precision CHECK (source_shape_area_sqft >= 0),
  geom geometry(Geometry,4326) NOT NULL,
  geom_native geometry(Geometry,2230) NOT NULL,
  geometry_sha256 text NOT NULL CHECK (geometry_sha256 ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (acquisition_id, source_object_id),
  CHECK (ST_GeometryType(geom) IN ('ST_Polygon','ST_MultiPolygon')),
  CHECK (ST_GeometryType(geom_native) IN ('ST_Polygon','ST_MultiPolygon')),
  CHECK (ST_NDims(geom) = 2 AND ST_NDims(geom_native) = 2),
  CHECK (NOT ST_IsEmpty(geom) AND ST_IsValid(geom)),
  CHECK (NOT ST_IsEmpty(geom_native) AND ST_IsValid(geom_native))
);
CREATE INDEX base_zoning_v2_geom_native_idx ON base_zoning_v2_rehearsal.base_zoning_city_sd_v2 USING gist (geom_native);
CREATE INDEX base_zoning_v2_zone_code_idx ON base_zoning_v2_rehearsal.base_zoning_city_sd_v2 (zone_code);

CREATE TABLE base_zoning_v2_rehearsal.rejection (
  acquisition_id text NOT NULL REFERENCES base_zoning_v2_rehearsal.acquisition,
  source_object_id integer NOT NULL,
  zone_code text,
  reasons jsonb NOT NULL CHECK (jsonb_array_length(reasons) > 0),
  geom geometry(Geometry,4326),
  geom_native geometry(Geometry,2230),
  native_envelope geometry(Polygon,2230) NOT NULL,
  geometry_sha256 text,
  PRIMARY KEY (acquisition_id, source_object_id)
);
CREATE INDEX base_zoning_v2_rejection_envelope_idx ON base_zoning_v2_rehearsal.rejection USING gist (native_envelope);
CREATE INDEX base_zoning_v2_rejection_geom_native_idx ON base_zoning_v2_rehearsal.rejection USING gist (geom_native);

CREATE TABLE base_zoning_v2_rehearsal.mapping_geometry (
  acquisition_id text NOT NULL REFERENCES base_zoning_v2_rehearsal.acquisition,
  source_object_id integer NOT NULL,
  zone_code text NOT NULL,
  geom_native geometry(Geometry,2230) NOT NULL,
  source_geometry_state text NOT NULL CHECK (source_geometry_state IN ('VALID_SOURCE','EXPLICIT_MAKE_VALID')),
  repair_method text,
  source_area_sqft double precision NOT NULL,
  mapping_area_sqft double precision NOT NULL,
  absolute_area_delta_sqft double precision NOT NULL,
  relative_area_delta_percent double precision NOT NULL,
  PRIMARY KEY (acquisition_id, source_object_id),
  CHECK (ST_GeometryType(geom_native) IN ('ST_Polygon','ST_MultiPolygon')),
  CHECK (ST_IsValid(geom_native) AND NOT ST_IsEmpty(geom_native)),
  CHECK ((source_geometry_state='VALID_SOURCE' AND repair_method IS NULL) OR
         (source_geometry_state='EXPLICIT_MAKE_VALID' AND repair_method='GEOS_MAKE_VALID_LINEWORK'))
);
CREATE INDEX base_zoning_v2_mapping_geom_idx ON base_zoning_v2_rehearsal.mapping_geometry USING gist (geom_native);
CREATE INDEX base_zoning_v2_mapping_zone_idx ON base_zoning_v2_rehearsal.mapping_geometry(zone_code);

CREATE TABLE base_zoning_v2_rehearsal.city_parcel_input (
  parcel_acquisition_id text NOT NULL,
  parcel_source_object_id bigint NOT NULL,
  apn_norm text NOT NULL CHECK (apn_norm ~ '^[0-9]{10}$'),
  parcel_id bigint NOT NULL,
  geometry_sha256 text NOT NULL,
  geom_native geometry(Geometry,2230) NOT NULL,
  parcel_area_sqft double precision NOT NULL CHECK (parcel_area_sqft > 0),
  PRIMARY KEY (parcel_acquisition_id, parcel_source_object_id),
  UNIQUE (apn_norm)
);
CREATE INDEX base_zoning_v2_parcel_geom_idx ON base_zoning_v2_rehearsal.city_parcel_input USING gist (geom_native);
CREATE INDEX base_zoning_v2_parcel_id_idx ON base_zoning_v2_rehearsal.city_parcel_input (parcel_id);

CREATE TABLE base_zoning_v2_rehearsal.parcel_zone_intersection (
  parcel_acquisition_id text NOT NULL,
  parcel_source_object_id bigint NOT NULL,
  zoning_acquisition_id text NOT NULL,
  zoning_source_object_id integer NOT NULL,
  zone_code text NOT NULL,
  intersected_area_sqft double precision NOT NULL CHECK (intersected_area_sqft > 0),
  parcel_coverage_percent double precision NOT NULL CHECK (parcel_coverage_percent > 0),
  PRIMARY KEY (parcel_acquisition_id, parcel_source_object_id, zoning_acquisition_id, zoning_source_object_id),
  FOREIGN KEY (parcel_acquisition_id, parcel_source_object_id)
    REFERENCES base_zoning_v2_rehearsal.city_parcel_input(parcel_acquisition_id, parcel_source_object_id),
  FOREIGN KEY (zoning_acquisition_id, zoning_source_object_id)
    REFERENCES base_zoning_v2_rehearsal.mapping_geometry(acquisition_id, source_object_id)
);
CREATE INDEX base_zoning_v2_intersection_zone_idx ON base_zoning_v2_rehearsal.parcel_zone_intersection (zone_code);

CREATE TABLE base_zoning_v2_rehearsal.parcel_zone_metric (
  parcel_acquisition_id text NOT NULL,
  parcel_source_object_id bigint NOT NULL,
  zoning_acquisition_id text NOT NULL,
  zone_code text NOT NULL,
  intersected_area_sqft double precision NOT NULL CHECK (intersected_area_sqft > 0),
  parcel_coverage_percent double precision NOT NULL CHECK (parcel_coverage_percent > 0),
  contributing_polygon_count integer NOT NULL CHECK (contributing_polygon_count > 0),
  PRIMARY KEY (parcel_acquisition_id, parcel_source_object_id, zoning_acquisition_id, zone_code)
);

CREATE TABLE base_zoning_v2_rehearsal.parcel_base_zoning_map_v2 (
  parcel_acquisition_id text NOT NULL,
  parcel_source_object_id bigint NOT NULL,
  apn_norm text NOT NULL,
  zoning_acquisition_id text NOT NULL,
  mapping_method_version text NOT NULL,
  mapping_state text NOT NULL CHECK (mapping_state IN ('SINGLE_ZONE','MULTI_ZONE','BOUNDARY_SLIVER','UNMAPPED','INDETERMINATE')),
  dominant_zone_code text,
  dominant_coverage_percent double precision,
  secondary_coverage_percent double precision,
  total_covered_percent double precision NOT NULL,
  distinct_zone_count integer NOT NULL CHECK (distinct_zone_count >= 0),
  repaired_source_feature_count integer NOT NULL CHECK (repaired_source_feature_count >= 0),
  zone_evidence jsonb NOT NULL,
  PRIMARY KEY (parcel_acquisition_id, parcel_source_object_id),
  UNIQUE (apn_norm)
);
CREATE INDEX base_zoning_v2_map_state_idx ON base_zoning_v2_rehearsal.parcel_base_zoning_map_v2(mapping_state);
CREATE INDEX base_zoning_v2_map_dominant_zone_idx ON base_zoning_v2_rehearsal.parcel_base_zoning_map_v2(dominant_zone_code);

COMMENT ON TABLE base_zoning_v2_rehearsal.base_zoning_city_sd_v2 IS 'Unrepaired valid source zoning geometry only';
COMMENT ON TABLE base_zoning_v2_rehearsal.mapping_geometry IS 'All source features; invalid raw geometry has explicit audited GEOS make-valid derivation and area-delta evidence';
COMMENT ON TABLE base_zoning_v2_rehearsal.parcel_zone_intersection IS 'Feature-level spatial evidence; no first-intersection selection';
COMMENT ON TABLE base_zoning_v2_rehearsal.parcel_base_zoning_map_v2 IS 'Base-zone identity evidence only; no development standards or capacity';

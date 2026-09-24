-- Disposable local rehearsal only. Not a production migration or serving schema.
CREATE SCHEMA parcel_v2_rehearsal;
CREATE TABLE parcel_v2_rehearsal.acquisition (
 acquisition_id text PRIMARY KEY,
 artifact_sha256 text NOT NULL CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
 report_sha256 text NOT NULL CHECK (report_sha256 ~ '^[a-f0-9]{64}$'),
 normalized_rows_sha256 text NOT NULL CHECK (normalized_rows_sha256 ~ '^[a-f0-9]{64}$'),
 source_count bigint NOT NULL, accepted_count bigint NOT NULL, rejected_count bigint NOT NULL,
 native_crs text NOT NULL CHECK (native_crs='EPSG:2230'),
 artifact_crs text NOT NULL CHECK (artifact_crs='EPSG:4326'),
 CHECK (source_count=accepted_count+rejected_count)
);
CREATE TABLE parcel_v2_rehearsal.parcel_base_sangis_v2 (
 acquisition_id text NOT NULL REFERENCES parcel_v2_rehearsal.acquisition,
 source_object_id bigint NOT NULL CHECK (source_object_id>0),
 apn_raw text NOT NULL,
 apn_norm text NOT NULL CHECK (apn_norm ~ '^[0-9]{10}$'),
 parcel_id bigint NOT NULL CHECK (parcel_id>0),
 situs_components jsonb NOT NULL,
 address text,
 situs_zip text,
 situs_juris text,
 taxable_acreage double precision CHECK (taxable_acreage>=0),
 geom geometry(Geometry,4326) NOT NULL,
 centroid geometry(Point,4326) NOT NULL,
 point_on_surface geometry(Point,4326) NOT NULL,
 centroid_within boolean NOT NULL,
 approximate_geometry_area_sqft double precision NOT NULL CHECK (approximate_geometry_area_sqft>0),
 geometry_sha256 text NOT NULL CHECK (geometry_sha256 ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY (acquisition_id,source_object_id),
 CHECK (ST_GeometryType(geom) IN ('ST_Polygon','ST_MultiPolygon')),
 CHECK (ST_NDims(geom)=2 AND NOT ST_IsEmpty(geom) AND ST_IsValid(geom))
);
-- APN, parcel ID and geometry are deliberately NOT unique. Preserve stacked rows.
CREATE INDEX parcel_v2_apn_idx ON parcel_v2_rehearsal.parcel_base_sangis_v2(apn_norm);
CREATE INDEX parcel_v2_jurisdiction_idx ON parcel_v2_rehearsal.parcel_base_sangis_v2(situs_juris);
CREATE INDEX parcel_v2_parcel_id_idx ON parcel_v2_rehearsal.parcel_base_sangis_v2(parcel_id);
CREATE INDEX parcel_v2_geom_idx ON parcel_v2_rehearsal.parcel_base_sangis_v2 USING gist(geom);
CREATE TABLE parcel_v2_rehearsal.rejection (
 acquisition_id text NOT NULL REFERENCES parcel_v2_rehearsal.acquisition,
 source_object_id bigint NOT NULL,
 apn_raw text,
 reasons jsonb NOT NULL CHECK (jsonb_array_length(reasons)>0),
 PRIMARY KEY (acquisition_id,source_object_id)
);
COMMENT ON COLUMN parcel_v2_rehearsal.parcel_base_sangis_v2.taxable_acreage IS 'Source taxable acreage, not legal lot area';
COMMENT ON COLUMN parcel_v2_rehearsal.parcel_base_sangis_v2.geometry_sha256 IS 'Packet 6 canonical WKB hash for identity grouping; no geometry repair';

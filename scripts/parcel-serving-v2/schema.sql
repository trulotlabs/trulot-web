-- Isolated rehearsal only; not a production migration.
CREATE SCHEMA parcel_serving_rehearsal;
CREATE TABLE parcel_serving_rehearsal.receipt (
 acquisition_id text PRIMARY KEY REFERENCES parcel_v2_rehearsal.acquisition,
 dataset_id text NOT NULL CHECK(dataset_id='parcel_base_sangis_v2'),
 acquired_at text NOT NULL,
 publisher text NOT NULL CHECK(publisher='SanGIS'),
 source_url text NOT NULL,
 metadata_url text NOT NULL,
 source_temporal_extent text,
 artifact_sha256 text NOT NULL,
 metadata_sha256 text NOT NULL,
 receipt_reference text NOT NULL,
 import_identity text NOT NULL,
 serving_definition_sha256 text NOT NULL
);
CREATE TABLE parcel_serving_rehearsal.selected_acquisition (
 singleton boolean PRIMARY KEY CHECK(singleton),
 acquisition_id text NOT NULL REFERENCES parcel_serving_rehearsal.receipt
);
CREATE VIEW parcel_serving_rehearsal.parcel_serving_v2 AS
 SELECT p.acquisition_id,p.source_object_id,p.apn_norm,p.parcel_id,
 p.address,p.situs_components,p.situs_zip,p.situs_juris,
 p.geom,p.centroid,p.point_on_surface,p.centroid_within,
 p.approximate_geometry_area_sqft,p.taxable_acreage,p.geometry_sha256,
 a.native_crs,a.artifact_crs
 FROM parcel_v2_rehearsal.parcel_base_sangis_v2 p
 JOIN parcel_serving_rehearsal.selected_acquisition selected USING(acquisition_id)
 JOIN parcel_v2_rehearsal.acquisition a USING(acquisition_id)
 WHERE p.situs_juris='SD';
COMMENT ON VIEW parcel_serving_rehearsal.parcel_serving_v2 IS 'One selected snapshot; City of San Diego situs scope. No deduplication or enrichment.';

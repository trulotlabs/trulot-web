-- Rehearsal contract only. This file is not a production migration and is not executed by Packet 11.
-- The authoritative build artifact is the deterministic external NDJSON produced by integrate.py.
CREATE SCHEMA parcel_intelligence_rehearsal;

CREATE TABLE parcel_intelligence_rehearsal.parcel_intelligence_serving_v2 (
  parcel_acquisition_id text NOT NULL,
  parcel_source_object_id bigint NOT NULL,
  apn_norm text PRIMARY KEY CHECK (apn_norm ~ '^[0-9]{10}$'),
  parcel_id bigint NOT NULL,
  parcel_payload jsonb NOT NULL,
  zoning_acquisition_id text NOT NULL,
  zoning_mapping_method_version text NOT NULL,
  zoning_mapping_state text NOT NULL CHECK (zoning_mapping_state IN ('SINGLE_ZONE','MULTI_ZONE','BOUNDARY_SLIVER','UNMAPPED','INDETERMINATE')),
  analytical_dominant_zone_code text,
  zoning_evidence jsonb NOT NULL,
  parcel_provenance jsonb NOT NULL,
  zoning_provenance jsonb NOT NULL,
  integration_method_version text NOT NULL,
  UNIQUE (parcel_acquisition_id, parcel_source_object_id),
  CHECK (jsonb_typeof(zoning_evidence) = 'array')
);

CREATE INDEX parcel_intelligence_v2_parcel_id_idx ON parcel_intelligence_rehearsal.parcel_intelligence_serving_v2(parcel_id);
CREATE INDEX parcel_intelligence_v2_zoning_state_idx ON parcel_intelligence_rehearsal.parcel_intelligence_serving_v2(zoning_mapping_state);
CREATE INDEX parcel_intelligence_v2_dominant_zone_idx ON parcel_intelligence_rehearsal.parcel_intelligence_serving_v2(analytical_dominant_zone_code);

COMMENT ON TABLE parcel_intelligence_rehearsal.parcel_intelligence_serving_v2 IS
  'Offline Parcel Serving V2 plus Base Zoning V2 truth; no standards, capacity, permits, overlays, or runtime wiring.';
COMMENT ON COLUMN parcel_intelligence_rehearsal.parcel_intelligence_serving_v2.analytical_dominant_zone_code IS
  'Descriptive area-ranking convenience only; never replaces the complete zoning_evidence array.';

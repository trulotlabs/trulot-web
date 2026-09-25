import { z } from "zod";
import { canonicalParcelPath, canonicalParcelSlug } from "./parcel-slug";
import type { FactProvenance, TruthFact } from "./parcel-truth";
import type { ParcelPageV1Result, ParcelTruth } from "./parcel-page-v1";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const point = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
});
const polygon = z.object({ type: z.enum(["Polygon", "MultiPolygon"]), coordinates: z.array(z.unknown()) });
const zoningFeature = z.object({
  sourceObjectId: z.number().int().positive(),
  sourceGeometryState: z.enum(["VALID_SOURCE", "EXPLICIT_MAKE_VALID"]),
  intersectedAreaSqFt: z.number().positive(),
});
const zoningEvidence = z.object({
  zoneCode: z.string().min(1),
  intersectedAreaSqFt: z.number().positive(),
  parcelCoveragePercent: z.number().positive(),
  features: z.array(zoningFeature).min(1),
});

export const parcelServingV2RowSchema = z.object({
  schema_version: z.literal(1),
  parcel_acquisition_id: z.string().min(1),
  parcel_source_object_id: z.number().int().positive(),
  apn_norm: z.string().regex(/^\d{10}$/),
  parcel_id: z.number().int(),
  address: z.string().min(1).nullable(),
  situs_components: z.record(z.string(), z.unknown()),
  situs_zip: z.string().nullable(),
  jurisdiction: z.literal("SD"),
  geom: polygon,
  centroid: point,
  point_on_surface: point,
  centroid_within: z.boolean(),
  approximate_geometry_area_sqft: z.number().positive(),
  taxable_acreage: z.number().nullable(),
  geometry_sha256: hash,
  parcel_native_crs: z.literal("EPSG:2230"),
  parcel_artifact_crs: z.literal("EPSG:4326"),
  zoning_acquisition_id: z.string().min(1),
  mapping_method_version: z.string().min(1),
  zoning_mapping_state: z.enum(["SINGLE_ZONE", "MULTI_ZONE", "BOUNDARY_SLIVER", "UNMAPPED", "INDETERMINATE"]),
  dominant_zone_code: z.string().min(1).nullable(),
  dominant_coverage_percent: z.number().nullable(),
  secondary_coverage_percent: z.number().nullable(),
  total_covered_percent: z.number().nonnegative(),
  uncovered_percent: z.number().nonnegative(),
  distinct_zone_count: z.number().int().nonnegative(),
  repaired_source_feature_count: z.number().int().nonnegative(),
  zoning_evidence: z.array(zoningEvidence),
  provenance: z.object({
    parcelAcquisitionId: z.string().min(1),
    parcelSourceObjectId: z.number().int().positive(),
    parcelArtifactSha256: hash,
    zoningAcquisitionId: z.string().min(1),
    zoningArtifactSha256: hash,
    mappingMethodVersion: z.string().min(1),
    importRunId: z.string().uuid(),
  }),
});

export type ParcelServingV2Row = z.infer<typeof parcelServingV2RowSchema>;
export type ParcelServingV2Status = "found" | "not_found" | "source_unavailable" | "partial" | "malformed_result" | "invalid_request";

export interface ParcelServingV2Data {
  apn: string;
  address: string | null;
  zip: string | null;
  jurisdiction: "SD";
  centroid: { longitude: number; latitude: number };
  pointOnSurface: { longitude: number; latitude: number };
  approximateGeometryAreaSqFt: number;
  geometryAreaLabel: "Approximate geometry-derived parcel area (not legal lot area)";
  taxableAcreage: number | null;
  canonicalSlug: string;
  canonicalPath: string;
  zoning: {
    state: ParcelServingV2Row["zoning_mapping_state"];
    dominantZoneCode: string | null;
    distinctZoneCount: number;
    evidence: ParcelServingV2Row["zoning_evidence"];
  };
  provenance: ParcelServingV2Row["provenance"];
}

export type ParcelServingV2Truth = Omit<ParcelTruth, "parcel"> & {
  parcel: TruthFact<{
    apn: string;
    address: string | null;
    zip: string | null;
    jurisdiction: "SD";
    approximateGeometryAreaSqFt: number;
  } | false>;
  baseZoning: TruthFact<{
    mappingState: ParcelServingV2Row["zoning_mapping_state"];
    dominantZoneCode: string | null;
    zoneEvidence: ParcelServingV2Row["zoning_evidence"];
  }>;
};

export interface ParcelServingV2Result {
  status: ParcelServingV2Status;
  reason: string;
  data: ParcelServingV2Data | null;
  truth: ParcelServingV2Truth;
}

export interface ParcelServingV2QueryResult {
  data: unknown;
  error: unknown;
}

export type ParcelServingV2Query = (apn: string) => Promise<ParcelServingV2QueryResult>;

function provenance(sourceId: string, datasetId: string, basis: string, row?: ParcelServingV2Row): FactProvenance {
  return {
    sourceId,
    datasetId,
    sourceLabel: datasetId === "parcel_base_sangis_v2" ? "SanGIS Parcel Base V2" : "City of San Diego Base Zoning V2",
    publisher: datasetId === "parcel_base_sangis_v2" ? "SanGIS" : "City of San Diego Planning via SanGIS",
    sourceUrl: datasetId === "parcel_base_sangis_v2"
      ? "https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer/0"
      : "https://geo.sandag.org/server/rest/services/Hosted/Zoning_Base_SD/FeatureServer/0",
    effectiveAt: null,
    retrievedAt: null,
    importedAt: null,
    viewCalculatedAt: null,
    methodology: row?.mapping_method_version ?? null,
    basis,
  };
}

function unavailableTruth(sourceState: "source_unavailable" | "not_evaluated" = "not_evaluated"): ParcelServingV2Truth {
  return {
    parcel: {
      state: "unavailable",
      value: null,
      sourceState,
      derivation: "recorded",
      provenance: provenance("parcel-serving-v2", "parcel_base_sangis_v2", "Parcel V2 result was not available."),
    },
    baseZoning: {
      state: "unavailable",
      value: null,
      sourceState,
      derivation: "deterministic_derived",
      provenance: provenance("parcel-zone-mapping-v2", "base_zoning_city_sd_v2", "Base Zoning V2 result was not available."),
    },
    ...independentTruth(),
  };
}

function independentTruth(): Pick<ParcelTruth, "overlays" | "permits"> {
  const independent = <T>(sourceId: string, basis: string): TruthFact<T> => ({
    state: "unavailable",
    value: null,
    sourceState: "not_evaluated",
    derivation: "recorded",
    provenance: provenance(sourceId, "independent_source", basis),
  });
  return {
    overlays: {
      tpa: independent<boolean>("tpa-overlay", "Overlay sources remain independent of Parcel Serving V2."),
      ctcac: independent<boolean>("ctcac-overlay", "Overlay sources remain independent of Parcel Serving V2."),
      sda: independent<boolean>("sda-overlay", "Overlay sources remain independent of Parcel Serving V2."),
    },
    permits: independent<never[]>("parcel-permits", "Permit sources remain independent of Parcel Serving V2."),
  };
}

export function normalizeParcelServingV2Apn(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{10}$/.test(trimmed)) return trimmed;
  if (/^\d{3}-\d{3}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.replaceAll("-", "");
  return null;
}

export type V2RouteApnResolution =
  | { status: "exact"; apn: string }
  | { status: "legacy_padding_required"; apn: null }
  | { status: "invalid"; apn: null };

export function resolveV2RouteApn(slug: string): V2RouteApnResolution {
  const prefixed = slug.match(/^apn-(\d{8,10})$/i);
  const formatted = slug.match(/^(\d{3}-\d{3}-\d{2}(?:-\d{2})?)(?:-|$)/);
  const bare = slug.match(/^(\d{8,10})(?:-|$)/);
  const candidate = prefixed?.[1] ?? formatted?.[1].replaceAll("-", "") ?? bare?.[1] ?? null;
  if (!candidate) return { status: "invalid", apn: null };
  if (candidate.length !== 10) return { status: "legacy_padding_required", apn: null };
  return { status: "exact", apn: candidate };
}

export async function getParcelServingV2Result(input: string, query: ParcelServingV2Query): Promise<ParcelServingV2Result> {
  const apn = normalizeParcelServingV2Apn(input);
  if (!apn) return { status: "invalid_request", reason: "exact_10_digit_apn_required", data: null, truth: unavailableTruth() };

  let response: ParcelServingV2QueryResult;
  try {
    response = await query(apn);
  } catch {
    return { status: "source_unavailable", reason: "query_rejected", data: null, truth: unavailableTruth("source_unavailable") };
  }
  if (response.error) {
    return { status: "source_unavailable", reason: "query_failed", data: null, truth: unavailableTruth("source_unavailable") };
  }
  if (response.data === null) {
    return {
      status: "not_found",
      reason: "authoritative_selected_snapshot_absence",
      data: null,
      truth: {
        parcel: {
          state: "supported",
          value: false,
          sourceState: "available",
          derivation: "recorded",
          provenance: provenance(apn, "parcel_base_sangis_v2", "No matching APN in the validated selected City snapshot."),
        },
        baseZoning: {
          state: "not_applicable",
          value: null,
          sourceState: "available",
          derivation: "deterministic_derived",
          provenance: provenance(apn, "base_zoning_city_sd_v2", "No parcel exists in the selected Parcel V2 City scope."),
        },
        ...independentTruth(),
      },
    };
  }
  const parsed = parcelServingV2RowSchema.safeParse(response.data);
  if (!parsed.success) {
    return { status: "malformed_result", reason: "serving_contract_mismatch", data: null, truth: unavailableTruth("source_unavailable") };
  }
  const row = parsed.data;
  if (row.apn_norm !== apn || row.provenance.parcelAcquisitionId !== row.parcel_acquisition_id || row.provenance.parcelSourceObjectId !== row.parcel_source_object_id || row.provenance.zoningAcquisitionId !== row.zoning_acquisition_id) {
    return { status: "malformed_result", reason: "serving_identity_mismatch", data: null, truth: unavailableTruth("source_unavailable") };
  }

  const zoningUnresolved = row.zoning_mapping_state === "UNMAPPED" || row.zoning_mapping_state === "INDETERMINATE";
  const parcelFact = {
    apn: row.apn_norm,
    address: row.address,
    zip: row.situs_zip,
    jurisdiction: row.jurisdiction,
    approximateGeometryAreaSqFt: row.approximate_geometry_area_sqft,
  };
  const data: ParcelServingV2Data = {
    ...parcelFact,
    centroid: { longitude: row.centroid.coordinates[0], latitude: row.centroid.coordinates[1] },
    pointOnSurface: { longitude: row.point_on_surface.coordinates[0], latitude: row.point_on_surface.coordinates[1] },
    geometryAreaLabel: "Approximate geometry-derived parcel area (not legal lot area)",
    taxableAcreage: row.taxable_acreage,
    canonicalSlug: canonicalParcelSlug(row.apn_norm, row.address),
    canonicalPath: canonicalParcelPath(row.apn_norm, row.address),
    zoning: {
      state: row.zoning_mapping_state,
      dominantZoneCode: row.dominant_zone_code,
      distinctZoneCount: row.distinct_zone_count,
      evidence: row.zoning_evidence,
    },
    provenance: row.provenance,
  };
  const parcelProvenance = provenance(`${row.parcel_acquisition_id}:${row.parcel_source_object_id}`, "parcel_base_sangis_v2", "Recorded parcel identity plus explicitly labeled geometry-derived facts.", row);
  const zoningProvenance = provenance(`${row.zoning_acquisition_id}:${row.parcel_source_object_id}`, "base_zoning_city_sd_v2", "Deterministic parcel-to-zone area coverage with complete split-zone evidence.", row);

  return {
    status: zoningUnresolved ? "partial" : "found",
    reason: zoningUnresolved ? `zoning_${row.zoning_mapping_state.toLowerCase()}` : "integrated",
    data,
    truth: {
      parcel: { state: "supported", value: parcelFact, sourceState: "available", derivation: "recorded", provenance: parcelProvenance },
      baseZoning: zoningUnresolved
        ? { state: "partial", value: { mappingState: row.zoning_mapping_state, dominantZoneCode: row.dominant_zone_code, zoneEvidence: row.zoning_evidence }, sourceState: "partial", derivation: "deterministic_derived", provenance: zoningProvenance }
        : { state: "supported", value: { mappingState: row.zoning_mapping_state, dominantZoneCode: row.dominant_zone_code, zoneEvidence: row.zoning_evidence }, sourceState: "available", derivation: "deterministic_derived", provenance: zoningProvenance },
      ...independentTruth(),
    },
  };
}

export type ParcelV2ComparisonClass =
  | "MATCH"
  | "NORMALIZED_EQUIVALENT"
  | "SOURCE_VINTAGE_DIFFERENCE"
  | "LEGACY_SEMANTICS_UNKNOWN"
  | "V2_CORRECTION_CANDIDATE"
  | "UNRESOLVED";

export interface ParcelV2ShadowComparison {
  apn: string;
  v1Status: ParcelPageV1Result["status"];
  v2Status: ParcelServingV2Status;
  fields: Record<"presence" | "apn" | "address" | "zip" | "jurisdiction" | "coordinates" | "area" | "baseZoning", ParcelV2ComparisonClass>;
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function compareText(left: string | null | undefined, right: string | null | undefined): ParcelV2ComparisonClass {
  if (left === right) return "MATCH";
  if (normalizedText(left) && normalizedText(left) === normalizedText(right)) return "NORMALIZED_EQUIVALENT";
  if (!left || !right) return "UNRESOLVED";
  return "SOURCE_VINTAGE_DIFFERENCE";
}

export function compareParcelServingV2(v1: ParcelPageV1Result, v2: ParcelServingV2Result, apn: string): ParcelV2ShadowComparison {
  const v1Present = Boolean(v1.data);
  const v2Present = Boolean(v2.data);
  const fields: ParcelV2ShadowComparison["fields"] = {
    presence: v1Present === v2Present ? "MATCH" : v2Present ? "V2_CORRECTION_CANDIDATE" : "UNRESOLVED",
    apn: "UNRESOLVED",
    address: "UNRESOLVED",
    zip: "UNRESOLVED",
    jurisdiction: "UNRESOLVED",
    coordinates: "UNRESOLVED",
    area: "LEGACY_SEMANTICS_UNKNOWN",
    baseZoning: "UNRESOLVED",
  };
  if (v1.data && v2.data) {
    fields.apn = compareText(v1.data.apnNorm, v2.data.apn);
    fields.address = compareText(v1.data.identity.address, v2.data.address);
    fields.zip = compareText(v1.data.identity.zip?.slice(0, 5), v2.data.zip?.slice(0, 5));
    fields.jurisdiction = normalizedText(v1.data.identity.city) === "SANDIEGO" && v2.data.jurisdiction === "SD" ? "NORMALIZED_EQUIVALENT" : "UNRESOLVED";
    const coordinates = v1.data.identity.lat !== null && v1.data.identity.lng !== null;
    fields.coordinates = coordinates
      ? Math.abs(v1.data.identity.lat! - v2.data.centroid.latitude) <= 0.000001 && Math.abs(v1.data.identity.lng! - v2.data.centroid.longitude) <= 0.000001
        ? "MATCH"
        : "SOURCE_VINTAGE_DIFFERENCE"
      : "UNRESOLVED";
    if (v2.data.zoning.state === "MULTI_ZONE" || v2.data.zoning.state === "BOUNDARY_SLIVER") {
      fields.baseZoning = "LEGACY_SEMANTICS_UNKNOWN";
    } else if (v2.data.zoning.state === "UNMAPPED" || v2.data.zoning.state === "INDETERMINATE") {
      fields.baseZoning = "UNRESOLVED";
    } else {
      fields.baseZoning = compareText(v1.data.zoning.baseCode.value, v2.data.zoning.dominantZoneCode);
    }
  }
  return { apn, v1Status: v1.status, v2Status: v2.status, fields };
}

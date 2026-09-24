// Offline dependency-injected rehearsal adapter. Never imported by application runtime.
import { z } from "zod";
import type { FactProvenance, TruthFact } from "../../lib/parcel-truth";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const mappingState = z.enum(["SINGLE_ZONE", "MULTI_ZONE", "BOUNDARY_SLIVER", "UNMAPPED", "INDETERMINATE"]);
const featureEvidence = z.object({
  sourceObjectId: z.number().int().positive(),
  sourceGeometryState: z.enum(["VALID_SOURCE", "EXPLICIT_MAKE_VALID"]),
  intersectedAreaSqFt: z.number().positive(),
}).strict();
const zoneEvidence = z.object({
  zoneCode: z.string().trim().min(1),
  intersectedAreaSqFt: z.number().positive(),
  parcelCoveragePercent: z.number().positive(),
  features: z.array(featureEvidence).min(1),
}).strict();
export const mappingRowSchema = z.object({
  parcelAcquisitionId: z.string().min(1),
  parcelSourceObjectId: z.number().int().positive(),
  apn: z.string().regex(/^\d{10}$/),
  mappingState,
  dominantZoneCode: z.string().trim().min(1).nullable(),
  distinctZoneCount: z.number().int().nonnegative(),
  dominantCoveragePercent: z.number().nullable(),
  secondaryCoveragePercent: z.number().nonnegative(),
  totalCoveredPercent: z.number().nonnegative(),
  repairedSourceFeatureCount: z.number().int().nonnegative(),
  zoneEvidence: z.array(zoneEvidence),
}).strict().superRefine((row, context) => {
  if (row.distinctZoneCount !== row.zoneEvidence.length) context.addIssue({ code: "custom", message: "zone count mismatch" });
  if ((row.mappingState === "UNMAPPED") !== (row.zoneEvidence.length === 0)) context.addIssue({ code: "custom", message: "unmapped evidence mismatch" });
  if (row.zoneEvidence.length && row.dominantZoneCode !== row.zoneEvidence[0].zoneCode) context.addIssue({ code: "custom", message: "dominant zone mismatch" });
});
export const receiptSchema = z.object({
  acquisitionId: z.string().min(1),
  datasetId: z.literal("base_zoning_city_sd_v2"),
  publisher: z.literal("City of San Diego Planning via SanGIS"),
  sourceItemId: z.literal("e99981214e6348de8ddc3674f799c75d"),
  sourceUrl: z.literal("https://geo.sandag.org/server/rest/services/Hosted/Zoning_Base_SD/FeatureServer/0"),
  acquiredAt: z.string().datetime({ offset: true }),
  sourceModifiedAt: z.string().datetime({ offset: true }),
  artifactSha256: hash,
  mappingFingerprintSha256: hash,
  mappingMethodVersion: z.literal("base-zoning-city-sd-v2-area-coverage-v1"),
  receiptReference: z.string().min(1),
}).strict();

export type BaseZoningRow = z.infer<typeof mappingRowSchema>;
export type BaseZoningValue = {
  mappingState: z.infer<typeof mappingState>;
  zones: string[];
  dominantZoneCode: string | null;
  evidence: z.infer<typeof zoneEvidence>[];
};
export interface BaseZoningResult {
  status: "found" | "partial" | "source_unavailable";
  reason: "mapped" | "unmapped" | "indeterminate" | "source_failure" | "invalid_request";
  fact: TruthFact<BaseZoningValue>;
}

function provenance(receipt: z.infer<typeof receiptSchema> | null, basis: string): FactProvenance {
  return {
    sourceId: "base_zoning_v2_rehearsal",
    datasetId: receipt?.datasetId ?? null,
    sourceLabel: "City of San Diego base zoning",
    publisher: receipt?.publisher ?? null,
    sourceUrl: receipt?.sourceUrl ?? null,
    effectiveAt: receipt?.sourceModifiedAt ?? null,
    retrievedAt: receipt?.acquiredAt ?? null,
    importedAt: null,
    viewCalculatedAt: null,
    methodology: receipt ? `receipt=${receipt.receiptReference}; artifact=${receipt.artifactSha256}; mapping=${receipt.mappingFingerprintSha256}; method=${receipt.mappingMethodVersion}` : null,
    basis,
  };
}

function unavailable(reason: BaseZoningResult["reason"] = "source_failure"): BaseZoningResult {
  return { status: "source_unavailable", reason, fact: { state: "unavailable", value: null, sourceState: "source_unavailable",
    derivation: "deterministic_derived", provenance: provenance(null, "Source lookup failed or violated the mapping contract; no zoning absence conclusion.") } };
}

export async function lookupBaseZoningV2(apn: string, query: (apn: string) => Promise<unknown>): Promise<BaseZoningResult> {
  if (!/^\d{10}$/.test(apn)) return unavailable("invalid_request");
  try {
    const envelope = z.object({ row: mappingRowSchema, receipt: receiptSchema, error: z.null().optional() }).strict().parse(await query(apn));
    if (envelope.row.apn !== apn || envelope.row.parcelAcquisitionId.length === 0) return unavailable();
    const row = envelope.row;
    const value: BaseZoningValue = { mappingState: row.mappingState, zones: row.zoneEvidence.map(item => item.zoneCode),
      dominantZoneCode: row.dominantZoneCode, evidence: row.zoneEvidence };
    const p = provenance(envelope.receipt, "Area intersection of accepted Parcel Base V2 geometry with the immutable City base-zoning snapshot; all material zone values are preserved.");
    if (row.mappingState === "UNMAPPED") return { status: "partial", reason: "unmapped",
      fact: { state: "unknown", value: null, sourceState: "available", derivation: "deterministic_derived",
        provenance: { ...p, basis: "No valid source coverage intersects the parcel; this does not mean unzoned." } } };
    if (row.mappingState === "INDETERMINATE") return { status: "partial", reason: "indeterminate",
      fact: { state: "partial", value, sourceState: "partial", derivation: "deterministic_derived",
        provenance: { ...p, basis: "Intersection evidence exists but total coverage is outside the effectively-full tolerance." } } };
    return { status: "found", reason: "mapped", fact: { state: "supported", value, sourceState: "available",
      derivation: "deterministic_derived", provenance: p } };
  } catch {
    return unavailable();
  }
}

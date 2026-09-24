// Offline composition of Parcel Serving V2 and Base Zoning V2. Never imported by application runtime.
import type { TruthFact } from "../../lib/parcel-truth";
import { lookupParcelServingV2, type ServingResult } from "../parcel-serving-v2/adapter";
import { lookupBaseZoningV2, type BaseZoningResult, type BaseZoningValue } from "../base-zoning-v2/adapter";

export type ZoningDisplay = {
  sourceLabel: string | null;
  sourceAcquiredAt: string | null;
  sourceModifiedAt: string | null;
  acquisitionReference: string | null;
  mappingState: BaseZoningValue["mappingState"];
  analyticalDominantZoneCode: string | null;
  zones: Array<{
    rawCode: string;
    parcelCoveragePercent: number;
    sourceFeatureIds: number[];
    role: "single" | "material" | "principal" | "boundary_sliver" | "partial_evidence";
  }>;
  basis: string;
};

export type IntegratedParcelTruth = ServingResult["truth"] & { baseZoning: TruthFact<BaseZoningValue> };
export interface IntegratedResult {
  status: "found" | "not_found" | "partial" | "source_unavailable" | "invalid_request";
  reason: "integrated" | "parcel_not_found" | "parcel_partial" | "parcel_source_failure" | "invalid_request" |
    "zoning_unmapped" | "zoning_indeterminate" | "zoning_source_failure";
  truth: IntegratedParcelTruth;
  parcel: ServingResult["data"];
  zoningDisplay: ZoningDisplay | null;
}

function deferredZoning(state: "not_applicable" | "unavailable"): TruthFact<BaseZoningValue> {
  const sourceState = state === "not_applicable" ? "available" : "not_evaluated";
  return { state, value: null, sourceState, derivation: "deterministic_derived", provenance: {
    sourceId: "base_zoning_v2_rehearsal", datasetId: null, sourceLabel: "City of San Diego base zoning",
    publisher: null, sourceUrl: null, effectiveAt: null, retrievedAt: null, importedAt: null, viewCalculatedAt: null,
    methodology: null, basis: state === "not_applicable" ? "Parcel is absent from the selected City parcel scope." : "Zoning was not evaluated because parcel identity was unavailable or ambiguous.",
  } } as TruthFact<BaseZoningValue>;
}

function display(result: BaseZoningResult): ZoningDisplay | null {
  if (!result.fact.value) return null;
  const value = result.fact.value;
  return {
    sourceLabel: result.fact.provenance.sourceLabel,
    sourceAcquiredAt: result.fact.provenance.retrievedAt,
    sourceModifiedAt: result.fact.provenance.effectiveAt,
    acquisitionReference: result.fact.provenance.methodology,
    mappingState: value.mappingState,
    analyticalDominantZoneCode: value.dominantZoneCode,
    zones: value.evidence.map((item, index) => ({
      rawCode: item.zoneCode,
      parcelCoveragePercent: item.parcelCoveragePercent,
      sourceFeatureIds: item.features.map(feature => feature.sourceObjectId),
      role: value.mappingState === "SINGLE_ZONE" ? "single" : value.mappingState === "BOUNDARY_SLIVER"
        ? index === 0 ? "principal" : "boundary_sliver"
        : value.mappingState === "INDETERMINATE" ? "partial_evidence" : "material",
    })),
    basis: result.fact.provenance.basis,
  };
}

export async function lookupParcelIntelligenceV2(
  input: string,
  parcelQuery: (apn: string) => Promise<unknown>,
  zoningQuery: (apn: string) => Promise<unknown>,
): Promise<IntegratedResult> {
  const parcel = await lookupParcelServingV2(input, parcelQuery);
  if (parcel.status !== "found" || !parcel.data) {
    const reason = parcel.status === "not_found" ? "parcel_not_found" : parcel.status === "invalid_request" ? "invalid_request"
      : parcel.status === "partial" ? "parcel_partial" : "parcel_source_failure";
    return { status: parcel.status, reason, parcel: parcel.data, zoningDisplay: null,
      truth: { ...parcel.truth, baseZoning: deferredZoning(parcel.status === "not_found" ? "not_applicable" : "unavailable") } };
  }
  const zoning = await lookupBaseZoningV2(parcel.data.row.apn_norm, zoningQuery);
  const zoningDisplay = display(zoning);
  if (zoning.fact.state === "supported") return { status: "found", reason: "integrated", parcel: parcel.data,
    truth: { ...parcel.truth, baseZoning: zoning.fact }, zoningDisplay };
  const reason = zoning.reason === "unmapped" ? "zoning_unmapped" : zoning.reason === "indeterminate"
    ? "zoning_indeterminate" : "zoning_source_failure";
  return { status: "partial", reason, parcel: parcel.data, truth: { ...parcel.truth, baseZoning: zoning.fact }, zoningDisplay };
}

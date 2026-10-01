import {
  PARCEL_LOOKUP_MAX_RESULTS,
  searchParcelLookup,
  type ParcelLookupRecord,
  type ParcelLookupResponse,
} from "./parcel-lookup-contract";
import type {
  ParcelLookupProductionCandidate,
  ParcelLookupProductionIdentity,
  ParcelLookupProductionV0,
} from "./parcel-lookup-production-v0";

export type ParcelLookupUiSource = "sealed-preview" | "bounded-production-api";

export type ParcelLookupUiResult = {
  response: ParcelLookupResponse;
  records: ParcelLookupRecord[];
  sourceAvailable: boolean;
};

function productionRecord(
  candidate: ParcelLookupProductionCandidate | ParcelLookupProductionIdentity,
): ParcelLookupRecord {
  return {
    apn: candidate.apn,
    apnDisplay: candidate.apnDisplay,
    parcelId: null,
    sourceObjectId: 0,
    address: candidate.address,
    unit: null,
    displayAddress: candidate.displayAddress,
    normalizedAddress: null,
    normalizedUnitAddress: null,
    zip: candidate.zip,
    jurisdiction: candidate.jurisdiction,
    approximateAreaSqFt: "approximateAreaSqFt" in candidate ? candidate.approximateAreaSqFt : 0,
    centroid: [candidate.orientation.longitude, candidate.orientation.latitude],
    geometryType: "Polygon",
    geometrySha256: "0".repeat(64),
    polygons: [],
    parcelIntelligenceAvailable: false,
    zoningState: "NOT_APPLICABLE",
    zones: [],
    coastalState: "NOT_APPLICABLE",
    coastalValue: null,
    existingUnits: null,
  };
}

export function sealedParcelLookupUiResult(records: ParcelLookupRecord[], query: string, sourceAvailable = true): ParcelLookupUiResult {
  return {
    response: searchParcelLookup(records, query, { maximumResults: PARCEL_LOOKUP_MAX_RESULTS, sourceAvailable }),
    records,
    sourceAvailable,
  };
}

export async function productionParcelLookupUiResult(
  query: string,
  options: { endpoint?: string; signal?: AbortSignal } = {},
): Promise<ParcelLookupUiResult> {
  const endpoint = options.endpoint ?? "/api/parcel-lookup";
  const response = await fetch(`${endpoint}?q=${encodeURIComponent(query)}&limit=${PARCEL_LOOKUP_MAX_RESULTS}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal: options.signal,
    headers: { Accept: "application/json" },
  });
  const body = await response.json() as ParcelLookupProductionV0 | { state?: string };
  if (!response.ok && body.state === "INVALID_QUERY") {
    const local = searchParcelLookup([], query);
    return {
      response: local.state === "NO_MATCH" ? { ...local, state: "MALFORMED_QUERY" } : local,
      records: [],
      sourceAvailable: true,
    };
  }
  if (!response.ok || !("contractVersion" in body)) {
    return {
      response: searchParcelLookup([], query, { sourceAvailable: false }),
      records: [],
      sourceAvailable: false,
    };
  }
  const production = body as ParcelLookupProductionV0;
  const records = production.candidates.map(productionRecord);
  const candidatesByApn = new Map(records.map((record) => [record.apn, record]));
  return {
    response: {
      inputType: production.inputType,
      state: production.state,
      normalizedQuery: production.normalizedQuery,
      candidates: production.candidates.map((candidate, index) => ({
        record: candidatesByApn.get(candidate.apn)!,
        rank: index + 1,
        matchReason: production.state === "EXACT_MATCH" ? "exact_address" : "token_match",
      })),
      totalMatches: production.hasMore ? records.length + 1 : records.length,
    },
    records,
    sourceAvailable: true,
  };
}

export async function openProductionParcelIdentity(
  apn: string,
  options: { endpoint?: string; signal?: AbortSignal } = {},
): Promise<ParcelLookupRecord | null> {
  const response = await fetch(`${options.endpoint ?? "/api/parcel-lookup"}?q=${encodeURIComponent(apn)}&limit=1`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal: options.signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const body = await response.json() as ParcelLookupProductionV0;
  return body.selected ? productionRecord(body.selected) : null;
}

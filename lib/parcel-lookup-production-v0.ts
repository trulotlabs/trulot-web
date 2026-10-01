import {
  formatApn,
  normalizeAddress,
  normalizeApnInput,
  searchParcelLookup,
  type ParcelLookupInputType,
  type ParcelLookupRecord,
  type ParcelLookupState,
} from "./parcel-lookup-contract";

export const PARCEL_LOOKUP_PRODUCTION_V0_CONTRACT = "parcel-lookup-production-v0-p45" as const;
export const PARCEL_LOOKUP_PRODUCTION_V0_MAX_RESULTS = 10;
export const PARCEL_LOOKUP_PRODUCTION_V0_MAX_INTERNAL_CANDIDATES = 50;
export const PARCEL_LOOKUP_PRODUCTION_V0_MIN_QUERY_LENGTH = 2;
export const PARCEL_LOOKUP_PRODUCTION_V0_MAX_QUERY_LENGTH = 160;
export const PARCEL_LOOKUP_PRODUCTION_V0_MAX_TOKENS = 12;
export const PARCEL_LOOKUP_PRODUCTION_V0_RESPONSE_BYTES = 65_536;
export const PARCEL_LOOKUP_PRODUCTION_V0_DEADLINE_MS = 1_800;

export type ParcelLookupOrientation = {
  kind: "POINT_ONLY";
  longitude: number;
  latitude: number;
  label: "Display orientation only";
};

export type ParcelLookupProductionCandidate = {
  address: string | null;
  displayAddress: string;
  apn: string;
  apnDisplay: string;
  jurisdiction: "SD";
  zip: string | null;
  orientation: ParcelLookupOrientation;
};

export type ParcelLookupProductionIdentity = ParcelLookupProductionCandidate & {
  approximateAreaSqFt: number;
  areaLabel: "Approximate geometry area";
};

export type ParcelLookupProductionRequest = {
  query: string;
  limit?: number;
};

export type ParcelLookupProductionRpcQueryType =
  | "EXACT_APN"
  | "APN_PREFIX"
  | "EXACT_ADDRESS"
  | "AUTOCOMPLETE";

export type ParcelLookupProductionRpcRow = {
  apn: string;
  apn_display: string;
  address: string | null;
  normalized_address: string | null;
  normalized_unit_address: string | null;
  zip: string | null;
  jurisdiction: string;
  longitude: number;
  latitude: number;
  approximate_area_sqft: number;
};

export type ParcelLookupProductionRpc = (
  request: { query: string; queryType: ParcelLookupProductionRpcQueryType; limit: number },
  signal: AbortSignal,
) => Promise<ParcelLookupProductionRpcRow[]>;

export type ParcelLookupProductionV0 = {
  contractVersion: typeof PARCEL_LOOKUP_PRODUCTION_V0_CONTRACT;
  inputType: ParcelLookupInputType;
  state: ParcelLookupState;
  normalizedQuery: string | null;
  candidates: ParcelLookupProductionCandidate[];
  selected: ParcelLookupProductionIdentity | null;
  returnedCount: number;
  hasMore: boolean;
  ambiguous: boolean;
};

export type ParcelLookupProductionError = {
  contractVersion: typeof PARCEL_LOOKUP_PRODUCTION_V0_CONTRACT;
  state: "INVALID_QUERY" | "SOURCE_UNAVAILABLE" | "TIMEOUT" | "DATABASE_UNAVAILABLE";
  message: string;
  candidates: [];
  selected: null;
};

export type ParcelLookupProductionOutcome =
  | { ok: true; status: 200; body: ParcelLookupProductionV0; queryType: ParcelLookupInputType }
  | { ok: false; status: 400 | 503 | 504; body: ParcelLookupProductionError; queryType: ParcelLookupInputType | "INVALID" };

type LookupEnvironment = Record<string, string | undefined>;

export function parcelLookupProductionEnabled(environment: LookupEnvironment = process.env): boolean {
  return environment.TRULOT_PARCEL_LOOKUP_V0 === "1";
}

export function parcelLookupLengthBucket(length: number): "0-1" | "2-15" | "16-40" | "41-80" | "81-160" | "161+" {
  if (length < 2) return "0-1";
  if (length <= 15) return "2-15";
  if (length <= 40) return "16-40";
  if (length <= 80) return "41-80";
  if (length <= 160) return "81-160";
  return "161+";
}

export function parcelLookupTokenBucket(count: number): "0" | "1-3" | "4-8" | "9-12" | "13+" {
  if (count === 0) return "0";
  if (count <= 3) return "1-3";
  if (count <= 8) return "4-8";
  if (count <= 12) return "9-12";
  return "13+";
}

export function invalidParcelLookupResponse(message: string): ParcelLookupProductionError {
  return {
    contractVersion: PARCEL_LOOKUP_PRODUCTION_V0_CONTRACT,
    state: "INVALID_QUERY",
    message,
    candidates: [],
    selected: null,
  };
}

function errorResponse(
  state: Exclude<ParcelLookupProductionError["state"], "INVALID_QUERY">,
  message: string,
): ParcelLookupProductionError {
  return { contractVersion: PARCEL_LOOKUP_PRODUCTION_V0_CONTRACT, state, message, candidates: [], selected: null };
}

function toSearchRecord(row: ParcelLookupProductionRpcRow): ParcelLookupRecord {
  return {
    apn: row.apn,
    apnDisplay: row.apn_display,
    parcelId: null,
    sourceObjectId: 0,
    address: row.address,
    unit: null,
    displayAddress: row.address ?? `APN ${row.apn_display}`,
    normalizedAddress: row.normalized_address,
    normalizedUnitAddress: row.normalized_unit_address,
    zip: row.zip,
    jurisdiction: row.jurisdiction,
    approximateAreaSqFt: row.approximate_area_sqft,
    centroid: [row.longitude, row.latitude],
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

function toCandidate(row: ParcelLookupProductionRpcRow): ParcelLookupProductionCandidate {
  return {
    address: row.address,
    displayAddress: row.address ?? `APN ${row.apn_display}`,
    apn: row.apn,
    apnDisplay: row.apn_display,
    jurisdiction: "SD",
    zip: row.zip,
    orientation: {
      kind: "POINT_ONLY",
      longitude: row.longitude,
      latitude: row.latitude,
      label: "Display orientation only",
    },
  };
}

function publicState(state: ParcelLookupState): ParcelLookupState {
  return state;
}

export async function executeParcelLookupProduction(
  request: ParcelLookupProductionRequest,
  rpc: ParcelLookupProductionRpc,
  options: { signal?: AbortSignal } = {},
): Promise<ParcelLookupProductionOutcome> {
  const raw = request.query ?? "";
  const query = raw.trim();
  const tokenCount = normalizeAddress(query).split(" ").filter(Boolean).length;
  const limit = request.limit ?? PARCEL_LOOKUP_PRODUCTION_V0_MAX_RESULTS;
  if (!Number.isInteger(limit) || limit < 1 || limit > PARCEL_LOOKUP_PRODUCTION_V0_MAX_RESULTS) {
    return { ok: false, status: 400, body: invalidParcelLookupResponse("Limit must be an integer from 1 to 10."), queryType: "INVALID" };
  }
  if (query.length < PARCEL_LOOKUP_PRODUCTION_V0_MIN_QUERY_LENGTH) {
    return { ok: false, status: 400, body: invalidParcelLookupResponse("Enter at least 2 characters."), queryType: "INVALID" };
  }
  if (/[\u0000-\u001f\u007f]/.test(raw)
    || query.length > PARCEL_LOOKUP_PRODUCTION_V0_MAX_QUERY_LENGTH
    || tokenCount > PARCEL_LOOKUP_PRODUCTION_V0_MAX_TOKENS) {
    return { ok: false, status: 400, body: invalidParcelLookupResponse("Query exceeds the Parcel Lookup V0 bounds."), queryType: "INVALID" };
  }

  const digitCount = query.replace(/\D/g, "").length;
  const apnPunctuation = /^[\d\s\-–—./(),]+$/;
  const apnLike = apnPunctuation.test(query)
    && (digitCount === 10 || !/\s/.test(query) || /[\-–—./(),]/.test(query));
  let queryType: ParcelLookupProductionRpcQueryType;
  let inputType: ParcelLookupInputType;
  let normalizedQuery: string;
  if (apnLike) {
    const apn = normalizeApnInput(query);
    if (apn.state !== "VALID" && apn.state !== "PREFIX") {
      return { ok: false, status: 400, body: invalidParcelLookupResponse("Enter a complete 10-digit APN or 6–9 APN prefix digits."), queryType: apn.inputType };
    }
    queryType = apn.state === "VALID" ? "EXACT_APN" : "APN_PREFIX";
    inputType = apn.inputType;
    normalizedQuery = apn.canonical ?? "";
  } else {
    normalizedQuery = normalizeAddress(query);
    if (normalizedQuery.length < PARCEL_LOOKUP_PRODUCTION_V0_MIN_QUERY_LENGTH) {
      return { ok: false, status: 400, body: invalidParcelLookupResponse("Enter at least 2 address characters."), queryType: "MALFORMED" };
    }
    queryType = "EXACT_ADDRESS";
    inputType = "FULL_ADDRESS";
  }

  const signal = options.signal ?? new AbortController().signal;
  try {
    let rows = await rpc({
      query: normalizedQuery,
      queryType,
      limit: queryType === "EXACT_ADDRESS" ? PARCEL_LOOKUP_PRODUCTION_V0_MAX_RESULTS + 1 : limit + 1,
    }, signal);
    if (queryType === "EXACT_ADDRESS" && rows.length === 0) {
      queryType = "AUTOCOMPLETE";
      inputType = "PARTIAL_ADDRESS";
      rows = await rpc({ query: normalizedQuery, queryType, limit: PARCEL_LOOKUP_PRODUCTION_V0_MAX_INTERNAL_CANDIDATES }, signal);
    }
    const byApn = new Map(rows.map((row) => [row.apn, row]));
    const ranked = searchParcelLookup(rows.map(toSearchRecord), query, {
      maximumResults: PARCEL_LOOKUP_PRODUCTION_V0_MAX_INTERNAL_CANDIDATES,
    });
    const orderedRows = ranked.candidates.map((candidate) => byApn.get(candidate.record.apn)).filter((row): row is ParcelLookupProductionRpcRow => Boolean(row));
    const visibleRows = orderedRows.slice(0, limit);
    const candidates = visibleRows.map(toCandidate);
    const exact = ranked.state === "EXACT_MATCH" && visibleRows.length === 1 ? visibleRows[0] : null;
    const selected = exact ? {
      ...toCandidate(exact),
      approximateAreaSqFt: exact.approximate_area_sqft,
      areaLabel: "Approximate geometry area" as const,
    } : null;
    const body: ParcelLookupProductionV0 = {
      contractVersion: PARCEL_LOOKUP_PRODUCTION_V0_CONTRACT,
      inputType,
      state: publicState(ranked.state),
      normalizedQuery,
      candidates,
      selected,
      returnedCount: candidates.length,
      hasMore: orderedRows.length > limit || rows.length >= PARCEL_LOOKUP_PRODUCTION_V0_MAX_INTERNAL_CANDIDATES,
      ambiguous: ranked.state === "MULTIPLE_MATCHES",
    };
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > PARCEL_LOOKUP_PRODUCTION_V0_RESPONSE_BYTES) {
      return { ok: false, status: 503, body: errorResponse("SOURCE_UNAVAILABLE", "Parcel lookup response exceeded its safety bound."), queryType: inputType };
    }
    return { ok: true, status: 200, body, queryType: inputType };
  } catch (error) {
    if (signal.aborted || (error instanceof Error && /abort|timeout/i.test(error.message))) {
      return { ok: false, status: 504, body: errorResponse("TIMEOUT", "Parcel lookup timed out. Please retry."), queryType: inputType };
    }
    return { ok: false, status: 503, body: errorResponse("DATABASE_UNAVAILABLE", "Parcel lookup is temporarily unavailable."), queryType: inputType };
  }
}

export function formatProductionApn(apn: string): string {
  return formatApn(apn);
}

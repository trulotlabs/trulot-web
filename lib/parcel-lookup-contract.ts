export type ParcelLookupInputType =
  | "FULL_ADDRESS"
  | "PARTIAL_ADDRESS"
  | "FORMATTED_APN"
  | "UNFORMATTED_APN"
  | "APN_PREFIX"
  | "MALFORMED"
  | "EMPTY";

export type ParcelLookupState =
  | "EXACT_MATCH"
  | "MULTIPLE_MATCHES"
  | "PARTIAL_MATCHES"
  | "NO_MATCH"
  | "INVALID_APN"
  | "MALFORMED_QUERY"
  | "EMPTY_QUERY"
  | "SOURCE_UNAVAILABLE";

export type ParcelLookupZone = {
  code: string;
  coveragePercent: number | null;
  role: string;
};

export type ParcelLookupRecord = {
  apn: string;
  apnDisplay: string;
  parcelId: number | null;
  sourceObjectId: number;
  address: string | null;
  unit: string | null;
  displayAddress: string;
  normalizedAddress: string | null;
  normalizedUnitAddress: string | null;
  zip: string | null;
  jurisdiction: string;
  approximateAreaSqFt: number;
  centroid: [number, number];
  geometryType: "Polygon" | "MultiPolygon";
  geometrySha256: string;
  polygons: Array<Array<Array<[number, number]>>>;
  parcelIntelligenceAvailable: boolean;
  zoningState: string;
  zones: ParcelLookupZone[];
  coastalState: string;
  coastalValue: string | null;
  existingUnits: number | null;
};

export type ParcelLookupCandidate = {
  record: ParcelLookupRecord;
  rank: number;
  matchReason: "exact_apn" | "apn_prefix" | "exact_address" | "address_prefix" | "token_match" | "substring";
};

export type ParcelLookupResponse = {
  inputType: ParcelLookupInputType;
  state: ParcelLookupState;
  normalizedQuery: string | null;
  candidates: ParcelLookupCandidate[];
  totalMatches: number;
};

export type ApnNormalization = {
  state: "VALID" | "PREFIX" | "INVALID" | "EMPTY";
  inputType: ParcelLookupInputType;
  canonical: string | null;
  display: string | null;
};

const DIRECTIONALS: Record<string, string> = {
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
  NORTHEAST: "NE",
  NORTHWEST: "NW",
  SOUTHEAST: "SE",
  SOUTHWEST: "SW",
};

const SUFFIXES: Record<string, string> = {
  STREET: "ST",
  AVENUE: "AVE",
  BOULEVARD: "BLVD",
  ROAD: "RD",
  DRIVE: "DR",
  COURT: "CT",
  PLACE: "PL",
  LANE: "LN",
  TERRACE: "TER",
  CIRCLE: "CIR",
  HIGHWAY: "HWY",
  PARKWAY: "PKWY",
};

const APN_PUNCTUATION = /^[\d\s\-–—./(),]+$/;

export function formatApn(apn: string): string {
  if (!/^\d{10}$/.test(apn)) return apn;
  return `${apn.slice(0, 3)}-${apn.slice(3, 6)}-${apn.slice(6, 8)}-${apn.slice(8)}`;
}

export function normalizeApnInput(input: string): ApnNormalization {
  const trimmed = input.trim();
  if (!trimmed) return { state: "EMPTY", inputType: "EMPTY", canonical: null, display: null };
  if (!APN_PUNCTUATION.test(trimmed)) {
    return { state: "INVALID", inputType: "MALFORMED", canonical: null, display: null };
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    return {
      state: "VALID",
      inputType: /^\d{10}$/.test(trimmed) ? "UNFORMATTED_APN" : "FORMATTED_APN",
      canonical: digits,
      display: formatApn(digits),
    };
  }
  if (digits.length >= 6 && digits.length < 10) {
    return { state: "PREFIX", inputType: "APN_PREFIX", canonical: digits, display: null };
  }
  return { state: "INVALID", inputType: "MALFORMED", canonical: null, display: null };
}

export function normalizeAddress(input: string): string {
  const normalized = input
    .normalize("NFKD")
    .toUpperCase()
    .replace(/#/g, " UNIT ")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\bSAN\s+DIEGO\b(?:\s+CA)?(?:\s+\d{5}(?:\s+\d{4})?)?$/g, " ")
    .replace(/\bCA\s+\d{5}(?:\s+\d{4})?$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  return normalized
    .split(" ")
    .map((token) => DIRECTIONALS[token] ?? SUFFIXES[token] ?? token)
    .join(" ")
    .replace(/\bUNIT 0+(\d+)\b/g, "UNIT $1");
}

function addressAliases(record: ParcelLookupRecord): string[] {
  return [record.normalizedAddress, record.normalizedUnitAddress]
    .filter((value): value is string => Boolean(value));
}

function rankAddress(record: ParcelLookupRecord, query: string): Omit<ParcelLookupCandidate, "rank"> | null {
  const aliases = addressAliases(record);
  if (aliases.some((alias) => alias === query)) return { record, matchReason: "exact_address" };
  if (aliases.some((alias) => alias.startsWith(query))) return { record, matchReason: "address_prefix" };

  const queryTokens = query.split(" ");
  const tokenMatch = aliases.some((alias) => {
    const tokens = alias.split(" ");
    return queryTokens.every((queryToken) => tokens.some((token) => token.startsWith(queryToken)));
  });
  if (tokenMatch) return { record, matchReason: "token_match" };
  if (aliases.some((alias) => alias.includes(query))) return { record, matchReason: "substring" };
  return null;
}

const MATCH_ORDER: Record<ParcelLookupCandidate["matchReason"], number> = {
  exact_apn: 0,
  exact_address: 1,
  apn_prefix: 2,
  address_prefix: 3,
  token_match: 4,
  substring: 5,
};

function finalize(
  inputType: ParcelLookupInputType,
  state: ParcelLookupState,
  normalizedQuery: string | null,
  matches: Array<Omit<ParcelLookupCandidate, "rank">>,
  maximumResults: number,
): ParcelLookupResponse {
  const ordered = matches.sort((a, b) => {
    const reason = MATCH_ORDER[a.matchReason] - MATCH_ORDER[b.matchReason];
    if (reason) return reason;
    const address = a.record.displayAddress.localeCompare(b.record.displayAddress, "en", { numeric: true });
    return address || a.record.apn.localeCompare(b.record.apn);
  });
  return {
    inputType,
    state,
    normalizedQuery,
    totalMatches: ordered.length,
    candidates: ordered.slice(0, maximumResults).map((candidate, index) => ({ ...candidate, rank: index + 1 })),
  };
}

export function searchParcelLookup(
  records: ParcelLookupRecord[],
  input: string,
  options: { maximumResults?: number; sourceAvailable?: boolean } = {},
): ParcelLookupResponse {
  const maximumResults = options.maximumResults ?? 10;
  if (options.sourceAvailable === false) return finalize("MALFORMED", "SOURCE_UNAVAILABLE", null, [], maximumResults);
  const trimmed = input.trim();
  if (!trimmed) return finalize("EMPTY", "EMPTY_QUERY", null, [], maximumResults);

  const digitCount = trimmed.replace(/\D/g, "").length;
  const apnLike = APN_PUNCTUATION.test(trimmed)
    && (digitCount === 10 || !/\s/.test(trimmed) || /[\-–—./(),]/.test(trimmed));
  if (apnLike) {
    const apn = normalizeApnInput(trimmed);
    if (apn.state === "INVALID") return finalize(apn.inputType, "INVALID_APN", null, [], maximumResults);
    if (apn.state === "VALID") {
      const matches = records
        .filter((record) => record.apn === apn.canonical)
        .map((record) => ({ record, matchReason: "exact_apn" as const }));
      return finalize(apn.inputType, matches.length ? "EXACT_MATCH" : "NO_MATCH", apn.canonical, matches, maximumResults);
    }
    if (apn.state === "PREFIX") {
      const matches = records
        .filter((record) => record.apn.startsWith(apn.canonical ?? ""))
        .map((record) => ({ record, matchReason: "apn_prefix" as const }));
      return finalize("APN_PREFIX", matches.length ? "PARTIAL_MATCHES" : "NO_MATCH", apn.canonical, matches, maximumResults);
    }
  }

  const query = normalizeAddress(trimmed);
  if (query.length < 2) return finalize("MALFORMED", "MALFORMED_QUERY", query || null, [], maximumResults);
  const matches = records
    .map((record) => rankAddress(record, query))
    .filter((candidate): candidate is Omit<ParcelLookupCandidate, "rank"> => candidate !== null);
  const exactCount = matches.filter((candidate) => candidate.matchReason === "exact_address").length;
  const state: ParcelLookupState = exactCount === 1
    ? "EXACT_MATCH"
    : exactCount > 1
      ? "MULTIPLE_MATCHES"
      : matches.length
        ? "PARTIAL_MATCHES"
        : "NO_MATCH";
  return finalize(exactCount ? "FULL_ADDRESS" : "PARTIAL_ADDRESS", state, query, matches, maximumResults);
}

export const PARCEL_LOOKUP_QUERY_THRESHOLD = 2;
export const PARCEL_LOOKUP_MAX_RESULTS = 10;

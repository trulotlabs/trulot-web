import { createClient } from "@supabase/supabase-js";
import {
  assertNoForbiddenCopy,
  assertNoForbiddenCopyInList,
} from "./forbidden-copy";
import {
  getPermitLinkage,
  parseApnCandidates,
  permitSourceLabelForConfidence,
  type PermitLinkageConfidence,
} from "./permit-linkage";
import {
  canonicalParcelPath,
  canonicalParcelSlug,
  formatApnForDisplay,
  normalizeApnDigits,
} from "./parcel-slug";
import { buildParcelPageSourceEntries, type ParcelPageSourceEntry } from "./source-freshness";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type RawRow = Record<string, unknown>;

export type ConfidenceTier = "recorded" | "mapped" | "conditional";

export type CanonicalResultState =
  | "found"
  | "not_found"
  | "source_unavailable"
  | "partial"
  | "invalid_request";

export type SafeSourceErrorCode =
  | "query_failed"
  | "missing_relation"
  | "permission_denied"
  | "timeout"
  | "schema_mismatch"
  | "missing_input";

export interface SourceStatus {
  status: CanonicalResultState;
  freshness: string | null;
  safeErrorCode: SafeSourceErrorCode | null;
  publicMessage: string | null;
}

export interface ParcelPageSourceStatus {
  parcel: SourceStatus;
  permits: SourceStatus;
  overlays: SourceStatus;
  similarLots: SourceStatus;
}

export interface SourcedFact<T = string> {
  value: T | null;
  sourceLabel: string;
  confidenceTier: ConfidenceTier;
  nullBehavior: string;
  todo?: string;
}

export type SnapshotFact = SourcedFact<string>;

export interface ProgramFact extends SourcedFact<string> {
  name: string;
}

export interface StandardFact extends SourcedFact<string> {
  label: string;
}

export interface SimilarParcelFact {
  value: string;
  sourceLabel: string;
  confidenceTier: ConfidenceTier;
  nullBehavior: string;
  url: string;
  address: string;
  permitStatus: string | null;
  permitDate: string | null;
  distanceMiles: number | null;
}

export interface PermitFact extends SourcedFact<string> {
  permitNumber: string | null;
  permitUrl: string | null;
  status: string | null;
  date: string | null;
  linkageConfidence?: PermitLinkageConfidence;
}

export interface SignalFact extends SourcedFact<string> {
  title: string;
  detail: string | null;
}

export interface SourceRegistryRow {
  fieldName: string;
  sourceTableView: string;
  availableNow: "yes" | "no";
  nullBehavior: string;
  sourceLabel: string;
  confidenceTier: ConfidenceTier;
}

export type SourceRegistryEntry = ParcelPageSourceEntry;

export interface MethodologySection {
  id: string;
  title: string;
  body: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface ParcelPageV1Data {
  pageStatus: Exclude<CanonicalResultState, "invalid_request">;
  sourceStatus: ParcelPageSourceStatus;
  apnNorm: string;
  canonicalSlug: string;
  canonicalPath: string;
  identity: {
    address: string;
    city: string;
    state: string;
    zip: string | null;
    apn: string;
    neighborhood: string | null;
    communityPlanArea: string | null;
    dataRefreshedAt: string | null;
    stale: boolean;
    staleReason: string | null;
    mapCaption: string;
    lat: number | null;
    lng: number | null;
    staticMapUrl: string | null;
    boundaryAvailable: boolean;
  };
  facts: Array<{ label: string; fact: SourcedFact<string> }>;
  snapshot: SnapshotFact[];
  zoning: {
    baseCode: SourcedFact<string>;
    plainName: SourcedFact<string>;
    description: SourcedFact<string>;
    standards: StandardFact[];
    citation: SourcedFact<string>;
    programs: ProgramFact[];
    interpretation: SnapshotFact[];
  };
  similarLots: {
    criteriaLabel: string;
    totalMatchCount: number;
    matches: SimilarParcelFact[];
    emptyState: string | null;
  };
  permits: {
    thisParcel: PermitFact[];
    earliestDataYear: number;
    nearbySummary: Array<{ label: string; fact: SourcedFact<string> }>;
    emptyState: string | null;
  };
  signals: SignalFact[];
  signalsEmptyState: string | null;
  sources: SourceRegistryEntry[];
  methodology: {
    sections: MethodologySection[];
    faq: FaqItem[];
    disclaimer: string;
  };
  fieldMapping: SourceRegistryRow[];
}

export interface ParcelPageV1Result {
  status: CanonicalResultState;
  data: ParcelPageV1Data | null;
  sourceStatus: ParcelPageSourceStatus;
}

const NULL_PUBLIC_RECORD = "Not available in public records";
const NULL_SECTION_UNAVAILABLE = "Not available from the current parcel data views.";

const SD_LAND_USE_CODES: Record<string, string> = {
  "111": "Single-family residence",
  "112": "Single-family planned development",
  "120": "Duplex",
  "121": "Triplex",
  "122": "Fourplex",
  "130": "Multifamily residential",
  "131": "Apartment building",
  "132": "Condominium",
  "150": "Mixed use — residential",
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatMonthYear(raw: unknown): string | null {
  const s = str(raw);
  if (!s) return null;
  const date = new Date(s);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatShortDate(raw: unknown): string | null {
  const s = str(raw);
  if (!s) return null;
  const date = new Date(s);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPermitMonth(raw: unknown): string | null {
  const s = str(raw);
  if (!s) return null;
  const date = new Date(s);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatSqFt(value: number | null): string | null {
  if (value === null || value <= 0) return null;
  return `${Math.round(value).toLocaleString()} sq ft`;
}

function boolish(value: unknown): boolean {
  return value === true || value === "true" || value === "t" || value === "1";
}

function formatAddress(row: RawRow): string {
  const address = str(row.address);
  if (address) return address;
  return `APN ${formatApnForDisplay(str(row.apn_norm))}`;
}

function formatOwnerType(row: RawRow): string | null {
  const ownerType = str(row.owner_type_category || row.owner_type || row.owner_category);
  if (ownerType) return ownerType;
  const ownerOcc = str(row.ownerocc).toUpperCase();
  if (ownerOcc === "Y" || ownerOcc === "N") return "Ownership category not exposed";
  return null;
}

function normalizeYear(raw: unknown): string | null {
  const s = str(raw);
  if (!s || s === "0" || s === "00") return null;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n)) return null;
  if (n > 1000) return String(n);
  return String(n < 30 ? 2000 + n : 1900 + n);
}

function formatDistanceMiles(subjectLat: number | null, subjectLng: number | null, lat: number | null, lng: number | null): number | null {
  if ([subjectLat, subjectLng, lat, lng].some((value) => value === null)) return null;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad((lat as number) - (subjectLat as number));
  const dLng = toRad((lng as number) - (subjectLng as number));
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(subjectLat as number)) *
      Math.cos(toRad(lat as number)) *
      Math.sin(dLng / 2) ** 2;
  return earthRadiusMiles * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function daysOld(raw: unknown): number | null {
  const s = str(raw);
  if (!s) return null;
  const date = new Date(s);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function defaultSourceStatus(): SourceStatus {
  return {
    status: "not_found",
    freshness: null,
    safeErrorCode: null,
    publicMessage: null,
  };
}

function emptySourceStatus(): ParcelPageSourceStatus {
  return {
    parcel: defaultSourceStatus(),
    permits: defaultSourceStatus(),
    overlays: defaultSourceStatus(),
    similarLots: defaultSourceStatus(),
  };
}

function buildSourceStatus(
  status: CanonicalResultState,
  options?: {
    freshness?: string | null;
    safeErrorCode?: SafeSourceErrorCode | null;
    publicMessage?: string | null;
  },
): SourceStatus {
  return {
    status,
    freshness: options?.freshness ?? null,
    safeErrorCode: options?.safeErrorCode ?? null,
    publicMessage: options?.publicMessage ?? null,
  };
}

function mapSafeSourceErrorCode(error: { code?: string | null; message?: string | null } | null | undefined): SafeSourceErrorCode {
  const code = str(error?.code).toUpperCase();
  const message = str(error?.message).toLowerCase();

  if (code === "42P01" || message.includes("relation") || message.includes("does not exist")) {
    return "missing_relation";
  }
  if (code === "42501" || message.includes("permission denied") || message.includes("not allowed")) {
    return "permission_denied";
  }
  if (code === "57014" || message.includes("timeout")) {
    return "timeout";
  }
  if (code === "42703" || code.startsWith("PGRST") || message.includes("schema")) {
    return "schema_mismatch";
  }

  return "query_failed";
}

function permitPortalUrl(permitNumber: string | null): string | null {
  if (!permitNumber) return null;
  return `https://opendsd.sandiego.gov/Web/Approvals?permitNum=${encodeURIComponent(permitNumber)}`;
}

function dedupePermitRows(rows: RawRow[]): RawRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = str(row.record_id || row.record_number);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeApnCandidateList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((value) => normalizeApnDigits(str(value))).filter((value) => value.length === 10))];
}

function isDirectParcelPermit(parcelApnNorm: string, permitRow: RawRow): boolean {
  const linkageConfidence = str(permitRow.linkage_confidence);
  if (linkageConfidence === "exact_apn") return true;
  if (linkageConfidence !== "parsed_apn") return false;

  const candidates = normalizeApnCandidateList(permitRow.apn_candidates);
  return candidates.length === 1 && candidates[0] === parcelApnNorm;
}

async function fetchPermitsForParcel(
  parcel: {
    apnNorm: string;
    address: string;
    city: string;
    state: string;
    zip: string | null;
  },
): Promise<{ rows: RawRow[]; status: SourceStatus; excludedAmbiguousCount: number }> {
  const { data, error } = await supabase
    .from("trulot_permit_parcel_link_v1")
    .select(
      "apn_norm,record_id,record_number,record_type,status,description,opened_date,issued_date,finaled_date,completed_date,address_full,project_scope,approval_scope,project_title,linkage_confidence,apn_candidates,matched_parcel_apn_norm",
    )
    .eq("matched_parcel_apn_norm", parcel.apnNorm)
    .in("linkage_confidence", ["exact_apn", "parsed_apn"])
    .order("opened_date", { ascending: false });

  if (error) {
    return {
      rows: [],
      status: buildSourceStatus("source_unavailable", {
        safeErrorCode: mapSafeSourceErrorCode(error),
        publicMessage: "Permit records are temporarily unavailable.",
      }),
      excludedAmbiguousCount: 0,
    };
  }

  const candidateRows = dedupePermitRows((data ?? []) as RawRow[]);
  const rows = candidateRows.filter((row) => isDirectParcelPermit(parcel.apnNorm, row));
  const excludedAmbiguousCount = candidateRows.length - rows.length;
  const freshness = formatShortDate(rows[0]?.opened_date ?? candidateRows[0]?.opened_date);

  if (rows.length === 0) {
    return {
      rows,
      status: buildSourceStatus(excludedAmbiguousCount > 0 ? "partial" : "not_found", {
        freshness,
        safeErrorCode: excludedAmbiguousCount > 0 ? "missing_input" : null,
        publicMessage:
          excludedAmbiguousCount > 0
            ? "Permit records mention multiple APNs and remain unavailable for direct parcel history until parcel linkage is unambiguous."
            : "No reliably linked permits are on file for this parcel in the current digital permit record set.",
      }),
      excludedAmbiguousCount,
    };
  }

  return {
    rows,
    status: buildSourceStatus(excludedAmbiguousCount > 0 ? "partial" : "found", {
      freshness,
      safeErrorCode: excludedAmbiguousCount > 0 ? "missing_input" : null,
      publicMessage:
        excludedAmbiguousCount > 0
          ? "Some permit records mentioning multiple APNs were excluded from direct parcel history until parcel linkage is unambiguous."
          : null,
    }),
    excludedAmbiguousCount,
  };
}

function cleanPermitDescription(description: string): string {
  if (!description) return "Permit record on file";
  return description.replace(/\s+/g, " ").trim().slice(0, 160);
}

function normalizePermitStatus(raw: unknown): string | null {
  const status = str(raw).toLowerCase();
  if (!status) return null;
  if (status.includes("final")) return "Finaled";
  if (status.includes("issued")) return "Issued";
  if (status.includes("expire")) return "Expired";
  if (status.includes("withdraw")) return "Withdrawn";
  if (status.includes("applied") || status.includes("review") || status.includes("open")) return "Applied";
  return status
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildSignalFacts(row: RawRow, overlays: Record<string, boolean>): SignalFact[] {
  const lotArea = num(row.lot_area_sqft);
  const livingArea = num(row.total_lvg_area);
  const signals: SignalFact[] = [];

  if (lotArea && livingArea && lotArea > 0) {
    const coverage = Math.round((livingArea / lotArea) * 100);
    signals.push({
      title: "Existing structure coverage",
      value: `${coverage}% of lot area`,
      detail: "Derived from recorded building size and mapped lot area.",
      sourceLabel: "County Assessor building area + SanGIS parcel area",
      confidenceTier: "mapped",
      nullBehavior: `Show “${NULL_SECTION_UNAVAILABLE}”.`,
    });
  }

  if (boolish(overlays.tpa)) {
    signals.push({
      title: "Transit Priority Area overlay is mapped here",
      value: "Mapped TPA overlay",
      detail: "Overlay presence is based on the current lookup function.",
      sourceLabel: "check_parcel_overlays(lat,lng)",
      confidenceTier: "mapped",
      nullBehavior: `Show “${NULL_SECTION_UNAVAILABLE}”.`,
    });
  }

  const nearbyProjects = num(row.nearby_project_count);
  if (nearbyProjects && nearbyProjects > 0) {
    signals.push({
      title: "Nearby permit activity is on record",
      value: `${nearbyProjects} nearby parcels with recorded development activity`,
      detail: "Count comes from the existing nearby development summary fields.",
      sourceLabel: "parcel_page_api_v2 nearby development summary",
      confidenceTier: "mapped",
      nullBehavior: `Show “${NULL_SECTION_UNAVAILABLE}”.`,
    });
  }

  return signals;
}

async function getOverlayFlags(
  lat: number | null,
  lng: number | null,
): Promise<{ flags: Record<string, boolean>; status: SourceStatus }> {
  if (lat === null || lng === null) {
    return {
      flags: { tpa: false, sda: false, ctcac: false, unavailable: true },
      status: buildSourceStatus("source_unavailable", {
        safeErrorCode: "missing_input",
        publicMessage: "Overlay lookup is unavailable because parcel coordinates are missing.",
      }),
    };
  }
  const { data, error } = await supabase.rpc("check_parcel_overlays", { p_lat: lat, p_lng: lng });
  if (error || !data) {
    return {
      flags: { tpa: false, sda: false, ctcac: false, unavailable: true },
      status: buildSourceStatus("source_unavailable", {
        safeErrorCode: mapSafeSourceErrorCode(error),
        publicMessage: "Overlay lookup is temporarily unavailable.",
      }),
    };
  }
  const flags = {
    tpa: Boolean(data.tpa),
    sda: Boolean(data.sda),
    ctcac: Boolean(data.ctcac),
    unavailable: false,
  };
  return {
    flags,
    status: buildSourceStatus(flags.tpa || flags.sda || flags.ctcac ? "found" : "not_found", {
      publicMessage: flags.tpa || flags.sda || flags.ctcac ? null : "No tracked overlays were returned by the current lookup.",
    }),
  };
}

function staticMethodology(): ParcelPageV1Data["methodology"] {
  return {
    sections: [
      {
        id: "zoning",
        title: "How we determine zoning",
        body:
          "We show the mapped zone and overlay context returned by the current parcel views and overlay lookup functions. We do not treat pending rezonings, title exceptions, or site-specific determinations as settled facts on this page.",
      },
      {
        id: "matching",
        title: "How we match similar lots",
        body:
          "Similar lots are limited to parcels with the same recorded base zone, roughly similar lot size, and nearby coordinates when those fields are available. Nearby precedent text comes from recorded permit descriptions only.",
      },
      {
        id: "limits",
        title: "What we do not do",
        body:
          "We do not verify title, utility capacity, slope, environmental conditions, or site-specific entitlement outcomes. We do not estimate value or predict approvals. Program rows stay hedged unless the current backend exposes a verified eligibility result.",
      },
    ],
    faq: [
      {
        question: "What is an APN?",
        answer:
          "An Assessor's Parcel Number is the identifier used by the county assessor and related public record systems to track a parcel.",
      },
      {
        question: "What does the zoning code mean on this page?",
        answer:
          "The zoning code shown here is the mapped base zone returned by the current parcel record. Published standards and exceptions may require additional city review.",
      },
      {
        question: "Does this page confirm what can be built here?",
        answer:
          "No. This page reports recorded facts, mapped context, and conditional program signals from public records. Final entitlement depends on site conditions and city review.",
      },
    ],
    disclaimer:
      "TruLot compiles and explains public parcel records. This page is not legal, financial, or land-use advice, and it is not a substitute for official records or city determinations. Public datasets can lag, change, or contain errors, so confirm important details with the County Assessor and the City of San Diego.",
  };
}

function buildSourceTable(row: RawRow): SourceRegistryEntry[] {
  const generatedAt = formatShortDate(row.generated_at) ?? "Refresh date not exposed";
  const pageCalculatedAt = formatShortDate(new Date().toISOString()) ?? "Calculation time not exposed";
  return buildParcelPageSourceEntries({
    parcelViewRebuiltAt: generatedAt,
    pageCalculatedAt,
  });
}

function buildFieldMappingReport(): SourceRegistryRow[] {
  return [
    { fieldName: "identity.address", sourceTableView: "parcel_page_api_v2", availableNow: "yes", nullBehavior: "Fall back to APN-only heading.", sourceLabel: "SanGIS / assessor situs address", confidenceTier: "recorded" },
    { fieldName: "identity.zip", sourceTableView: "parcel_page_api_v2", availableNow: "no", nullBehavior: `Show “${NULL_PUBLIC_RECORD}”.`, sourceLabel: "TODO — situs ZIP adapter", confidenceTier: "recorded" },
    { fieldName: "identity.neighborhood", sourceTableView: "parcel_page_api_v2", availableNow: "no", nullBehavior: "Omit from identity subline.", sourceLabel: "TODO — neighborhood layer adapter", confidenceTier: "mapped" },
    { fieldName: "identity.communityPlanArea", sourceTableView: "parcel_page_api_v2.situs_community", availableNow: "yes", nullBehavior: "Omit from identity subline.", sourceLabel: "Current parcel community field", confidenceTier: "mapped" },
    { fieldName: "facts.lotSizeSqFt", sourceTableView: "parcel_page_api_v2.lot_area_sqft", availableNow: "yes", nullBehavior: `Show “${NULL_PUBLIC_RECORD}”.`, sourceLabel: "SanGIS parcel area", confidenceTier: "recorded" },
    { fieldName: "facts.existingUse", sourceTableView: "parcel_page_api_v2.nucleus_use_cd", availableNow: "yes", nullBehavior: `Show “${NULL_PUBLIC_RECORD}”.`, sourceLabel: "County Assessor use code", confidenceTier: "recorded" },
    { fieldName: "facts.yearBuilt", sourceTableView: "parcel_page_api_v2.year_effective", availableNow: "yes", nullBehavior: `Show “${NULL_PUBLIC_RECORD}”.`, sourceLabel: "County Assessor", confidenceTier: "recorded" },
    { fieldName: "facts.buildingSizeSqFt", sourceTableView: "parcel_page_api_v2.total_lvg_area", availableNow: "yes", nullBehavior: `Show “${NULL_PUBLIC_RECORD}”.`, sourceLabel: "County Assessor building area", confidenceTier: "recorded" },
    { fieldName: "facts.zoningCode", sourceTableView: "parcel_page_api_v2.zone_name", availableNow: "yes", nullBehavior: `Show “${NULL_PUBLIC_RECORD}”.`, sourceLabel: "Mapped base zone", confidenceTier: "mapped" },
    { fieldName: "facts.ownerType", sourceTableView: "parcel_page_api_v2.owner_type_category", availableNow: "no", nullBehavior: `Show “${NULL_PUBLIC_RECORD}”.`, sourceLabel: "TODO — owner type category adapter", confidenceTier: "recorded" },
    { fieldName: "facts.lastSale", sourceTableView: "parcel_page_api_v2.docdate", availableNow: "no", nullBehavior: `Show “${NULL_PUBLIC_RECORD}”.`, sourceLabel: "TODO — recorder sale-date adapter", confidenceTier: "recorded" },
    { fieldName: "zoning.programs.tpa", sourceTableView: "check_parcel_overlays(lat,lng)", availableNow: "yes", nullBehavior: "Show overlay unavailable state.", sourceLabel: "Overlay lookup function", confidenceTier: "mapped" },
    { fieldName: "zoning.programs.sda", sourceTableView: "check_parcel_overlays(lat,lng)", availableNow: "yes", nullBehavior: "Show overlay unavailable state.", sourceLabel: "Overlay lookup function", confidenceTier: "mapped" },
    { fieldName: "zoning.programs.adu", sourceTableView: "TODO rules adapter", availableNow: "no", nullBehavior: "Show unknown hedged state.", sourceLabel: "TODO — program rules adapter", confidenceTier: "conditional" },
    { fieldName: "similarLots.matches", sourceTableView: "parcel_page_api_v2 + parcel_permit_terminal_v2", availableNow: "yes", nullBehavior: "Show no nearby precedents state.", sourceLabel: "Same-zone parcel query + permit records", confidenceTier: "mapped" },
    { fieldName: "permits.thisParcel", sourceTableView: "trulot_permit_parcel_link_v1 filtered to exact or unambiguous parsed APN matches", availableNow: "yes", nullBehavior: "Show unavailable or partial state when source lookup fails or ambiguity remains; show no permits state only after successful direct-history lookup with zero matches.", sourceLabel: "City permit record via exact or parsed APN match", confidenceTier: "recorded" },
    { fieldName: "signals.coverage", sourceTableView: "parcel_page_api_v2.total_lvg_area + lot_area_sqft", availableNow: "yes", nullBehavior: "Show no development signals state.", sourceLabel: "Assessor + parcel area fields", confidenceTier: "mapped" },
  ];
}

async function fetchSimilarLots(
  subject: RawRow,
): Promise<{ similarLots: ParcelPageV1Data["similarLots"]; status: SourceStatus }> {
  const subjectApn = normalizeApnDigits(str(subject.apn_norm));
  const subjectLat = num(subject.lat);
  const subjectLng = num(subject.lng);
  const lotArea = num(subject.lot_area_sqft);
  const baseZone = str(subject.base_zone || subject.zone_name);

  if (!baseZone || lotArea === null || subjectLat === null || subjectLng === null) {
    return {
      similarLots: {
        criteriaLabel: "Same recorded base zone, similar lot size, within 0.5 miles.",
        totalMatchCount: 0,
        matches: [],
        emptyState: "Nearby parcel matching is not available because the current parcel record is missing zone, lot-size, or coordinate fields.",
      },
      status: buildSourceStatus("source_unavailable", {
        safeErrorCode: "missing_input",
        publicMessage: "Nearby precedent matching is unavailable because required parcel inputs are missing.",
      }),
    };
  }

  const minLot = lotArea * 0.7;
  const maxLot = lotArea * 1.3;

  const { data: candidateRows, error } = await supabase
    .from("parcel_page_api_v2")
    .select("apn_norm,address,city,state,zone_name,base_zone,lot_area_sqft,lat,lng")
    .eq("base_zone", baseZone)
    .gte("lot_area_sqft", minLot)
    .lte("lot_area_sqft", maxLot)
    .neq("apn_norm", subjectApn)
    .limit(24);

  if (error) {
    return {
      similarLots: {
        criteriaLabel: "Same recorded base zone, similar lot size, within 0.5 miles.",
        totalMatchCount: 0,
        matches: [],
        emptyState: "Nearby precedent matching is temporarily unavailable.",
      },
      status: buildSourceStatus("source_unavailable", {
        safeErrorCode: mapSafeSourceErrorCode(error),
        publicMessage: "Nearby precedent matching is temporarily unavailable.",
      }),
    };
  }

  if (!candidateRows || candidateRows.length === 0) {
    return {
      similarLots: {
        criteriaLabel: "Same recorded base zone, similar lot size, within 0.5 miles.",
        totalMatchCount: 0,
        matches: [],
        emptyState: "No nearby precedents were found in the current parcel and permit views.",
      },
      status: buildSourceStatus("not_found", {
        publicMessage: "No nearby precedents were found in the current parcel and permit views.",
      }),
    };
  }

  const withDistance = candidateRows
    .map((row) => {
      const distanceMiles = formatDistanceMiles(subjectLat, subjectLng, num(row.lat), num(row.lng));
      return { row, distanceMiles };
    })
    .filter((item) => item.distanceMiles !== null && (item.distanceMiles as number) <= 0.5)
    .sort((a, b) => (a.distanceMiles as number) - (b.distanceMiles as number))
    .slice(0, 8);

  if (withDistance.length === 0) {
    return {
      similarLots: {
        criteriaLabel: "Same recorded base zone, similar lot size, within 0.5 miles.",
        totalMatchCount: 0,
        matches: [],
        emptyState: "No nearby precedents were found within 0.5 miles using the current parcel coordinates.",
      },
      status: buildSourceStatus("not_found", {
        publicMessage: "No nearby precedents were found within 0.5 miles using the current parcel coordinates.",
      }),
    };
  }

  const apns = withDistance.flatMap((item) => {
    const apn = normalizeApnDigits(str(item.row.apn_norm));
    return [apn, `${apn}0`];
  });
  const { data: permitRows, error: permitError } = await supabase
    .from("parcel_permit_terminal_v2")
    .select("apn_norm,record_number,record_type,status,description,opened_date")
    .in("apn_norm", [...new Set(apns)])
    .order("opened_date", { ascending: false });

  if (permitError) {
    return {
      similarLots: {
        criteriaLabel: "Same recorded base zone, similar lot size, within 0.5 miles.",
        totalMatchCount: 0,
        matches: [],
        emptyState: "Nearby precedent matching is temporarily unavailable.",
      },
      status: buildSourceStatus("source_unavailable", {
        safeErrorCode: mapSafeSourceErrorCode(permitError),
        publicMessage: "Nearby precedent matching is temporarily unavailable.",
      }),
    };
  }

  const permitMap = new Map<string, RawRow[]>();
  for (const permit of (permitRows ?? []) as RawRow[]) {
    for (const apn of parseApnCandidates(str(permit.apn_norm))) {
      const existing = permitMap.get(apn) ?? [];
      existing.push(permit);
      permitMap.set(apn, existing);
    }
  }

  const matches: SimilarParcelFact[] = withDistance.map(({ row, distanceMiles }) => {
    const apn = normalizeApnDigits(str(row.apn_norm));
    const firstPermit = (permitMap.get(apn) ?? [])[0] ?? null;
    const permitStatus = normalizePermitStatus(firstPermit?.status);
    const permitDate = formatPermitMonth(firstPermit?.opened_date);
    const value = firstPermit
      ? cleanPermitDescription(str(firstPermit.description) || str(firstPermit.record_type))
      : "No recorded permit activity found";
    return {
      value,
      sourceLabel: firstPermit ? "City permit record" : "Current parcel + permit views",
      confidenceTier: firstPermit ? "recorded" : "mapped",
      nullBehavior: "Omit row if parcel address is unavailable.",
      url: canonicalParcelPath(apn, str(row.address)),
      address: str(row.address) || `APN ${formatApnForDisplay(apn)}`,
      permitStatus,
      permitDate,
      distanceMiles,
    };
  });

  return {
    similarLots: {
      criteriaLabel: "Same recorded base zone, similar lot size, within 0.5 miles.",
      totalMatchCount: withDistance.length,
      matches,
      emptyState: null,
    },
    status: buildSourceStatus("found", {
      freshness: matches[0]?.permitDate ?? null,
    }),
  };
}

export async function getParcelPageV1Result(rawApnOrSlug: string): Promise<ParcelPageV1Result> {
  const rawDigits = rawApnOrSlug.replace(/\D/g, "");
  if (!rawDigits) {
    return {
      status: "invalid_request",
      data: null,
      sourceStatus: {
        ...emptySourceStatus(),
        parcel: buildSourceStatus("invalid_request", {
          safeErrorCode: "missing_input",
          publicMessage: "Parcel requests must include an APN.",
        }),
      },
    };
  }

  const apnNorm = normalizeApnDigits(rawApnOrSlug);
  const { data: parcel, error: parcelError } = await supabase
    .from("parcel_page_api_v2")
    .select("*")
    .eq("apn_norm", apnNorm)
    .maybeSingle();

  if (parcelError) {
    return {
      status: "source_unavailable",
      data: null,
      sourceStatus: {
        ...emptySourceStatus(),
        parcel: buildSourceStatus("source_unavailable", {
          safeErrorCode: mapSafeSourceErrorCode(parcelError),
          publicMessage: "Parcel records are temporarily unavailable.",
        }),
      },
    };
  }

  if (!parcel) {
    return {
      status: "not_found",
      data: null,
      sourceStatus: {
        ...emptySourceStatus(),
        parcel: buildSourceStatus("not_found", {
          publicMessage: "We do not have a public parcel record for this page yet.",
        }),
      },
    };
  }

  const parcelRow = parcel as RawRow;
  const address = formatAddress(parcelRow);
  const city = str(parcelRow.city) || "San Diego";
  const state = str(parcelRow.state) || "CA";
  const zip = str(parcelRow.situs_zip || parcelRow.zip || parcelRow.zip_code) || null;
  const permitsResult = await fetchPermitsForParcel({ apnNorm, address, city, state, zip });

  const lat = num(parcelRow.lat);
  const lng = num(parcelRow.lng);
  const overlaysResult = await getOverlayFlags(lat, lng);
  const overlays = overlaysResult.flags;
  const similarLotsResult = await fetchSimilarLots(parcelRow);
  const similarLots = similarLotsResult.similarLots;
  const permits = permitsResult.rows;
  const canonicalSlug = canonicalParcelSlug(apnNorm, address);
  const canonicalPath = canonicalParcelPath(apnNorm, address);
  const refreshedAt = formatShortDate(parcelRow.generated_at);
  const staleDays = daysOld(parcelRow.generated_at);
  const stale = staleDays !== null && staleDays > 60;
  const zoneName = str(parcelRow.zone_name);
  const lotSize = formatSqFt(num(parcelRow.lot_area_sqft));
  const buildingSize = formatSqFt(num(parcelRow.total_lvg_area));
  const existingUse = SD_LAND_USE_CODES[str(parcelRow.nucleus_use_cd)] ?? null;
  const ownerType = formatOwnerType(parcelRow);
  const sourceStatus: ParcelPageSourceStatus = {
    parcel: buildSourceStatus("found", {
      freshness: refreshedAt,
    }),
    permits: permitsResult.status,
    overlays: overlaysResult.status,
    similarLots: similarLotsResult.status,
  };
  const pageStatus: Exclude<CanonicalResultState, "invalid_request"> = [sourceStatus.permits, sourceStatus.overlays, sourceStatus.similarLots].some(
    (item) => item.status === "source_unavailable" || item.status === "partial",
  )
    ? "partial"
    : "found";

  const overlayNames = [
    overlays.tpa ? "Transit Priority Area" : null,
    overlays.sda ? "Sustainable Development Area" : null,
    overlays.ctcac ? "CTCAC mapped area" : null,
  ].filter(Boolean) as string[];
  const linkedDirectPermits = permits
    .map((permit) => ({
      permit,
      linkageConfidence: getPermitLinkage(apnNorm, address, permit),
    }))
    .filter((entry) => entry.linkageConfidence === "exact_apn" || entry.linkageConfidence === "parsed_apn");

  const factRows: ParcelPageV1Data["facts"] = [
    {
      label: "Lot size",
      fact: {
        value: lotSize,
        sourceLabel: "SanGIS parcel layer",
        confidenceTier: "recorded",
        nullBehavior: `Show “${NULL_PUBLIC_RECORD}”.`,
      },
    },
    {
      label: "Existing use",
      fact: {
        value: existingUse,
        sourceLabel: "County Assessor use code",
        confidenceTier: "recorded",
        nullBehavior: `Show “${NULL_PUBLIC_RECORD}”.`,
      },
    },
    {
      label: "Year built",
      fact: {
        value: normalizeYear(parcelRow.year_effective),
        sourceLabel: "County Assessor",
        confidenceTier: "recorded",
        nullBehavior: `Show “${NULL_PUBLIC_RECORD}”.`,
      },
    },
    {
      label: "Building size",
      fact: {
        value: buildingSize,
        sourceLabel: "County Assessor building area",
        confidenceTier: "recorded",
        nullBehavior: `Show “${NULL_PUBLIC_RECORD}”.`,
      },
    },
    {
      label: "Zoning",
      fact: {
        value: zoneName || null,
        sourceLabel: "Mapped base zone",
        confidenceTier: "mapped",
        nullBehavior: `Show “${NULL_PUBLIC_RECORD}”.`,
      },
    },
    {
      label: "Community plan",
      fact: {
        value: str(parcelRow.situs_community) || null,
        sourceLabel: "Current parcel community field",
        confidenceTier: "mapped",
        nullBehavior: `Show “${NULL_PUBLIC_RECORD}”.`,
      },
    },
    {
      label: "Overlays",
      fact: {
        value: overlays.unavailable ? null : overlayNames.length > 0 ? overlayNames.join(", ") : "No mapped overlays found in the current lookup",
        sourceLabel: "check_parcel_overlays(lat,lng)",
        confidenceTier: "mapped",
        nullBehavior: "Show “Overlay lookup unavailable”.",
      },
    },
    {
      label: "Owner type",
      fact: {
        value: ownerType,
        sourceLabel: ownerType ? "Current parcel ownership field" : "TODO — owner type category adapter",
        confidenceTier: "recorded",
        nullBehavior: `Show “${NULL_PUBLIC_RECORD}”.`,
        ...(ownerType ? {} : { todo: "Expose owner type category from parcel view." }),
      },
    },
    {
      label: "Last sale",
      fact: {
        value: formatMonthYear(parcelRow.docdate || parcelRow.last_sale_date || parcelRow.sale_date),
        sourceLabel: "TODO — recorder sale-date adapter",
        confidenceTier: "recorded",
        nullBehavior: `Show “${NULL_PUBLIC_RECORD}”.`,
        todo: "Current parcel view does not expose recorder sale date in this repo snapshot.",
      },
    },
    {
      label: "Sewer / septic",
      fact: {
        value: str(parcelRow.sewer_type || parcelRow.sewer) || null,
        sourceLabel: str(parcelRow.sewer_type || parcelRow.sewer) ? "Current parcel utility field" : "TODO — sewer adapter",
        confidenceTier: "recorded",
        nullBehavior: `Show “${NULL_PUBLIC_RECORD}”.`,
        ...(str(parcelRow.sewer_type || parcelRow.sewer) ? {} : { todo: "Sewer field is not exposed in the active parcel views." }),
      },
    },
  ];

  const snapshot: SnapshotFact[] = [];
  if (lotSize || existingUse || buildingSize) {
    const pieces = [
      lotSize ? `This parcel is ${lotSize.toLowerCase()}` : "This parcel is on file",
      existingUse ? `and recorded as ${existingUse.toLowerCase()}` : null,
      buildingSize ? `with ${buildingSize.toLowerCase()} of building area` : null,
    ].filter(Boolean);
    snapshot.push({
      value: `${pieces.join(" ")}.`,
      sourceLabel: "SanGIS parcel layer + County Assessor",
      confidenceTier: "recorded",
      nullBehavior: "Omit sentence when required inputs are missing.",
    });
  }
  if (zoneName) {
    const overlayText = overlays.unavailable
      ? "Overlay context is not available from the current lookup."
      : overlayNames.length > 0
      ? `Mapped overlays include ${overlayNames.join(" and ")}.`
      : "No mapped overlays were returned by the current lookup.";
    snapshot.push({
      value: `The parcel is mapped to base zone ${zoneName}. ${overlayText}`,
      sourceLabel: "Mapped base zone + overlay lookup",
      confidenceTier: "mapped",
      nullBehavior: "Omit sentence when zone data is unavailable.",
    });
  }
  if (linkedDirectPermits.length > 0) {
    const latestPermit = linkedDirectPermits[0].permit;
    const latestConfidence = linkedDirectPermits[0].linkageConfidence;
    snapshot.push({
      value: `City permit records show ${cleanPermitDescription(str(latestPermit.description) || str(latestPermit.record_type)).toLowerCase()} on this parcel.`,
      sourceLabel: permitSourceLabelForConfidence(latestConfidence),
      confidenceTier: "recorded",
      nullBehavior: "Omit sentence when permit records are unavailable.",
    });
  } else if (sourceStatus.permits.status === "not_found") {
    snapshot.push({
      value: "City permit records show no permits on file for this parcel in the current digital record set.",
      sourceLabel: "City permit linkage audit",
      confidenceTier: "recorded",
      nullBehavior: "Show this sentence when no permit rows are returned.",
    });
  }
  if (similarLots.matches.length > 0) {
    snapshot.push({
      value: `${similarLots.matches.length} nearby parcels with the same recorded base zone and similar lot size have permit records on file.`,
      sourceLabel: "Same-zone parcel query + permit records",
      confidenceTier: "mapped",
      nullBehavior: "Omit sentence when nearby matching is unavailable.",
    });
  }

  const programFacts: ProgramFact[] = [
    {
      name: "Accessory Dwelling Unit rules",
      value: null,
      sourceLabel: "TODO — program rules adapter",
      confidenceTier: "conditional",
      nullBehavior: "Show “Eligibility not yet exposed in the current parcel views”.",
      todo: "Expose ADU eligibility output from the rules engine instead of inferring it in the page layer.",
    },
    {
      name: "SB 9",
      value: null,
      sourceLabel: "TODO — program rules adapter",
      confidenceTier: "conditional",
      nullBehavior: "Show “Eligibility not yet exposed in the current parcel views”.",
      todo: "Expose SB 9 eligibility output from the rules engine instead of inferring it in the page layer.",
    },
    {
      name: "Transit Priority Area",
      value: overlays.unavailable
        ? null
        : overlays.tpa
        ? "Applies per mapped overlay"
        : "Does not appear to apply — parcel is outside the current mapped TPA overlay",
      sourceLabel: "check_parcel_overlays(lat,lng)",
      confidenceTier: "conditional",
      nullBehavior: "Show “Overlay lookup unavailable”.",
    },
    {
      name: "Sustainable Development Area",
      value: overlays.unavailable
        ? null
        : overlays.sda
        ? "Applies per mapped overlay"
        : "Does not appear to apply — parcel is outside the current mapped SDA overlay",
      sourceLabel: "check_parcel_overlays(lat,lng)",
      confidenceTier: "conditional",
      nullBehavior: "Show “Overlay lookup unavailable”.",
    },
    {
      name: "Complete Communities / other bonus programs",
      value: null,
      sourceLabel: "TODO — program rules adapter",
      confidenceTier: "conditional",
      nullBehavior: "Show “Eligibility not yet exposed in the current parcel views”.",
      todo: "Current backend route does not expose program-eligibility outputs for this page.",
    },
  ];

  const zoningInterpretation: SnapshotFact[] = [
    {
      value: zoneName
        ? `This parcel is mapped to ${zoneName}, and that mapped zone should be read separately from permit history and conditional program rules.`
        : "Mapped zoning is not available from the current parcel record.",
      sourceLabel: zoneName ? "Mapped base zone" : "TODO — zoning adapter",
      confidenceTier: zoneName ? "mapped" : "conditional",
      nullBehavior: "Show cautious zoning fallback copy.",
    },
    {
      value: overlays.unavailable
        ? "Overlay context is unavailable in the current lookup, so this page does not make a program statement from overlays alone."
        : overlayNames.length > 0
        ? `Overlay context is mapped, but any program effect remains conditional on project specifics and city review.`
        : "No mapped overlays were returned by the current lookup, and program rows remain conditional where the backend does not yet expose a verified eligibility result.",
      sourceLabel: overlays.unavailable ? "Overlay lookup unavailable" : "Overlay lookup + program adapters",
      confidenceTier: "conditional",
      nullBehavior: "Show cautious interpretation fallback copy.",
    },
  ];

  const permitFacts: PermitFact[] = linkedDirectPermits.slice(0, 8).map(({ permit, linkageConfidence }) => ({
    value: cleanPermitDescription(str(permit.description) || str(permit.record_type)),
    permitNumber: str(permit.record_number || permit.record_id) || null,
    permitUrl: permitPortalUrl(str(permit.record_number || permit.record_id) || null),
    status: normalizePermitStatus(permit.status),
    date: formatShortDate(permit.opened_date || permit.issued_date || permit.completed_date || permit.finaled_date),
    sourceLabel: permitSourceLabelForConfidence(linkageConfidence),
    confidenceTier: "recorded",
    linkageConfidence,
    nullBehavior: "Show no-permits empty state when no permit records exist.",
  }));

  const nearbySummary: ParcelPageV1Data["permits"]["nearbySummary"] = [
    {
      label: "Nearby recorded activity",
      fact: {
        value: num(parcelRow.nearby_project_count) !== null ? `${Math.round(num(parcelRow.nearby_project_count) ?? 0)} nearby parcels with recorded activity` : null,
        sourceLabel: "parcel_page_api_v2 nearby development summary",
        confidenceTier: "mapped",
        nullBehavior: `Show “${NULL_SECTION_UNAVAILABLE}”.`,
      },
    },
    {
      label: "Nearby active projects",
      fact: {
        value: num(parcelRow.nearby_active_count) !== null ? `${Math.round(num(parcelRow.nearby_active_count) ?? 0)} active` : null,
        sourceLabel: "parcel_page_api_v2 nearby development summary",
        confidenceTier: "mapped",
        nullBehavior: `Show “${NULL_SECTION_UNAVAILABLE}”.`,
      },
    },
    {
      label: "Nearby completed projects",
      fact: {
        value: num(parcelRow.nearby_completed_count) !== null ? `${Math.round(num(parcelRow.nearby_completed_count) ?? 0)} completed` : null,
        sourceLabel: "parcel_page_api_v2 nearby development summary",
        confidenceTier: "mapped",
        nullBehavior: `Show “${NULL_SECTION_UNAVAILABLE}”.`,
      },
    },
  ];

  const signals = buildSignalFacts(parcelRow, overlays);
  const methodology = staticMethodology();

  const copyToCheck = [
    ...snapshot.map((item) => item.value ?? ""),
    ...programFacts.map((item) => `${item.name} ${item.value ?? ""} ${item.todo ?? ""}`),
    ...zoningInterpretation.map((item) => item.value ?? ""),
    ...signals.map((item) => `${item.title} ${item.value ?? ""} ${item.detail ?? ""}`),
    ...methodology.sections.map((item) => item.body),
    ...methodology.faq.flatMap((item) => [item.question, item.answer]),
    methodology.disclaimer,
  ];
  assertNoForbiddenCopyInList(copyToCheck, "parcel-page-v1");
  assertNoForbiddenCopy(address, "parcel-address");

  const data: ParcelPageV1Data = {
    pageStatus,
    sourceStatus,
    apnNorm,
    canonicalSlug,
    canonicalPath,
    identity: {
      address,
      city,
      state,
      zip,
      apn: formatApnForDisplay(apnNorm),
      neighborhood: str(parcelRow.neighborhood) || null,
      communityPlanArea: str(parcelRow.situs_community) || null,
      dataRefreshedAt: refreshedAt,
      stale,
      staleReason: stale ? `Current parcel view refresh is ${staleDays} days old.` : null,
      mapCaption: lat !== null && lng !== null ? "Parcel location from current parcel coordinates. Boundary image is not yet attached to this record." : "Parcel map is not available from the current parcel views.",
      lat,
      lng,
      staticMapUrl: null,
      boundaryAvailable: false,
    },
    facts: factRows,
    snapshot,
    zoning: {
      baseCode: {
        value: zoneName || null,
        sourceLabel: "Mapped base zone",
        confidenceTier: "mapped",
        nullBehavior: `Show “${NULL_PUBLIC_RECORD}”.`,
      },
      plainName: {
        value: null,
        sourceLabel: "TODO — curated zoning copy table",
        confidenceTier: "mapped",
        nullBehavior: "Show “Plain-language zone description not yet attached to this parcel record”.",
        todo: "Expose curated base-zone names from a reviewed zoning copy table.",
      },
      description: {
        value: null,
        sourceLabel: "TODO — curated zoning copy table",
        confidenceTier: "mapped",
        nullBehavior: "Show “Published zone description not yet attached to this parcel record”.",
        todo: "Expose one-line zone descriptions from a reviewed zoning copy table.",
      },
      standards: [],
      citation: {
        value: null,
        sourceLabel: "TODO — zoning standards adapter",
        confidenceTier: "mapped",
        nullBehavior: "Show standards unavailable state.",
        todo: "Attach published zone standards and citations by base zone.",
      },
      programs: programFacts,
      interpretation: zoningInterpretation,
    },
    similarLots,
    permits: {
      thisParcel: permitFacts,
      earliestDataYear: 2003,
      nearbySummary,
      emptyState:
        permitFacts.length === 0
          ? sourceStatus.permits.status === "source_unavailable" || sourceStatus.permits.status === "partial"
            ? sourceStatus.permits.publicMessage
            : "No reliably linked permits are on file for this parcel in the current digital permit record set."
          : null,
    },
    signals,
    signalsEmptyState: signals.length === 0 ? "No development signals are available from the current public record fields for this parcel." : null,
    sources: buildSourceTable(parcelRow),
    methodology,
    fieldMapping: buildFieldMappingReport(),
  };

  return {
    status: pageStatus,
    data,
    sourceStatus,
  };
}

export async function getParcelPageV1Data(rawApnOrSlug: string): Promise<ParcelPageV1Data | null> {
  const result = await getParcelPageV1Result(rawApnOrSlug);
  return result.status === "found" || result.status === "partial" ? result.data : null;
}

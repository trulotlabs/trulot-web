import { createClient } from "@supabase/supabase-js";
import type {
  ParcelPageData,
  ConfidenceLevel,
  PermitLifecycleStatus,
  PermitRecord,
  PermitTreeNode,
} from "./parcel-page-contract";
import { inferPhase, type PhaseResult } from "./infer-phase";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type RawRow = Record<string, unknown>;

const SD_LAND_USE_CODES: Record<string, string> = {
  "100": "Vacant land",
  "101": "Vacant — residential",
  "102": "Vacant — commercial",
  "103": "Vacant — industrial",
  "111": "Single family residential",
  "112": "Single family — PUD",
  "120": "Duplex",
  "121": "Triplex",
  "122": "Quadruplex",
  "130": "Multifamily residential",
  "131": "Apartment building",
  "132": "Condominium",
  "140": "Mobile home",
  "141": "Mobile home park",
  "150": "Mixed use — residential",
  "200": "Commercial",
  "210": "Retail / shopping center",
  "220": "Office",
  "230": "Hotel / motel",
  "240": "Service commercial",
  "300": "Industrial",
  "310": "Light industrial",
  "320": "Heavy industrial",
  "400": "Agricultural",
  "500": "Exempt / government",
  "510": "Public utility",
  "520": "Schools / education",
  "530": "Religious institution",
  "540": "Parks / recreation",
  "600": "Special use",
};

export type JobToEngage = {
  role: string;
  reason: string;
  timing: "now" | "near-term" | "future";
  confidence: ConfidenceLevel;
  location: { address: string; lat: unknown; lng: unknown; submarket: unknown };
  alert_tags: string[];
};

export type ParcelPageResult = ParcelPageData & {
  development_stage: string;
  stale_days: number;
  stale_flag: "none" | "watch" | "stale" | "severe";
  phase_result: PhaseResult;
  full_address?: string;
  conflict?: { type: string; detail: string };
  opportunity_layer?: {
    development_stage: string;
    interpretation: string;
    key_triggers: string[];
    potential_opportunities: string[];
    watch_next: string[];
  };
  jobs_to_engage: JobToEngage[];
};

// ─── Field normalization ───────────────────────────────────────────────────────

export function normalizeApn(raw: string): string {
  return raw.replace(/[^0-9]/g, "").padStart(10, "0");
}

export function formatApn(apn: string): string {
  if (apn.length === 10) return `${apn.slice(0, 3)}-${apn.slice(3, 6)}-${apn.slice(6, 8)}-${apn.slice(8, 10)}`;
  return apn;
}

/** Safe string coercion — never returns undefined */
function str(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

/** Safe numeric coercion — returns 0 for non-finite or non-numeric */
function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = parseFloat(value.replace(/^0+(?=\d)/, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Safe integer from possibly-padded assessor string ("03" → 3, "00" → null) */
function assessorInt(value: unknown): number | null {
  if (typeof value === "string") {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value);
  return null;
}

/**
 * Assessor baths encoding: stored as integer × 10 (e.g. "010" = 1 bath, "015" = 1.5 baths).
 * Returns null if 0 or unparseable — never show "0 baths".
 */
function assessorBaths(value: unknown): number | null {
  const raw = typeof value === "string" ? parseInt(value, 10) : typeof value === "number" ? Math.round(value) : 0;
  if (!Number.isFinite(raw) || raw === 0) return null;
  const decoded = Math.round(raw / 10 * 2) / 2; // round to nearest 0.5
  return decoded > 0 ? decoded : null;
}

/**
 * Normalize year from assessor 2-digit string.
 *
 * 2-digit rule: < 30 → 2000s, ≥ 30 → 1900s. Null/0/"00" → null.
 * 4-digit values must be plausible (1800 < n ≤ current year) or null.
 */
function normalizeYear(raw: unknown): string | null {
  const s = str(raw).trim();
  if (!s || s === "0" || s === "00") return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n === 0) return null;

  if (n > 100) {
    const currentYear = new Date().getFullYear();
    return n > 1800 && n <= currentYear ? `~${n}` : null;
  }

  const fourDigit = n < 30 ? 2000 + n : 1900 + n;
  return `~${fourDigit}`;
}

function normalizePermitStatus(raw: unknown): PermitLifecycleStatus {
  const s = str(raw).toLowerCase();
  if (s.includes("inspection followup") || s.includes("inspecting") || s.includes("inspection")) return "INSPECTION";
  if (s.includes("issued")) return "ISSUED";
  if (s.includes("finaled") || s.includes("closed") || s.includes("complete")) return "COMPLETE";
  if (s.includes("active")) return "ACTIVE";
  return "IN REVIEW";
}

function buildFullAddress(row: RawRow): string {
  const address = str(row.address);
  if (!address) return "";
  if (/\bCA\b|\d{5}/i.test(address)) return address;
  const city = str(row.situs_city) || str(row.city) || "San Diego";
  const state = str(row.situs_state) || str(row.state) || "CA";
  const zip = str(row.situs_zip) || str(row.zip_code) || "";
  return [address, `${city}, ${state}`, zip].filter(Boolean).join(", ").replace(/,\s*,/g, ",").trim();
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function daysSinceDate(dateStr: string): number {
  if (!dateStr) return 9999;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? 9999 : Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

// ─── Scope resolution ─────────────────────────────────────────────────────────

/**
 * Strip amendment metadata artifacts from permit scope text.
 * Removes patterns like "** Scope Change 12/1/2025 **" and the
 * leading "Scope change — " prefix that wraps them.
 * Preserves actual project description content.
 */
function stripScopeAmendmentArtifacts(raw: string): string {
  return raw
    // Remove "** Scope Change MM/DD/YYYY **" or "**SCOPE CHANGE (6/12/2024)**"
    .replace(/\*{1,2}\s*scope change\s*[\(\[\/]?[\d\/\-]+[\)\]]?\s*\*{1,2}/gi, "")
    // Remove leading "Scope change — " wrapper
    .replace(/^scope change\s*[—–\-]\s*/i, "")
    .trim();
}

/**
 * Primary permit scope = what the primary permit actually is.
 * NEVER replace with ADU/proposed scope — that lives in proposed_project only.
 * Truncates to a clean statement without hallucinating intent.
 */
function resolvePrimaryScope(description: unknown): string {
  const raw = str(description).trim();
  if (!raw) return "Scope not on file";

  const wasAmendment = /scope change/i.test(raw);
  // Strip amendment metadata — preserve actual project description
  const desc = wasAmendment ? (stripScopeAmendmentArtifacts(raw) || raw) : raw;

  if (/retaining wall|site prep|site preparation/i.test(desc)) return "Site retaining walls / site prep";
  if (/grading/i.test(desc) && !/ADU|units?/i.test(desc)) return `Grading — ${desc.slice(0, 100)}`;

  return desc.length > 200 ? `${desc.slice(0, 200)}…` : desc;
}

// ─── ADU / proposed project parsing ──────────────────────────────────────────

function findAduScopePermit(permits: RawRow[]): RawRow | undefined {
  // Must reference at least one ADU (any variant)
  return permits.find((p) => /\bADU[s']?\b/i.test(str(p.description)));
}

/**
 * ADU count extractor — handles the full range of permit description formats:
 *
 * Priority 1: explicit total statement ("for a total of 12 ADUs") — always wins
 * Priority 2: classified ADU types (by right + moderate + bonus) — always additive
 * Priority 3: flexible token scan — number (w/ optional parens) + up to 5 words + ADU variant
 *
 * Multi-reference cases (no explicit total, no classified types):
 *   same number repeated → return that number
 *   different numbers → return max (conservative)
 */
function normalizeWordNumerals(s: string): string {
  const map: Record<string, string> = {
    one: "1", two: "2", three: "3", four: "4", five: "5",
    six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
    eleven: "11", twelve: "12",
  };
  return s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi,
    (m) => map[m.toLowerCase()] ?? m);
}

function extractAduCount(description: string): number {
  const text = normalizeWordNumerals(description.replace(/\n/g, " "));

  // 1. Explicit total wins
  const totalPatterns: RegExp[] = [
    /for\s+a\s+total\s+(?:for|of)\s+\(?\s*(\d+)\s*\)?\s+ADU/i,
    /total\s+(?:of\s+)?\(?\s*(\d+)\s*\)?\s+ADU/i,
    /\(?\s*(\d+)\s*\)?\s+ADU[s']?\s+(?:in\s+)?total\b/i,
    /totaling\s+\(?\s*(\d+)\s*\)?\s+ADU/i,
  ];
  for (const p of totalPatterns) {
    const m = text.match(p);
    if (m) return parseInt(m[1], 10);
  }

  // 2. Classified ADU types (always additive — these are distinct program categories)
  const byRight = text.match(/\(?\s*(\d+)\s*\)?\s+ADU[s']?\s+by\s+right/i);
  const moderate = text.match(/\(?\s*(\d+)\s*\)?\s+moderate\s+ADU[s']?/i);
  const bonus = text.match(/\(?\s*(\d+)\s*\)?\s+bonus\s+ADU[s']?/i);
  if (byRight || moderate || bonus) {
    return (byRight ? parseInt(byRight[1], 10) : 0) +
           (moderate ? parseInt(moderate[1], 10) : 0) +
           (bonus ? parseInt(bonus[1], 10) : 0);
  }

  // 3. Flexible token scan: number (possibly in parens) + up to 5 tokens + ADU variant
  const tokens = text.split(/\s+/);
  const counts: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i].replace(/[.,;:!?]$/, "");
    const numMatch = tok.match(/^\(?\s*(\d+)\s*\)?$/);
    if (!numMatch) continue;
    const n = parseInt(numMatch[1], 10);
    if (n === 0 || n >= 500) continue;
    // Look forward up to 5 tokens for an ADU variant
    for (let j = i + 1; j < Math.min(i + 6, tokens.length); j++) {
      const t = tokens[j].replace(/[.,;:!?]$/, "");
      if (/^ADU[s']*$/i.test(t)) { // handles ADU, ADUs, ADU's, ADUs'
        counts.push(n);
        break;
      }
    }
  }

  if (counts.length === 0) {
    // Fallback 1: duplex buildings — "8 new 2-story duplex buildings" → 16 units
    const duplexBldg = text.match(/(\d+)\s+(?:new\s+)?(?:\d+-story\s+)?duplex\s+buildings?/i);
    if (duplexBldg) return parseInt(duplexBldg[1], 10) * 2;

    // Fallback 2: plain duplex count — "4 duplexes" → 8 units (not "duplex main" which is a unit type label)
    const duplexCount = text.match(/(\d+)\s+(?:new\s+)?duplexes?\b(?!\s+main)/i);
    if (duplexCount) return parseInt(duplexCount[1], 10) * 2;

    // Fallback 3: conversion + detached additive pattern
    // "conversion of SDU to 2 units ... new detached two-unit" → 2 + 2 = 4
    const convM = text.match(/conversion[^.;\n]{0,80}to\s+(\d+)\s+units?/i);
    const detM  = text.match(/new\s+detached[^.;\n]{0,50}(?:(\d+)-unit|(\d+)\s+units?)/i);
    if (convM || detM) {
      const c = convM ? parseInt(convM[1], 10) : 0;
      const d = detM  ? parseInt(detM[1] ?? detM[2] ?? "0", 10) : 0;
      if (c + d > 0) return c + d;
    }

    return 0;
  }
  if (counts.length === 1) return counts[0];
  const unique = [...new Set(counts)];
  if (unique.length === 1) return unique[0]; // same number repeated
  return Math.max(...counts); // multiple different counts — conservative max
}

function extractSfrCount(description: string): number {
  const match = description.match(/(\d+)\s+SFR/i);
  if (match) return Number(match[1]);
  return /\bSFR\b|single.?family/i.test(description) ? 1 : 0;
}

/**
 * Building count extractor.
 * Handles: "(7) buildings", "8 new ... buildings" (flexible gap), sums grouped patterns.
 */
function extractBuildingCount(description: string): number {
  const text = description;

  // Pattern: (N) + up to 40 chars + "buildings"
  const grouped = [...text.matchAll(/\((\d+)\)[^.;,]{0,40}buildings?/gi)];
  if (grouped.length > 0) {
    return grouped.reduce((sum, m) => sum + parseInt(m[1], 10), 0);
  }

  // Flexible: standalone number + up to 5 tokens + "buildings"
  const tokens = text.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const numMatch = tokens[i].match(/^(\d+)$/);
    if (!numMatch) continue;
    const n = parseInt(numMatch[1], 10);
    if (n === 0 || n > 100) continue;
    for (let j = i + 1; j < Math.min(i + 6, tokens.length); j++) {
      if (/^buildings?$/i.test(tokens[j].replace(/[.,;:!?]$/, ""))) {
        return n;
      }
    }
  }
  return 0;
}

// ─── Stage derivation ─────────────────────────────────────────────────────────

function getDevelopmentStage(primaryProject: RawRow | null, permits: RawRow[]): string {
  if (!primaryProject) return "INACTIVE";
  const momentum    = str(primaryProject.project_momentum_label);
  const days        = num(primaryProject.primary_project_days_since_activity);
  const hasBuilding = Boolean(primaryProject.has_building_project);
  const primaryStatus  = str(primaryProject.primary_project_status).toLowerCase();
  const primaryIssued  = str(primaryProject.primary_project_issued);

  if (!hasBuilding || momentum === "Awaiting Issuance") return "EARLY";
  if (momentum === "Completed") return "COMPLETE";

  if (momentum === "Status unclear" || (days > 180 && momentum !== "Active")) {
    // Before declaring STALLED: check for active construction signals that
    // the primary-project view doesn't capture (sub-permit activity).
    //
    // Rule A: Primary permit is at inspection AND was issued within 12 months →
    //         construction is underway; the activity gap is in the permit record,
    //         not necessarily on-site.
    const issuedDaysAgo = daysSinceDate(primaryIssued);
    // Use normalizePermitStatus for robustness — raw status field format varies by view
    const primaryNormStatus = normalizePermitStatus(primaryStatus);
    // Also check permit terminal for any building permit at inspection (sub-permit view
    // may have a more current status than the primary-project summary view)
    const hasInspectionBuilding = primaryNormStatus === "INSPECTION" ||
      permits.some((p) =>
        /building permit|combination building/i.test(str(p.record_type)) &&
        normalizePermitStatus(p.status) === "INSPECTION"
      );
    if (hasInspectionBuilding && issuedDaysAgo < 365) return "ACTIVE";

    // Rule B: An execution or encroachment permit (AGR / agreement / grading)
    //         is present and was opened within 12 months → project pulse confirmed.
    const hasRecentExecution = permits.some((p) => {
      if (!/agreement|encroachment|grading/i.test(str(p.record_type))) return false;
      if (!/issued|active|inspection/i.test(str(p.status))) return false;
      return daysSinceDate(str(p.opened_date)) < 365;
    });
    if (hasRecentExecution) return "ACTIVE";

    return "STALLED";
  }

  if (momentum === "Active") {
    const openedBuilding = permits.filter(
      (p) => /building permit|combination building/i.test(str(p.record_type)) && /opened|in.?review/i.test(str(p.status))
    );
    const hasScopeChange = permits.some((p) => /scope change/i.test(str(p.description)));
    if (openedBuilding.length >= 2 || hasScopeChange) return "SCALING";
    return "ACTIVE";
  }
  return "INACTIVE";
}

// ─── Conflict detection ───────────────────────────────────────────────────────

/**
 * Detect when primary permit reality conflicts with proposed project scope.
 * Returns a conflict record if found, null otherwise.
 * Escalation: caller must decide how to surface this — never silently merge.
 */
function detectConflict(
  primaryProject: RawRow | null,
  proposedProject: { scope: string; adu_units: number } | null
): { type: string; detail: string } | null {
  if (!primaryProject || !proposedProject || proposedProject.adu_units === 0) return null;

  const primaryScope = resolvePrimaryScope(primaryProject.primary_project_description);
  const primaryIsRetaining = /retaining wall|site prep/i.test(primaryScope);
  const proposedHasUnits = proposedProject.adu_units > 0;

  if (primaryIsRetaining && proposedHasUnits) {
    return {
      type: "scope_mismatch",
      detail: `Primary permit is site prep / retaining walls. Proposed ADU scope (${proposedProject.scope}) is from a related permit — NOT yet an approved building project. Verify with city before treating as active development.`,
    };
  }
  return null;
}

// ─── Execution permits ────────────────────────────────────────────────────────

/** Pull real execution / support permits from DB records — no stubs */
function buildExecutionNodes(permits: RawRow[]): PermitTreeNode[] {
  return permits
    .filter((p) =>
      /traffic control|agreement|encroachment|drawing|grading|inspection/i.test(str(p.record_type)) ||
      /inspection followup|field activity/i.test(str(p.status))
    )
    .slice(0, 4)
    .map((p) => ({
      status: normalizePermitStatus(p.status),
      title: `${str(p.record_number) || str(p.record_id)} — ${str(p.record_type)}`,
      filed: str(p.opened_date) || undefined,
      confidence: "source-backed" as ConfidenceLevel,
    }));
}

// ─── Opportunity layer ────────────────────────────────────────────────────────

/**
 * Opportunity layer is interpretation — only surface when backed by real signals.
 * key_triggers must be derived from actual permit IDs and stage data.
 * Never hardcode permit numbers. Never generate generic suggestions.
 */
function buildOpportunityLayer(
  stage: string,
  primaryProject: RawRow | null,
  permits: RawRow[],
  nearbyCount: number,
  proposedProject: { scope: string } | null
): ParcelPageResult["opportunity_layer"] | undefined {
  // Only surface opportunity layer for actionable stages
  if (!["ACTIVE", "SCALING", "EARLY", "STALLED"].includes(stage)) return undefined;

  // Derive key_triggers from real permit data — no hardcoding
  const openedPermits = permits.filter((p) => /opened|in.?review/i.test(str(p.status)));
  const primaryId = str(primaryProject?.primary_project_id);
  const realTriggers: string[] = [];

  if (primaryId) realTriggers.push(`${primaryId}: ${str(primaryProject?.primary_project_status)} → watch for issuance`);
  for (const p of openedPermits.slice(0, 2)) {
    const pid = str(p.record_number) || str(p.record_id);
    if (pid && pid !== primaryId) realTriggers.push(`${pid}: ${str(p.record_type)} in ${str(p.status)}`);
  }
  if (realTriggers.length === 0) return undefined; // No real triggers — don't surface

  const interpretation = stage === "SCALING"
    ? "Active site prep is underway while a larger development cluster is in review. Primary and proposed scopes are separate — verify city records before treating proposed as approved."
    : stage === "ACTIVE"
      ? "Active construction underway. Monitor inspection cadence and execution permit status."
      : stage === "EARLY"
        ? "Development intent on record — permit in plan check. No ground broken yet."
        : "Project is stale. Watch for reactivation signals or salvage opportunity.";

  const opportunities: string[] = [];
  if (stage === "SCALING" && proposedProject) opportunities.push(`Proposed: ${proposedProject.scope} — conditional on permit approval`);
  if (nearbyCount >= 3) opportunities.push(`${nearbyCount} nearby active projects — submarket activity signal`);

  const watchNext: string[] = [...realTriggers];
  if (stage === "SCALING") watchNext.push("Grading approval on primary permit", "Scope change permit status movement");

  return {
    development_stage: stage,
    interpretation,
    jobs_to_engage: [],  // populated separately in jobs_to_engage field
    key_triggers: realTriggers,
    potential_opportunities: opportunities,
    watch_next: watchNext,
  };
}

// ─── Jobs to engage ───────────────────────────────────────────────────────────

const ROLE_TAGS: { pattern: RegExp; tags: string[] }[] = [
  { pattern: /civil/i,               tags: ["civil"] },
  { pattern: /grading/i,             tags: ["grading", "civil"] },
  { pattern: /retaining wall/i,      tags: ["retaining_wall", "civil", "grading"] },
  { pattern: /utility/i,             tags: ["utility"] },
  { pattern: /framing/i,             tags: ["framing"] },
  { pattern: /structural/i,          tags: ["framing", "foundation"] },
  { pattern: /foundation/i,          tags: ["foundation"] },
  { pattern: /MEP/i,                 tags: ["mep", "electrical", "mechanical", "plumbing"] },
  { pattern: /traffic/i,             tags: ["traffic_control"] },
  { pattern: /entitlement/i,         tags: ["entitlement"] },
  { pattern: /acquisition|salvage/i, tags: ["acquisition"] },
  { pattern: /vertical.*pipeline/i,  tags: ["framing", "mep", "foundation"] },
];

function tagsForRole(role: string): string[] {
  const tags = new Set<string>();
  for (const { pattern, tags: roleTags } of ROLE_TAGS) {
    if (pattern.test(role)) roleTags.forEach((t) => tags.add(t));
  }
  return Array.from(tags);
}

function buildJobs(stage: string, parcel: RawRow, primaryProject: RawRow | null): JobToEngage[] {
  const primaryLabel = str(primaryProject?.primary_project_label);
  const primaryDesc = str(primaryProject?.primary_project_description);
  const isComboBp = /combination building/i.test(primaryLabel);
  const hasRetainingWall = /retaining wall/i.test(primaryDesc);
  const hasMDU = /MDU|26 ADU|multiple.*unit/i.test(primaryDesc);
  const hasScopeChange = /scope change/i.test(primaryDesc);
  const lotSqft = num(parcel.lot_area_sqft);
  const location = {
    address: buildFullAddress(parcel),
    lat: parcel.lat ?? null,
    lng: parcel.lng ?? null,
    submarket: parcel.situs_community ?? parcel.situs_zip ?? null,
  };

  const rawJobs: Array<Omit<JobToEngage, "location" | "alert_tags">> = [];

  if (stage === "ACTIVE" || stage === "SCALING") {
    if (isComboBp || hasRetainingWall) {
      rawJobs.push({
        role: "Civil / Grading",
        timing: "now",
        reason: hasRetainingWall
          ? "Active permit — retaining walls in inspection phase"
          : "Active combination permit — site work underway",
        confidence: "source-backed",
      });
    }
    if (isComboBp) {
      rawJobs.push({
        role: "Structural / Framing",
        timing: hasMDU || hasScopeChange ? "near-term" : "now",
        reason: hasMDU
          ? "Multi-unit scope in permit record — structural follows site prep"
          : "Active building permit — framing phase",
        confidence: hasMDU ? "inferred" : "source-backed",
      });
      rawJobs.push({
        role: "MEP (Electrical, Mechanical, Plumbing)",
        timing: hasMDU ? "near-term" : "now",
        reason: "Combination permit includes MEP scope",
        confidence: "source-backed",
      });
    }
  }

  if (stage === "SCALING") {
    rawJobs.push({
      role: "Vertical Construction (future pipeline)",
      timing: "near-term",
      reason: hasMDU
        ? "MDU development cluster in review — larger construction to follow site prep"
        : "Scope change indicates expanded project — vertical construction in pipeline",
      confidence: "conditional",
    });
    if (hasMDU && lotSqft > 15000) {
      rawJobs.push({
        role: "Structural / Foundation (multi-unit)",
        timing: "near-term",
        reason: "Multi-unit scope + large lot — foundation work follows grading",
        confidence: "conditional",
      });
    }
  }

  if (stage === "EARLY") rawJobs.push({ role: "Entitlement / Investor Tracking", timing: "near-term", reason: "Permit in review — project has not broken ground", confidence: "inferred" });
  if (stage === "STALLED") rawJobs.push({ role: "Acquisition / Salvage", timing: "near-term", reason: "Project stalled — entitlement may be salvageable", confidence: "inferred" });

  return rawJobs.map((job) => ({ ...job, location, alert_tags: tagsForRole(job.role) }));
}

// ─── Capacity ─────────────────────────────────────────────────────────────────

function sdAduCap(lotSqft: number): { maxAdu: number; total: number } {
  if (lotSqft <= 8000) return { maxAdu: 4, total: 5 };
  if (lotSqft <= 10000) return { maxAdu: 5, total: 6 };
  return { maxAdu: 6, total: 7 };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function getParcelPageData(rawApn: string): Promise<ParcelPageResult | null> {
  const apn = normalizeApn(rawApn);

  const [parcelRes, projectRes, permitsRes] = await Promise.all([
    supabase.from("parcel_page_api_v2").select("*").eq("apn_norm", apn).single(),
    supabase.from("parcel_primary_project_v1").select("*").eq("apn_norm", apn).maybeSingle(),
    supabase.from("parcel_permit_terminal_v2").select("*").eq("apn_norm", apn).order("opened_date", { ascending: false }),
  ]);

  if (parcelRes.error || !parcelRes.data) return null;

  const parcel = parcelRes.data as RawRow;
  const primaryProject = (projectRes.data as RawRow | null) ?? null;
  const permits = (permitsRes.data ?? []) as RawRow[];

  // ── Stage + stale signal (parallel — does NOT override stage) ───────────────
  const stage = getDevelopmentStage(primaryProject, permits);
  const staleDays = Math.round(num(primaryProject?.primary_project_days_since_activity));
  const staleFlag: "none" | "watch" | "stale" | "severe" =
    staleDays >= 730 ? "severe" :
    staleDays >= 365 ? "stale" :
    staleDays >= 180 ? "watch" :
    "none";

  // ── Lot / zoning ───────────────────────────────────────────────────────────
  const lotSqft = num(parcel.lot_area_sqft);
  const zoneName = str(parcel.zone_name);
  const rsMatch = zoneName.match(/^RS-1-(\d+)/i);
  const rmMatch = zoneName.match(/^RM-(\d+)-(\d+)/i);
  // RX zones (e.g. RX-1-1) — SD non-standard; apply RM-style DU/SF rule, confidence inferred
  const rxMatch = zoneName.match(/^RX-(\d+)-(\d+)/i);
  const isRs = !!rsMatch;
  const isRm = !!rmMatch;
  const isRx = !!rxMatch;

  // If lot < zoning minimum → baseline = 0 (non-conforming). Never default to 1.
  let baselineUnits = 0;
  let capacityBasis = `${zoneName || "Unknown zone"} — capacity not calculated`;
  let capacityConfidence: ConfidenceLevel = "unknown";

  if (rsMatch) {
    const minSf = Number(rsMatch[1]) * 1000;
    baselineUnits = Math.floor(lotSqft / minSf); // 0 if lot < minimum (non-conforming)
    capacityBasis = baselineUnits === 0
      ? `${zoneName} → 1 DU / ${minSf.toLocaleString()} SF — lot undersized (${Math.round(lotSqft).toLocaleString()} SF < ${minSf.toLocaleString()} SF min)`
      : `${zoneName} → 1 DU / ${minSf.toLocaleString()} SF`;
    capacityConfidence = "source-backed";
  } else if (rmMatch) {
    const minSf = Number(rmMatch[2]) * 1000;
    baselineUnits = Math.floor(lotSqft / minSf);
    capacityBasis = baselineUnits === 0
      ? `${zoneName} → 1 DU / ${minSf.toLocaleString()} SF — lot undersized (${Math.round(lotSqft).toLocaleString()} SF)`
      : `${zoneName} → 1 DU / ${minSf.toLocaleString()} SF`;
    capacityConfidence = "source-backed";
  } else if (rxMatch) {
    // RX is not a standard SD zone designation — apply RM-equivalent parsing.
    // Capacity is inferred; verify against SDMC for this specific parcel.
    const minSf = Number(rxMatch[2]) * 1000;
    baselineUnits = Math.floor(lotSqft / minSf);
    capacityBasis = baselineUnits === 0
      ? `${zoneName} → est. 1 DU / ${minSf.toLocaleString()} SF — lot undersized (${Math.round(lotSqft).toLocaleString()} SF) — verify with SDMC`
      : `${zoneName} → est. 1 DU / ${minSf.toLocaleString()} SF — verify with SDMC`;
    capacityConfidence = "inferred";
  }

  const aduCap = sdAduCap(lotSqft);

  // ── Nearby signals ─────────────────────────────────────────────────────────
  const nearbyCount = num(parcel.nearby_project_count);
  const nearbyStrength = nearbyCount >= 5 ? "High" : nearbyCount >= 2 ? "Moderate" : nearbyCount >= 1 ? "Low" : "None";

  // ── Permits ────────────────────────────────────────────────────────────────
  const aduScopePermit = findAduScopePermit(permits);
  const aduDescription = str(aduScopePermit?.description);
  const aduUnits = extractAduCount(aduDescription);
  const sfrUnits = extractSfrCount(aduDescription) || 1;
  const buildingCount = extractBuildingCount(aduDescription);

  const primaryPermit: PermitRecord | null = primaryProject?.has_building_project
    ? {
        permit_number: str(primaryProject.primary_project_id),
        type: str(primaryProject.primary_project_label),
        status: normalizePermitStatus(primaryProject.primary_project_status),
        filed: str(primaryProject.primary_project_opened) || undefined,
        issued: str(primaryProject.primary_project_issued) || undefined,
        last_activity: str(primaryProject.primary_project_last_activity) || undefined,
        applicant: str(primaryProject.primary_project_applicant) || undefined,
        scope: resolvePrimaryScope(primaryProject.primary_project_description),
        description: str(primaryProject.primary_project_description) || undefined,
        confidence: "source-backed",
      }
    : null;

  // ── Proposed project (separate from primary — never merge) ─────────────────
  // Determine scope label: use "units (duplex)" or "units (conversion)" when the
  // count was derived from non-ADU fallback patterns, not the explicit ADU keyword.
  const isDuplexDerived     = aduUnits > 0 && !/\bADU[s']?\b/i.test(aduDescription) && /duplex buildings?/i.test(aduDescription);
  const isConversionDerived = aduUnits > 0 && !/\bADU[s']?\b/i.test(aduDescription) && /conversion[^.;]+to\s+\d+\s+units?/i.test(aduDescription);
  const proposedScopeLabel  = isDuplexDerived
    ? `${aduUnits} units (duplex)${buildingCount > 0 ? ` in ${buildingCount} buildings` : ""}`
    : isConversionDerived
    ? `${aduUnits} units (conversion + detached)${buildingCount > 0 ? ` in ${buildingCount} buildings` : ""}`
    : `${aduUnits} ADUs + ${sfrUnits} SFR${buildingCount > 0 ? ` in ${buildingCount} buildings` : ""}`;

  const proposedProject = aduScopePermit && aduUnits > 0
    ? {
        scope: proposedScopeLabel,
        adu_units: aduUnits,
        sfr_units: sfrUnits,
        building_count: buildingCount,
        confidence: "conditional" as ConfidenceLevel,
        // v1.3: source = specific permit ID that carries this scope
        source: str(aduScopePermit.record_id) || str(aduScopePermit.record_number),
        source_type: str(aduScopePermit.record_type) || undefined,
        note: "Stated project intent from related permit — NOT an approved building project. Verify with city records before treating as current reality.",
        related_permit: {
          permit_number: str(aduScopePermit.record_id) || str(aduScopePermit.record_number),
          type: str(aduScopePermit.record_type),
          status: normalizePermitStatus(aduScopePermit.status),
          filed: str(aduScopePermit.opened_date) || undefined,
          scope: aduDescription.slice(0, 200),
          confidence: "conditional" as ConfidenceLevel,
          note: "Verify with city records.",
        } as PermitRecord,
      }
    : null;

  // ── Conflict detection ─────────────────────────────────────────────────────
  const conflict = detectConflict(primaryProject, proposedProject);

  // ── Permit tree ────────────────────────────────────────────────────────────
  const buildingPermits: PermitTreeNode[] = primaryPermit
    ? [{
        status: primaryPermit.status,
        title: `${primaryPermit.permit_number} — ${primaryPermit.type}`,
        scope: primaryPermit.scope,
        filed: primaryPermit.filed,
        issued: primaryPermit.issued,
        confidence: "source-backed",
      }]
    : [];

  const relatedRecords: PermitTreeNode[] = proposedProject
    ? [{
        status: proposedProject.related_permit.status,
        title: `${proposedProject.related_permit.permit_number} — ${proposedProject.related_permit.type}`,
        scope: `${proposedProject.scope} — conditional`,
        filed: proposedProject.related_permit.filed,
        confidence: "conditional",
        note: "Proposed scope only — not yet an approved building project",
      }]
    : [];

  // Real execution/support records — no stubs
  const execution = buildExecutionNodes(permits);

  // ── Site signals — only what applies ──────────────────────────────────────
  const siteSignals: Array<{ key: string; value: string; confidence: ConfidenceLevel; strength?: string }> = [];
  if (lotSqft > 0) siteSignals.push({ key: "lot_size", value: `${Math.round(lotSqft).toLocaleString()} SF`, confidence: "source-backed" });
  if ((isRs || isRm || isRx) && lotSqft > 0) siteSignals.push({ key: "adu_eligible", value: `Yes — ${zoneName}, ${Math.round(lotSqft).toLocaleString()} SF lot`, confidence: "conditional" });

  // ── Structure — null-safe ──────────────────────────────────────────────────
  const beds = assessorInt(parcel.bedrooms);
  const baths = assessorBaths(parcel.baths);
  const yearBuilt = normalizeYear(parcel.year_effective);
  const livingArea = num(parcel.total_lvg_area);
  const unitCount = assessorInt(parcel.unitqty);

  const structure = {
    // null-safe: never return 0 — UI must hide missing fields entirely
    unit_count: unitCount,
    living_area: livingArea > 0 ? `${Math.round(livingArea).toLocaleString()} SF` : "Unknown",
    year_built: yearBuilt ?? "Unknown",
    bedrooms: beds,
    bathrooms: baths,
    land_value: num(parcel.asr_land),
    improvement_value: num(parcel.asr_impr),
    total_assessed_value: num(parcel.asr_total),
    owner_occupied: (parcel.ownerocc === "Y" ? "yes" : parcel.ownerocc === "N" ? "no" : "unknown") as "yes" | "no" | "unknown",
    land_use: str(parcel.nucleus_use_cd)
      ? `${SD_LAND_USE_CODES[str(parcel.nucleus_use_cd)] ?? `Code ${parcel.nucleus_use_cd}`}`
      : "Unknown",
    confidence: (unitCount != null ? "source-backed" : "inferred") as ConfidenceLevel,
    source: "SanGIS County Assessor",
  };

  // ── Constraints: flags only, no unit math, unknown if not verified ─────────
  const hasVhfhsz = /VHFSZ|VHFHSZ|fire hazard/i.test(str(primaryProject?.primary_project_description)) ||
    permits.some((p) => /VHFSZ|VHFHSZ|fire hazard/i.test(str(p.description)));
  const hasHistoric = /historic determination/i.test(str(primaryProject?.primary_project_description)) ||
    permits.some((p) => /historic determination/i.test(str(p.description)));

  const constraints = {
    overlays: {
      tpa: { status: "Unknown", confidence: "unknown" as ConfidenceLevel },
      sda: { status: "Unknown", confidence: "unknown" as ConfidenceLevel },
      cchs: { status: "Unknown", confidence: "unknown" as ConfidenceLevel },
      ctcac: { status: "Unknown", confidence: "unknown" as ConfidenceLevel },
    },
    regulatory: {
      fire_hazard: {
        status: hasVhfhsz ? "Referenced in permit record" : "Unknown",
        confidence: (hasVhfhsz ? "source-backed" : "unknown") as ConfidenceLevel,
      },
      historic_determination: {
        status: hasHistoric ? "Referenced in permit record" : "Unknown",
        confidence: (hasHistoric ? "source-backed" : "unknown") as ConfidenceLevel,
      },
      coastal_overlay: { status: "Unknown", confidence: "unknown" as ConfidenceLevel },
      esl: { status: "Not verified", confidence: "unknown" as ConfidenceLevel },
      far_coverage: { status: "Verification required", confidence: "unknown" as ConfidenceLevel },
    },
  };

  // ── Opportunity layer — real data only ─────────────────────────────────────
  const opportunityLayer = buildOpportunityLayer(stage, primaryProject, permits, nearbyCount, proposedProject);

  // ── Phase inference ──────────────────────────────────────────────────────
  const phaseResult = inferPhase(primaryProject, permits);

  // ── Jobs to engage ─────────────────────────────────────────────────────────
  const jobsToEngage = buildJobs(stage, parcel, primaryProject);

  // ── Readout summary ────────────────────────────────────────────────────────
  let readoutSummary: string;
  if (stage === "SCALING") {
    readoutSummary = `Site-prep permit active${primaryPermit?.status === "INSPECTION" ? " (inspection phase)" : ""}. ${proposedProject ? `Related permit shows ${proposedProject.scope} — conditional, pending city verification.` : ""}${conflict ? " Scope conflict flagged — see conflict note." : ""}`;
  } else if (stage === "ACTIVE") {
    readoutSummary = `Active construction underway. ${primaryPermit ? `${primaryPermit.type} ${primaryPermit.status === "ISSUED" ? "issued" : "in " + primaryPermit.status.toLowerCase()}.` : ""}`;
  } else if (stage === "EARLY") {
    readoutSummary = "Development intent on record — permit in plan check, no ground broken.";
  } else if (stage === "STALLED") {
    readoutSummary = `Project on record but no activity for ${Math.round(num(primaryProject?.primary_project_days_since_activity))} days. Watch for reactivation.`;
  } else if (stage === "COMPLETE") {
    readoutSummary = "Development complete. Use as comp or stabilization reference.";
  } else {
    readoutSummary = "No active permit activity detected.";
  }

  const fullAddr = buildFullAddress(parcel);

  return {
    development_stage: stage,
    stale_days: staleDays,
    stale_flag: staleFlag,
    phase_result: phaseResult,
    full_address: fullAddr,
    ...(conflict ? { conflict } : {}),
    parcel: {
      address: fullAddr,
      full_address: fullAddr,
      apn: formatApn(apn),
      lot_size: lotSqft > 0 ? `${Math.round(lotSqft).toLocaleString()} SF / ${parcel.lot_area_acres} ac` : "Unknown",
      zoning: zoneName || "Unknown",
      // v1.3: status = normalized stage label (ACTIVE/STALLED/COMPLETE), not raw momentum label
      status: stage === "ACTIVE" || stage === "SCALING" ? "ACTIVE"
        : stage === "STALLED" ? "STALLED"
        : stage === "COMPLETE" ? "COMPLETE"
        : stage === "EARLY" ? "EARLY"
        : "INACTIVE",
      community: str(parcel.situs_community) || undefined,
      // v1.3 canonical: geo object + lot_size_sf (number)
      // Legacy fields kept until Codex UI migrates to v1.3 field names
      geo: {
        lat: typeof parcel.lat === "number" ? parcel.lat : null,
        lng: typeof parcel.lng === "number" ? parcel.lng : null,
      },
      lot_size_sf: Math.round(lotSqft) || null,
      latitude: typeof parcel.lat === "number" ? parcel.lat : undefined,
      longitude: typeof parcel.lng === "number" ? parcel.lng : undefined,
    },
    readout: {
      summary: readoutSummary,
      signals: [
        ...(stage === "ACTIVE" || stage === "SCALING" ? [{ key: "active_construction", value: "Active", confidence: "source-backed" as ConfidenceLevel }] : []),
        ...(conflict ? [{ key: "scope_conflict", value: "Primary permit ≠ proposed scope — see conflict note", confidence: "source-backed" as ConfidenceLevel }] : []),
        ...(proposedProject ? [{ key: "proposed_project", value: proposedProject.scope, confidence: "conditional" as ConfidenceLevel }] : []),
        ...(parcel.absentee_owner === true ? [{ key: "absentee_owner", value: "Absentee owner", confidence: "source-backed" as ConfidenceLevel }] : []),
        ...(nearbyCount > 0 ? [{ key: "nearby_activity", value: `${nearbyCount} nearby projects (${nearbyStrength})`, confidence: "inferred" as ConfidenceLevel }] : []),
      ],
    },
    project: {
      primary_permit: primaryPermit ?? {
        permit_number: "none",
        type: "None",
        status: "IN REVIEW",
        scope: "No active permit on file",
        confidence: "source-backed",
      },
      proposed_project: proposedProject ?? {
        scope: "No proposed project scope detected",
        adu_units: 0,
        sfr_units: 0,
        building_count: 0,
        confidence: "unknown",
        related_permit: { permit_number: "none", type: "none", status: "IN REVIEW", scope: "none", confidence: "unknown" },
      },
      permit_tree: { building: buildingPermits, related_records: relatedRecords, execution },
      timeline: {
        filed: str(primaryProject?.primary_project_opened) || null,
        issued: str(primaryProject?.primary_project_issued) || null,
        last_activity: str(primaryProject?.primary_project_last_activity) || null,
        // field_activity: string for UI display; field_activity_confidence for badge
        field_activity: execution.length > 0
          ? "Active — inspection/execution permit on file"
          : stage === "ACTIVE" || stage === "SCALING"
          ? "Active (stage signal)"
          : "None detected",
        field_activity_confidence: (execution.length > 0 ? "source-backed" : "inferred") as ConfidenceLevel,
      },
    },
    capacity: {
      baseline_units: {
        units: baselineUnits,
        basis: baselineUnits === 0 && (isRs || isRm || isRx)
          ? capacityBasis  // already includes "undersized" note
          : `${capacityBasis}${(isRs || isRm || isRx) ? " + standard ADU allowances" : ""}`,
        confidence: capacityConfidence,
        source: "SDMC",
      },
      adu_upside_units: (isRs || isRm || isRx)
        ? {
            units: aduCap.total,
            basis: `SD ADU program — lot ${lotSqft > 10000 ? ">10,000 SF" : ">8,000 SF"} → 1 SDU + up to ${aduCap.maxAdu} ADU/JADU (SD IB-400)`,
            confidence: "conditional",
            source: "SD IB-400",
          }
        : {
            units: 0,
            basis: "ADU program applicability not verified for this zone",
            confidence: "unknown",
            source: "",
          },
    },
    signals: {
      site: siteSignals,
      market: nearbyCount > 0
        ? [{ key: "nearby_activity", value: `${nearbyCount} nearby projects`, strength: nearbyStrength, confidence: "inferred" as ConfidenceLevel }]
        : [],
      owner: parcel.absentee_owner === true
        ? [{ key: "absentee_owner", value: "Yes", confidence: "source-backed" as ConfidenceLevel }]
        : [],
    },
    context: {
      nearby_development: {
        total_nearby: nearbyCount,
        active: num(parcel.nearby_active_count),
        completed: num(parcel.nearby_completed_count),
        stalled: num(parcel.nearby_stalled_count),
        nearest_completed: parcel.nearest_completed_distance_ft
          ? `${Math.round(num(parcel.nearest_completed_distance_ft))} ft`
          : "Unknown",
        signal_strength: nearbyStrength,
      },
    },
    structure,
    constraints,
    opportunity_layer: opportunityLayer,
    confidence: {
      "source-backed": "Direct parcel, assessor, permit, or published planning source",
      inferred: "Derived from permit patterns, proximity, or market signals",
      conditional: "Possible only if program rules / city verification / constraints are satisfied",
      unknown: "Not verified in available source material",
    },
    jobs_to_engage: jobsToEngage,
  };
}

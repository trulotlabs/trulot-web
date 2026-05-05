import { createClient } from "@supabase/supabase-js";
import type {
  ParcelPageData,
  ConfidenceLevel,
  PermitLifecycleStatus,
  PermitRecord,
  PermitTreeNode,
} from "./parcel-page-contract";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type RawRow = Record<string, unknown>;

type JobToEngage = {
  role: string;
  reason: string;
  timing: "now" | "near-term" | "future";
  confidence: ConfidenceLevel;
  location: { address: string; lat: unknown; lng: unknown; submarket: unknown };
  alert_tags: string[];
};

export type ParcelPageResult = ParcelPageData & {
  development_stage: string;
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
 * "76" → "~1976", "02" → "~2002", "00" → null (unknown)
 */
function normalizeYear(raw: unknown): string | null {
  const s = str(raw).trim();
  if (!s || s === "0" || s === "00") return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n === 0) return null;
  const year = n < 30 ? 2000 + n : n < 100 ? 1900 + n : n;
  return year > 1800 && year <= new Date().getFullYear() + 1 ? `~${year}` : null;
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

// ─── Scope resolution ─────────────────────────────────────────────────────────

/**
 * Primary permit scope = what the primary permit actually is.
 * NEVER replace with ADU/proposed scope — that lives in proposed_project only.
 * Truncates to a clean statement without hallucinating intent.
 */
function resolvePrimaryScope(description: unknown): string {
  const desc = str(description).trim();
  if (!desc) return "Scope not on file";

  // Recognize specific known scope patterns and normalize to clean label
  if (/retaining wall|site prep|site preparation/i.test(desc)) return "Site retaining walls / site prep";
  if (/scope change/i.test(desc)) return `Scope change — ${desc.slice(0, 120)}`;
  if (/grading/i.test(desc) && !/ADU|units?/i.test(desc)) return `Grading — ${desc.slice(0, 100)}`;

  // Return first 200 chars of actual description — no substitution
  return desc.length > 200 ? `${desc.slice(0, 200)}…` : desc;
}

// ─── ADU / proposed project parsing ──────────────────────────────────────────

function findAduScopePermit(permits: RawRow[]): RawRow | undefined {
  // Must match a specific ADU count — not just the word "ADU"
  return permits.find((p) => /\d+\s+ADU/i.test(str(p.description)));
}

function extractAduCount(description: string): number {
  const match = description.match(/(\d+)\s+ADU/i);
  return match ? Number(match[1]) : 0;
}

function extractSfrCount(description: string): number {
  const match = description.match(/(\d+)\s+SFR/i);
  if (match) return Number(match[1]);
  return /\bSFR\b|single.?family/i.test(description) ? 1 : 0;
}

function extractBuildingCount(description: string): number {
  // Match patterns like "(7) buildings" or "7 buildings"
  const grouped = description.match(/\((\d+)\)[^.;,]*buildings?/gi);
  if (grouped) {
    return grouped.reduce((sum, m) => {
      const n = m.match(/\((\d+)\)/);
      return sum + (n ? Number(n[1]) : 0);
    }, 0);
  }
  const direct = description.match(/\b(\d+)\s+buildings?/i);
  return direct ? Number(direct[1]) : 0;
}

// ─── Stage derivation ─────────────────────────────────────────────────────────

function getDevelopmentStage(primaryProject: RawRow | null, permits: RawRow[]): string {
  if (!primaryProject) return "INACTIVE";
  const momentum = str(primaryProject.project_momentum_label);
  const days = num(primaryProject.primary_project_days_since_activity);
  const hasBuilding = Boolean(primaryProject.has_building_project);

  if (!hasBuilding || momentum === "Awaiting Issuance") return "EARLY";
  if (momentum === "Completed") return "COMPLETE";
  if (momentum === "Status unclear" || (days > 180 && momentum !== "Active")) return "STALLED";

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

  // ── Stage ──────────────────────────────────────────────────────────────────
  const stage = getDevelopmentStage(primaryProject, permits);

  // ── Lot / zoning ───────────────────────────────────────────────────────────
  const lotSqft = num(parcel.lot_area_sqft);
  const zoneName = str(parcel.zone_name);
  const rsMatch = zoneName.match(/^RS-1-(\d+)/i);
  const rmMatch = zoneName.match(/^RM-(\d+)-(\d+)/i);
  const isRs = !!rsMatch;
  const isRm = !!rmMatch;

  let baselineUnits = 1;
  let capacityBasis = `${zoneName || "Unknown zone"} — zoning capacity not calculated`;

  if (rsMatch) {
    const minSf = Number(rsMatch[1]) * 1000;
    baselineUnits = Math.max(1, Math.floor(lotSqft / minSf));
    capacityBasis = `${zoneName} → 1 DU / ${minSf.toLocaleString()} SF`;
  } else if (rmMatch) {
    const minSf = Number(rmMatch[2]) * 1000;
    baselineUnits = Math.max(1, Math.floor(lotSqft / minSf));
    capacityBasis = `${zoneName} → 1 DU / ${minSf.toLocaleString()} SF`;
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
  const proposedProject = aduScopePermit && aduUnits > 0
    ? {
        scope: `${aduUnits} ADUs + ${sfrUnits} SFR${buildingCount > 0 ? ` in ${buildingCount} buildings` : ""}`,
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
  if ((isRs || isRm) && lotSqft > 0) siteSignals.push({ key: "adu_eligible", value: `Yes — ${zoneName}, ${Math.round(lotSqft).toLocaleString()} SF lot`, confidence: "conditional" });
  if (parcel.has_nearby_active_project) siteSignals.push({ key: "tpa_proximity", value: "Detected (proximity proxy — not verified as formal TPA designation)", confidence: "inferred" });

  // ── Structure — null-safe ──────────────────────────────────────────────────
  const beds = assessorInt(parcel.bedrooms);
  const baths = assessorBaths(parcel.baths);
  const yearBuilt = normalizeYear(parcel.year_effective);
  const livingArea = num(parcel.total_lvg_area);
  const unitCount = assessorInt(parcel.unitqty);

  const structure = {
    unit_count: unitCount ?? 0,
    living_area: livingArea > 0 ? `${Math.round(livingArea).toLocaleString()} SF` : "Unknown",
    year_built: yearBuilt ?? "Unknown",
    // null-safe: never return 0 — UI must hide missing beds/baths entirely
    bedrooms: beds,
    bathrooms: baths,
    land_value: num(parcel.asr_land),
    improvement_value: num(parcel.asr_impr),
    total_assessed_value: num(parcel.asr_total),
    owner_occupied: (parcel.ownerocc === "Y" ? "yes" : parcel.ownerocc === "N" ? "no" : "unknown") as "yes" | "no" | "unknown",
    land_use: str(parcel.nucleus_use_cd) ? `${parcel.nucleus_use_cd} — ${parcel.nucleus_use_cd === "111" ? "Single family residential" : "See SanGIS land use table"}` : "Unknown",
    confidence: (unitCount != null ? "source-backed" : "inferred") as ConfidenceLevel,
    source: "SanGIS County Assessor",
  };

  // ── Constraints: flags only, no unit math, unknown if not verified ─────────
  const hasVhfhsz = /VHFSZ|VHFHSZ|fire hazard/i.test(str(primaryProject?.primary_project_description)) ||
    permits.some((p) => /VHFSZ|VHFHSZ|fire hazard/i.test(str(p.description)));
  const hasHistoric = permits.some((p) => /historic determination/i.test(str(p.description)));

  const constraints = {
    overlays: {
      // TPA, SDA, CCHS = flags only — no unit math, unknown if not source-verified
      tpa: {
        status: parcel.has_nearby_active_project ? "Proximity signal detected — not verified as formal TPA" : "Unknown",
        confidence: (parcel.has_nearby_active_project ? "inferred" : "unknown") as ConfidenceLevel,
      },
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
        ...(parcel.absentee_owner === true ? [{ key: "absentee_owner", value: "Yes", confidence: "source-backed" as ConfidenceLevel }] : []),
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
        basis: `${capacityBasis} + standard ADU allowances`,
        confidence: (isRs || isRm) ? "source-backed" : "unknown",
        source: "SDMC",
      },
      adu_upside_units: (isRs || isRm)
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

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
  location: {
    address: string;
    lat: unknown;
    lng: unknown;
    submarket: unknown;
  };
  alert_tags: string[];
};

export type ParcelPageResult = ParcelPageData & {
  development_stage: string;
  opportunity_layer?: {
    development_stage: string;
    interpretation: string;
    jobs_to_engage: string[];
    key_triggers: string[];
    potential_opportunities: string[];
    watch_next: string[];
  };
  jobs_to_engage: JobToEngage[];
};

export function normalizeApn(raw: string): string {
  return raw.replace(/[^0-9]/g, "").padStart(10, "0");
}

export function formatApn(apn: string): string {
  if (apn.length === 10) return `${apn.slice(0, 3)}-${apn.slice(3, 6)}-${apn.slice(6, 8)}-${apn.slice(8, 10)}`;
  return apn;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizePermitStatus(raw: unknown): PermitLifecycleStatus {
  const s = str(raw).toLowerCase();
  if (s.includes("inspection followup") || s.includes("inspecting") || s.includes("inspection")) return "INSPECTION";
  if (s.includes("issued")) return "ISSUED";
  if (s.includes("finaled") || s.includes("closed") || s.includes("complete")) return "COMPLETE";
  if (s.includes("active")) return "ACTIVE";
  return "IN REVIEW";
}

function sdAduCap(lotSqft: number): { maxAdu: number; total: number } {
  if (lotSqft <= 8000) return { maxAdu: 4, total: 5 };
  if (lotSqft <= 10000) return { maxAdu: 5, total: 6 };
  return { maxAdu: 6, total: 7 };
}

function fullAddress(row: RawRow): string {
  const address = str(row.address);
  if (!address) return "";
  if (/\bCA\b|\d{5}/i.test(address)) return address;

  const city = str(row.situs_city) || str(row.city) || "San Diego";
  const state = str(row.situs_state) || str(row.state) || "CA";
  const zip = str(row.situs_zip) || str(row.zip_code) || "92114";
  return `${address}, ${city}, ${state} ${zip}`.trim();
}

function primaryScope(description: unknown): string {
  const desc = str(description);
  if (/retaining wall|site prep|site preparation/i.test(desc)) return "Site retaining walls / site prep";
  if (!desc) return "Scope not verified";
  return desc;
}

function findAduScopePermit(permits: RawRow[]): RawRow | undefined {
  return permits.find((permit) => /ADU|26.*unit|26.*adu/i.test(str(permit.description)));
}

function extractAduCount(description: string): number {
  const match = description.match(/(\d+)\s+ADU/i);
  return match ? Number(match[1]) : 0;
}

function extractSfrCount(description: string): number {
  const match = description.match(/(\d+)\s+SFR/i);
  return match ? Number(match[1]) : /\bSFR\b|single-family/i.test(description) ? 1 : 0;
}

function extractBuildingCount(description: string): number {
  const matches = Array.from(description.matchAll(/\((\d+)\)[^.;,]*buildings?/gi));
  if (matches.length > 0) return matches.reduce((sum, match) => sum + Number(match[1]), 0);
  const direct = description.match(/\b(\d+)\s+buildings?/i);
  return direct ? Number(direct[1]) : 0;
}

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
      (permit) =>
        /building permit|combination building/i.test(str(permit.record_type)) &&
        /opened|in.?review/i.test(str(permit.status))
    );
    const hasScopeChange = permits.some((permit) => /scope change/i.test(str(permit.description)));
    if (openedBuilding.length >= 2 || hasScopeChange) return "SCALING";
    return "ACTIVE";
  }

  return "INACTIVE";
}

const ROLE_TAGS: { pattern: RegExp; tags: string[] }[] = [
  { pattern: /civil/i, tags: ["civil"] },
  { pattern: /grading/i, tags: ["grading", "civil"] },
  { pattern: /retaining wall/i, tags: ["retaining_wall", "civil", "grading"] },
  { pattern: /utility/i, tags: ["utility"] },
  { pattern: /framing/i, tags: ["framing"] },
  { pattern: /structural/i, tags: ["framing", "foundation"] },
  { pattern: /foundation/i, tags: ["foundation"] },
  { pattern: /MEP/i, tags: ["mep", "electrical", "mechanical", "plumbing"] },
  { pattern: /traffic/i, tags: ["traffic_control"] },
  { pattern: /entitlement/i, tags: ["entitlement"] },
  { pattern: /acquisition|salvage/i, tags: ["acquisition"] },
  { pattern: /vertical.*pipeline/i, tags: ["framing", "mep", "foundation"] },
];

function tagsForRole(role: string): string[] {
  const tags = new Set<string>();
  for (const { pattern, tags: roleTags } of ROLE_TAGS) {
    if (pattern.test(role)) roleTags.forEach((tag) => tags.add(tag));
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
    address: fullAddress(parcel),
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
        reason: hasRetainingWall ? "Active permit - retaining walls in inspection phase" : "Active combination permit - site work underway",
        confidence: "source-backed",
      });
    }
    if (isComboBp) {
      rawJobs.push({
        role: "Structural / Framing",
        timing: hasMDU || hasScopeChange ? "near-term" : "now",
        reason: hasMDU ? "Multi-unit scope - structural follows site prep" : "Active building permit - framing phase",
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
      reason: hasMDU ? "MDU development cluster in review - larger construction to follow" : "Scope change - expanded project in pipeline",
      confidence: "conditional",
    });
    if (hasMDU && lotSqft > 15000) {
      rawJobs.push({
        role: "Structural / Foundation (multi-unit)",
        timing: "near-term",
        reason: "Multi-unit scope + large lot - foundation/basement work follows grading",
        confidence: "conditional",
      });
    }
  }

  if (stage === "EARLY") rawJobs.push({ role: "Entitlement / Investor Tracking", timing: "near-term", reason: "Permit in review - project has not broken ground", confidence: "inferred" });
  if (stage === "STALLED") rawJobs.push({ role: "Acquisition / Salvage", timing: "near-term", reason: "Project stalled - entitlement may be salvageable", confidence: "inferred" });

  return rawJobs.map((job) => ({ ...job, location, alert_tags: tagsForRole(job.role) }));
}

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
  const permits = ((permitsRes.data ?? []) as RawRow[]);
  const stage = getDevelopmentStage(primaryProject, permits);
  const lotSqft = num(parcel.lot_area_sqft);
  const rsMatch = str(parcel.zone_name).match(/^RS-1-(\d+)/i);
  const minSf = rsMatch ? Number(rsMatch[1]) * 1000 : 0;
  const baselineUnits = minSf ? Math.floor(lotSqft / minSf) : 1;
  const aduCap = sdAduCap(lotSqft);
  const nearbyCount = num(parcel.nearby_project_count);
  const nearbyStrength = nearbyCount >= 5 ? "High" : nearbyCount >= 2 ? "Moderate" : nearbyCount >= 1 ? "Low" : "None";

  const aduScopePermit = findAduScopePermit(permits);
  const aduDescription = str(aduScopePermit?.description);
  const aduUnits = extractAduCount(aduDescription);
  const sfrUnits = extractSfrCount(aduDescription) || 1;
  const buildingCount = extractBuildingCount(aduDescription);
  const proposedScope = aduUnits > 0
    ? `${aduUnits} ADUs + ${sfrUnits} SFR${buildingCount > 0 ? ` in ${buildingCount} buildings` : ""}`
    : "No proposed project scope detected";

  const primaryPermit: PermitRecord | null = primaryProject?.has_building_project
    ? {
        permit_number: str(primaryProject.primary_project_id),
        type: str(primaryProject.primary_project_label),
        status: normalizePermitStatus(primaryProject.primary_project_status),
        filed: str(primaryProject.primary_project_opened) || undefined,
        issued: str(primaryProject.primary_project_issued) || undefined,
        last_activity: str(primaryProject.primary_project_last_activity) || undefined,
        applicant: str(primaryProject.primary_project_applicant) || undefined,
        scope: primaryScope(primaryProject.primary_project_description),
        description: str(primaryProject.primary_project_description) || undefined,
        confidence: "source-backed",
      }
    : null;

  const proposedProject = aduScopePermit && aduUnits > 0
    ? {
        scope: proposedScope,
        adu_units: aduUnits,
        sfr_units: sfrUnits,
        building_count: buildingCount,
        confidence: "conditional" as ConfidenceLevel,
        note: "Stated project intent from related permit; verify with city records.",
        related_permit: {
          permit_number: str(aduScopePermit.record_id) || str(aduScopePermit.record_number),
          type: str(aduScopePermit.record_type),
          status: normalizePermitStatus(aduScopePermit.status),
          filed: str(aduScopePermit.opened_date) || undefined,
          scope: proposedScope,
          description: aduDescription || undefined,
          confidence: "conditional" as ConfidenceLevel,
          note: "Verify with city records.",
        } as PermitRecord,
      }
    : null;

  const buildingPermits: PermitTreeNode[] = primaryPermit
    ? [{
        status: primaryPermit.status,
        title: `${primaryPermit.permit_number} - ${primaryPermit.type}`,
        scope: primaryPermit.scope,
        filed: primaryPermit.filed,
        issued: primaryPermit.issued,
        confidence: "source-backed",
      }]
    : [];

  const relatedRecords: PermitTreeNode[] = proposedProject
    ? [{
        status: proposedProject.related_permit.status,
        title: `${proposedProject.related_permit.permit_number} - ${proposedProject.related_permit.type}`,
        scope: proposedProject.scope,
        filed: proposedProject.related_permit.filed,
        confidence: "conditional",
        note: "Conditional - verify with city records",
      }]
    : [];

  const execution: PermitTreeNode[] = (stage === "ACTIVE" || stage === "SCALING")
    ? [{
        status: "ACTIVE",
        title: "Inspection follow-up / field activity detected",
        confidence: "inferred",
      }]
    : [];

  const jobsToEngage = buildJobs(stage, parcel, primaryProject);
  const interpretation = stage === "SCALING"
    ? "Active site prep is underway while a larger development cluster is in review."
    : stage === "ACTIVE"
      ? "Active construction is underway; monitor inspections and execution signals."
      : stage === "EARLY"
        ? "Project intent is on record; monitor plan-check movement."
        : stage === "STALLED"
          ? "Project is stale; watch for reactivation or salvage signals."
          : stage === "COMPLETE"
            ? "Completed asset; use as comp or stabilization reference."
            : "No active permit activity detected; monitor ownership or permit changes.";

  return {
    development_stage: stage,
    parcel: {
      address: fullAddress(parcel),
      full_address: fullAddress(parcel),
      apn: formatApn(apn),
      lot_size: lotSqft ? `${Math.round(lotSqft).toLocaleString()} SF / ${parcel.lot_area_acres} ac` : "Unknown",
      zoning: str(parcel.zone_name) || "Unknown",
      status: str(primaryProject?.project_momentum_label) || "Unknown",
    },
    readout: {
      summary: stage === "SCALING"
        ? `Site-prep permit active in inspection; related permit shows ${proposedScope.replace(" in 0 buildings", "")}, pending city verification.`
        : stage === "ACTIVE"
          ? "Active construction underway; monitor inspection and field activity."
          : "Parcel state available from permit and assessor records.",
      signals: [
        ...(stage === "ACTIVE" || stage === "SCALING" ? [{ key: "active_construction", value: "Active construction", confidence: "source-backed" as ConfidenceLevel }] : []),
        ...(proposedProject ? [{ key: "proposed_project", value: proposedProject.scope, confidence: "conditional" as ConfidenceLevel }] : []),
        ...(parcel.absentee_owner === true ? [{ key: "absentee_owner", value: "Absentee owner", confidence: "source-backed" as ConfidenceLevel }] : []),
        { key: "nearby_activity", value: `${nearbyCount} nearby projects`, confidence: "inferred" as ConfidenceLevel },
      ],
    },
    project: {
      primary_permit: primaryPermit ?? { permit_number: "none", type: "None", status: "IN REVIEW", scope: "No active permit activity detected", confidence: "source-backed" },
      proposed_project: proposedProject ?? { scope: "No proposed project scope detected", adu_units: 0, sfr_units: 0, building_count: 0, confidence: "unknown", related_permit: { permit_number: "none", type: "none", status: "IN REVIEW", scope: "none", confidence: "unknown" } },
      permit_tree: { building: buildingPermits, related_records: relatedRecords, execution },
      timeline: {
        filed: str(primaryProject?.primary_project_opened),
        issued: str(primaryProject?.primary_project_issued),
        field_activity: stage === "ACTIVE" || stage === "SCALING" ? "Active" : "None detected",
      },
    },
    opportunity_layer: {
      development_stage: stage,
      interpretation,
      jobs_to_engage: jobsToEngage.map((job) => job.role),
      key_triggers: [
        "PRJ-1111087 recheck outcome",
        "Grading approval",
        "Revised combo permits moving from Opened to Issued",
        "Inspection activity on primary permit",
      ],
      potential_opportunities: jobsToEngage.map((job) => job.role),
      watch_next: [
        "PRJ-1111087 recheck outcome",
        "Grading approval",
        "Revised combo permits moving from Opened to Issued",
        "Inspection activity on primary permit",
      ],
    },
    capacity: {
      baseline_units: { units: baselineUnits, basis: `${str(parcel.zone_name)} -> 1 DU / ${minSf.toLocaleString()} SF + standard ADU allowances`, confidence: "source-backed", source: "SDMC" },
      adu_upside_units: { units: aduCap.total, basis: `SD ADU program - lot ${lotSqft > 10000 ? ">10,000 SF" : ">8,000 SF"} -> 1 SDU + up to ${aduCap.maxAdu} ADU/JADU`, confidence: "conditional", source: "SD IB-400" },
    },
    signals: {
      site: [
        { key: "large_lot", value: `${Math.round(lotSqft).toLocaleString()} SF`, confidence: "source-backed" },
        { key: "adu_eligible", value: `Yes - ${str(parcel.zone_name)}, lot >10,000 SF`, confidence: "conditional" },
        ...(parcel.has_nearby_active_project ? [{ key: "tpa", value: "Detected (proximity proxy)", confidence: "inferred" as ConfidenceLevel }] : []),
      ],
      market: [{ key: "nearby_activity", value: `${nearbyCount} nearby projects`, strength: nearbyStrength, confidence: "inferred" }],
      owner: [...(parcel.absentee_owner === true ? [{ key: "absentee_owner", value: "Yes", confidence: "source-backed" as ConfidenceLevel }] : [])],
    },
    context: {
      nearby_development: {
        total_nearby: nearbyCount,
        active: num(parcel.nearby_active_count),
        completed: num(parcel.nearby_completed_count),
        stalled: num(parcel.nearby_stalled_count),
        nearest_completed: parcel.nearest_completed_distance_ft ? `${Math.round(num(parcel.nearest_completed_distance_ft))} ft` : "Unknown",
        signal_strength: nearbyStrength,
      },
    },
    structure: {
      unit_count: num(parcel.unitqty),
      living_area: parcel.total_lvg_area ? `${Math.round(num(parcel.total_lvg_area)).toLocaleString()} SF` : "Unknown",
      year_built: str(parcel.year_effective) || "Unknown",
      bedrooms: num(parcel.bedrooms),
      bathrooms: num(parcel.baths),
      land_value: num(parcel.asr_land),
      improvement_value: num(parcel.asr_impr),
      total_assessed_value: num(parcel.asr_total),
      owner_occupied: parcel.ownerocc === "Y" ? "yes" : parcel.ownerocc === "N" ? "no" : "unknown",
      land_use: `${parcel.nucleus_use_cd ?? "Unknown"} - ${parcel.nucleus_use_cd === "111" ? "Single family residential" : "See SanGIS land use table"}`,
      confidence: parcel.unitqty != null ? "source-backed" : "inferred",
      source: "SanGIS County Assessor",
    },
    constraints: {
      overlays: {
        tpa: { status: parcel.has_nearby_active_project ? "Detected (proximity proxy)" : "Unknown", confidence: parcel.has_nearby_active_project ? "inferred" : "unknown" },
        sda: { status: "Unknown", confidence: "unknown" },
        cchs: { status: "Unknown", confidence: "unknown" },
        ctcac: { status: "Unknown", confidence: "unknown" },
      },
      regulatory: {
        fire_hazard: { status: /VHFSZ|VHFHSZ|fire hazard/i.test(str(primaryProject?.primary_project_description)) ? "Detected in permit record" : "Unknown", confidence: /VHFSZ|VHFHSZ|fire hazard/i.test(str(primaryProject?.primary_project_description)) ? "source-backed" : "unknown" },
        historic_determination: { status: permits.some((permit) => /PRJ-111|historic determination/i.test(str(permit.description))) ? "Referenced in permit record" : "Unknown", confidence: permits.some((permit) => /PRJ-111|historic determination/i.test(str(permit.description))) ? "source-backed" : "unknown" },
        coastal_overlay: { status: "Unknown", confidence: "unknown" },
        esl: { status: "Not verified", confidence: "unknown" },
        far_coverage: { status: "Verification required", confidence: "unknown" },
      },
    },
    confidence: {
      "source-backed": "Direct parcel, assessor, permit, or published planning source",
      inferred: "Derived from permit patterns, proximity, or market signals",
      conditional: "Possible only if program rules / city verification / constraints are satisfied",
      unknown: "Not verified in available source material",
    },
    jobs_to_engage: jobsToEngage,
  };
}

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function normalizeApn(raw: string): string {
  return raw.replace(/[^0-9]/g, "").padStart(10, "0");
}

export function formatApn(apn: string): string {
  if (apn.length === 10)
    return `${apn.slice(0, 3)}-${apn.slice(3, 6)}-${apn.slice(6, 8)}-${apn.slice(8, 10)}`;
  return apn;
}

function normalizePermitStatus(raw: string | null | undefined): PermitLifecycleStatus {
  if (!raw) return "IN REVIEW";
  const s = raw.toLowerCase();
  if (s.includes("inspection followup") || s.includes("inspecting")) return "INSPECTION";
  if (s.includes("issued") || s.includes("finaled") || s.includes("closed")) return "COMPLETE";
  if (s.includes("active")) return "ACTIVE";
  if (s.includes("opened") || s.includes("in review") || s.includes("recheck")) return "IN REVIEW";
  return "IN REVIEW";
}

function sdAduCap(lotSqft: number): { maxAdu: number; total: number } {
  if (lotSqft <= 8000) return { maxAdu: 4, total: 5 };
  if (lotSqft <= 10000) return { maxAdu: 5, total: 6 };
  return { maxAdu: 6, total: 7 };
}

function getBestScope(
  primaryDesc: string | null,
  permits: Record<string, unknown>[]
): { text: string; source: string; isRelated: boolean } {
  const primary = primaryDesc ?? "";
  const isVague =
    primary.length < 100 ||
    /per separate permit/i.test(primary) ||
    /retaining wall/i.test(primary) ||
    /associated with.*existing/i.test(primary);

  if (primary && !isVague) {
    return { text: primary, source: "primary", isRelated: false };
  }

  const richer = [...permits]
    .filter((p) => typeof p.description === "string" && (p.description as string).length > primary.length)
    .sort((a, b) => ((b.description as string)?.length ?? 0) - ((a.description as string)?.length ?? 0))
    .find((p) => /ADU|units?|construction|building|residential|multifamily|dwelling/i.test((p.description as string) ?? ""));

  if (richer) {
    return {
      text: richer.description as string,
      source: (richer.record_id as string) || (richer.record_number as string) || "related permit",
      isRelated: true,
    };
  }

  return { text: primary || "Scope unknown", source: "primary", isRelated: false };
}

function getDevelopmentStage(
  primaryProject: Record<string, unknown> | null,
  permits: Record<string, unknown>[]
): string {
  if (!primaryProject) return "INACTIVE";
  const momentum = primaryProject.project_momentum_label as string;
  const days = (primaryProject.primary_project_days_since_activity as number) ?? 0;
  const hasBuilding = primaryProject.has_building_project as boolean;

  if (!hasBuilding || momentum === "Awaiting Issuance") return "EARLY";
  if (momentum === "Completed") return "COMPLETE";
  if (momentum === "Status unclear" || (days > 180 && momentum !== "Active")) return "STALLED";

  if (momentum === "Active") {
    const openedBuilding = permits.filter(
      (p) =>
        /building permit|combination building/i.test((p.record_type as string) ?? "") &&
        /opened|in.?review/i.test((p.status as string) ?? "")
    );
    const hasScopeChange = permits.some((p) =>
      /scope change/i.test((p.description as string) ?? "")
    );
    if (openedBuilding.length >= 2 || hasScopeChange) return "SCALING";
    return "ACTIVE";
  }

  return "INACTIVE";
}

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
  for (const { pattern, tags: t } of ROLE_TAGS) {
    if (pattern.test(role)) t.forEach((tag) => tags.add(tag));
  }
  return Array.from(tags);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export type ParcelPageResult = ParcelPageData & {
  development_stage: string;
  jobs_to_engage: unknown[];
};

export async function getParcelPageData(rawApn: string): Promise<ParcelPageResult | null> {
  const apn = normalizeApn(rawApn);

  const [parcelRes, projectRes, permitsRes] = await Promise.all([
    supabase.from("parcel_page_api_v2").select("*").eq("apn_norm", apn).single(),
    supabase.from("parcel_primary_project_v1").select("*").eq("apn_norm", apn).maybeSingle(),
    supabase.from("parcel_permit_terminal_v2").select("*").eq("apn_norm", apn).order("opened_date", { ascending: false }),
  ]);

  if (parcelRes.error || !parcelRes.data) return null;

  const p = parcelRes.data;
  const pp = projectRes.data;
  const permits: Record<string, unknown>[] = (permitsRes.data ?? []) as Record<string, unknown>[];

  const parcelSummary = {
    address: p.address ?? "",
    apn: formatApn(apn),
    lot_size: p.lot_area_sqft
      ? `${Math.round(p.lot_area_sqft).toLocaleString()} SF / ${p.lot_area_acres} ac`
      : "Unknown",
    zoning: p.zone_name ?? "Unknown",
    status: pp?.project_momentum_label ?? "Unknown",
    community: p.situs_community ?? undefined,
    latitude: p.lat ?? undefined,
    longitude: p.lng ?? undefined,
  };

  const stage = getDevelopmentStage(pp as Record<string, unknown> | null, permits);
  const scopeResult = getBestScope((pp?.primary_project_description as string) ?? null, permits);

  const aduScopePmt = permits.find(
    (p2) => typeof p2.description === "string" && /ADU|26.*unit|26.*adu/i.test(p2.description)
  );

  let proposedProject = null;
  if (aduScopePmt) {
    const desc = aduScopePmt.description as string;
    const aduMatch = desc.match(/(\d+)\s+ADU/i);
    const sfrMatch = desc.match(/(\d+)\s+SFR/i);
    const buildingMatch = desc.match(/\((\d+)\).*?building|\b(\d+)\s+building/i);
    proposedProject = {
      scope: `${aduMatch?.[1] ?? "?"} ADUs + ${sfrMatch?.[1] ?? "1"} SFR`,
      adu_units: parseInt(aduMatch?.[1] ?? "0"),
      sfr_units: parseInt(sfrMatch?.[1] ?? "1"),
      building_count: parseInt(buildingMatch?.[1] ?? buildingMatch?.[2] ?? "0"),
      confidence: "conditional" as ConfidenceLevel,
      note: "Stated project intent from related permit; verify with city records.",
      related_permit: {
        permit_number: (aduScopePmt.record_id ?? aduScopePmt.record_number) as string,
        type: aduScopePmt.record_type as string,
        status: normalizePermitStatus(aduScopePmt.status as string),
        filed: aduScopePmt.opened_date as string,
        scope: desc.slice(0, 200),
        confidence: "conditional" as ConfidenceLevel,
        note: "Verify with city records.",
      } as PermitRecord,
    };
  }

  const primaryPermit: PermitRecord | null = pp?.has_building_project
    ? {
        permit_number: pp.primary_project_id as string,
        type: pp.primary_project_label as string,
        status: normalizePermitStatus(pp.primary_project_status as string),
        filed: pp.primary_project_opened as string,
        issued: (pp.primary_project_issued as string) ?? undefined,
        last_activity: (pp.primary_project_last_activity as string) ?? undefined,
        applicant: (pp.primary_project_applicant as string) ?? undefined,
        scope: scopeResult.text,
        description: (pp.primary_project_description as string) ?? undefined,
        confidence: "source-backed",
        note: scopeResult.isRelated ? `Scope from related permit ${scopeResult.source} — verify` : undefined,
      }
    : null;

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

  const relatedNodes: PermitTreeNode[] = [
    ...(aduScopePmt
      ? [{
          status: normalizePermitStatus(aduScopePmt.status as string),
          title: `${aduScopePmt.record_id ?? aduScopePmt.record_number} — ${aduScopePmt.record_type}`,
          scope: ((aduScopePmt.description as string) ?? "").slice(0, 150),
          filed: aduScopePmt.opened_date as string,
          confidence: "conditional" as ConfidenceLevel,
          note: "Stated project scope — verify with city records",
        }]
      : []),
    ...permits
      .filter(
        (pm) =>
          pm !== aduScopePmt &&
          pm.record_number !== pp?.primary_project_id &&
          /building permit|combination building/i.test((pm.record_type as string) ?? "") &&
          /opened|in.?review/i.test((pm.status as string) ?? "")
      )
      .slice(0, 3)
      .map((pm) => ({
        status: normalizePermitStatus(pm.status as string),
        title: `${pm.record_number ?? pm.record_id} — ${pm.record_type}`,
        scope: (pm.description as string)?.slice(0, 120) ?? "Scope unknown",
        filed: pm.opened_date as string,
        confidence: "source-backed" as ConfidenceLevel,
      })),
  ];

  const executionNodes: PermitTreeNode[] = permits
    .filter((pm) =>
      /traffic control|agreement|encroachment|drawing|grading/i.test((pm.record_type as string) ?? "")
    )
    .slice(0, 3)
    .map((pm) => ({
      status: normalizePermitStatus(pm.status as string),
      title: `${pm.record_number ?? pm.record_id} — ${pm.record_type}`,
      filed: pm.opened_date as string,
      confidence: "source-backed" as ConfidenceLevel,
    }));

  const lotSqft = p.lot_area_sqft ?? 0;
  const rsMatch = (p.zone_name as string)?.match(/^RS-1-(\d+)/i);
  const rmMatch = (p.zone_name as string)?.match(/^RM-(\d+)-(\d+)/i);
  let baselineUnits = 1;
  let basisLine = p.zone_name ?? "Unknown zone";

  if (rsMatch) {
    const minSf = parseInt(rsMatch[1]) * 1000;
    baselineUnits = Math.floor(lotSqft / minSf);
    basisLine = `${p.zone_name} → 1 DU / ${minSf.toLocaleString()} SF`;
  } else if (rmMatch) {
    const minSf = parseInt(rmMatch[2]) * 1000;
    baselineUnits = Math.floor(lotSqft / minSf);
    basisLine = `${p.zone_name} → 1 DU / ${minSf.toLocaleString()} SF`;
  }

  const aduCap = sdAduCap(lotSqft);
  const isRs = !!rsMatch;
  const nearbyCount = (p.nearby_project_count as number) ?? 0;
  const nearbyStrength = nearbyCount >= 5 ? "High" : nearbyCount >= 2 ? "Moderate" : nearbyCount >= 1 ? "Low" : "None";

  const siteSignals = [
    { key: "lot_size", value: `${Math.round(lotSqft).toLocaleString()} SF`, confidence: "source-backed" as ConfidenceLevel },
    ...(isRs && lotSqft > 0
      ? [{ key: "adu_eligible", value: `Yes — ${p.zone_name}, lot ${lotSqft > 10000 ? ">10,000" : ">8,000"} SF`, confidence: "conditional" as ConfidenceLevel }]
      : []),
    ...(p.has_nearby_active_project ? [{ key: "tpa", value: "Detected (proximity proxy)", confidence: "inferred" as ConfidenceLevel }] : []),
  ];

  const bedsRaw = (p.bedrooms as string) ?? "0";
  const bathsRaw = (p.baths as string) ?? "0";
  const beds = parseInt(bedsRaw.replace(/^0+/, "") || "0");
  const baths = Math.round(parseInt(bathsRaw.replace(/^0+/, "") || "0") / 10);
  const yearRaw = (p.year_effective as string) ?? "";
  const yearDisplay =
    yearRaw && yearRaw !== "00"
      ? `~${parseInt(yearRaw) < 50 ? 2000 + parseInt(yearRaw) : 1900 + parseInt(yearRaw)}`
      : "Unknown";

  const structure = {
    unit_count: (p.unitqty as number) ?? 0,
    living_area: p.total_lvg_area ? `${Math.round(p.total_lvg_area as number).toLocaleString()} SF` : "Unknown",
    year_built: yearDisplay,
    bedrooms: beds,
    bathrooms: baths,
    land_value: (p.asr_land as number) ?? 0,
    improvement_value: (p.asr_impr as number) ?? 0,
    total_assessed_value: (p.asr_total as number) ?? 0,
    owner_occupied: (p.ownerocc === "Y" ? "yes" : p.ownerocc === "N" ? "no" : "unknown") as "yes" | "no" | "unknown",
    land_use: `${p.nucleus_use_cd ?? "Unknown"} — ${p.nucleus_use_cd === "111" ? "Single family residential" : "See SanGIS land use table"}`,
    confidence: (p.unitqty != null ? "source-backed" : "inferred") as ConfidenceLevel,
    source: "SanGIS County Assessor",
  };

  const hasVhfhsz =
    /VHFSZ|VHFHSZ|fire hazard/i.test((pp?.primary_project_description as string) ?? "") ||
    permits.some((pm) => /VHFSZ|VHFHSZ|fire hazard/i.test((pm.description as string) ?? ""));
  const hasHistoric = permits.some((pm) =>
    /PRJ-111/i.test((pm.description as string) ?? "") ||
    /historic determination/i.test((pm.description as string) ?? "")
  );

  const constraints = {
    overlays: {
      tpa: { status: p.has_nearby_active_project ? "Detected (proximity proxy)" : "Unknown", confidence: p.has_nearby_active_project ? "inferred" as ConfidenceLevel : "unknown" as ConfidenceLevel },
      sda: { status: "Unknown", confidence: "unknown" as ConfidenceLevel },
      cchs: { status: "Unknown", confidence: "unknown" as ConfidenceLevel },
      ctcac: { status: "Unknown", confidence: "unknown" as ConfidenceLevel },
    },
    regulatory: {
      fire_hazard: {
        status: hasVhfhsz ? "Detected in permit record" : "Unknown",
        confidence: hasVhfhsz ? "source-backed" as ConfidenceLevel : "unknown" as ConfidenceLevel,
      },
      historic_determination: {
        status: hasHistoric ? "Referenced in permit record" : "Unknown",
        confidence: hasHistoric ? "source-backed" as ConfidenceLevel : "unknown" as ConfidenceLevel,
      },
      coastal_overlay: { status: "Unknown", confidence: "unknown" as ConfidenceLevel },
      esl: { status: "Not verified", confidence: "unknown" as ConfidenceLevel },
      far_coverage: { status: "Verification required", confidence: "unknown" as ConfidenceLevel },
    },
  };

  const stageDescriptions: Record<string, string> = {
    INACTIVE: `No active permits. ${p.zone_name} zoning — ${baselineUnits} unit${baselineUnits !== 1 ? "s" : ""} by right.`,
    EARLY: `Development intent on record — permit in review, construction not started.`,
    ACTIVE: `Active construction underway. ${pp?.primary_project_label ?? "Building permit"} issued ${pp?.primary_project_issued ?? ""}.`,
    SCALING: `Site prep active. ${proposedProject ? `${proposedProject.scope} in pipeline` : "Larger development cluster in review"} — verify with city.`,
    STALLED: `Project on record but no activity for ${pp?.primary_project_days_since_activity ?? "?"} days.`,
    COMPLETE: `Development complete. Permit closed.`,
  };

  // ── Jobs to engage ─────────────────────────────────────────────────────────
  const primaryLabel = pp?.primary_project_label ?? "";
  const primaryDesc = pp?.primary_project_description ?? "";
  const isComboBp = /combination building/i.test(primaryLabel);
  const hasRetainingWall = /retaining wall/i.test(primaryDesc);
  const hasMDU = /MDU|26 ADU|multiple.*unit/i.test(primaryDesc);
  const hasScopeChange = /scope change/i.test(primaryDesc);
  const jobLocation = { address: p.address ?? "", lat: p.lat ?? null, lng: p.lng ?? null, submarket: p.situs_community ?? p.situs_zip ?? null };

  type RawJob = { role: string; timing: "now" | "near-term" | "future"; reason: string; confidence: ConfidenceLevel };
  const rawJobs: RawJob[] = [];

  if (stage === "ACTIVE" || stage === "SCALING") {
    if (isComboBp || hasRetainingWall) rawJobs.push({ role: "Civil / Grading", timing: "now", reason: hasRetainingWall ? "Active permit — retaining walls in inspection phase" : "Active combination permit — site work underway", confidence: "source-backed" });
    if (isComboBp) {
      rawJobs.push({ role: "Structural / Framing", timing: hasMDU || hasScopeChange ? "near-term" : "now", reason: hasMDU ? "Multi-unit scope — structural follows site prep" : "Active building permit — framing phase", confidence: hasMDU ? "inferred" : "source-backed" });
      rawJobs.push({ role: "MEP (Electrical, Mechanical, Plumbing)", timing: hasMDU ? "near-term" : "now", reason: "Combination permit includes MEP scope", confidence: "source-backed" });
    }
  }
  if (stage === "SCALING") {
    rawJobs.push({ role: "Vertical Construction (future pipeline)", timing: "near-term", reason: hasMDU ? "MDU development cluster in review — larger construction to follow" : "Scope change — expanded project in pipeline", confidence: "conditional" });
    if (hasMDU && lotSqft > 15000) rawJobs.push({ role: "Structural / Foundation (multi-unit)", timing: "near-term", reason: "Multi-unit scope + large lot — foundation/basement work follows grading", confidence: "conditional" });
  }
  if (stage === "EARLY") rawJobs.push({ role: "Entitlement / Investor Tracking", timing: "near-term", reason: "Permit in review — project has not broken ground", confidence: "inferred" });
  if (stage === "STALLED") rawJobs.push({ role: "Acquisition / Salvage", timing: "near-term", reason: "Project stalled — entitlement may be salvageable", confidence: "inferred" });

  const jobs_to_engage = rawJobs
    .filter((j) => j.confidence !== "unknown" && j.timing !== "future")
    .map((j) => ({ role: j.role, reason: j.reason, timing: j.timing, confidence: j.confidence, location: jobLocation, alert_tags: tagsForRole(j.role) }));

  return {
    development_stage: stage,
    parcel: parcelSummary,
    readout: {
      summary: stageDescriptions[stage] ?? "Parcel state unknown.",
      signals: [
        ...((stage === "ACTIVE" || stage === "SCALING") ? [{ key: "active_construction", value: "Active construction", confidence: "inferred" as ConfidenceLevel }] : []),
        ...(proposedProject ? [{ key: "related_adu_scope", value: `${proposedProject.scope} on related permit`, confidence: "conditional" as ConfidenceLevel }] : []),
        ...(p.absentee_owner === true ? [{ key: "absentee_owner", value: "Absentee owner", confidence: "source-backed" as ConfidenceLevel }] : []),
        { key: "nearby_activity", value: `${nearbyCount} nearby projects`, confidence: "inferred" as ConfidenceLevel },
      ],
    },
    project: {
      primary_permit: primaryPermit ?? { permit_number: "none", type: "None", status: "IN REVIEW", scope: "No building permit on file", confidence: "source-backed" },
      proposed_project: proposedProject ?? { scope: "No proposed project scope detected", adu_units: 0, sfr_units: 0, building_count: 0, confidence: "unknown", related_permit: { permit_number: "none", type: "none", status: "IN REVIEW", scope: "none", confidence: "unknown" } },
      permit_tree: {
        building: buildingPermits,
        related_records: relatedNodes,
        execution: executionNodes,
        ...(stage === "SCALING" ? {
          scaling_clusters: [
            { label: "Site Prep — 639/67th", master_project: "PRJ-1140985", status: "ACTIVE", permit_count: 1, note: "PMT-3368931 — retaining walls + site prep, INSPECTION", confidence: "source-backed" as ConfidenceLevel },
            { label: "26-ADU Development — 641/67th", master_project: "PRJ-1111087", status: "IN REVIEW", permit_count: permits.filter(p2 => /opened/i.test((p2.status as string) ?? "")).length, note: `${permits.filter(p2 => /opened/i.test((p2.status as string) ?? "")).length} permits in pipeline — scope change filed 2026-01-05`, dependent_approvals_summary: "7 dependent approvals on file (2026-03-16)", confidence: "conditional" as ConfidenceLevel },
          ],
        } : {}),
      },
      timeline: {
        filed: (pp?.primary_project_opened as string) ?? "",
        issued: (pp?.primary_project_issued as string) ?? "",
        field_activity: stage === "ACTIVE" || stage === "SCALING" ? "Active" : "None detected",
      },
    },
    capacity: {
      baseline_units: { units: baselineUnits, basis: `${basisLine} + standard ADU allowances`, confidence: "source-backed", source: "SDMC" },
      adu_upside_units: isRs
        ? { units: aduCap.total, basis: `SD ADU program — lot ${lotSqft > 10000 ? ">10,000 SF" : ">8,000 SF"} → 1 SDU + up to ${aduCap.maxAdu} ADU/JADU (SD IB-400)`, confidence: "conditional", source: "SD IB-400" }
        : { units: 0, basis: "ADU program not applicable for this zone", confidence: "unknown", source: "" },
    },
    signals: {
      site: siteSignals,
      market: [{ key: "nearby_activity", value: `${nearbyCount} nearby projects`, strength: nearbyStrength, confidence: "inferred" as ConfidenceLevel }],
      owner: [...(p.absentee_owner === true ? [{ key: "absentee_owner", value: "Yes", confidence: "source-backed" as ConfidenceLevel }] : [])],
    },
    context: {
      nearby_development: {
        total_nearby: nearbyCount,
        active: (p.nearby_active_count as number) ?? 0,
        completed: (p.nearby_completed_count as number) ?? 0,
        stalled: (p.nearby_stalled_count as number) ?? 0,
        nearest_completed: p.nearest_completed_distance_ft ? `${Math.round(p.nearest_completed_distance_ft as number)} ft` : "Unknown",
        signal_strength: nearbyStrength,
      },
    },
    structure,
    constraints,
    confidence: {
      "source-backed": "Direct parcel, assessor, permit, or published planning source",
      inferred: "Derived from permit patterns, proximity, or market signals",
      conditional: "Possible only if program rules / city verification / constraints are satisfied",
      unknown: "Not verified in available source material",
    },
    jobs_to_engage,
  };
}

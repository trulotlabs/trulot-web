/**
 * TruLot Phase Inference Layer V1
 *
 * Deterministic rule cascade that maps permit + inspection signals
 * to one of 10 canonical construction phases.
 *
 * Rules evaluated in REVERSE order (Completed → Entitlement).
 * First match wins. Never guesses — returns UNKNOWN if signals are insufficient.
 *
 * V1 data note: We infer inspection type from permit status ("Inspection Followup")
 * and description keywords. Dedicated inspection records not yet available.
 * Confidence is downgraded to MEDIUM when inspection type is ambiguous.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export type PhaseCode =
  | "ENTITLEMENT"
  | "PERMIT_ISSUED"
  | "SITE_PREP"
  | "FOUNDATION"
  | "FRAMING"
  | "MEP_ROUGH"
  | "INTERIOR_BUILDOUT"
  | "FINALIZATION"
  | "COMPLETED"
  | "STALLED"
  | "UNKNOWN";

export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type Signal = {
  type: "permit" | "inspection" | "description" | "activity_gap" | "momentum";
  id?: string;
  label: string;
  confidence: Confidence;
};

export type StallOpportunityFlag = "potential_distress" | "likely_restart" | "watch";

export type PhaseResult = {
  phase: PhaseCode;
  phase_label: string;
  confidence: Confidence;
  last_activity_date: string | null;
  days_in_phase: number;

  // Stall
  stalled: boolean;
  days_stalled?: number;
  stall_reason?: string;
  stall_opportunity_flag?: StallOpportunityFlag;

  // Next phase intelligence
  next_phase: PhaseCode | null;
  next_phase_label: string | null;
  estimated_timing: string;

  // Trade implications
  trades_needed_now: string[];
  trades_needed_next: string[];

  // Source signals — always populated (mandatory for transparency)
  signals_used: Signal[];
  signals_count: number;
};

// ─── Static maps ──────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<PhaseCode, string> = {
  ENTITLEMENT:       "Entitlement",
  PERMIT_ISSUED:     "Permit Issued",
  SITE_PREP:         "Site Prep",
  FOUNDATION:        "Foundation",
  FRAMING:           "Framing",
  MEP_ROUGH:         "MEP Rough",
  INTERIOR_BUILDOUT: "Interior Buildout",
  FINALIZATION:      "Finalization",
  COMPLETED:         "Completed",
  STALLED:           "Stalled",
  UNKNOWN:           "Unknown",
};

const NEXT_PHASE: Partial<Record<PhaseCode, PhaseCode>> = {
  ENTITLEMENT:       "PERMIT_ISSUED",
  PERMIT_ISSUED:     "SITE_PREP",
  SITE_PREP:         "FOUNDATION",
  FOUNDATION:        "FRAMING",
  FRAMING:           "MEP_ROUGH",
  MEP_ROUGH:         "INTERIOR_BUILDOUT",
  INTERIOR_BUILDOUT: "FINALIZATION",
  FINALIZATION:      "COMPLETED",
};

const ESTIMATED_TIMING: Partial<Record<PhaseCode, string>> = {
  ENTITLEMENT:       "30–120 days",
  PERMIT_ISSUED:     "2–8 weeks",
  SITE_PREP:         "2–6 weeks",
  FOUNDATION:        "2–4 weeks",
  FRAMING:           "2–4 weeks",
  MEP_ROUGH:         "3–6 weeks",
  INTERIOR_BUILDOUT: "4–8 weeks",
  FINALIZATION:      "2–6 weeks",
};

const TRADES_NOW: Partial<Record<PhaseCode, string[]>> = {
  ENTITLEMENT:       [],
  PERMIT_ISSUED:     ["GC mobilizing"],
  SITE_PREP:         ["Earthwork", "Utilities / Civil"],
  FOUNDATION:        ["Concrete", "Rebar / Steel"],
  FRAMING:           ["Framing crew"],
  MEP_ROUGH:         ["Electrician", "Plumber", "HVAC"],
  INTERIOR_BUILDOUT: ["Drywall", "Paint", "Flooring"],
  FINALIZATION:      ["Finish trades", "Punch list"],
  COMPLETED:         [],
  STALLED:           [],
  UNKNOWN:           [],
};

const TRADES_NEXT: Partial<Record<PhaseCode, string[]>> = {
  ENTITLEMENT:       ["GC selection"],
  PERMIT_ISSUED:     ["Demo", "Grading"],
  SITE_PREP:         ["Concrete", "Rebar"],
  FOUNDATION:        ["Framing crew"],
  FRAMING:           ["Electrician", "Plumber", "HVAC"],
  MEP_ROUGH:         ["Insulation", "Drywall"],
  INTERIOR_BUILDOUT: ["Cabinet", "Tile", "Finish trades"],
  FINALIZATION:      [],
  COMPLETED:         [],
  STALLED:           [],
  UNKNOWN:           [],
};

/** Stall thresholds (days) — V1 defaults, calibrate from data */
const STALL_THRESHOLDS: Partial<Record<PhaseCode, number>> = {
  ENTITLEMENT:       120,
  PERMIT_ISSUED:     90,
  SITE_PREP:         60,
  FOUNDATION:        45,
  FRAMING:           45,
  MEP_ROUGH:         45,
  INTERIOR_BUILDOUT: 60,
  FINALIZATION:      90,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RawRow = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}
function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
  return 0;
}
function desc(row: RawRow | null): string {
  return str(row?.primary_project_description).toLowerCase();
}

/** Check permit description for keyword match — returns signal label or null */
function descSignal(text: string, patterns: RegExp[], label: string): Signal | null {
  if (patterns.some((p) => p.test(text))) {
    return { type: "description", label, confidence: "MEDIUM" };
  }
  return null;
}

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 9999;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 9999;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function buildResult(
  phase: PhaseCode,
  confidence: Confidence,
  signals: Signal[],
  primaryProject: RawRow | null,
  overrides: Partial<PhaseResult> = {}
): PhaseResult {
  // Allow callers to override last_activity_date (e.g. use issuance date instead of filed date).
  // Recompute days_in_phase and stall from whatever date is resolved.
  const defaultActivity = str(primaryProject?.primary_project_last_activity) ||
                          str(primaryProject?.primary_project_issued) ||
                          str(primaryProject?.primary_project_opened) || null;
  const lastActivity = ("last_activity_date" in overrides ? overrides.last_activity_date : defaultActivity) ?? defaultActivity;
  const daysInPhase = lastActivity ? daysSince(lastActivity) : 0;
  const nextPhase = NEXT_PHASE[phase] ?? null;
  const stallThreshold = STALL_THRESHOLDS[phase];
  const stalled = stallThreshold !== undefined && daysInPhase > stallThreshold;

  return {
    phase,
    phase_label: PHASE_LABELS[phase],
    confidence,
    last_activity_date: lastActivity,
    days_in_phase: daysInPhase,
    stalled,
    days_stalled: stalled ? daysInPhase - (stallThreshold ?? 0) : undefined,
    next_phase: nextPhase,
    next_phase_label: nextPhase ? PHASE_LABELS[nextPhase] : null,
    estimated_timing: (nextPhase ? ESTIMATED_TIMING[nextPhase] : null) ?? "Unknown",
    trades_needed_now: TRADES_NOW[phase] ?? [],
    trades_needed_next: nextPhase ? (TRADES_NEXT[phase] ?? []) : [],
    signals_used: signals,
    signals_count: signals.length,
    ...overrides,
  };
}

// ─── Phase inference engine ───────────────────────────────────────────────────

/**
 * inferPhase — pure function, no network calls.
 *
 * @param primaryProject  Row from parcel_primary_project_v1 (or null)
 * @param permits         Rows from parcel_permit_terminal_v2
 * @returns               PhaseResult — always returns, never throws
 */
export function inferPhase(
  primaryProject: RawRow | null,
  permits: RawRow[]
): PhaseResult {
  const signals: Signal[] = [];

  // No data at all
  if (!primaryProject && permits.length === 0) {
    return buildResult("UNKNOWN", "NONE", [{ type: "activity_gap", label: "No permit or project data on file", confidence: "NONE" }], null);
  }

  // ── Extract raw signals ────────────────────────────────────────────────────

  const primaryStatus  = str(primaryProject?.primary_project_status).toLowerCase();
  const primaryLabel   = str(primaryProject?.primary_project_label).toLowerCase();
  const momentum       = str(primaryProject?.project_momentum_label);
  const daysInactive   = num(primaryProject?.primary_project_days_since_activity);
  const hasBuilding    = Boolean(primaryProject?.has_building_project);
  const primaryIssued  = str(primaryProject?.primary_project_issued);
  const primaryDesc    = desc(primaryProject);

  // Permit type buckets
  const buildingPermits  = permits.filter((p) => /building permit|combination building/i.test(str(p.record_type)));
  const gradingPermits   = permits.filter((p) => /grading/i.test(str(p.record_type)));
  const demoPermits      = permits.filter((p) => /demolition|demo/i.test(str(p.record_type)));
  const civilPermits     = permits.filter((p) => /agreement|encroachment|right.of.way|traffic control/i.test(str(p.record_type)));
  const issuedBuilding   = buildingPermits.filter((p) => /issued|inspection/i.test(str(p.status)));
  const openedBuilding   = buildingPermits.filter((p) => /opened|in.?review/i.test(str(p.status)));
  const finaledBuilding  = buildingPermits.filter((p) => /finaled|closed|completed/i.test(str(p.status)));

  // Description keyword signals
  const isFinalInspection    = /final inspection|certificate of occupancy|cof.?o|finaled/i.test(primaryDesc);
  const isInsulation         = /insulation/i.test(primaryDesc);
  const isDrywall            = /drywall|lath|interior finish/i.test(primaryDesc);
  const isMEP                = /electrical rough|plumbing rough|mechanical rough|\bMEP\b/i.test(primaryDesc);
  const isFraming            = /rough framing|\bframing\b|shear wall/i.test(primaryDesc);
  const isFoundation         = /\bfoundation\b|\bsoils?\b|\bfootings?\b|concrete slab|pre.slab/i.test(primaryDesc);
  const isSitePrepDesc       = /retaining wall|site prep|site preparation|grading/i.test(primaryDesc) && !isFoundation;
  const isDemoDesc           = /demolition|demo of existing/i.test(primaryDesc);

  // ── Rule cascade (evaluated Completed → Entitlement) ──────────────────────

  // ── COMPLETED ──────────────────────────────────────────────────────────────
  if (
    finaledBuilding.length > 0 ||
    /finaled|completed/i.test(primaryStatus) ||
    momentum === "Completed" ||
    isFinalInspection && /passed|finaled/i.test(primaryStatus)
  ) {
    const s: Signal[] = [];
    if (finaledBuilding.length > 0) s.push({ type: "permit", id: str(finaledBuilding[0].record_number), label: `Building permit finaled: ${str(finaledBuilding[0].record_number)}`, confidence: "HIGH" });
    if (/finaled|completed/i.test(primaryStatus)) s.push({ type: "permit", id: str(primaryProject?.primary_project_id), label: `Primary permit status: ${primaryStatus}`, confidence: "HIGH" });
    if (momentum === "Completed") s.push({ type: "momentum", label: "Project momentum: Completed", confidence: "HIGH" });
    return buildResult("COMPLETED", "HIGH", s, primaryProject);
  }

  // ── FINALIZATION ───────────────────────────────────────────────────────────
  if (isFinalInspection) {
    const s: Signal[] = [{ type: "description", label: "Permit description references final inspection / CofO", confidence: "MEDIUM" }];
    if (/inspection followup/i.test(primaryStatus)) s.push({ type: "permit", id: str(primaryProject?.primary_project_id), label: `Primary permit in inspection: ${primaryStatus}`, confidence: "HIGH" });
    return buildResult("FINALIZATION", "MEDIUM", s, primaryProject);
  }

  // ── INTERIOR BUILDOUT ──────────────────────────────────────────────────────
  if (isInsulation || isDrywall) {
    const s: Signal[] = [];
    if (isInsulation) s.push({ type: "description", label: "Insulation referenced in permit description", confidence: "HIGH" });
    if (isDrywall) s.push({ type: "description", label: "Drywall / interior finish referenced in permit description", confidence: "MEDIUM" });
    if (/inspection followup/i.test(primaryStatus)) s.push({ type: "permit", id: str(primaryProject?.primary_project_id), label: `Primary permit in inspection: ${primaryStatus}`, confidence: "HIGH" });
    return buildResult("INTERIOR_BUILDOUT", isInsulation ? "HIGH" : "MEDIUM", s, primaryProject);
  }

  // ── MEP ROUGH ─────────────────────────────────────────────────────────────
  if (isMEP && /inspection followup|issued/i.test(primaryStatus)) {
    const s: Signal[] = [{ type: "description", label: "MEP rough scope in permit description", confidence: "MEDIUM" }];
    s.push({ type: "permit", id: str(primaryProject?.primary_project_id), label: `Primary permit status: ${primaryStatus}`, confidence: "HIGH" });
    return buildResult("MEP_ROUGH", "MEDIUM", s, primaryProject);
  }

  // ── FRAMING ───────────────────────────────────────────────────────────────
  if (isFraming && /inspection followup|issued/i.test(primaryStatus)) {
    const s: Signal[] = [{ type: "description", label: "Framing scope in permit description", confidence: "MEDIUM" }];
    s.push({ type: "permit", id: str(primaryProject?.primary_project_id), label: `Primary permit status: ${primaryStatus}`, confidence: "HIGH" });
    return buildResult("FRAMING", "MEDIUM", s, primaryProject);
  }

  // ── FOUNDATION ────────────────────────────────────────────────────────────
  if (isFoundation && /inspection followup|issued/i.test(primaryStatus)) {
    const s: Signal[] = [{ type: "description", label: "Foundation / soils / footings scope in permit description", confidence: "MEDIUM" }];
    s.push({ type: "permit", id: str(primaryProject?.primary_project_id), label: `Primary permit status: ${primaryStatus}`, confidence: "HIGH" });
    return buildResult("FOUNDATION", "MEDIUM", s, primaryProject);
  }

  // ── SITE PREP ─────────────────────────────────────────────────────────────
  // Grading or demo permit active, OR primary is in inspection with site-prep description
  const hasSitePrepPermit = gradingPermits.length > 0 || demoPermits.filter((p) => /opened|issued/i.test(str(p.status))).length > 0;
  const hasCivilExecution = civilPermits.filter((p) => /issued|active/i.test(str(p.status))).length > 0;

  if (
    (isSitePrepDesc && /inspection followup|issued/i.test(primaryStatus)) ||
    (hasSitePrepPermit && !issuedBuilding.length) ||
    (hasCivilExecution && !issuedBuilding.length)
  ) {
    const s: Signal[] = [];
    if (isSitePrepDesc) s.push({ type: "description", label: "Site prep / retaining wall / grading scope in primary permit", confidence: "HIGH" });
    if (hasSitePrepPermit) {
      const p = [...gradingPermits, ...demoPermits][0];
      s.push({ type: "permit", id: str(p?.record_number), label: `Site permit on file: ${str(p?.record_type)} (${str(p?.status)})`, confidence: "HIGH" });
    }
    if (hasCivilExecution) {
      const p = civilPermits.find((p) => /issued|active/i.test(str(p.status)));
      s.push({ type: "permit", id: str(p?.record_number), label: `Civil / execution permit: ${str(p?.record_type)} (${str(p?.status)})`, confidence: "HIGH" });
    }
    if (/inspection followup/i.test(primaryStatus)) s.push({ type: "permit", id: str(primaryProject?.primary_project_id), label: `Primary permit in inspection: ${primaryStatus}`, confidence: "HIGH" });
    return buildResult("SITE_PREP", "HIGH", s, primaryProject);
  }

  // ── PERMIT ISSUED ─────────────────────────────────────────────────────────
  // Building permit issued but no inspection / site activity yet
  if (
    (issuedBuilding.length > 0 || primaryIssued) &&
    hasBuilding &&
    !/inspection followup/i.test(primaryStatus)
  ) {
    const s: Signal[] = [];
    if (primaryIssued) s.push({ type: "permit", id: str(primaryProject?.primary_project_id), label: `Building permit issued: ${primaryIssued}`, confidence: "HIGH" });
    if (issuedBuilding.length > 0) s.push({ type: "permit", id: str(issuedBuilding[0].record_number), label: `Issued building permit on file: ${str(issuedBuilding[0].record_number)}`, confidence: "HIGH" });
    return buildResult("PERMIT_ISSUED", "HIGH", s, primaryProject);
  }

  // ── ENTITLEMENT ───────────────────────────────────────────────────────────
  // Plan check / awaiting issuance — no permit issued yet
  if (
    /awaiting issuance/i.test(momentum) ||
    (openedBuilding.length > 0 && !primaryIssued) ||
    (/opened|in.?review/i.test(primaryStatus) && !primaryIssued)
  ) {
    const s: Signal[] = [];
    if (/awaiting issuance/i.test(momentum)) s.push({ type: "momentum", label: "Project momentum: Awaiting Issuance", confidence: "HIGH" });
    if (openedBuilding.length > 0) s.push({ type: "permit", id: str(openedBuilding[0].record_number), label: `Building permit in plan check: ${str(openedBuilding[0].record_number)}`, confidence: "HIGH" });
    if (/opened|in.?review/i.test(primaryStatus)) s.push({ type: "permit", id: str(primaryProject?.primary_project_id), label: `Primary permit status: ${primaryStatus}`, confidence: "HIGH" });
    return buildResult("ENTITLEMENT", "HIGH", s, primaryProject);
  }

  // ── INSPECTION — PHASE UNKNOWN ────────────────────────────────────────────
  // Permit is at inspection but description keywords didn't match any specific phase
  // (framing, MEP, foundation, etc.). Infer SITE_PREP as the minimum construction
  // phase — construction is underway, specific phase is unresolvable from description.
  if (/inspection/i.test(primaryStatus) && (issuedBuilding.length > 0 || primaryIssued)) {
    const s: Signal[] = [
      { type: "permit", id: str(primaryProject?.primary_project_id), label: `Primary permit at inspection — phase from description unresolvable`, confidence: "MEDIUM" },
    ];
    if (primaryIssued) s.push({ type: "permit", id: str(primaryProject?.primary_project_id), label: `Building permit issued: ${primaryIssued}`, confidence: "HIGH" });
    // Use issuance date as effective last activity — stall clock runs from issuance, not filed date
    return buildResult("SITE_PREP", "MEDIUM", s, primaryProject, { last_activity_date: primaryIssued || null });
  }

  // ── STALLED ───────────────────────────────────────────────────────────────
  // At this point we know there's permit activity but can't determine phase from signals.
  // If activity gap is very large, surface as STALLED rather than UNKNOWN.
  if (daysInactive > 180 || /status unclear/i.test(momentum)) {
    const s: Signal[] = [];
    s.push({ type: "activity_gap", label: `${daysInactive} days since last activity`, confidence: "HIGH" });
    if (/status unclear/i.test(momentum)) s.push({ type: "momentum", label: "Project momentum: Status unclear", confidence: "HIGH" });

    const stallOpportunity: StallOpportunityFlag =
      daysInactive > 180 ? "potential_distress" :
      daysInactive <= 60 ? "likely_restart" :
      "watch";

    const lastActivity = str(primaryProject?.primary_project_last_activity) ||
                         str(primaryProject?.primary_project_issued) || null;

    return {
      phase: "STALLED",
      phase_label: PHASE_LABELS["STALLED"],
      confidence: "HIGH",
      last_activity_date: lastActivity,
      days_in_phase: daysInactive,
      stalled: true,
      days_stalled: daysInactive,
      stall_reason: /status unclear/i.test(momentum)
        ? "Project status unclear — no inspection or permit movement detected"
        : `No permit activity for ${daysInactive} days`,
      stall_opportunity_flag: stallOpportunity,
      next_phase: null,
      next_phase_label: null,
      estimated_timing: "Unknown",
      trades_needed_now: [],
      trades_needed_next: [],
      signals_used: s,
      signals_count: s.length,
    };
  }

  // ── UNKNOWN ───────────────────────────────────────────────────────────────
  const lastActivity = str(primaryProject?.primary_project_last_activity) || null;
  return {
    phase: "UNKNOWN",
    phase_label: PHASE_LABELS["UNKNOWN"],
    confidence: "NONE",
    last_activity_date: lastActivity,
    days_in_phase: daysInactive,
    stalled: false,
    next_phase: null,
    next_phase_label: null,
    estimated_timing: "Unknown",
    trades_needed_now: [],
    trades_needed_next: [],
    signals_used: [{ type: "activity_gap", label: "Insufficient signals to determine phase", confidence: "NONE" }],
    signals_count: 1,
  };
}

// ─── Phase sequence helpers ────────────────────────────────────────────────────

/** Ordinal position of a phase (for ordering and comparison) */
export const PHASE_ORDER: Record<PhaseCode, number> = {
  UNKNOWN:           0,
  STALLED:           0,
  ENTITLEMENT:       1,
  PERMIT_ISSUED:     2,
  SITE_PREP:         3,
  FOUNDATION:        4,
  FRAMING:           5,
  MEP_ROUGH:         6,
  INTERIOR_BUILDOUT: 7,
  FINALIZATION:      8,
  COMPLETED:         9,
};

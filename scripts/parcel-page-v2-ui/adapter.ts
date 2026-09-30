/**
 * Packet 19 presentation-only adapter for the sealed ParcelIntelligenceV2 result.
 *
 * This module formats and groups evidence. It never selects zoning, Coastal
 * applicability, standards, compliance, or capacity.
 */

// Packet 18 is a sealed JSON contract without generated TypeScript types; all
// access is narrowed by this adapter before it reaches the presentation model.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>;

export type DisplayState =
  | "supported"
  | "conditional"
  | "unknown"
  | "unavailable"
  | "review"
  | "not_applicable";

export interface DisplayValue {
  label: string;
  value: string;
  state: DisplayState;
  stateLabel: string;
  source?: string;
  detail?: string;
  conditions?: string[];
}

export interface StandardsGroup {
  zoneCode: string;
  coverage: string | null;
  state: DisplayState;
  stateLabel: string;
  explanation?: string;
  standards: DisplayValue[];
}

export interface ParcelPageV2UiModel {
  adapterVersion: string;
  sourceContractVersion: string;
  asOf: string;
  sourceFingerprint: string;
  header: {
    title: string;
    address: string | null;
    apn: string;
    jurisdiction: string;
    identityState: DisplayState;
    identityLabel: string;
  };
  orientation: {
    zoningLabel: string;
    zoningState: DisplayState;
    zones: Array<{ code: string; coverage: string | null; role: string; featureIds: string[] }>;
    coastalLabel: string;
    coastalState: DisplayState;
    standardsVersion: string;
    standardsVersionState: DisplayState;
    mappingEvidence: {
      state: string;
      methodVersion: string;
      acquisition: string;
    };
    coastalEvidence: {
      areaShare: string | null;
      method: string;
      acquisition: string;
      featureIds: string[];
    };
  };
  standardsGroups: StandardsGroup[];
  propertyFacts: DisplayValue[];
  unknowns: Array<DisplayValue & { linkedAction?: string; group: "important" | "future" | "technical" }>;
  investigations: Array<{
    action: string;
    title: string;
    reason: string;
    blockedConclusion: string;
    requiredEvidence: string;
  }>;
  evidence: Array<{
    layer: string;
    source: string;
    version: string;
    state: DisplayState;
    stateLabel: string;
    artifactFingerprint: string;
    recordFingerprint: string;
  }>;
  capacity: { state: "not_evaluated"; label: "Not evaluated yet"; explanation: string };
  safeguards: {
    parcelComplianceEvaluated: false;
    developmentCapacityCalculated: false;
    standardsBlended: false;
    productionRuntimeWired: false;
  };
}

export const ADAPTER_VERSION = "parcel-page-v2-ui-adapter-2026-09-30-v0";

const STANDARD_ORDER = [
  "lot_area_min",
  "lot_width_min",
  "corner_lot_width_min",
  "lot_depth_min",
  "front_setback_min",
  "interior_side_setback_min",
  "street_side_setback_min",
  "rear_setback_min",
  "structure_height_max",
  "density_basis",
  "floor_area_ratio_max",
];

const STANDARD_LABELS: Record<string, string> = {
  lot_area_min: "Minimum lot area",
  lot_width_min: "Minimum lot width",
  corner_lot_width_min: "Minimum corner-lot width",
  lot_depth_min: "Minimum lot depth",
  front_setback_min: "Minimum front setback",
  interior_side_setback_min: "Minimum interior-side setback",
  street_side_setback_min: "Minimum street-side setback",
  rear_setback_min: "Minimum rear setback",
  structure_height_max: "Maximum structure height",
  density_basis: "Density basis",
  floor_area_ratio_max: "Maximum floor-area ratio",
};

const UNKNOWN_LABELS: Record<string, string> = {
  BASE_ZONING_AMBIGUOUS: "Base zoning",
  BASE_ZONING_UNMAPPED: "Base zoning",
  COASTAL_APPLICABILITY_UNRESOLVED: "Coastal applicability",
  CONDITIONAL_RULES_REQUIRE_ADDITIONAL_FACTS: "Conditional standards",
  CORNER_LOT_STATUS_UNKNOWN: "Corner-lot status",
  EXISTING_DWELLING_UNITS_UNKNOWN: "Existing dwelling units",
  FRONT_LOT_LINE_UNKNOWN: "Front lot line",
  GROSS_FLOOR_AREA_SQFT_UNKNOWN: "Gross floor area",
  INTERIOR_SIDE_LOT_LINES_UNKNOWN: "Interior-side lot lines",
  LEGAL_LOT_AREA_SQFT_UNKNOWN: "Legal lot area",
  LEGAL_LOT_DEPTH_FT_UNKNOWN: "Legal lot depth",
  LEGAL_LOT_WIDTH_FT_UNKNOWN: "Legal lot width",
  LEGAL_STREET_FRONTAGE_LENGTH_FT_UNKNOWN: "Legal street frontage",
  LIVING_AREA_UNKNOWN: "Assessor living area",
  NON_RS_COMPONENT_UNSUPPORTED: "Non-RS base standards",
  PARCEL_SOURCE_UNAVAILABLE: "Parcel source",
  REAR_LOT_LINE_UNKNOWN: "Rear lot line",
  RS_STANDARDS_SOURCE_UNAVAILABLE: "RS standards source",
  SITUS_ADDRESS_UNAVAILABLE: "Situs address",
  SLOPE_PERCENT_UNKNOWN: "Parcel slope",
  SPLIT_ZONE_REQUIRES_GEOMETRY_REVIEW: "Split-zone applicability",
  STREET_SIDE_LOT_LINES_UNKNOWN: "Street-side lot lines",
};

const UNKNOWN_PRIORITY = [
  "PARCEL_SOURCE_UNAVAILABLE",
  "BASE_ZONING_AMBIGUOUS",
  "BASE_ZONING_UNMAPPED",
  "COASTAL_APPLICABILITY_UNRESOLVED",
  "SPLIT_ZONE_REQUIRES_GEOMETRY_REVIEW",
  "NON_RS_COMPONENT_UNSUPPORTED",
  "LEGAL_LOT_WIDTH_FT_UNKNOWN",
  "LEGAL_LOT_DEPTH_FT_UNKNOWN",
  "LEGAL_LOT_AREA_SQFT_UNKNOWN",
  "CORNER_LOT_STATUS_UNKNOWN",
  "FRONT_LOT_LINE_UNKNOWN",
  "GROSS_FLOOR_AREA_SQFT_UNKNOWN",
  "EXISTING_DWELLING_UNITS_UNKNOWN",
  "LIVING_AREA_UNKNOWN",
  "SITUS_ADDRESS_UNAVAILABLE",
  "CONDITIONAL_RULES_REQUIRE_ADDITIONAL_FACTS",
];

const ACTION_TITLES: Record<string, string> = {
  OBTAIN_GROSS_FLOOR_AREA: "Obtain gross floor area",
  OBTAIN_SUPPORTED_ZONE_STANDARDS: "Research standards for the unsupported zone",
  REVIEW_SPLIT_ZONE_GEOMETRY: "Review the split-zone geometry",
  VERIFY_BASE_ZONING_MAPPING: "Verify the base-zoning mapping",
  VERIFY_COASTAL_APPLICABILITY: "Verify Coastal applicability",
  VERIFY_EXISTING_UNIT_COUNT: "Verify the existing dwelling-unit count",
  VERIFY_LEGAL_LOT_WIDTH: "Verify legal lot width",
  VERIFY_LOT_LINE_DESIGNATIONS: "Confirm lot-line designations",
  VERIFY_PARCEL_SITUS: "Verify the parcel situs address",
};

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function displayState(value: unknown, sourceState?: unknown): DisplayState {
  if (sourceState === "source_unavailable" || value === "unavailable") return "unavailable";
  if (value === "conditional" || value === "CONDITIONAL") return "conditional";
  if (value === "partial") return "review";
  if (value === "not_applicable") return "not_applicable";
  if (value === "supported" || value === "RECORDED" || value === "available") return "supported";
  return "unknown";
}

function stateLabel(state: DisplayState): string {
  return {
    supported: "Recorded",
    conditional: "Conditional",
    unknown: "Not yet verified",
    unavailable: "Source currently unavailable",
    review: "Review required",
    not_applicable: "Outside this standards set",
  }[state];
}

function unitLabel(unit: unknown): string {
  return ({ ft: "ft", sq_ft: "sq ft", square_foot: "sq ft", dwelling_unit_per_lot: "dwelling unit per lot" } as Record<string, string>)[String(unit)] || String(unit || "");
}

function standardValue(rule: JsonRecord): string {
  const value = rule.value || {};
  const unit = unitLabel(rule.unit);
  let rendered: string;
  if (value.kind === "number" && finiteNumber(value.number)) {
    rendered = `${formatNumber(value.number, 2)}${unit ? ` ${unit}` : ""}`;
  } else if ((value.kind === "source_expression" || value.kind === "reference") && typeof value.text === "string") {
    rendered = value.text.toLowerCase() === "varies" ? "Varies" : `${value.text}${unit ? ` ${unit}` : ""}`;
  } else {
    return rule.source_state === "source_unavailable" ? "Source currently unavailable" : "Not yet verified";
  }
  if (rule.standard_key === "corner_lot_width_min") return `${rendered} — if corner lot`;
  if (rule.fact_state === "CONDITIONAL" || value.evaluated === false) {
    if (rule.standard_key === "structure_height_max") return `${rendered} — condition-dependent`;
    if (rule.standard_key === "floor_area_ratio_max") return `${rendered} — additional rule conditions apply`;
  }
  return rendered;
}

function standardItem(rule: JsonRecord): DisplayValue {
  const state = displayState(rule.fact_state, rule.source_state);
  const source = [rule.source_section, rule.source_table, rule.source_page ? `p. ${rule.source_page}` : null].filter(Boolean).join(" · ");
  const conditions = [
    ...(Array.isArray(rule.condition) ? rule.condition : []),
    ...(Array.isArray(rule.exceptions) && rule.exceptions.length ? [`Referenced exceptions: ${rule.exceptions.join(", ")}`] : []),
    ...(Array.isArray(rule.unresolved_dependencies) && rule.unresolved_dependencies.length ? [`Unresolved dependencies: ${rule.unresolved_dependencies.join(", ")}`] : []),
  ];
  return {
    label: STANDARD_LABELS[rule.standard_key] || String(rule.standard_key).replaceAll("_", " "),
    value: standardValue(rule),
    state,
    stateLabel: stateLabel(state),
    source: source || rule.source_document || "Authoritative source retained",
    detail: rule.source_document,
    conditions,
  };
}

function factItem(label: string, fact: JsonRecord | null | undefined, source: string, formatter: (value: number) => string): DisplayValue {
  const state = displayState(fact?.fact_state, fact?.source_state);
  const value = state === "supported" && finiteNumber(fact?.value)
    ? formatter(fact.value)
    : state === "unavailable" ? "Source currently unavailable" : "Not yet verified";
  return {
    label,
    value,
    state,
    stateLabel: stateLabel(state),
    source,
    detail: Array.isArray(fact?.limitations) ? fact.limitations.join(" ") : undefined,
  };
}

function jurisdictionLabel(code: unknown): string {
  return code === "SD" ? "City of San Diego" : code ? String(code) : "Jurisdiction not yet verified";
}

function zoningPresentation(zoning: JsonRecord): { label: string; state: DisplayState } {
  if (zoning.mapping_state === "SINGLE_ZONE") return { label: "Single-zone mapping", state: "supported" };
  if (zoning.mapping_state === "SPLIT_ZONE") return { label: "Split-zone parcel", state: "review" };
  if (zoning.mapping_state === "AMBIGUOUS") return { label: "Zoning requires review", state: "review" };
  if (zoning.mapping_state === "UNMAPPED") return { label: "Base zoning not yet mapped", state: "unknown" };
  if (zoning.source_state === "source_unavailable") return { label: "Zoning source currently unavailable", state: "unavailable" };
  return { label: "Zoning not yet verified", state: "unknown" };
}

function coastalPresentation(coastal: JsonRecord): { label: string; state: DisplayState } {
  if (coastal.evidence_state === "OUTSIDE_COASTAL") return { label: "Outside Coastal Overlay Zone", state: "supported" };
  if (coastal.evidence_state === "INSIDE_COASTAL") return { label: "Inside Coastal Overlay Zone", state: "supported" };
  if (coastal.evidence_state === "BOUNDARY_AMBIGUOUS") return { label: "Coastal applicability requires review", state: "review" };
  if (coastal.source_state === "source_unavailable") return { label: "Coastal source currently unavailable", state: "unavailable" };
  return { label: "Coastal applicability not yet verified", state: "unknown" };
}

function actionForUnknown(item: JsonRecord, actions: JsonRecord[]): string | undefined {
  const code = String(item.code || "");
  const map: Record<string, string[]> = {
    VERIFY_BASE_ZONING_MAPPING: ["BASE_ZONING"],
    VERIFY_COASTAL_APPLICABILITY: ["COASTAL"],
    REVIEW_SPLIT_ZONE_GEOMETRY: ["SPLIT_ZONE"],
    OBTAIN_SUPPORTED_ZONE_STANDARDS: ["NON_RS"],
    VERIFY_LEGAL_LOT_WIDTH: ["LOT_WIDTH"],
    VERIFY_LOT_LINE_DESIGNATIONS: ["LOT_LINE", "SETBACK", "FRONT_LOT_LINE", "SIDE_LOT_LINES", "REAR_LOT_LINE"],
    OBTAIN_GROSS_FLOOR_AREA: ["GROSS_FLOOR_AREA"],
    VERIFY_EXISTING_UNIT_COUNT: ["DWELLING_UNITS", "LIVING_AREA"],
    VERIFY_PARCEL_SITUS: ["SITUS"],
  };
  return actions.find((action) => (map[action.action] || []).some((needle) => code.includes(needle)))?.action;
}

function unknownGroup(code: string): "important" | "future" | "technical" {
  if (["PARCEL_SOURCE_UNAVAILABLE", "BASE_ZONING_AMBIGUOUS", "BASE_ZONING_UNMAPPED", "COASTAL_APPLICABILITY_UNRESOLVED", "SPLIT_ZONE_REQUIRES_GEOMETRY_REVIEW", "NON_RS_COMPONENT_UNSUPPORTED", "LEGAL_LOT_WIDTH_FT_UNKNOWN", "CORNER_LOT_STATUS_UNKNOWN", "FRONT_LOT_LINE_UNKNOWN", "INTERIOR_SIDE_LOT_LINES_UNKNOWN", "STREET_SIDE_LOT_LINES_UNKNOWN", "REAR_LOT_LINE_UNKNOWN", "SITUS_ADDRESS_UNAVAILABLE"].includes(code)) return "important";
  if (["LEGAL_LOT_AREA_SQFT_UNKNOWN", "LEGAL_LOT_DEPTH_FT_UNKNOWN", "GROSS_FLOOR_AREA_SQFT_UNKNOWN", "SLOPE_PERCENT_UNKNOWN", "EXISTING_DWELLING_UNITS_UNKNOWN", "LIVING_AREA_UNKNOWN"].includes(code)) return "future";
  return "technical";
}

export function adaptParcelIntelligenceV2(input: JsonRecord): ParcelPageV2UiModel {
  if (!input || typeof input !== "object") throw new TypeError("ParcelIntelligenceV2 result is required");
  if (input.parcel_compliance_evaluated !== false || input.development_capacity_calculated !== false || input.standards_blended !== false || input.production_runtime_wired !== false) {
    throw new Error("Packet 19 accepts only the sealed non-compliance, non-capacity, non-production contract");
  }
  const identity = input.identity || {};
  const zoning = input.zoning || {};
  const coastal = input.coastal_context || {};
  const standards = input.base_standards || {};
  const structure = input.property_facts?.structure || {};
  const zoningDisplay = zoningPresentation(zoning);
  const coastalDisplay = coastalPresentation(coastal);
  const zones: Array<{ code: string; coverage: string | null; role: string; featureIds: string[] }> = (Array.isArray(zoning.zone_evidence) ? zoning.zone_evidence : []).map((zone: JsonRecord) => ({
    code: String(zone.zone_code),
    coverage: finiteNumber(zone.coverage_percent) ? `${formatNumber(zone.coverage_percent, 1)}%` : null,
    role: String(zone.role || "evidence"),
    featureIds: Array.isArray(zone.source_feature_ids) ? zone.source_feature_ids.map(String) : [],
  }));

  const standardsGroups: StandardsGroup[] = (Array.isArray(standards.zone_results) ? standards.zone_results : []).map((zone: JsonRecord) => {
    const evidence = zones.find((item) => item.code === zone.zone_code);
    const zoneState = zone.resolution_state === "UNSUPPORTED_BY_RS_V0" ? "not_applicable" : displayState(zone.state, zone.source_state);
    const selected = (Array.isArray(zone.rules) ? zone.rules : [])
      .filter((rule: JsonRecord) => STANDARD_ORDER.includes(rule.standard_key))
      .sort((a: JsonRecord, b: JsonRecord) => STANDARD_ORDER.indexOf(a.standard_key) - STANDARD_ORDER.indexOf(b.standard_key))
      .map(standardItem);
    return {
      zoneCode: String(zone.zone_code),
      coverage: evidence?.coverage || null,
      state: zoneState,
      stateLabel: zoneState === "not_applicable" ? "Standards outside this RS adapter" : stateLabel(zoneState),
      explanation: zoneState === "not_applicable" ? "This zone remains visible, but its standards are outside the sealed RS base-standards resolver." : undefined,
      standards: selected,
    };
  });

  if (!standardsGroups.length && zones.length) {
    const unresolvedState: DisplayState = standards.source_state === "source_unavailable" ? "unavailable" : standards.resolution_state === "MAPPING_UNRESOLVED" ? "review" : "unknown";
    for (const zone of zones) {
      standardsGroups.push({
        zoneCode: zone.code,
        coverage: zone.coverage,
        state: unresolvedState,
        stateLabel: stateLabel(unresolvedState),
        explanation: (standards.unresolved_reasons || [])[0]?.detail || "No definitive standards set is selected.",
        standards: [],
      });
    }
  }

  if (!standardsGroups.length) {
    const state: DisplayState = standards.source_state === "source_unavailable" || input.state === "SOURCE_UNAVAILABLE" ? "unavailable" : "unknown";
    standardsGroups.push({
      zoneCode: "Base zone unresolved",
      coverage: null,
      state,
      stateLabel: stateLabel(state),
      explanation: (standards.unresolved_reasons || [])[0]?.detail || "Standards cannot be selected until base zoning and source evidence are available.",
      standards: [],
    });
  }

  const propertyFacts: DisplayValue[] = [
    factItem("Existing dwelling units", structure.existing_dwelling_units, "County assessor record", (value) => formatNumber(value)),
    factItem("Living area", structure.living_area, "County assessor living-area field", (value) => `${formatNumber(value)} sq ft`),
    {
      label: "Approximate parcel geometry area",
      value: finiteNumber(identity.approximate_geometry_area_sqft) ? `${formatNumber(identity.approximate_geometry_area_sqft)} sq ft` : "Not yet verified",
      state: finiteNumber(identity.approximate_geometry_area_sqft) ? "supported" : "unknown",
      stateLabel: finiteNumber(identity.approximate_geometry_area_sqft) ? "Derived geometry" : "Not yet verified",
      source: "Parcel geometry",
      detail: "Approximate GIS geometry area; this is not a legal-lot-area determination.",
    },
  ];
  if (finiteNumber(identity.taxable_acreage)) {
    propertyFacts.push({ label: "Taxable acreage", value: `${formatNumber(identity.taxable_acreage, 3)} acres`, state: "supported", stateLabel: "Recorded", source: "County assessor record", detail: "Taxable acreage does not establish Code-defined legal lot area." });
  }
  for (const footprint of (Array.isArray(structure.historical_footprints) ? structure.historical_footprints : []).filter((item: JsonRecord) => item.fact_key === "historical_building_footprint_area_sq_ft").slice(0, 3)) {
    const state = displayState(footprint.fact_state, footprint.source_state);
    propertyFacts.push({
      label: "Building outline evidence — 2017 imagery",
      value: state === "supported" && finiteNumber(footprint.value) ? `${formatNumber(footprint.value)} sq ft outline` : state === "unavailable" ? "Source currently unavailable" : "Not yet verified",
      state,
      stateLabel: stateLabel(state),
      source: "City/SANDAG historical building outlines",
      detail: "Historical plan-view outline evidence; it does not establish current completeness, living area, gross floor area, or compliance.",
    });
  }

  const actions = Array.isArray(input.next_investigation) ? input.next_investigation : [];
  const unresolved = Array.isArray(input.unresolved) ? input.unresolved : [];
  const ranked = unresolved
    .map((item: JsonRecord, index: number) => ({ item, index, rank: UNKNOWN_PRIORITY.indexOf(item.code) === -1 ? UNKNOWN_PRIORITY.length + index : UNKNOWN_PRIORITY.indexOf(item.code) }))
    .sort((a: JsonRecord, b: JsonRecord) => a.rank - b.rank)
    .map((entry: JsonRecord) => entry.item);
  const unknowns = ranked.map((item: JsonRecord) => ({
    label: UNKNOWN_LABELS[item.code] || String(item.code || "Unresolved fact").replaceAll("_", " ").toLowerCase(),
    value: item.category === "SOURCE_UNAVAILABLE" || String(item.code).includes("SOURCE_UNAVAILABLE") ? "Source currently unavailable" : "Not yet verified",
    state: (item.category === "SOURCE_UNAVAILABLE" || String(item.code).includes("SOURCE_UNAVAILABLE") ? "unavailable" : "unknown") as DisplayState,
    stateLabel: item.category === "SOURCE_UNAVAILABLE" || String(item.code).includes("SOURCE_UNAVAILABLE") ? "Source currently unavailable" : "Not yet verified",
    detail: item.detail,
    source: item.source_layer,
    linkedAction: actionForUnknown(item, actions),
    group: unknownGroup(String(item.code || "")),
  }));

  const investigations = actions.map((action: JsonRecord) => ({
    action: String(action.action),
    title: ACTION_TITLES[action.action] || String(action.action).replaceAll("_", " ").toLowerCase(),
    reason: String(action.reason),
    blockedConclusion: String(action.blocked_conclusion),
    requiredEvidence: String(action.required_evidence),
  }));

  const evidence = (Array.isArray(input.source_layers) ? input.source_layers : []).map((layer: JsonRecord) => {
    const state = layer.source_state === "source_unavailable" ? "unavailable" : "supported";
    return {
      layer: String(layer.layer),
      source: String(layer.artifact_path),
      version: String(layer.contract_version),
      state: state as DisplayState,
      stateLabel: stateLabel(state),
      artifactFingerprint: String(layer.artifact_sha256 || "Not available"),
      recordFingerprint: String(layer.record_fingerprint_sha256 || "Not available"),
    };
  });

  const address = typeof identity.situs_address === "string" && identity.situs_address.trim() ? identity.situs_address.trim() : null;
  const identityState = displayState(identity.state, identity.source_state);
  let standardsVersion = "Not available until zoning is resolved";
  let standardsVersionState: DisplayState = standards.source_state === "source_unavailable" ? "unavailable" : "unknown";
  if (coastal.evidence_state === "BOUNDARY_AMBIGUOUS") {
    standardsVersion = "Not selected — Coastal applicability unresolved";
    standardsVersionState = "review";
  } else if (standards.rule_set_version) {
    standardsVersion = String(standards.rule_set_version);
    standardsVersionState = "supported";
  }

  return {
    adapterVersion: ADAPTER_VERSION,
    sourceContractVersion: String(input.contract_version),
    asOf: String(input.as_of),
    sourceFingerprint: String(input.fingerprint_sha256),
    header: {
      title: address || `Parcel ${identity.apn}`,
      address,
      apn: String(identity.apn),
      jurisdiction: jurisdictionLabel(identity.jurisdiction_code),
      identityState,
      identityLabel: stateLabel(identityState),
    },
    orientation: {
      zoningLabel: zoningDisplay.label,
      zoningState: zoningDisplay.state,
      zones,
      coastalLabel: coastalDisplay.label,
      coastalState: coastalDisplay.state,
      standardsVersion,
      standardsVersionState,
      mappingEvidence: {
        state: String(zoning.mapping_evidence_state || zoning.mapping_state || "Not available"),
        methodVersion: String(zoning.mapping_method_version || "Not available"),
        acquisition: String(zoning.zoning_acquisition_id || "Not available"),
      },
      coastalEvidence: {
        areaShare: finiteNumber(coastal.coastal_area_share_percent) ? `${formatNumber(coastal.coastal_area_share_percent, 1)}%` : null,
        method: String(coastal.mapping_method || "Not available"),
        acquisition: String(coastal.provenance?.source_acquisition_id || "Not available"),
        featureIds: Array.isArray(coastal.source_feature_ids) ? coastal.source_feature_ids.map(String) : [],
      },
    },
    standardsGroups,
    propertyFacts,
    unknowns,
    investigations,
    evidence,
    capacity: {
      state: "not_evaluated",
      label: "Not evaluated yet",
      explanation: "TruLot has not evaluated parcel compliance or development capacity. Legal lot dimensions, rule conditions, and other project facts must be established first.",
    },
    safeguards: {
      parcelComplianceEvaluated: false,
      developmentCapacityCalculated: false,
      standardsBlended: false,
      productionRuntimeWired: false,
    },
  };
}

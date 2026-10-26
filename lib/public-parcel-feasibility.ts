import rendererContractJson from "@/data/bounded-feasibility-product-contract-v0/renderer-contract.json";
import schemaJson from "@/data/bounded-feasibility-product-contract-v0/schema.json";
import {
  CONTRACT_VERSION,
  EVIDENCE_TYPES,
  FeasibilityPreviewError,
  type ComparisonScope,
  type ContextState,
  type EligibilityState,
  type EvidenceEntry,
  type EvidenceType,
  type FeasibilityItem,
  type JsonSchema,
  type Measurement,
  type PreviewPayload,
  type ProductState,
  type RegulatoryUseState,
  type SummaryGroup,
  type VerificationState,
  validateFeasibilityPreviewPayload,
  validateRendererContract,
} from "./bounded-feasibility-preview";
import {
  buildSummary,
  deriveStateLabel,
} from "./feasibility-preview-presentation";
import type { ParcelPageSourceEntry } from "./source-freshness";
import {
  LA_MESA_PUBLIC_PROFILES,
  buildLaMesaDetails,
  buildLaMesaPayload,
} from "./la-mesa-public-feasibility";

export const PUBLIC_FEASIBILITY_ERROR_CODES = [
  "FEASIBILITY_PROFILE_UNAVAILABLE",
  "FEASIBILITY_BUILD_FAILED",
  "FEASIBILITY_VALIDATION_FAILED",
  "FEASIBILITY_PUBLIC_SCOPE_REJECTED",
] as const;

export type PublicFeasibilityErrorCode =
  (typeof PUBLIC_FEASIBILITY_ERROR_CODES)[number];
export type PublicJurisdictionId =
  | "CITY_OF_SAN_DIEGO"
  | "CITY_OF_LA_MESA"
  | (string & {});
export type PublicMeasurementKey =
  | "LOT_AREA"
  | "LOT_WIDTH"
  | "LOT_DEPTH"
  | "STREET_FRONTAGE";

export interface PublicMeasurementInput {
  value: number | null;
  unit: "sq ft" | "ft";
  sourceLabel: string;
  sourceDate: string | null;
  sourceUrl: string | null;
  availability: "AVAILABLE" | "MISSING" | "SOURCE_UNAVAILABLE";
}

export interface PublicMappedContextInput {
  mapped: boolean | null;
  verification:
    | "VERIFIED"
    | "PENDING"
    | "NOT_EVALUATED"
    | "SOURCE_UNAVAILABLE";
  sourceLabel: string;
  sourceDate: string | null;
  sourceUrl: string | null;
}

/** Narrow public input with no project, plan, survey, or private fields. */
export interface PublicLaMesaEvaluationInput {
  evaluationDate: string;
  aduProfile: "LA_MESA_ADU_2026";
  selectionState: "READY" | "PROFILE_UNAVAILABLE" | "JURISDICTION_UNRESOLVED";
  baseProfile: string | null;
  modifierIds: string[];
  missingPropertyFacts: string[];
  publicEvidenceOnly: true;
}

export interface PublicParcelFeasibilityInput {
  jurisdictionId: PublicJurisdictionId;
  parcelId: string;
  address: string | null;
  ruleProfileVersion: string;
  baseZoneCode: string | null;
  measurements: Partial<Record<PublicMeasurementKey, PublicMeasurementInput>>;
  coastalContext:
    | "OUTSIDE_COASTAL"
    | "INSIDE_COASTAL"
    | "UNKNOWN"
    | "SOURCE_UNAVAILABLE"
    | "NOT_APPLICABLE";
  contexts: {
    sda?: PublicMappedContextInput;
    fire?: PublicMappedContextInput;
    tpa?: PublicMappedContextInput;
  };
  sourceFreshness: string | null;
  laMesa?: PublicLaMesaEvaluationInput;
}

export interface PublicFeasibilitySummaryCount {
  group: Extract<
    SummaryGroup,
    | "MEETS_BASE_RULE"
    | "DOES_NOT_MEET_BASE_RULE"
    | "CONDITIONAL"
    | "NEEDS_EVIDENCE"
    | "NOT_EVALUATED"
    | "NOT_APPLICABLE"
    | "SOURCE_UNAVAILABLE"
  >;
  label: string;
  count: number;
}

export interface PublicFeasibilityRuleRow {
  id: string;
  name: string;
  family: string;
  state: ProductState;
  stateLabel: string;
  answer: string;
  explanation: string;
  requirement: string | null;
  fact: string | null;
  calculation: string | null;
  blocker: string | null;
  evidence: Array<{
    label: string;
    value: string | null;
    sourceDate: string | null;
    url: string | null;
  }>;
}

export interface PublicFeasibilityContextRecord {
  id: string;
  type: string;
  name: string;
  stateLabel: string;
  answer: string;
  mapped: boolean | null;
  verification: VerificationState;
  eligibility: EligibilityState;
  regulatoryUse: RegulatoryUseState;
}

/** Presentation-safe output; private/project fields are not representable. */
export type PublicLaMesaAnswerCategory =
  | "Likely state/local pathway available"
  | "Conditional"
  | "Needs property evidence"
  | "Needs project details"
  | "Outside current scope"
  | "Source unavailable";

export interface PublicJurisdictionFeasibilityDetails {
  evaluationEffectiveDate: string;
  municipalCodeProfile: string;
  developmentRules: {
    baseProfile: string | null;
    evaluationState: ProductState;
  };
  aduPathwaySummary: {
    profile: string | null;
    answerCategory: PublicLaMesaAnswerCategory;
    selectedPathwayIds: string[];
    pathwayCatalog: Array<{ id: string; label: string }>;
    currentDetachedSingleFamilyCount: number;
    permitApprovalConclusion: null;
    finalParcelEligibility: null;
  };
  mappedModifiers: string[];
  unresolvedPredicates: string[];
  publicEvidenceSources: Array<{
    label: string;
    publisher: string;
    date: string;
    url: string;
  }>;
}

export interface PublicParcelFeasibilityOutput {
  readiness: "READY" | "UNSUPPORTED_PROFILE" | "UNAVAILABLE";
  jurisdictionId: PublicJurisdictionId;
  baseZoneCode: string | null;
  summary: PublicFeasibilitySummaryCount[];
  rules: PublicFeasibilityRuleRow[];
  contexts: PublicFeasibilityContextRecord[];
  sourceRegistryAdditions: ParcelPageSourceEntry[];
  sectionMessage: string | null;
  errorCode: PublicFeasibilityErrorCode | null;
  jurisdictionDetails: PublicJurisdictionFeasibilityDetails | null;
}

export interface PublicRuleProfile {
  jurisdictionId: PublicJurisdictionId;
  zoneCode: string;
  version: string;
  coastalContexts: Array<PublicParcelFeasibilityInput["coastalContext"]>;
  kind: "RS" | "RM" | "LA_MESA_ADU";
}

const PROFILES: readonly PublicRuleProfile[] = [
  {
    jurisdictionId: "CITY_OF_SAN_DIEGO",
    zoneCode: "RS-1-7",
    version: "SD_CURRENT_2026_07_15",
    coastalContexts: ["OUTSIDE_COASTAL"],
    kind: "RS",
  },
  {
    jurisdictionId: "CITY_OF_SAN_DIEGO",
    zoneCode: "RM-2-5",
    version: "SD_CURRENT_2026_07_15",
    coastalContexts: ["OUTSIDE_COASTAL"],
    kind: "RM",
  },
  ...LA_MESA_PUBLIC_PROFILES,
] as const;

const renderer = validateRendererContract(rendererContractJson);
const schema = schemaJson as JsonSchema;
const PRIVATE_EVIDENCE = new Set<EvidenceType>(
  EVIDENCE_TYPES.filter((type) => type.startsWith("PRIVATE_")),
);
const CODE_URL =
  "https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division04.pdf";

export function listPublicFeasibilityProfiles(): readonly PublicRuleProfile[] {
  return PROFILES;
}

function selectProfile(
  input: PublicParcelFeasibilityInput,
): PublicRuleProfile | null {
  if (!input.baseZoneCode) return null;
  return (
    PROFILES.find(
      (profile) =>
        profile.jurisdictionId === input.jurisdictionId &&
        profile.zoneCode === input.baseZoneCode &&
        profile.version === input.ruleProfileVersion &&
        profile.coastalContexts.includes(input.coastalContext),
    ) ?? null
  );
}

function policy(
  decimals = 0,
  maxDecimalPlaces = 6,
): Measurement["display_policy"] {
  return {
    decimal_places: decimals,
    max_decimal_places: maxDecimalPlaces,
    trailing_zeros: false,
    qualifier: null,
  };
}

function publicEvidence(
  options: Partial<EvidenceEntry> &
    Pick<EvidenceEntry, "evidence_id" | "type" | "label">,
): EvidenceEntry {
  const entry: EvidenceEntry = {
    value: null,
    privacy: "PUBLIC_AUTHORITY",
    source_date: null,
    measurement_refs: [],
    rule_binding: null,
    project_status: null,
    survey_currentness: null,
    ...options,
  };
  if (entry.url === undefined) delete entry.url;
  return entry;
}

function emptyItem(
  id: string,
  name: string,
  family: string,
  section: FeasibilityItem["section"],
): FeasibilityItem {
  return {
    item_id: id,
    item_kind: "RULE",
    name,
    rule_family: family,
    section,
    result_state: null,
    comparison_scope: null,
    comparison: null,
    template_key: null,
    template_values: {},
    answer: null,
    explanation: "",
    display_requirement: null,
    display_fact: null,
    base_requirement: null,
    derived_requirement: null,
    exact_calculation: null,
    measurements: [],
    calculation: null,
    context_type: null,
    context_state: null,
    mapped_observation: null,
    verification_state: null,
    eligibility_state: null,
    regulatory_use_state: null,
    evidence_entries: [],
    blocker: null,
    privacy: "PUBLIC",
    actions: [],
  };
}

function comparisonItem(options: {
  id: string;
  name: string;
  family: string;
  requirement: number;
  fact: PublicMeasurementInput;
  unit: "sq ft" | "ft";
  explanation: string;
}): FeasibilityItem {
  const requirementId = `${options.id}-REQ`;
  const factId = `${options.id}-FACT`;
  const ruleEvidenceId = `${options.id}-RULE`;
  const factEvidenceId = `${options.id}-PUBLIC-FACT`;
  const comparisonEvidenceId = `${options.id}-COMPARISON`;
  const item = emptyItem(
    options.id,
    options.name,
    options.family,
    "PARCEL_DIMENSIONS",
  );
  item.item_kind = "COMPARISON";
  item.comparison_scope = "PARCEL_RULE";
  item.comparison = {
    rule_semantic: "MINIMUM_REQUIREMENT",
    rule_label: options.name.toLowerCase(),
    requirement_measurement_id: requirementId,
    fact_measurement_id: factId,
  };
  item.explanation = options.explanation;
  item.measurements = [
    {
      measurement_id: requirementId,
      role: "REQUIREMENT",
      exact_value: options.requirement,
      unit: options.unit,
      dimension: options.unit === "sq ft" ? "AREA" : "LENGTH",
      display_policy: policy(0),
      evidence_refs: [ruleEvidenceId, comparisonEvidenceId],
    },
    {
      measurement_id: factId,
      role: "FACT",
      exact_value: options.fact.value!,
      unit: options.unit,
      dimension: options.unit === "sq ft" ? "AREA" : "LENGTH",
      display_policy: policy(options.unit === "sq ft" ? 0 : 2),
      evidence_refs: [factEvidenceId, comparisonEvidenceId],
    },
  ];
  item.evidence_entries = [
    publicEvidence({
      evidence_id: ruleEvidenceId,
      type: "PUBLIC_CODE",
      label: "Authoritative rule",
      value: "San Diego Municipal Code residential base-zone standards",
      source_date: "Current compiled code",
      measurement_refs: [requirementId],
      rule_binding: {
        rule_semantic: "MINIMUM_REQUIREMENT",
        requirement_measurement_id: requirementId,
      },
      url: CODE_URL,
    }),
    publicEvidence({
      evidence_id: factEvidenceId,
      type: "PUBLIC_PARCEL_FACT",
      label: options.fact.sourceLabel,
      source_date: options.fact.sourceDate,
      measurement_refs: [factId],
      url: options.fact.sourceUrl ?? undefined,
    }),
    publicEvidence({
      evidence_id: comparisonEvidenceId,
      type: "COMPARISON_INPUT",
      label: "Validated comparison inputs",
      source_date: options.fact.sourceDate,
      measurement_refs: [requirementId, factId],
    }),
  ];
  return item;
}

function missingMeasurementItem(
  id: string,
  name: string,
  family: string,
  sourceUnavailable: boolean,
): FeasibilityItem {
  const item = emptyItem(id, name, family, "PARCEL_DIMENSIONS");
  item.result_state = sourceUnavailable ? "SOURCE_UNAVAILABLE" : "NEEDS_EVIDENCE";
  item.comparison_scope = "PARCEL_RULE";
  item.template_key = sourceUnavailable ? "SOURCE_UNAVAILABLE" : "NEEDS_EVIDENCE";
  item.template_values = sourceUnavailable
    ? { name: name.toLowerCase() }
    : { blocker: `${name} public parcel measurement is required.` };
  item.explanation =
    "No rule comparison is made without the required public parcel measurement.";
  if (sourceUnavailable) {
    item.evidence_entries = [
      publicEvidence({
        evidence_id: `${id}-SOURCE`,
        type: "PUBLIC_PARCEL_FACT",
        label: "Parcel source unavailable",
      }),
    ];
  } else {
    item.blocker = {
      code: `${id}_MISSING`,
      missing: `${name} public parcel measurement is required.`,
      why: "The parcel fact is required for a bounded comparison.",
    };
    item.evidence_entries = [
      publicEvidence({
        evidence_id: `${id}-BLOCKER`,
        type: "BLOCKER_EVIDENCE",
        label: "Missing public parcel fact",
        value: item.blocker.missing,
      }),
    ];
  }
  return item;
}

function comparisonOrMissing(options: {
  id: string;
  name: string;
  family: string;
  requirement: number;
  input: PublicMeasurementInput | undefined;
  unit: "sq ft" | "ft";
  explanation: string;
}): FeasibilityItem {
  if (options.input?.availability === "AVAILABLE" && options.input.value !== null) {
    return comparisonItem({ ...options, fact: options.input });
  }
  return missingMeasurementItem(
    options.id,
    options.name,
    options.family,
    options.input?.availability === "SOURCE_UNAVAILABLE",
  );
}

function conditionalRule(options: {
  id: string;
  name: string;
  family: string;
  section: FeasibilityItem["section"];
  requirement: string;
  explanation: string;
  measurement?: { value: number; unit: "ft" | "ratio"; decimals?: number };
}): FeasibilityItem {
  const item = emptyItem(
    options.id,
    options.name,
    options.family,
    options.section,
  );
  item.result_state = "CONDITIONAL";
  item.comparison_scope = "PARCEL_RULE";
  item.template_key = "CONDITIONAL_BASE_RULE";
  item.template_values = {
    name: options.name.toLowerCase(),
    requirement: options.requirement,
  };
  item.display_requirement = options.requirement;
  item.explanation = options.explanation;
  const evidenceId = `${options.id}-RULE`;
  if (options.measurement) {
    const measurementId = `${options.id}-REQ`;
    item.measurements = [
      {
        measurement_id: measurementId,
        role: "REQUIREMENT",
        exact_value: options.measurement.value,
        unit: options.measurement.unit,
        dimension: options.measurement.unit === "ft" ? "LENGTH" : "RATIO",
        display_policy: policy(options.measurement.decimals ?? 0),
        evidence_refs: [evidenceId],
      },
    ];
    item.evidence_entries = [
      publicEvidence({
        evidence_id: evidenceId,
        type: "PUBLIC_CODE",
        label: "Authoritative rule",
        value: options.requirement,
        source_date: "Current compiled code",
        measurement_refs: [measurementId],
        url: CODE_URL,
      }),
    ];
  } else {
    item.evidence_entries = [
      publicEvidence({
        evidence_id: evidenceId,
        type: "PUBLIC_CODE",
        label: "Authoritative rule",
        value: options.requirement,
        source_date: "Current compiled code",
        url: CODE_URL,
      }),
    ];
  }
  return item;
}

function rearRule(depth: PublicMeasurementInput | undefined): FeasibilityItem {
  if (!depth || depth.availability !== "AVAILABLE" || depth.value === null) {
    return missingMeasurementItem(
      "RS17_REAR",
      "Rear setback",
      "REAR_SETBACK",
      depth?.availability === "SOURCE_UNAVAILABLE",
    );
  }
  const calculated = depth.value * 0.1;
  const item = conditionalRule({
    id: "RS17_REAR",
    name: "Calculated rear setback rule",
    family: "REAR_SETBACK",
    section: "SETBACKS",
    requirement: `${calculated.toFixed(1)} ft`,
    explanation:
      "The table base is 13 ft, but this lot depth triggers the long-lot formula. Additional conditions may still modify the requirement.",
  });
  item.template_key = "CONDITIONAL_CURRENT_RULE";
  item.base_requirement = "13 ft";
  const inputId = "RS17_REAR-DEPTH";
  const resultId = "RS17_REAR-RESULT";
  const baseId = "RS17_REAR-BASE";
  const evidenceId = "RS17_REAR-RULE";
  item.measurements = [
    {
      measurement_id: inputId,
      role: "FACT",
      exact_value: depth.value,
      unit: "ft",
      dimension: "LENGTH",
      display_policy: policy(2, 6),
      evidence_refs: [evidenceId],
    },
    {
      measurement_id: resultId,
      role: "DERIVED_REQUIREMENT",
      exact_value: calculated,
      unit: "ft",
      dimension: "LENGTH",
      display_policy: policy(1, 3),
      evidence_refs: [evidenceId],
    },
    {
      measurement_id: baseId,
      role: "REQUIREMENT",
      exact_value: 13,
      unit: "ft",
      dimension: "LENGTH",
      display_policy: policy(),
      evidence_refs: [evidenceId],
    },
  ];
  item.calculation = {
    operation: "MULTIPLY",
    input_measurement_id: inputId,
    factor: 0.1,
    result_measurement_id: resultId,
  };
  item.evidence_entries = [
    publicEvidence({
      evidence_id: evidenceId,
      type: "PUBLIC_CODE",
      label: "Rear-setback rule and public lot-depth input",
      source_date: depth.sourceDate,
      measurement_refs: [inputId, resultId, baseId],
      url: CODE_URL,
    }),
  ];
  return item;
}

function stateRule(options: {
  id: string;
  name: string;
  family: string;
  section: FeasibilityItem["section"];
  state: "NOT_APPLICABLE" | "NOT_EVALUATED" | "NEEDS_EVIDENCE";
  scope: ComparisonScope;
  explanation: string;
  blocker?: string;
}): FeasibilityItem {
  const item = emptyItem(
    options.id,
    options.name,
    options.family,
    options.section,
  );
  item.result_state = options.state;
  item.comparison_scope = options.scope;
  item.template_key = options.state;
  item.template_values =
    options.state === "NEEDS_EVIDENCE"
      ? { blocker: options.blocker! }
      : options.state === "NOT_EVALUATED"
        ? { name: options.name.toLowerCase() }
        : {};
  item.explanation = options.explanation;
  if (options.state === "NEEDS_EVIDENCE") {
    item.blocker = {
      code: `${options.id}_EVIDENCE_REQUIRED`,
      missing: options.blocker!,
      why: options.explanation,
    };
    item.evidence_entries = [
      publicEvidence({
        evidence_id: `${options.id}-BLOCKER`,
        type: "BLOCKER_EVIDENCE",
        label: "Evidence required",
        value: options.blocker!,
      }),
    ];
  } else {
    item.evidence_entries = [
      publicEvidence({
        evidence_id: `${options.id}-RULE`,
        type: "PUBLIC_CODE",
        label: "Applicability record",
        value: options.explanation,
        source_date: "Current compiled code",
        url: CODE_URL,
      }),
    ];
  }
  return item;
}

function contextItem(
  id: string,
  type: string,
  name: string,
  input: PublicMappedContextInput,
): FeasibilityItem {
  let state: ContextState;
  let verification: VerificationState;
  let eligibility: EligibilityState;
  let regulatory: RegulatoryUseState;
  if (input.verification === "SOURCE_UNAVAILABLE") {
    state = "SOURCE_UNAVAILABLE";
    verification = "SOURCE_UNAVAILABLE";
    eligibility = "SOURCE_UNAVAILABLE";
    regulatory = "SOURCE_UNAVAILABLE";
  } else if (input.verification === "PENDING" && input.mapped === true) {
    state = "MAPPED_VERIFICATION_PENDING";
    verification = "PENDING";
    eligibility = "NOT_EVALUATED";
    regulatory = "NOT_USED_PENDING_VERIFICATION";
  } else if (input.verification === "VERIFIED" && input.mapped === true) {
    state = "MAPPED_VERIFIED";
    verification = "VERIFIED";
    eligibility = "NOT_EVALUATED";
    regulatory = "CONTEXT_ONLY";
  } else if (input.verification === "VERIFIED" && input.mapped === false) {
    state = "NO_MAPPED_INTERSECTION";
    verification = "NO_INTERSECTION";
    eligibility = "NOT_EVALUATED";
    regulatory = "CONTEXT_ONLY";
  } else {
    state = "NOT_EVALUATED";
    verification = "NOT_EVALUATED";
    eligibility = "NOT_EVALUATED";
    regulatory = "NOT_EVALUATED";
  }
  const item = emptyItem(id, name, type.toUpperCase(), "MAPPED_CONTEXT");
  item.item_kind = "CONTEXT";
  item.context_type = type;
  item.context_state = state;
  item.mapped_observation =
    state === "SOURCE_UNAVAILABLE" || state === "NOT_EVALUATED"
      ? null
      : input.mapped;
  item.verification_state = verification;
  item.eligibility_state = eligibility;
  item.regulatory_use_state = regulatory;
  item.template_key =
    state === "MAPPED_VERIFICATION_PENDING"
      ? "MAPPED_CONTEXT_PENDING"
      : state === "MAPPED_VERIFIED"
        ? "MAPPED_CONTEXT"
        : state === "NO_MAPPED_INTERSECTION"
          ? "NO_MAPPED_CONTEXT"
          : state;
  item.template_values = { name };
  item.explanation =
    regulatory === "NOT_USED_PENDING_VERIFICATION"
      ? "Eligibility is not evaluated and the mapped observation is not used for a regulatory conclusion."
      : "Mapped geography is context only; it is not project compliance.";
  item.evidence_entries = [
    publicEvidence({
      evidence_id: `${id}-MAPPING`,
      type: "PUBLIC_MAPPING",
      label: input.sourceLabel,
      value:
        input.mapped === null
          ? null
          : input.mapped
            ? "Mapped geometry detected"
            : "No mapped intersection detected",
      source_date: input.sourceDate,
      url: input.sourceUrl ?? undefined,
    }),
  ];
  return item;
}

function buildRsItems(input: PublicParcelFeasibilityInput): FeasibilityItem[] {
  return [
    comparisonOrMissing({
      id: "RS17_AREA",
      name: "Lot area",
      family: "MINIMUM_LOT_AREA",
      requirement: 5000,
      input: input.measurements.LOT_AREA,
      unit: "sq ft",
      explanation:
        "The supported Code-defined lot area is compared only with the RS-1-7 base minimum.",
    }),
    comparisonOrMissing({
      id: "RS17_WIDTH",
      name: "Lot width",
      family: "MINIMUM_LOT_WIDTH",
      requirement: 50,
      input: input.measurements.LOT_WIDTH,
      unit: "ft",
      explanation:
        "The supported Code-defined lot width is compared only with the RS-1-7 base minimum.",
    }),
    comparisonOrMissing({
      id: "RS17_DEPTH",
      name: "Lot depth",
      family: "MINIMUM_LOT_DEPTH",
      requirement: 95,
      input: input.measurements.LOT_DEPTH,
      unit: "ft",
      explanation:
        "The supported Code-defined lot depth is compared only with the RS-1-7 base minimum.",
    }),
    comparisonOrMissing({
      id: "RS17_FRONTAGE",
      name: "Frontage",
      family: "MINIMUM_STREET_FRONTAGE",
      requirement: 50,
      input: input.measurements.STREET_FRONTAGE,
      unit: "ft",
      explanation:
        "The supported frontage is compared only with the selected RS-1-7 base requirement.",
    }),
    conditionalRule({
      id: "RS17_FRONT",
      name: "Front setback",
      family: "FRONT_SETBACK",
      section: "SETBACKS",
      requirement: "15 ft base",
      explanation:
        "Lot slope, street geometry, and project-specific Fire conditions may modify the requirement.",
      measurement: { value: 15, unit: "ft" },
    }),
    rearRule(input.measurements.LOT_DEPTH),
    conditionalRule({
      id: "RS17_SIDE",
      name: "Interior-side setback",
      family: "INTERIOR_SIDE_SETBACK",
      section: "SETBACKS",
      requirement: "4 ft ordinary base on each side",
      explanation:
        "Additions, side-yard reallocation, projections, and project-specific Fire conditions remain separate.",
      measurement: { value: 4, unit: "ft" },
    }),
    stateRule({
      id: "RS17_STREET_SIDE",
      name: "Street-side setback",
      family: "STREET_SIDE_SETBACK",
      section: "SETBACKS",
      state: "NOT_APPLICABLE",
      scope: "PARCEL_RULE",
      explanation:
        "The recorded public lot configuration has no street-side property line.",
    }),
    stateRule({
      id: "RS17_EXISTING",
      name: "Existing-building setbacks",
      family: "EXISTING_STRUCTURE_SETBACKS",
      section: "EVIDENCE_NEEDED",
      state: "NEEDS_EVIDENCE",
      scope: "EXISTING_STRUCTURE",
      blocker:
        "A current survey tied to the Code-defined building frame and legal boundaries is required.",
      explanation:
        "A parcel rule is not an existing-structure compliance result.",
    }),
    conditionalRule({
      id: "RS17_HEIGHT",
      name: "Height profile",
      family: "STRUCTURE_HEIGHT",
      section: "HEIGHT_FAR",
      requirement:
        "24 ft base with a 30 ft envelope and angled-plane conditions",
      explanation:
        "The applicable height envelope depends on Code-defined lot width and project geometry.",
    }),
    conditionalRule({
      id: "RS17_FAR",
      name: "FAR profile",
      family: "FAR",
      section: "HEIGHT_FAR",
      requirement:
        "base FAR branch requires additional parcel and project facts",
      explanation:
        "An exact FAR branch is not selected from the current public parcel evidence.",
    }),
  ];
}

function buildRmItems(input: PublicParcelFeasibilityInput): FeasibilityItem[] {
  const items: FeasibilityItem[] = [
    conditionalRule({
      id: "RM25_BASE_HEIGHT",
      name: "Height rule",
      family: "STRUCTURE_HEIGHT",
      section: "HEIGHT_FAR",
      requirement: "40 ft maximum with angled-plane and overlay conditions",
      explanation:
        "The base profile remains conditional on the identified envelope and overlay conditions.",
      measurement: { value: 40, unit: "ft" },
    }),
    stateRule({
      id: "RM25_PROJECT_HEIGHT",
      name: "Project height",
      family: "STRUCTURE_HEIGHT",
      section: "HEIGHT_FAR",
      state: "NOT_EVALUATED",
      scope: "PROJECT_SPECIFIC",
      explanation:
        "No project-specific height comparison is made in the public parcel view.",
    }),
    conditionalRule({
      id: "RM25_BASE_FAR",
      name: "FAR rule",
      family: "FAR",
      section: "HEIGHT_FAR",
      requirement: "1.35 base maximum before any verified modifier",
      explanation:
        "The public base FAR profile does not establish project FAR.",
      measurement: { value: 1.35, unit: "ratio", decimals: 2 },
    }),
    stateRule({
      id: "RM25_PROJECT_FAR",
      name: "Project FAR",
      family: "FAR",
      section: "HEIGHT_FAR",
      state: "NOT_EVALUATED",
      scope: "PROJECT_SPECIFIC",
      explanation:
        "No project-specific FAR comparison is made in the public parcel view.",
    }),
  ];
  if (input.contexts.sda) {
    items.push(contextItem("RM25_SDA", "SDA", "SDA", input.contexts.sda));
  }
  if (input.contexts.fire) {
    items.push(contextItem("RM25_FIRE", "FIRE", "Fire", input.contexts.fire));
  }
  return items;
}

function buildPayload(
  input: PublicParcelFeasibilityInput,
  profile: PublicRuleProfile,
): PreviewPayload {
  return {
    contract_version: CONTRACT_VERSION,
    scope: "PUBLIC_PARCEL",
    privacy: "PUBLIC",
    subject: {
      eyebrow: "Public parcel rule evaluation",
      title: input.address ?? `Parcel ${input.parcelId}`,
      detail: `${input.baseZoneCode ?? "Zone unavailable"} public parcel sources`,
    },
    base_facts: [
      {
        fact_id: "zone",
        label: "Base zone identified",
        value: input.baseZoneCode ?? "Unavailable",
      },
      {
        fact_id: "jurisdiction",
        label: "Jurisdiction",
        value: input.jurisdictionId,
      },
      {
        fact_id: "scope",
        label: "Evidence scope",
        value: "Public parcel sources only",
      },
    ],
    project_context: null,
    overall_state: "PARTIAL_EVALUATION",
    items: profile.kind === "RS" ? buildRsItems(input) : buildRmItems(input),
    actions: [],
    provenance: [
      {
        artifact: "Authoritative public code and parcel evidence",
        privacy: "PUBLIC_AUTHORITY",
      },
    ],
  };
}

export function assertPublicFeasibilityPayload(payload: PreviewPayload): void {
  if (
    payload.scope !== "PUBLIC_PARCEL" ||
    payload.privacy !== "PUBLIC" ||
    payload.project_context !== null ||
    payload.provenance.some((entry) => entry.privacy !== "PUBLIC_AUTHORITY")
  ) {
    throw new FeasibilityPreviewError("PUBLIC_SCOPE_PRIVACY");
  }
  for (const item of payload.items) {
    if (
      item.privacy !== "PUBLIC" ||
      item.evidence_entries.some(
        (entry) =>
          entry.privacy !== "PUBLIC_AUTHORITY" ||
          PRIVATE_EVIDENCE.has(entry.type),
      ) ||
      (item.comparison && item.comparison_scope !== "PARCEL_RULE")
    ) {
      throw new FeasibilityPreviewError("PUBLIC_PRIVATE_EVIDENCE");
    }
  }
}

const COUNTABLE_GROUPS = new Set<PublicFeasibilitySummaryCount["group"]>([
  "MEETS_BASE_RULE",
  "DOES_NOT_MEET_BASE_RULE",
  "CONDITIONAL",
  "NEEDS_EVIDENCE",
  "NOT_EVALUATED",
  "NOT_APPLICABLE",
  "SOURCE_UNAVAILABLE",
]);

function sourceRegistry(payload: PreviewPayload): ParcelPageSourceEntry[] {
  const byUrl = new Map<string, ParcelPageSourceEntry>();
  for (const entry of payload.items.flatMap((item) => item.evidence_entries)) {
    if (entry.privacy !== "PUBLIC_AUTHORITY" || !entry.url) continue;
    if (!byUrl.has(entry.url)) {
      byUrl.set(entry.url, {
        dataset: entry.label,
        publisher: entry.url.includes("sandiego.gov")
          ? "City of San Diego"
          : "Public authority",
        vintageOrRefresh: entry.source_date ?? "Source date unavailable",
        url: entry.url,
      });
    }
  }
  return [...byUrl.values()];
}

function present(
  input: PublicParcelFeasibilityInput,
  payload: PreviewPayload,
): PublicParcelFeasibilityOutput {
  const summary = buildSummary(payload)
    .filter((entry) =>
      COUNTABLE_GROUPS.has(
        entry.group as PublicFeasibilitySummaryCount["group"],
      ),
    )
    .map((entry) => ({
      group: entry.group as PublicFeasibilitySummaryCount["group"],
      label: entry.title,
      count: entry.items.length,
    }));
  const rules = payload.items
    .filter(
      (item) =>
        item.item_kind !== "FACT" &&
        item.item_kind !== "CONTEXT" &&
        item.result_state,
    )
    .map(
      (item): PublicFeasibilityRuleRow => ({
        id: item.item_id,
        name: item.name,
        family: item.rule_family,
        state: item.result_state!,
        stateLabel: deriveStateLabel(item),
        answer: item.answer!,
        explanation: item.explanation,
        requirement: item.display_requirement,
        fact: item.display_fact,
        calculation: item.exact_calculation,
        blocker: item.blocker?.missing ?? null,
        evidence: item.evidence_entries.map((entry) => ({
          label: entry.label,
          value: entry.value,
          sourceDate: entry.source_date,
          url: entry.url ?? null,
        })),
      }),
    );
  const contexts = payload.items
    .filter((item) => item.item_kind === "CONTEXT")
    .map(
      (item): PublicFeasibilityContextRecord => ({
        id: item.item_id,
        type: item.context_type!,
        name: item.name,
        stateLabel: deriveStateLabel(item),
        answer: item.answer!,
        mapped: item.mapped_observation,
        verification: item.verification_state!,
        eligibility: item.eligibility_state!,
        regulatoryUse: item.regulatory_use_state!,
      }),
    );
  return {
    readiness: "READY",
    jurisdictionId: input.jurisdictionId,
    baseZoneCode: input.baseZoneCode,
    summary,
    rules,
    contexts,
    sourceRegistryAdditions: sourceRegistry(payload),
    sectionMessage: null,
    errorCode: null,
    jurisdictionDetails:
      input.jurisdictionId === "CITY_OF_LA_MESA"
        ? buildLaMesaDetails(input)
        : null,
  };
}

function unavailable(
  input: PublicParcelFeasibilityInput,
  errorCode: PublicFeasibilityErrorCode,
): PublicParcelFeasibilityOutput {
  return {
    readiness: "UNAVAILABLE",
    jurisdictionId: input.jurisdictionId,
    baseZoneCode: input.baseZoneCode,
    summary: [],
    rules: [],
    contexts: [],
    sourceRegistryAdditions: [],
    sectionMessage: "Detailed rule evaluation temporarily unavailable.",
    errorCode,
    jurisdictionDetails: null,
  };
}

export function buildPublicParcelFeasibility(
  input: PublicParcelFeasibilityInput,
): PublicParcelFeasibilityOutput {
  const profile = selectProfile(input);
  const laMesaBoundedFallback =
    input.jurisdictionId === "CITY_OF_LA_MESA" &&
    input.laMesa &&
    input.laMesa.selectionState !== "READY";
  if (!profile && !laMesaBoundedFallback) {
    return {
      readiness: "UNSUPPORTED_PROFILE",
      jurisdictionId: input.jurisdictionId,
      baseZoneCode: input.baseZoneCode,
      summary: [],
      rules: [],
      contexts: [],
      sourceRegistryAdditions: [],
      sectionMessage:
        "Detailed development-rule evaluation is not yet available for this zone.",
      errorCode: "FEASIBILITY_PROFILE_UNAVAILABLE",
      jurisdictionDetails: null,
    };
  }
  let source: PreviewPayload;
  try {
    source =
      input.jurisdictionId === "CITY_OF_LA_MESA"
        ? buildLaMesaPayload(input)
        : buildPayload(input, profile!);
  } catch (error) {
    console.error(
      `[FEASIBILITY_BUILD_FAILED] ${error instanceof Error ? error.name : "UNKNOWN"}`,
    );
    return unavailable(input, "FEASIBILITY_BUILD_FAILED");
  }
  let validated: PreviewPayload;
  try {
    validated = validateFeasibilityPreviewPayload(
      source,
      renderer.templates,
      schema,
      renderer.projectStatusLabels,
    );
  } catch (error) {
    console.error(
      `[FEASIBILITY_VALIDATION_FAILED] ${error instanceof FeasibilityPreviewError ? `${error.code} ${error.message}` : "UNKNOWN"}`,
    );
    return unavailable(input, "FEASIBILITY_VALIDATION_FAILED");
  }
  try {
    assertPublicFeasibilityPayload(validated);
    return present(input, validated);
  } catch (error) {
    console.error(
      `[FEASIBILITY_PUBLIC_SCOPE_REJECTED] ${error instanceof FeasibilityPreviewError ? error.code : "UNKNOWN"}`,
    );
    return unavailable(input, "FEASIBILITY_PUBLIC_SCOPE_REJECTED");
  }
}

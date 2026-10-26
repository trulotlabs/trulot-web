import registryJson from "@/data/la-mesa-v4-benchmark-integration-v0/jurisdiction-registry.json";
import type { FeasibilityItem, PreviewPayload, ProductState } from "./bounded-feasibility-preview";
import type {
  PublicJurisdictionFeasibilityDetails,
  PublicParcelFeasibilityInput,
  PublicRuleProfile,
} from "./public-parcel-feasibility";

export const LA_MESA_JURISDICTION_ID = "CITY_OF_LA_MESA";
export const LA_MESA_PROFILE_VERSION = "LA_MESA_TITLE24_2026_10_04";
export const LA_MESA_ADU_PROFILE_2026 = "LA_MESA_ADU_2026";

export const LA_MESA_PUBLIC_PROFILES: readonly PublicRuleProfile[] =
  registryJson.profiles.map((profile) => ({
    jurisdictionId: profile.jurisdictionId,
    zoneCode: profile.zoneCode,
    version: profile.version,
    coastalContexts: profile.coastalContexts as PublicRuleProfile["coastalContexts"],
    kind: "LA_MESA_ADU" as const,
  }));

const PRIVATE_KEYS = new Set([
  "privateProjectFacts",
  "privatePlanFacts",
  "privateSurveyEvidence",
  "authenticatedWorkContext",
]);

function assertBoundedInput(input: PublicParcelFeasibilityInput): void {
  const candidate = input as unknown as Record<string, unknown>;
  for (const key of PRIVATE_KEYS) {
    if (key in candidate) throw new Error("PRIVATE_INPUT_REJECTED");
  }
  if (!input.laMesa) throw new Error("LA_MESA_CONTEXT_REQUIRED");
  if (input.laMesa.publicEvidenceOnly !== true) {
    throw new Error("PUBLIC_EVIDENCE_REQUIRED");
  }
  if (!/^2026-\d{2}-\d{2}$/.test(input.laMesa.evaluationDate)) {
    throw new Error("LA_MESA_2026_DATE_REQUIRED");
  }
  if (input.laMesa.aduProfile !== LA_MESA_ADU_PROFILE_2026) {
    throw new Error("LA_MESA_2026_ADU_PROFILE_REQUIRED");
  }
}

function evidence(sourceId: string) {
  const source = registryJson.sources.find((entry) => entry.id === sourceId);
  if (!source) throw new Error(`SOURCE_MISSING:${sourceId}`);
  return {
    evidence_id: `LM-${sourceId}`,
    type: sourceId === "LM_ZONING" ? "PUBLIC_MAPPING" as const : "PUBLIC_CODE" as const,
    label: source.label,
    value: null,
    privacy: "PUBLIC_AUTHORITY" as const,
    source_date: source.date,
    measurement_refs: [],
    rule_binding: null,
    project_status: null,
    survey_currentness: null,
    url: source.url,
  };
}

function stateItem(options: {
  state: Extract<ProductState, "NEEDS_EVIDENCE" | "OUTSIDE_CURRENT_SCOPE" | "SOURCE_UNAVAILABLE">;
  name: string;
  explanation: string;
  blocker?: string;
}): FeasibilityItem {
  return {
    item_id: "LM_ADU_PATHWAY",
    item_kind: "RULE",
    name: options.name,
    rule_family: "ADU_PATHWAY",
    section: "EVIDENCE_NEEDED",
    result_state: options.state,
    comparison_scope: "PARCEL_RULE",
    comparison: null,
    template_key: options.state,
    template_values:
      options.state === "NEEDS_EVIDENCE"
        ? { blocker: options.blocker! }
        : { name: options.name.toLowerCase() },
    answer: null,
    explanation: options.explanation,
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
    evidence_entries:
      options.state === "NEEDS_EVIDENCE"
        ? [
            evidence("LM_TITLE24"),
            evidence("CA_ADU_STATUTE"),
            evidence("LM_ADU_MATRIX"),
            evidence("HCD_ADU"),
            {
              evidence_id: "LM-ADU-BLOCKER",
              type: "BLOCKER_EVIDENCE",
              label: "Missing public property fact",
              value: options.blocker!,
              privacy: "PUBLIC_AUTHORITY",
              source_date: null,
              measurement_refs: [],
              rule_binding: null,
              project_status: null,
              survey_currentness: null,
            },
          ]
        : [evidence("LM_ZONING")],
    blocker:
      options.state === "NEEDS_EVIDENCE"
        ? {
            code: "LM_PRIMARY_DWELLING_TYPE_REQUIRED",
            missing: options.blocker!,
            why: "Zoning does not establish the existing or proposed dwelling type required by the 2026 ADU pathways.",
          }
        : null,
    privacy: "PUBLIC",
    actions: [],
  };
}

function publicAnswer(state: ProductState): PublicJurisdictionFeasibilityDetails["aduPathwaySummary"]["answerCategory"] {
  if (state === "NEEDS_EVIDENCE") return "Needs property evidence";
  if (state === "SOURCE_UNAVAILABLE") return "Source unavailable";
  return "Outside current scope";
}

function resultState(input: PublicParcelFeasibilityInput): Extract<ProductState, "NEEDS_EVIDENCE" | "OUTSIDE_CURRENT_SCOPE" | "SOURCE_UNAVAILABLE"> {
  if (input.laMesa!.selectionState === "JURISDICTION_UNRESOLVED") return "SOURCE_UNAVAILABLE";
  if (input.laMesa!.selectionState === "PROFILE_UNAVAILABLE") return "OUTSIDE_CURRENT_SCOPE";
  return "NEEDS_EVIDENCE";
}

export function buildLaMesaPayload(input: PublicParcelFeasibilityInput): PreviewPayload {
  assertBoundedInput(input);
  const state = resultState(input);
  const blocker = "Authoritative public evidence of the primary dwelling type and existing/proposed status is required.";
  const explanation =
    state === "SOURCE_UNAVAILABLE"
      ? "City jurisdiction is unresolved, so a La Mesa profile is not selected."
      : state === "OUTSIDE_CURRENT_SCOPE"
        ? "No supported operative residential base profile is available; no neighboring profile is substituted."
        : "The 2026 rule catalog remains unselected until dwelling type is supported; zoning alone is not used to infer it.";
  return {
    contract_version: "bounded-feasibility-product-contract-v4-2026-10-02-p60f",
    scope: "PUBLIC_PARCEL",
    privacy: "PUBLIC",
    subject: {
      eyebrow: "Public parcel rule evaluation",
      title: input.address ?? `Parcel ${input.parcelId}`,
      detail: `${input.baseZoneCode ?? "Zone unavailable"} public parcel sources`,
    },
    base_facts: [
      { fact_id: "zone", label: "Base zone identified", value: input.baseZoneCode ?? "Unavailable" },
      { fact_id: "jurisdiction", label: "Jurisdiction", value: input.jurisdictionId },
      { fact_id: "effective-date", label: "Evaluation effective date", value: input.laMesa!.evaluationDate },
      { fact_id: "scope", label: "Evidence scope", value: "Public parcel sources only" },
    ],
    project_context: null,
    overall_state:
      state === "SOURCE_UNAVAILABLE"
        ? "SOURCE_UNAVAILABLE"
        : state === "OUTSIDE_CURRENT_SCOPE"
          ? "OUTSIDE_CURRENT_SCOPE"
          : "MORE_EVIDENCE_NEEDED",
    items: [
      stateItem({
        state,
        name: "La Mesa ADU pathway",
        explanation,
        blocker: state === "NEEDS_EVIDENCE" ? blocker : undefined,
      }),
    ],
    actions: [],
    provenance: [
      { artifact: "Authoritative public La Mesa and California sources", privacy: "PUBLIC_AUTHORITY" },
    ],
  };
}

export function buildLaMesaDetails(input: PublicParcelFeasibilityInput): PublicJurisdictionFeasibilityDetails {
  assertBoundedInput(input);
  const state = resultState(input);
  return {
    evaluationEffectiveDate: input.laMesa!.evaluationDate,
    municipalCodeProfile: LA_MESA_PROFILE_VERSION,
    developmentRules: {
      baseProfile: input.laMesa!.baseProfile,
      evaluationState: state,
    },
    aduPathwaySummary: {
      profile: input.laMesa!.selectionState === "READY" ? LA_MESA_ADU_PROFILE_2026 : null,
      answerCategory: publicAnswer(state),
      selectedPathwayIds: [],
      pathwayCatalog: [
        ...registryJson.pathways.singleFamily2026,
        ...registryJson.pathways.multifamilyExisting2026,
        ...registryJson.pathways.multifamilyProposed2026,
      ].map((path) => ({ id: path.id, label: path.label })),
      currentDetachedSingleFamilyCount: 1,
      permitApprovalConclusion: null,
      finalParcelEligibility: null,
    },
    mappedModifiers: [...input.laMesa!.modifierIds],
    unresolvedPredicates: [...input.laMesa!.missingPropertyFacts],
    publicEvidenceSources: registryJson.sources.map((source) => ({
      label: source.label,
      publisher: source.publisher,
      date: source.date,
      url: source.url,
    })),
  };
}

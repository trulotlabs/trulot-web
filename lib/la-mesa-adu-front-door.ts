import {
  searchParcelLookup,
  type ParcelLookupSearchRecord,
} from "./parcel-lookup-contract";
import type { AssessorPropertyIntelligence, PreliminaryDwellingState } from "./property-intelligence";

export const LA_MESA_ADU_PREVIEW_ENV = "TRULOT_LA_MESA_ADU_PREVIEW";

export type LaMesaPreviewEnvironment = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  TRULOT_LA_MESA_ADU_PREVIEW?: string;
};

export function laMesaAduPreviewEnabled(
  environment: LaMesaPreviewEnvironment = process.env,
): boolean {
  if (environment.TRULOT_LA_MESA_ADU_PREVIEW !== "1") return false;
  if (environment.VERCEL_ENV === "production") return false;
  if (environment.VERCEL_ENV === "preview") return true;
  return environment.NODE_ENV === "development" || environment.NODE_ENV === "test";
}

export type FrontDoorJurisdiction =
  | "CITY_OF_LA_MESA"
  | "CITY_OF_SAN_DIEGO"
  | "OUTSIDE_LA_MESA"
  | "UNRESOLVED";

export type FrontDoorCandidate = {
  address: string | null;
  displayAddress: string;
  unit: string | null;
  apn: string;
  apnDisplay: string;
  jurisdiction: FrontDoorJurisdiction;
  jurisdictionLabel: string;
  confidence: "EXACT" | "PARTIAL";
  rank: number;
  ambiguous: boolean;
  canonicalScopeState: "IN_SCOPE_CONFIRMED" | "JURISDICTION_UNRESOLVED" | "OUTSIDE_CANONICAL_SCOPE";
  authority:
    | "SEALED_PUBLIC_BENCHMARK"
    | "SEALED_PUBLIC_SERVING"
    | "CROSS_JURISDICTION_COMPARISON";
};

export type FrontDoorLookupResult = {
  state:
    | "EXACT_MATCH"
    | "MULTIPLE_MATCHES"
    | "PARTIAL_MATCHES"
    | "NO_MATCH"
    | "INVALID_QUERY";
  candidates: FrontDoorCandidate[];
  message: string | null;
};

export type UserProvidedValue<T extends string> = {
  value: T;
  provenance: "USER_PROVIDED";
};

export type ExistingUse =
  | "ONE_DETACHED_HOUSE"
  | "TWO_OR_MORE_DWELLINGS"
  | "CONDOMINIUM"
  | "VACANT_LAND"
  | "NOT_SURE";
export type AduIdea =
  | "NEW_DETACHED_ADU"
  | "ATTACHED_ADDITION"
  | "CONVERSION"
  | "JADU"
  | "NOT_SURE";
export type ExistingSpace = "YES" | "NO" | "NOT_SURE";

export type HomeownerAnswers = {
  existingUse: UserProvidedValue<ExistingUse>;
  aduIdea: UserProvidedValue<AduIdea>;
  existingSpace?: UserProvidedValue<ExistingSpace>;
};

export type PropertyRecordConfirmation = "YES" | "NO" | "NOT_SURE";

export type FrontDoorAnswerCategory =
  | "Likely state/local pathway available"
  | "Conditional"
  | "Needs property evidence"
  | "Needs project details"
  | "Outside current scope"
  | "Source unavailable";

export type FrontDoorPathway = {
  id: string;
  label: string;
  category: FrontDoorAnswerCategory;
  reason: string;
  majorConstraint: string;
  stillNeeded: string[];
};

export type FrontDoorEvaluation = {
  parcel: FrontDoorCandidate;
  jurisdictionConfirmed: boolean;
  baseZone: string | null;
  baseProfile: string | null;
  answerCategory: FrontDoorAnswerCategory;
  headline: string;
  mappedContexts: Array<{ id: string; label: string; explanation: string }>;
  specificPlanMessage: string | null;
  missingFacts: string[];
  pathways: FrontDoorPathway[];
  homeownerAnswers: HomeownerAnswers | null;
  propertyIntelligence: FrontDoorPropertyIntelligence | null;
  propertyFactConflicts: string[];
  userAnswerLimits: string[];
  evidenceSources: Array<{ label: string; publisher: string; date: string; url: string }>;
  evaluationDate: string | null;
  futureChangeNotice: string | null;
  errorMessage: string | null;
};

export type FrontDoorPublicEvaluation = {
  baseZone: string | null;
  baseProfile: string | null;
  answerCategory: FrontDoorAnswerCategory;
  mappedModifierIds: string[];
  missingFacts: string[];
  pathwayCatalog: Array<{ id: string; label: string }>;
  evidenceSources: Array<{ label: string; publisher: string; date: string; url: string }>;
  evaluationDate: string | null;
  specificPlanBoundaryUnresolved: boolean;
  available: boolean;
};

export type LaMesaFrontDoorSearchRecord = ParcelLookupSearchRecord & {
  jurisdictionId:
    | "CITY_OF_LA_MESA"
    | "CITY_OF_SAN_DIEGO"
    | "OTHER_JURISDICTION"
    | "JURISDICTION_UNRESOLVED";
  jurisdictionDisplayName: string;
  canonicalScopeState: FrontDoorCandidate["canonicalScopeState"];
  authority: FrontDoorCandidate["authority"];
};

export type LaMesaFrontDoorDataset = {
  records: LaMesaFrontDoorSearchRecord[];
  evaluations: Record<string, FrontDoorPublicEvaluation>;
  propertyIntelligence: Record<string, FrontDoorPropertyIntelligence>;
  canonicalCount: number;
};

export type FrontDoorPropertyIntelligence = Pick<
  AssessorPropertyIntelligence,
  "provenance" | "preliminaryDwellingState" | "eligibleForPreselection" | "conflictReasons" | "currentnessLimit"
>;

export type PropertyConfirmationModel = {
  recordedState: PreliminaryDwellingState;
  prompt: string;
  preselectedUse: ExistingUse | null;
};

export function propertyConfirmationFor(
  intelligence: FrontDoorPropertyIntelligence | null | undefined,
): PropertyConfirmationModel | null {
  if (!intelligence) return null;
  if (intelligence.eligibleForPreselection && intelligence.preliminaryDwellingState === "RECORDED_SINGLE_FAMILY_LIKELY") {
    return { recordedState: intelligence.preliminaryDwellingState, prompt: "Public property records indicate one detached residence. Is that still correct?", preselectedUse: "ONE_DETACHED_HOUSE" };
  }
  if (intelligence.eligibleForPreselection && intelligence.preliminaryDwellingState === "RECORDED_MULTIFAMILY_LIKELY") {
    return { recordedState: intelligence.preliminaryDwellingState, prompt: "Public property records indicate multiple dwelling units. Is that still correct?", preselectedUse: "TWO_OR_MORE_DWELLINGS" };
  }
  if (intelligence.preliminaryDwellingState === "RECORDED_CONDO") {
    return { recordedState: intelligence.preliminaryDwellingState, prompt: "Public property records indicate a condominium. Is that still correct?", preselectedUse: "CONDOMINIUM" };
  }
  return null;
}

function jurisdictionFor(recordValue: LaMesaFrontDoorSearchRecord): FrontDoorJurisdiction {
  if (recordValue.jurisdictionId === "CITY_OF_LA_MESA") return "CITY_OF_LA_MESA";
  if (recordValue.jurisdictionId === "CITY_OF_SAN_DIEGO") return "CITY_OF_SAN_DIEGO";
  if (recordValue.jurisdictionId === "OTHER_JURISDICTION") return "OUTSIDE_LA_MESA";
  return "UNRESOLVED";
}

export function resolveLaMesaFrontDoor(
  query: string,
  dataset: LaMesaFrontDoorDataset,
): FrontDoorLookupResult {
  const response = searchParcelLookup(dataset.records, query, { maximumResults: 10 });
  const invalid =
    response.state === "INVALID_APN" ||
    response.state === "MALFORMED_QUERY" ||
    response.state === "EMPTY_QUERY";
  const ambiguous = response.totalMatches > 1;
  const candidates = response.candidates.map((candidate) => ({
    address: candidate.record.address,
    displayAddress: candidate.record.displayAddress,
    unit: candidate.record.unit,
    apn: candidate.record.apn,
    apnDisplay: candidate.record.apnDisplay,
    jurisdiction: jurisdictionFor(candidate.record),
    jurisdictionLabel: candidate.record.jurisdictionDisplayName,
    confidence:
      candidate.matchReason === "exact_apn" ||
      candidate.matchReason === "exact_address" ||
      candidate.matchReason === "exact_unit_address"
        ? "EXACT" as const
        : "PARTIAL" as const,
    rank: candidate.rank,
    ambiguous,
    canonicalScopeState: candidate.record.canonicalScopeState,
    authority: candidate.record.authority,
  }));
  const state = invalid
    ? "INVALID_QUERY" as const
    : response.state === "MULTIPLE_MATCHES"
      ? "MULTIPLE_MATCHES" as const
      : response.state === "PARTIAL_MATCHES"
        ? "PARTIAL_MATCHES" as const
        : response.state === "EXACT_MATCH"
          ? "EXACT_MATCH" as const
          : "NO_MATCH" as const;
  const message =
    response.totalMatches > response.candidates.length
      ? "Keep typing to narrow the results."
      : state === "INVALID_QUERY"
      ? "Enter a fuller address or all 10 APN digits. TruLot will not guess missing parcel identity."
      : state === "NO_MATCH"
        ? "No parcel matched this bounded La Mesa preview."
        : state === "MULTIPLE_MATCHES"
          ? "More than one parcel shares this address. Choose the correct APN and jurisdiction."
          : state === "PARTIAL_MATCHES"
            ? "Choose the matching parcel."
            : null;
  return { state, candidates, message };
}

const OVERLAY_LABELS: Record<string, string> = {
  LM_OVERLAY_H: "Hillside area detected",
  LM_OVERLAY_P: "Scenic Preservation area detected",
  LM_OVERLAY_F: "Floodway context detected",
  LM_OVERLAY_D: "Urban Design context detected",
  LM_OVERLAY_MU: "Mixed-use context detected",
  LM_OVERLAY_G: "Grossmont Center context detected",
};

function selectedPathwayIds(answers: HomeownerAnswers): string[] {
  const use = answers.existingUse.value;
  const idea = answers.aduIdea.value;
  if (use === "ONE_DETACHED_HOUSE") {
    if (idea === "NEW_DETACHED_ADU") return ["SF_DETACHED_66323_ADU"];
    if (idea === "ATTACHED_ADDITION") return ["SF_LOCAL_66314_ADU"];
    if (idea === "CONVERSION") return ["SF_CONVERSION_66323_ADU"];
    if (idea === "JADU") return ["SF_JADU_66323"];
  }
  if (use === "TWO_OR_MORE_DWELLINGS") {
    if (idea === "NEW_DETACHED_ADU") return ["MF_DETACHED_EXISTING_66323_ADU"];
    if (idea === "CONVERSION") return ["MF_CONVERSION_66323_ADU"];
  }
  return [];
}

function pathways(
  ids: string[],
  catalog: Array<{ id: string; label: string }>,
  answers: HomeownerAnswers,
  hasMappedContext: boolean,
): FrontDoorPathway[] {
  return ids.flatMap((id) => {
    const entry = catalog.find((candidate) => candidate.id === id);
    if (!entry) return [];
    const conversionUnclear =
      id.includes("CONVERSION") && answers.existingSpace?.value !== "YES";
    return [{
      id,
      label: entry.label,
      category: conversionUnclear ? "Needs project details" : "Conditional",
      reason: conversionUnclear
        ? "The selected idea depends on qualifying existing garage or accessory space."
        : "Your answers match the basic dwelling and project-form predicates for this 2026 pathway.",
      majorConstraint: hasMappedContext
        ? "Mapped context may add project-specific review; it does not automatically prevent this pathway."
        : "Legal dwelling status and project-specific standards still require verification.",
      stillNeeded: conversionUnclear
        ? ["Whether qualifying conversion space exists", "Legal status of the existing structure"]
        : ["Legal status of the existing dwelling", "Project dimensions and site-specific review"],
    }];
  });
}

export function evaluateLaMesaFrontDoor(
  candidate: FrontDoorCandidate,
  dataset: LaMesaFrontDoorDataset,
  answers: HomeownerAnswers | null = null,
): FrontDoorEvaluation {
  const limits = [
    "Homeowner answers do not establish legal or permitted dwelling status.",
    "A survey, exact building dimensions, and fire/access compliance are not established here.",
    "This preliminary screen is not permit approval or whole-project compliance.",
  ];
  if (
    candidate.jurisdiction !== "CITY_OF_LA_MESA" ||
    candidate.canonicalScopeState !== "IN_SCOPE_CONFIRMED"
  ) {
    return {
      parcel: candidate,
      jurisdictionConfirmed: false,
      baseZone: null,
      baseProfile: null,
      answerCategory: "Source unavailable",
      headline: candidate.canonicalScopeState === "JURISDICTION_UNRESOLVED"
        ? "This parcel is recorded with La Mesa situs data, but its City jurisdiction needs review."
        : "This property is not currently confirmed within the City of La Mesa.",
      mappedContexts: [],
      specificPlanMessage: null,
      missingFacts: ["Confirmed City of La Mesa jurisdiction"],
      pathways: [],
      homeownerAnswers: answers,
      propertyIntelligence: null,
      propertyFactConflicts: [],
      userAnswerLimits: limits,
      evidenceSources: [],
      evaluationDate: null,
      futureChangeNotice: null,
      errorMessage: null,
    };
  }
  const details = dataset.evaluations[candidate.apn];
  const propertyIntelligence = dataset.propertyIntelligence[candidate.apn] ?? null;
  if (!details?.available) {
    return {
      parcel: candidate,
      jurisdictionConfirmed: true,
      baseZone: details?.baseZone ?? null,
      baseProfile: details?.baseProfile ?? null,
      answerCategory: details?.answerCategory ?? "Source unavailable",
      headline: details?.answerCategory === "Outside current scope"
        ? "TruLot found the parcel, but its operative residential profile is outside the current evaluation scope."
        : "Detailed ADU evaluation is temporarily unavailable.",
      mappedContexts: [],
      specificPlanMessage: details?.specificPlanBoundaryUnresolved
        ? "Specific-plan applicability needs review before TruLot can narrow the rules further."
        : null,
      missingFacts: details?.missingFacts ?? [],
      pathways: [],
      homeownerAnswers: answers,
      propertyIntelligence,
      propertyFactConflicts: propertyIntelligence?.conflictReasons ?? [],
      userAnswerLimits: limits,
      evidenceSources: details?.evidenceSources ?? [],
      evaluationDate: details?.evaluationDate ?? null,
      futureChangeNotice: null,
      errorMessage: details ? null : "Detailed ADU evaluation is temporarily unavailable.",
    };
  }
  const mappedContexts = details.mappedModifierIds.map((id) => ({
    id,
    label: OVERLAY_LABELS[id] ?? "Mapped planning context detected",
    explanation: "This does not automatically prevent an ADU, but it may add project-specific requirements.",
  }));
  const evidenceSources = propertyIntelligence
    ? [...details.evidenceSources, {
        label: "Public parcel and recorded property characteristics",
        publisher: "SanGIS / San Diego County Assessor-Recorder-County Clerk",
        date: "Acquired September 24, 2026",
        url: "https://gis.sangis.org/",
      }]
    : details.evidenceSources;
  const specificPlanMessage = details.specificPlanBoundaryUnresolved
    ? "Specific-plan applicability needs review before TruLot can narrow the rules further."
    : null;
  let chosen: FrontDoorPathway[] = [];
  let category = details.answerCategory;
  let headline = "We found the property and its zoning. To narrow the ADU options, we need a few facts about what is currently on the property.";
  if (propertyIntelligence?.preliminaryDwellingState === "RECORDED_RESIDENTIAL_CONFLICT") {
    headline = "Public records are not consistent about the current property configuration. Please tell us what is currently on the property.";
  } else if (propertyConfirmationFor(propertyIntelligence)) {
    headline = "We found a recorded property characteristic that can shorten the intake after you confirm it.";
  }
  const propertyFactConflicts = [...(propertyIntelligence?.conflictReasons ?? [])];
  if (answers) {
    const ids = selectedPathwayIds(answers);
    chosen = pathways(ids, details.pathwayCatalog, answers, mappedContexts.length > 0);
    const expectedUse = propertyConfirmationFor(propertyIntelligence)?.preselectedUse;
    if (expectedUse && answers.existingUse.value !== expectedUse && answers.existingUse.value !== "NOT_SURE") {
      propertyFactConflicts.push("HOMEOWNER_ANSWER_DIFFERS_FROM_RECORDED_CHARACTERISTIC");
    }
    if (answers.existingUse.value === "NOT_SURE") {
      category = "Needs property evidence";
      headline = "We still need the property’s dwelling type before narrowing the ADU pathways.";
    } else if (answers.existingUse.value === "CONDOMINIUM") {
      category = "Needs property evidence";
      headline = "The recorded condominium characteristic is preserved, but parcel and unit identity need review before TruLot can narrow an ADU pathway.";
    } else if (answers.existingUse.value === "VACANT_LAND") {
      category = "Needs property evidence";
      headline = "Vacant-land development requires dwelling and project evidence beyond this preliminary ADU screen.";
    } else if (answers.aduIdea.value === "NOT_SURE" || !chosen.length) {
      category = "Needs project details";
      headline = "The property context is available. Choose an ADU idea to narrow the relevant pathway.";
    } else if (chosen.some((pathway) => pathway.category === "Needs project details")) {
      category = "Needs project details";
      headline = "One pathway may fit, but TruLot still needs a project detail before narrowing it further.";
    } else {
      category = "Conditional";
      headline = "Your answers identify a preliminary 2026 pathway. Legal status and project-specific conditions still need verification.";
    }
  }
  return {
    parcel: candidate,
    jurisdictionConfirmed: true,
    baseZone: details.baseZone,
    baseProfile: details.baseProfile,
    answerCategory: category,
    headline,
    mappedContexts,
    specificPlanMessage,
    missingFacts: details.missingFacts,
    pathways: chosen,
    homeownerAnswers: answers,
    propertyIntelligence,
    propertyFactConflicts,
    userAnswerLimits: limits,
    evidenceSources,
    evaluationDate: details.evaluationDate,
    futureChangeNotice:
      "California ADU rules change January 1, 2027. TruLot is evaluating this property under current 2026 rules.",
    errorMessage: null,
  };
}

export type LocalLeadDraft = {
  name: string;
  email: string;
  phone: string;
  consentToContact: boolean;
};

export type WaypointAduHandoff = {
  contractVersion: "lamesaadu-waypoint-handoff-v0";
  parcel: { apn: string; address: string | null; jurisdiction: "CITY_OF_LA_MESA" };
  evaluationDate: string;
  selectedPathwayIds: string[];
  unresolvedFacts: string[];
  homeownerAnswers: HomeownerAnswers;
  profiles: { municipal: string; adu: "LA_MESA_ADU_2026" };
  contact: { name: string; email: string; phone: string | null };
  consentReceipt: { granted: true; purpose: "OPTIONAL_PROFESSIONAL_FOLLOW_UP" };
  delivery: "LOCAL_FIXTURE_ONLY";
};

export function buildLocalWaypointHandoff(
  evaluation: FrontDoorEvaluation,
  lead: LocalLeadDraft,
): WaypointAduHandoff | null {
  if (
    !lead.consentToContact ||
    !lead.name.trim() ||
    !/^\S+@\S+\.\S+$/.test(lead.email.trim()) ||
    !evaluation.jurisdictionConfirmed ||
    !evaluation.homeownerAnswers ||
    !evaluation.evaluationDate
  ) return null;
  return {
    contractVersion: "lamesaadu-waypoint-handoff-v0",
    parcel: {
      apn: evaluation.parcel.apn,
      address: evaluation.parcel.address,
      jurisdiction: "CITY_OF_LA_MESA",
    },
    evaluationDate: evaluation.evaluationDate,
    selectedPathwayIds: evaluation.pathways.map((pathway) => pathway.id),
    unresolvedFacts: evaluation.missingFacts,
    homeownerAnswers: evaluation.homeownerAnswers,
    profiles: { municipal: "LA_MESA_TITLE24_2026_10_04", adu: "LA_MESA_ADU_2026" },
    contact: {
      name: lead.name.trim(),
      email: lead.email.trim(),
      phone: lead.phone.trim() || null,
    },
    consentReceipt: { granted: true, purpose: "OPTIONAL_PROFESSIONAL_FOLLOW_UP" },
    delivery: "LOCAL_FIXTURE_ONLY",
  };
}

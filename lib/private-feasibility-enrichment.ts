import type { PrivateLookupResult, PrivatePropertyIntelligenceDto } from "./private-property-intelligence-runtime";

export type PrivateFeasibilityResultState = "CONDITIONAL" | "NEEDS_EVIDENCE" | "NOT_EVALUATED" | "SOURCE_UNAVAILABLE";
export type PrivatePathway = "SINGLE_FAMILY" | "MULTIFAMILY" | null;
export type UserExistingUse = "ONE_DETACHED_HOUSE" | "TWO_OR_MORE_DWELLINGS" | "CONDOMINIUM" | "VACANT_LAND" | "NOT_SURE";

export type PrivateFeasibilityQuestion = {
  order: number;
  kind: "CURRENT_CONFIGURATION" | "EXISTING_USE" | "ADU_INTENT" | "ACCESSORY_CONTEXT" | "PROJECT_DETAILS" | "EVIDENCE_REQUEST";
  prompt: string;
};

export type PrivateFeasibilityEnrichment = {
  contractVersion: "private-feasibility-enrichment-v0";
  apn: string;
  resultState: PrivateFeasibilityResultState;
  preliminaryPathway: PrivatePathway;
  pathwayRequiresConfirmation: boolean;
  complianceConclusionSupported: false;
  currentnessState: string;
  boundedAduEvidence: PrivatePropertyIntelligenceDto["boundedAduEvidence"];
  warnings: string[];
  questions: PrivateFeasibilityQuestion[];
  evidenceRequests: string[];
  recordedFacts: { provenance: "COMPOSED_PROPERTY_INTELLIGENCE"; dwellingState: PrivatePropertyIntelligenceDto["preliminaryDwellingState"]; conflictTypes: string[] };
  userCorrection: null | { provenance: "USER_PROVIDED"; existingUse: UserExistingUse; disagreesWithRecorded: boolean };
  summary: string;
  internalSignals: string[];
};

const CURRENT_CONFIGURATION_PROMPTS: Record<string, string> = {
  LATER_CHANGE_CURRENT_CONFIGURATION: "Public records show a later property change. What is the current dwelling and unit configuration?",
  ACTIVE_CHANGE_CURRENT_CONFIGURATION: "Public records show active work that may change the property. What is currently on the property?",
  CONFLICT_CURRENT_CONFIGURATION: "Public records are not consistent about the property configuration. What is currently on the property?",
  BLANK: "What is currently on the property?",
};

function recordedUse(dto: PrivatePropertyIntelligenceDto): UserExistingUse | null {
  if (dto.preliminaryDwellingState === "SINGLE_FAMILY_LIKELY") return "ONE_DETACHED_HOUSE";
  if (dto.preliminaryDwellingState === "MULTIFAMILY_LIKELY") return "TWO_OR_MORE_DWELLINGS";
  if (dto.preliminaryDwellingState === "CONDO") return "CONDOMINIUM";
  return null;
}

function primaryQuestion(dto: PrivatePropertyIntelligenceDto): string {
  if (CURRENT_CONFIGURATION_PROMPTS[dto.questionClass]) return CURRENT_CONFIGURATION_PROMPTS[dto.questionClass];
  if (dto.questionClass === "CONDO_CONFIRMATION") return "Public property records indicate a condominium. Is that still correct?";
  if (dto.questionClass === "RECORDED_PROPERTY_CONFIRMATION") {
    return dto.preliminaryDwellingState === "MULTIFAMILY_LIKELY"
      ? "Public property records indicate multiple dwelling units. Is that still correct?"
      : "Public property records indicate one detached residence. Is that still correct?";
  }
  return "What is currently on the property?";
}

function evidenceFor(dto: PrivatePropertyIntelligenceDto): string[] {
  const evidence = new Set<string>();
  if (["LATER_CHANGE_OBSERVED", "ACTIVE_CHANGE_IN_PROGRESS", "CURRENTNESS_UNKNOWN", "CONFLICTING_EVIDENCE", "OBSERVATIONAL_SUPPORT_ONLY"].includes(dto.currentnessState)) {
    evidence.add("Current dwelling and unit configuration from the homeowner or current site documentation");
  }
  if (dto.currentnessState === "ACTIVE_CHANGE_IN_PROGRESS" || dto.boundedAduEvidence === "UNKNOWN") evidence.add("Current permit record or building plans");
  if (dto.conflictTypes.includes("COMMON_PARCEL_GEOMETRY_AMBIGUITY")) evidence.add("Current survey, site plan, or photo sufficient to resolve structure placement");
  if (dto.conflictTypes.includes("COMMON_ADDRESS_PERMIT_AMBIGUITY")) evidence.add("APN-specific permit record or plans linking the work to this unit");
  if (dto.conflictTypes.includes("RECORDED_CHARACTERISTIC_CONFLICT")) evidence.add("Assessor correction or current property documentation");
  return [...evidence];
}

export function enrichPrivateFeasibility(
  dto: PrivatePropertyIntelligenceDto,
  options: { userExistingUse?: UserExistingUse; includeProjectQuestions?: boolean } = {},
): PrivateFeasibilityEnrichment {
  const warnings: string[] = [];
  const internalSignals: string[] = [];
  const unsafeCurrentness = ["LATER_CHANGE_OBSERVED", "ACTIVE_CHANGE_IN_PROGRESS", "OBSERVATIONAL_SUPPORT_ONLY", "CONFLICTING_EVIDENCE", "CURRENTNESS_UNKNOWN"].includes(dto.currentnessState);
  let preliminaryPathway: PrivatePathway = null;
  if (!unsafeCurrentness && dto.preliminaryDwellingState === "SINGLE_FAMILY_LIKELY") preliminaryPathway = "SINGLE_FAMILY";
  if (!unsafeCurrentness && dto.preliminaryDwellingState === "MULTIFAMILY_LIKELY") preliminaryPathway = "MULTIFAMILY";

  if (dto.currentnessState === "RECORDED_STALE_POSSIBLE") warnings.push("Recorded property facts may be stale; confirm the current configuration before relying on pathway assumptions.");
  if (dto.currentnessState === "LATER_CHANGE_OBSERVED") warnings.push("A later recorded change blocks stale layout assumptions until the current configuration is confirmed.");
  if (dto.currentnessState === "ACTIVE_CHANGE_IN_PROGRESS") warnings.push("Active work may change the property configuration; feasibility remains preliminary.");
  if (dto.currentnessState === "OBSERVATIONAL_SUPPORT_ONLY") warnings.push("Only observational structure context is available; it does not establish current use or legality.");
  if (dto.currentnessState === "CONFLICTING_EVIDENCE") warnings.push("Recorded sources conflict; no source has been silently preferred.");
  if (dto.currentnessState === "CURRENTNESS_UNKNOWN") warnings.push("Current property configuration is unknown and requires user or property evidence.");
  if (dto.preliminaryDwellingState === "CONFLICTING") warnings.push("Conflicting dwelling evidence blocks automatic pathway selection.");
  if (dto.preliminaryDwellingState === "CONDO") warnings.push("Condominium context requires unit-specific confirmation; ordinary single-family and multifamily pathways are not preselected.");
  if (dto.boundedAduEvidence === "FINALED") warnings.push("A finaled ADU-related record indicates a later change, but does not establish the exact current unit count.");
  if (dto.boundedAduEvidence === "ACTIVE") warnings.push("An active ADU-related record does not establish completion or current occupancy.");
  if (dto.boundedAduEvidence === "EXPIRED_OR_WITHDRAWN") warnings.push("An expired or withdrawn ADU proposal does not establish that an ADU exists.");
  if (dto.boundedAduEvidence === "UNKNOWN") warnings.push("ADU record status is unresolved and requires permit evidence before use.");
  for (const conflict of dto.conflictTypes) warnings.push(`Unresolved property-intelligence conflict: ${conflict}.`);

  const questions: PrivateFeasibilityQuestion[] = [{ order: 1, kind: "CURRENT_CONFIGURATION", prompt: primaryQuestion(dto) }];
  if (dto.questionClass === "BLANK" || ["LATER_CHANGE_CURRENT_CONFIGURATION", "ACTIVE_CHANGE_CURRENT_CONFIGURATION", "CONFLICT_CURRENT_CONFIGURATION"].includes(dto.questionClass)) {
    questions.push({ order: 2, kind: "EXISTING_USE", prompt: "How is the property currently used?" });
  }
  questions.push({ order: 3, kind: "ADU_INTENT", prompt: "What dwelling or ADU project are you considering?" });
  if (dto.accessoryStructureCandidate) questions.push({ order: 4, kind: "ACCESSORY_CONTEXT", prompt: "Older mapping shows a detached secondary structure. Is that structure still there?" });
  if (options.includeProjectQuestions) questions.push({ order: 5, kind: "PROJECT_DETAILS", prompt: "What are the proposed project dimensions and site details?" });
  const evidenceRequests = evidenceFor(dto);
  if (evidenceRequests.length) questions.push({ order: 6, kind: "EVIDENCE_REQUEST", prompt: `Please provide: ${evidenceRequests.join("; ")}.` });
  questions.sort((a,b) => a.order - b.order);

  const expected = recordedUse(dto);
  const userCorrection = options.userExistingUse ? {
    provenance: "USER_PROVIDED" as const,
    existingUse: options.userExistingUse,
    disagreesWithRecorded: Boolean(expected && options.userExistingUse !== "NOT_SURE" && options.userExistingUse !== expected),
  } : null;
  if (userCorrection?.disagreesWithRecorded) {
    warnings.push("The homeowner answer differs from recorded evidence; both remain preserved pending resolution.");
    internalSignals.push("HOMEOWNER_VS_RECORDED_STATE");
    preliminaryPathway = userCorrection.existingUse === "ONE_DETACHED_HOUSE" ? "SINGLE_FAMILY" : userCorrection.existingUse === "TWO_OR_MORE_DWELLINGS" ? "MULTIFAMILY" : null;
  }

  const needsEvidence = unsafeCurrentness || dto.preliminaryDwellingState === "CONFLICTING" || dto.boundedAduEvidence === "UNKNOWN" || evidenceRequests.length > 0;
  const summary = dto.currentnessState === "LATER_CHANGE_OBSERVED"
    ? "Public records show a later permitted configuration change. Current property configuration should be confirmed before applying existing-structure assumptions."
    : dto.currentnessState === "ACTIVE_CHANGE_IN_PROGRESS"
      ? "Public records show active work that may change the property configuration. Feasibility should remain preliminary until the current state is confirmed."
      : dto.preliminaryDwellingState === "SINGLE_FAMILY_LIKELY"
        ? "Public property records indicate one detached residence. Confirm the current configuration before relying on pathway assumptions."
        : "Property intelligence supports question selection only. Confirm the current configuration before relying on pathway assumptions.";

  return {
    contractVersion: "private-feasibility-enrichment-v0", apn: dto.apn,
    resultState: needsEvidence ? "NEEDS_EVIDENCE" : "CONDITIONAL",
    preliminaryPathway, pathwayRequiresConfirmation: preliminaryPathway !== null,
    complianceConclusionSupported: false, currentnessState: dto.currentnessState,
    boundedAduEvidence: dto.boundedAduEvidence, warnings, questions, evidenceRequests,
    recordedFacts: { provenance: "COMPOSED_PROPERTY_INTELLIGENCE", dwellingState: dto.preliminaryDwellingState, conflictTypes: [...dto.conflictTypes] },
    userCorrection, summary, internalSignals,
  };
}

export function enrichPrivateFeasibilityFromLookup(
  lookup: PrivateLookupResult,
  previousV4: Omit<PrivateFeasibilityEnrichment, "internalSignals" | "resultState"> & { resultState: PrivateFeasibilityResultState },
  options: { userExistingUse?: UserExistingUse; includeProjectQuestions?: boolean } = {},
): PrivateFeasibilityEnrichment {
  if (lookup.status === "FOUND") return enrichPrivateFeasibility(lookup.value, options);
  return { ...previousV4, resultState: lookup.status === "UNAVAILABLE" ? "SOURCE_UNAVAILABLE" : previousV4.resultState, internalSignals: lookup.status === "UNAVAILABLE" ? ["PROPERTY_INTELLIGENCE_UNAVAILABLE"] : [] };
}

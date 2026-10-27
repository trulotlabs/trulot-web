import type { PreliminaryDwellingState as RecordedDwellingState } from "./property-intelligence";
import type { ExistingUse, HomeownerAnswers } from "./la-mesa-adu-front-door";

export const PROPERTY_INTELLIGENCE_AUTHORITY_ORDER = [
  "EXPLICIT_FINALED_PERMIT_FACT",
  "EXPLICIT_ISSUED_CHANGE_SIGNAL",
  "RECORDED_ASSESSOR_CHARACTERISTIC",
  "OFFICIAL_OBSERVATIONAL_GEOMETRY",
  "USER_PROVIDED",
] as const;

export type PropertyAuthorityClass = typeof PROPERTY_INTELLIGENCE_AUTHORITY_ORDER[number];
export type ComposedCurrentnessState =
  | "RECORDED_CURRENT_ENOUGH_FOR_PRESELECTION"
  | "RECORDED_STALE_POSSIBLE"
  | "LATER_CHANGE_OBSERVED"
  | "ACTIVE_CHANGE_IN_PROGRESS"
  | "OBSERVATIONAL_SUPPORT_ONLY"
  | "CONFLICTING_EVIDENCE"
  | "CURRENTNESS_UNKNOWN";

export type ComposedDwellingState =
  | "SINGLE_FAMILY_LIKELY"
  | "MULTIFAMILY_LIKELY"
  | "CONDO"
  | "UNKNOWN"
  | "CONFLICTING";

export type PermitChangeSignal =
  | "NO_BOUNDED_PERMIT_EVIDENCE"
  | "NO_CHANGE_FOUND_IN_BOUNDED_QUERY"
  | "FINALED_EXPLICIT_CHANGE"
  | "ACTIVE_EXPLICIT_CHANGE"
  | "EXPIRED_OR_WITHDRAWN_PROPOSAL";

export type PropertyIntelligenceUse =
  | "PATHWAY_SELECTION"
  | "PRELIMINARY_SCREENING"
  | "QUESTION_PRESELECTION"
  | "CURRENTNESS_WARNING"
  | "COMPLIANCE";

export type PropertyIntelligenceConflict = {
  conflictType:
    | "RECORDED_CHARACTERISTIC_CONFLICT"
    | "LATER_CHANGE_VS_RECORDED_STATE"
    | "OLDER_GEOMETRY_VS_LATER_CHANGE"
    | "COMMON_PARCEL_GEOMETRY_AMBIGUITY"
    | "HOMEOWNER_VS_RECORDED_STATE";
  sourceA: { authority: PropertyAuthorityClass; evidenceReference: string };
  sourceB: { authority: PropertyAuthorityClass; evidenceReference: string };
  affectedFact: "DWELLING_CONFIGURATION" | "STRUCTURE_CURRENTNESS" | "UNIT_LEVEL_STRUCTURE_ASSIGNMENT";
  currentnessRelevance: string;
  resolutionState: "HOMEOWNER_CONFIRMATION_REQUIRED" | "UNIT_LEVEL_INFERENCE_BLOCKED" | "UNRESOLVED";
  allowedUse: "QUESTION_SELECTION" | "CURRENTNESS_WARNING" | "PRELIMINARY_SCREENING_ONLY";
};

export type RecordedAssessorSummary = {
  recordedDwellingState: RecordedDwellingState;
  recordedUnitCount: number | null;
  eligibleForPreselection: boolean;
  assessorHints: string[];
  conflictReasons: string[];
  evidenceReference: string;
};

export type BoundedPermitSummary = {
  scope: "BOUNDED_PACKET_74_COHORT" | "NOT_AVAILABLE";
  changeSignal: PermitChangeSignal;
  explicitAduEvidence: "FINALED" | "ACTIVE" | "EXPIRED_OR_WITHDRAWN" | "NONE";
  evidenceReference: string | null;
};

export type StructureObservationSummary = {
  observedFootprintCount: number;
  accessoryStructureCandidate: boolean;
  stackedOrAmbiguous: boolean;
  observationDate: string;
  currentnessState: string;
  evidenceReference: string;
};

export type ComposedPropertyIntelligence = {
  contractVersion: "jurisdiction-neutral-property-intelligence-composition-v0";
  parcelIdentity: { jurisdiction: string; apn: string };
  provenance: "COMPOSED_PROPERTY_INTELLIGENCE";
  recordedDwellingState: RecordedDwellingState;
  recordedUnitCount: number | null;
  preliminaryDwellingState: ComposedDwellingState;
  condoState: "RECORDED_CONDO" | "NOT_RECORDED_CONDO" | "UNKNOWN";
  assessorHints: string[];
  permitChangeSignal: PermitChangeSignal;
  explicitAduPermitEvidence: BoundedPermitSummary["explicitAduEvidence"];
  permitEvidenceScope: BoundedPermitSummary["scope"];
  structureObservation: StructureObservationSummary;
  currentnessState: ComposedCurrentnessState;
  conflicts: PropertyIntelligenceConflict[];
  conflictReasons: string[];
  homeownerFacts: HomeownerAnswers | null;
  provenanceReferences: string[];
  permittedEvaluationUses: Record<PropertyIntelligenceUse, boolean>;
  eligibleForPreselection: boolean;
  currentnessLimit: string;
};

function dwellingState(recorded: RecordedDwellingState, changeSignal: PermitChangeSignal): ComposedDwellingState {
  if (changeSignal === "FINALED_EXPLICIT_CHANGE" || changeSignal === "ACTIVE_EXPLICIT_CHANGE") return "CONFLICTING";
  if (recorded === "RECORDED_SINGLE_FAMILY_LIKELY") return "SINGLE_FAMILY_LIKELY";
  if (recorded === "RECORDED_MULTIFAMILY_LIKELY") return "MULTIFAMILY_LIKELY";
  if (recorded === "RECORDED_CONDO") return "CONDO";
  if (recorded === "RECORDED_RESIDENTIAL_CONFLICT") return "CONFLICTING";
  return "UNKNOWN";
}

export function composePropertyIntelligence(input: {
  jurisdiction: string;
  apn: string;
  assessor: RecordedAssessorSummary;
  permit: BoundedPermitSummary;
  structure: StructureObservationSummary;
  homeownerFacts?: HomeownerAnswers | null;
}): ComposedPropertyIntelligence {
  const { assessor, permit, structure } = input;
  const conflicts: PropertyIntelligenceConflict[] = assessor.conflictReasons.map((reason) => ({
    conflictType: "RECORDED_CHARACTERISTIC_CONFLICT",
    sourceA: { authority: "RECORDED_ASSESSOR_CHARACTERISTIC", evidenceReference: assessor.evidenceReference },
    sourceB: { authority: "RECORDED_ASSESSOR_CHARACTERISTIC", evidenceReference: `${assessor.evidenceReference}#${reason}` },
    affectedFact: "DWELLING_CONFIGURATION",
    currentnessRelevance: reason,
    resolutionState: "HOMEOWNER_CONFIRMATION_REQUIRED",
    allowedUse: "QUESTION_SELECTION",
  }));

  if (permit.changeSignal === "FINALED_EXPLICIT_CHANGE" || permit.changeSignal === "ACTIVE_EXPLICIT_CHANGE") {
    conflicts.push({
      conflictType: "LATER_CHANGE_VS_RECORDED_STATE",
      sourceA: { authority: permit.changeSignal === "FINALED_EXPLICIT_CHANGE" ? "EXPLICIT_FINALED_PERMIT_FACT" : "EXPLICIT_ISSUED_CHANGE_SIGNAL", evidenceReference: permit.evidenceReference ?? "bounded-permit-evidence" },
      sourceB: { authority: "RECORDED_ASSESSOR_CHARACTERISTIC", evidenceReference: assessor.evidenceReference },
      affectedFact: "DWELLING_CONFIGURATION",
      currentnessRelevance: "A later explicit change prevents stale recorded configuration from being preselected.",
      resolutionState: "HOMEOWNER_CONFIRMATION_REQUIRED",
      allowedUse: "CURRENTNESS_WARNING",
    });
    if (structure.observedFootprintCount > 0) {
      conflicts.push({
        conflictType: "OLDER_GEOMETRY_VS_LATER_CHANGE",
        sourceA: { authority: "OFFICIAL_OBSERVATIONAL_GEOMETRY", evidenceReference: structure.evidenceReference },
        sourceB: { authority: permit.changeSignal === "FINALED_EXPLICIT_CHANGE" ? "EXPLICIT_FINALED_PERMIT_FACT" : "EXPLICIT_ISSUED_CHANGE_SIGNAL", evidenceReference: permit.evidenceReference ?? "bounded-permit-evidence" },
        affectedFact: "STRUCTURE_CURRENTNESS",
        currentnessRelevance: "The observation predates the later change and cannot represent current configuration.",
        resolutionState: "UNRESOLVED",
        allowedUse: "CURRENTNESS_WARNING",
      });
    }
  }
  if (structure.stackedOrAmbiguous) {
    conflicts.push({
      conflictType: "COMMON_PARCEL_GEOMETRY_AMBIGUITY",
      sourceA: { authority: "OFFICIAL_OBSERVATIONAL_GEOMETRY", evidenceReference: structure.evidenceReference },
      sourceB: { authority: "RECORDED_ASSESSOR_CHARACTERISTIC", evidenceReference: assessor.evidenceReference },
      affectedFact: "UNIT_LEVEL_STRUCTURE_ASSIGNMENT",
      currentnessRelevance: "Common-parcel geometry cannot be assigned to an individual unit.",
      resolutionState: "UNIT_LEVEL_INFERENCE_BLOCKED",
      allowedUse: "PRELIMINARY_SCREENING_ONLY",
    });
  }

  const homeownerFacts = input.homeownerFacts ?? null;
  const composedDwelling = dwellingState(assessor.recordedDwellingState, permit.changeSignal);
  const expectedUse = composedDwelling === "SINGLE_FAMILY_LIKELY" ? "ONE_DETACHED_HOUSE"
    : composedDwelling === "MULTIFAMILY_LIKELY" ? "TWO_OR_MORE_DWELLINGS"
      : composedDwelling === "CONDO" ? "CONDOMINIUM" : null;
  if (homeownerFacts && expectedUse && homeownerFacts.existingUse.value !== expectedUse && homeownerFacts.existingUse.value !== "NOT_SURE") {
    conflicts.push({
      conflictType: "HOMEOWNER_VS_RECORDED_STATE",
      sourceA: { authority: "USER_PROVIDED", evidenceReference: `user-provided:${input.apn}:existing-use` },
      sourceB: { authority: "RECORDED_ASSESSOR_CHARACTERISTIC", evidenceReference: assessor.evidenceReference },
      affectedFact: "DWELLING_CONFIGURATION",
      currentnessRelevance: "The homeowner answer differs from the recorded preliminary state; both are retained.",
      resolutionState: "UNRESOLVED",
      allowedUse: "QUESTION_SELECTION",
    });
  }

  let currentnessState: ComposedCurrentnessState;
  if (permit.changeSignal === "ACTIVE_EXPLICIT_CHANGE") currentnessState = "ACTIVE_CHANGE_IN_PROGRESS";
  else if (permit.changeSignal === "FINALED_EXPLICIT_CHANGE") currentnessState = "LATER_CHANGE_OBSERVED";
  else if (assessor.conflictReasons.length > 0) currentnessState = "CONFLICTING_EVIDENCE";
  else if (assessor.recordedDwellingState === "RECORDED_TYPE_UNKNOWN" && structure.observedFootprintCount === 0) currentnessState = "CURRENTNESS_UNKNOWN";
  else if (assessor.recordedDwellingState === "RECORDED_TYPE_UNKNOWN") currentnessState = "OBSERVATIONAL_SUPPORT_ONLY";
  else if (structure.currentnessState === "CURRENTNESS_UNKNOWN" || structure.observedFootprintCount === 0) currentnessState = "RECORDED_STALE_POSSIBLE";
  else currentnessState = "RECORDED_CURRENT_ENOUGH_FOR_PRESELECTION";

  const preliminaryDwellingState = dwellingState(assessor.recordedDwellingState, permit.changeSignal);
  const eligibleForPreselection = assessor.eligibleForPreselection &&
    preliminaryDwellingState !== "CONFLICTING" &&
    currentnessState !== "LATER_CHANGE_OBSERVED" &&
    currentnessState !== "ACTIVE_CHANGE_IN_PROGRESS" &&
    currentnessState !== "CONFLICTING_EVIDENCE";

  return {
    contractVersion: "jurisdiction-neutral-property-intelligence-composition-v0",
    parcelIdentity: { jurisdiction: input.jurisdiction, apn: input.apn },
    provenance: "COMPOSED_PROPERTY_INTELLIGENCE",
    recordedDwellingState: assessor.recordedDwellingState,
    recordedUnitCount: assessor.recordedUnitCount,
    preliminaryDwellingState,
    condoState: assessor.recordedDwellingState === "RECORDED_CONDO" ? "RECORDED_CONDO" : assessor.recordedDwellingState === "RECORDED_TYPE_UNKNOWN" ? "UNKNOWN" : "NOT_RECORDED_CONDO",
    assessorHints: assessor.assessorHints,
    permitChangeSignal: permit.changeSignal,
    explicitAduPermitEvidence: permit.explicitAduEvidence,
    permitEvidenceScope: permit.scope,
    structureObservation: structure,
    currentnessState,
    conflicts,
    conflictReasons: conflicts.map((conflict) => conflict.conflictType),
    homeownerFacts,
    provenanceReferences: [assessor.evidenceReference, structure.evidenceReference, ...(permit.evidenceReference ? [permit.evidenceReference] : [])],
    permittedEvaluationUses: {
      PATHWAY_SELECTION: eligibleForPreselection,
      PRELIMINARY_SCREENING: true,
      QUESTION_PRESELECTION: eligibleForPreselection || preliminaryDwellingState === "CONDO",
      CURRENTNESS_WARNING: currentnessState !== "RECORDED_CURRENT_ENOUGH_FOR_PRESELECTION",
      COMPLIANCE: false,
    },
    eligibleForPreselection,
    currentnessLimit: "This composition supports preliminary questions and screening only; it does not establish legal or permitted configuration.",
  };
}

export type PropertyQuestionSelection = {
  primary: null | {
    kind: "RECORDED_CONFIRMATION" | "CONDO_CONFIRMATION" | "CURRENT_CONFIGURATION";
    prompt: string;
    preselectedUse: ExistingUse | null;
  };
  accessory: null | { prompt: string; observationDate: string };
};

export function selectPropertyQuestions(value: ComposedPropertyIntelligence): PropertyQuestionSelection {
  let primary: PropertyQuestionSelection["primary"] = null;
  if (["CONFLICTING_EVIDENCE", "LATER_CHANGE_OBSERVED", "ACTIVE_CHANGE_IN_PROGRESS"].includes(value.currentnessState)) {
    primary = { kind: "CURRENT_CONFIGURATION", prompt: "Public records are not consistent about the current property configuration. What is currently on the property?", preselectedUse: null };
  } else if (value.preliminaryDwellingState === "CONDO") {
    primary = { kind: "CONDO_CONFIRMATION", prompt: "Public property records indicate a condominium. Is that still correct?", preselectedUse: "CONDOMINIUM" };
  } else if (value.eligibleForPreselection && value.preliminaryDwellingState === "SINGLE_FAMILY_LIKELY") {
    primary = { kind: "RECORDED_CONFIRMATION", prompt: "Public property records indicate one detached residence. Is that still correct?", preselectedUse: "ONE_DETACHED_HOUSE" };
  } else if (value.eligibleForPreselection && value.preliminaryDwellingState === "MULTIFAMILY_LIKELY") {
    primary = { kind: "RECORDED_CONFIRMATION", prompt: "Public property records indicate multiple dwelling units. Is that still correct?", preselectedUse: "TWO_OR_MORE_DWELLINGS" };
  }
  const accessory = value.structureObservation.accessoryStructureCandidate &&
    !["CONFLICTING_EVIDENCE", "LATER_CHANGE_OBSERVED", "ACTIVE_CHANGE_IN_PROGRESS", "CURRENTNESS_UNKNOWN"].includes(value.currentnessState)
    ? { prompt: "Older mapping shows a detached secondary structure on the parcel. Is that structure still there?", observationDate: value.structureObservation.observationDate }
    : null;
  return { primary, accessory };
}

export type V4PropertyIntelligenceInput = {
  preliminaryDwellingState: ComposedDwellingState;
  dwellingStateProvenance: "RECORDED" | "USER_PROVIDED" | "UNKNOWN";
  currentnessState: ComposedCurrentnessState;
  activeChange: boolean;
  explicitAduPermitEvidence: ComposedPropertyIntelligence["explicitAduPermitEvidence"];
  accessoryStructureCandidate: boolean;
  unresolvedConflictTypes: PropertyIntelligenceConflict["conflictType"][];
};

export function toV4PropertyIntelligenceInput(value: ComposedPropertyIntelligence): V4PropertyIntelligenceInput {
  const userUse = value.homeownerFacts?.existingUse.value;
  const userState: ComposedDwellingState | null = userUse === "ONE_DETACHED_HOUSE" ? "SINGLE_FAMILY_LIKELY"
    : userUse === "TWO_OR_MORE_DWELLINGS" ? "MULTIFAMILY_LIKELY"
      : userUse === "CONDOMINIUM" ? "CONDO"
        : userUse === "VACANT_LAND" || userUse === "NOT_SURE" ? "UNKNOWN" : null;
  return {
    preliminaryDwellingState: userState ?? value.preliminaryDwellingState,
    dwellingStateProvenance: userState ? "USER_PROVIDED" : value.preliminaryDwellingState === "UNKNOWN" ? "UNKNOWN" : "RECORDED",
    currentnessState: value.currentnessState,
    activeChange: value.currentnessState === "ACTIVE_CHANGE_IN_PROGRESS",
    explicitAduPermitEvidence: value.explicitAduPermitEvidence,
    accessoryStructureCandidate: value.structureObservation.accessoryStructureCandidate,
    unresolvedConflictTypes: value.conflicts.map((conflict) => conflict.conflictType),
  };
}

export function applyHomeownerFacts(
  value: ComposedPropertyIntelligence,
  homeownerFacts: HomeownerAnswers,
): ComposedPropertyIntelligence {
  const expectedUse = value.preliminaryDwellingState === "SINGLE_FAMILY_LIKELY" ? "ONE_DETACHED_HOUSE"
    : value.preliminaryDwellingState === "MULTIFAMILY_LIKELY" ? "TWO_OR_MORE_DWELLINGS"
      : value.preliminaryDwellingState === "CONDO" ? "CONDOMINIUM" : null;
  const conflict = expectedUse && homeownerFacts.existingUse.value !== expectedUse && homeownerFacts.existingUse.value !== "NOT_SURE"
    ? {
        conflictType: "HOMEOWNER_VS_RECORDED_STATE" as const,
        sourceA: { authority: "USER_PROVIDED" as const, evidenceReference: `user-provided:${value.parcelIdentity.apn}:existing-use` },
        sourceB: { authority: "RECORDED_ASSESSOR_CHARACTERISTIC" as const, evidenceReference: value.provenanceReferences[0] },
        affectedFact: "DWELLING_CONFIGURATION" as const,
        currentnessRelevance: "The homeowner answer differs from the recorded preliminary state; both are retained.",
        resolutionState: "UNRESOLVED" as const,
        allowedUse: "QUESTION_SELECTION" as const,
      }
    : null;
  const conflicts = conflict && !value.conflicts.some((item) => item.conflictType === conflict.conflictType)
    ? [...value.conflicts, conflict]
    : value.conflicts;
  return {
    ...value,
    homeownerFacts,
    conflicts,
    conflictReasons: conflicts.map((item) => item.conflictType),
  };
}

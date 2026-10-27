export type StructureObservationAuthority = "OBSERVATIONAL_GEOMETRY";

export type FootprintRole =
  | "PRIMARY_FOOTPRINT_CANDIDATE"
  | "SECONDARY_FOOTPRINT_CANDIDATE"
  | "AMBIGUOUS_FOOTPRINT"
  | "STACKED_PARCEL_FOOTPRINT";

export type StructureCurrentnessState =
  | "OBSERVATIONAL_STALE"
  | "CURRENTNESS_PARTIAL"
  | "LATER_CHANGE_OBSERVED"
  | "NO_LATER_CHANGE_KNOWN"
  | "CURRENTNESS_UNKNOWN";

export interface AccessoryCandidateThresholds {
  minimumSecondaryAreaSqft: number;
  maximumSecondaryAreaSqft: number;
  minimumSecondaryToPrimaryRatio: number;
  maximumSecondaryToPrimaryRatio: number;
  minimumSeparationFeet: number;
  minimumParcelCoverageRatio: number;
  minimumParcelEdgeClearanceFeet: number;
}

export const DEFAULT_ACCESSORY_CANDIDATE_THRESHOLDS: Readonly<AccessoryCandidateThresholds> = {
  minimumSecondaryAreaSqft: 120,
  maximumSecondaryAreaSqft: 1_200,
  minimumSecondaryToPrimaryRatio: 0.05,
  maximumSecondaryToPrimaryRatio: 0.45,
  minimumSeparationFeet: 3,
  minimumParcelCoverageRatio: 0.9,
  // A setback-like threshold would imply a legal conclusion. The selected
  // model records boundary distance and tests sensitivity, but does not use it.
  minimumParcelEdgeClearanceFeet: 0,
};

export interface FootprintRoleInput {
  observationId: string;
  footprintAreaSqft: number;
  parcelCoverageRatio: number;
  separationFromLargestFeet: number | null;
  parcelEdgeClearanceFeet: number;
  stackedOrCommonParcelAmbiguity: boolean;
}

export interface FootprintRoleResult {
  observationId: string;
  role: FootprintRole;
  accessoryStructureCandidate: boolean;
}

export function classifyFootprintRoles(
  footprints: FootprintRoleInput[],
  thresholds: AccessoryCandidateThresholds = DEFAULT_ACCESSORY_CANDIDATE_THRESHOLDS,
): FootprintRoleResult[] {
  if (footprints.length === 0) return [];
  if (footprints.some((footprint) => footprint.stackedOrCommonParcelAmbiguity)) {
    return footprints.map((footprint) => ({
      observationId: footprint.observationId,
      role: "STACKED_PARCEL_FOOTPRINT",
      accessoryStructureCandidate: false,
    }));
  }

  const ordered = [...footprints].sort(
    (a, b) => b.footprintAreaSqft - a.footprintAreaSqft || a.observationId.localeCompare(b.observationId),
  );
  const primary = ordered[0];
  return ordered.map((footprint, index) => {
    if (index === 0) {
      return {
        observationId: footprint.observationId,
        role: "PRIMARY_FOOTPRINT_CANDIDATE",
        accessoryStructureCandidate: false,
      };
    }
    const ratio = footprint.footprintAreaSqft / primary.footprintAreaSqft;
    const accessoryStructureCandidate =
      ordered.length > 1 &&
      footprint.footprintAreaSqft >= thresholds.minimumSecondaryAreaSqft &&
      footprint.footprintAreaSqft <= thresholds.maximumSecondaryAreaSqft &&
      ratio >= thresholds.minimumSecondaryToPrimaryRatio &&
      ratio <= thresholds.maximumSecondaryToPrimaryRatio &&
      (footprint.separationFromLargestFeet ?? -1) >= thresholds.minimumSeparationFeet &&
      footprint.parcelCoverageRatio >= thresholds.minimumParcelCoverageRatio &&
      footprint.parcelEdgeClearanceFeet >= thresholds.minimumParcelEdgeClearanceFeet;
    return {
      observationId: footprint.observationId,
      role: accessoryStructureCandidate ? "SECONDARY_FOOTPRINT_CANDIDATE" : "AMBIGUOUS_FOOTPRINT",
      accessoryStructureCandidate,
    };
  });
}

export function deriveStructureCurrentness(input: {
  observedFootprintCount: number;
  stackedOrCommonParcelAmbiguity: boolean;
  assessorFactAvailable: boolean;
  permitChangeState?:
    | "NO_PERMIT_CHANGE_FOUND"
    | "LATER_PERMIT_CHANGE_OBSERVED"
    | "ACTIVE_CHANGE_IN_PROGRESS"
    | "PERMIT_HISTORY_TRUNCATED"
    | "PERMIT_HISTORY_UNKNOWN";
}): StructureCurrentnessState {
  if (input.permitChangeState === "LATER_PERMIT_CHANGE_OBSERVED" || input.permitChangeState === "ACTIVE_CHANGE_IN_PROGRESS") {
    return "LATER_CHANGE_OBSERVED";
  }
  if (input.observedFootprintCount === 0 || input.stackedOrCommonParcelAmbiguity) return "CURRENTNESS_UNKNOWN";
  if (input.permitChangeState === "NO_PERMIT_CHANGE_FOUND") return "NO_LATER_CHANGE_KNOWN";
  if (input.assessorFactAvailable) return "CURRENTNESS_PARTIAL";
  return "OBSERVATIONAL_STALE";
}

export function structureObservationPrompt(input: {
  accessoryStructureCandidate: boolean;
  currentnessState: StructureCurrentnessState;
}): string | null {
  if (!input.accessoryStructureCandidate) return null;
  if (input.currentnessState === "LATER_CHANGE_OBSERVED") {
    return "Older mapping may no longer reflect the current property configuration.";
  }
  return "Older mapping shows a detached secondary structure on the parcel. Is that structure still there?";
}

export const STRUCTURE_OBSERVATION_EVIDENCE_CLASSES = [
  "STRUCTURE_OBSERVATION",
  "OBSERVED_FOOTPRINT_COUNT",
  "OBSERVED_SECONDARY_STRUCTURE_CANDIDATE",
  "STRUCTURE_CURRENTNESS_STATE",
] as const;

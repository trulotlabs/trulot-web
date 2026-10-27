export type PropertyFactType =
  | "ASSESSOR_USE_CLASS"
  | "RECORDED_UNIT_COUNT"
  | "TOTAL_LIVING_AREA"
  | "ASSESSED_IMPROVEMENT_VALUE"
  | "ASSESSOR_ADU_HINT"
  | "ASSESSOR_GARAGE_CONVERSION_HINT";

export type PropertyFact<T extends string | number | boolean> = {
  jurisdiction: string;
  apn: string;
  factType: PropertyFactType;
  value: T;
  sourceId: "SANGIS_ARCC_PARCEL_BASE_20260924";
  authorityClass: "RECORDED_PROPERTY_CHARACTERISTIC" | "RECORDED_HINT";
  recordedDate: null;
  sourceUpdateDate: null;
  acquisitionDate: "2026-09-24";
  currentnessState: "RECORDED_NOT_CURRENT_AS_BUILT_TRUTH";
  derivationClass: "DIRECT_RECORDED" | "NORMALIZED_RECORDED" | "RECORDED_HINT";
  conflictState: "NONE" | "CONFLICT_PRESENT";
  evidenceReference: string;
  permittedEvaluationUses: Array<"PRELIMINARY_SCREENING" | "PRESELECT_WITH_CONFIRMATION" | "CONFLICT_DETECTION">;
};

export type NormalizedAssessorUseClass =
  | "DETACHED_FAMILY_HINT"
  | "MULTIFAMILY_HINT"
  | "CONDOMINIUM_HINT"
  | "VACANT_LAND_HINT"
  | "NONRESIDENTIAL"
  | "UNKNOWN_OTHER";

export type AssessorUseMapping = {
  originalCode: string;
  sourceMeaning: string;
  normalizedClass: NormalizedAssessorUseClass;
  assessorAduHint: boolean;
};

const DETACHED = new Set(["109", "110", "111", "112", "113", "115", "116", "117", "119"]);
const MULTIFAMILY = new Set(["120", "130", "140", "150", "152", "153", "160", "162", "163"]);
const CONDO = new Set(["170", "171", "172", "173", "174", "175", "176"]);
const VACANT = new Set(["200", "400", "500", "600", "700", "800"]);

export function normalizeAssessorUse(code: unknown, sourceMeaning: string): AssessorUseMapping {
  const originalCode = typeof code === "string" ? code.trim().padStart(3, "0") : "000";
  let normalizedClass: NormalizedAssessorUseClass = "UNKNOWN_OTHER";
  if (DETACHED.has(originalCode)) normalizedClass = "DETACHED_FAMILY_HINT";
  else if (MULTIFAMILY.has(originalCode)) normalizedClass = "MULTIFAMILY_HINT";
  else if (CONDO.has(originalCode)) normalizedClass = "CONDOMINIUM_HINT";
  else if (VACANT.has(originalCode)) normalizedClass = "VACANT_LAND_HINT";
  else if (/^[2345678]\d\d$/.test(originalCode)) normalizedClass = "NONRESIDENTIAL";
  return {
    originalCode,
    sourceMeaning: sourceMeaning || "UNKNOWN",
    normalizedClass,
    assessorAduHint: originalCode === "109" || originalCode === "112",
  };
}

export function normalizeRecordedUnitCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

export type PreliminaryDwellingState =
  | "RECORDED_SINGLE_FAMILY_LIKELY"
  | "RECORDED_MULTIFAMILY_LIKELY"
  | "RECORDED_CONDO"
  | "RECORDED_RESIDENTIAL_CONFLICT"
  | "RECORDED_TYPE_UNKNOWN";

export type AssessorPropertyInput = {
  jurisdiction: string;
  apn: string;
  useCode: unknown;
  useMeaning: string;
  unitQuantity: unknown;
  totalLivingArea: unknown;
  assessedImprovementValue: unknown;
  garageConversionMarker: unknown;
  acquisitionValid?: boolean;
  laterConflictEvidence?: string[];
};

export type AssessorPropertyIntelligence = {
  provenance: "RECORDED_PROPERTY_CHARACTERISTIC";
  use: AssessorUseMapping;
  recordedUnitCount: number | null;
  preliminaryDwellingState: PreliminaryDwellingState;
  eligibleForPreselection: boolean;
  facts: PropertyFact<string | number | boolean>[];
  conflictReasons: string[];
  currentnessLimit: string;
};

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function buildAssessorPropertyIntelligence(input: AssessorPropertyInput): AssessorPropertyIntelligence {
  const use = normalizeAssessorUse(input.useCode, input.useMeaning);
  const units = normalizeRecordedUnitCount(input.unitQuantity);
  const later = input.laterConflictEvidence ?? [];
  const conflicts: string[] = [];
  let state: PreliminaryDwellingState = "RECORDED_TYPE_UNKNOWN";

  if (use.assessorAduHint) conflicts.push("ASSESSOR_ADU_HINT_REQUIRES_CURRENT_CONFIGURATION_REVIEW");
  if (use.normalizedClass === "DETACHED_FAMILY_HINT" && units !== null && units > 1) {
    conflicts.push("DETACHED_USE_AND_MULTIPLE_RECORDED_UNITS");
  }
  if (use.normalizedClass === "MULTIFAMILY_HINT" && units === 1) {
    conflicts.push("MULTIFAMILY_USE_AND_ONE_RECORDED_UNIT");
  }
  if (use.normalizedClass === "CONDOMINIUM_HINT" && units !== 1) {
    conflicts.push("CONDO_UNIT_SEMANTICS_INCONSISTENT");
  }
  conflicts.push(...later.map((item) => `LATER_CHANGE_EVIDENCE:${item}`));

  if (conflicts.length) state = "RECORDED_RESIDENTIAL_CONFLICT";
  else if (use.normalizedClass === "DETACHED_FAMILY_HINT" && units === 1) state = "RECORDED_SINGLE_FAMILY_LIKELY";
  else if (use.normalizedClass === "MULTIFAMILY_HINT" && units !== null && units >= 2) state = "RECORDED_MULTIFAMILY_LIKELY";
  else if (use.normalizedClass === "CONDOMINIUM_HINT") state = "RECORDED_CONDO";

  const conflictState = conflicts.length ? "CONFLICT_PRESENT" as const : "NONE" as const;
  const base = {
    jurisdiction: input.jurisdiction,
    apn: input.apn,
    sourceId: "SANGIS_ARCC_PARCEL_BASE_20260924" as const,
    authorityClass: "RECORDED_PROPERTY_CHARACTERISTIC" as const,
    recordedDate: null,
    sourceUpdateDate: null,
    acquisitionDate: "2026-09-24" as const,
    currentnessState: "RECORDED_NOT_CURRENT_AS_BUILT_TRUTH" as const,
    conflictState,
    evidenceReference: `sangis-arcc-parcel-base-20260924:${input.apn}`,
  };
  const facts: PropertyFact<string | number | boolean>[] = [{
    ...base,
    factType: "ASSESSOR_USE_CLASS",
    value: use.normalizedClass,
    derivationClass: "NORMALIZED_RECORDED",
    permittedEvaluationUses: ["PRELIMINARY_SCREENING", "PRESELECT_WITH_CONFIRMATION", "CONFLICT_DETECTION"],
  }];
  if (units !== null) facts.push({ ...base, factType: "RECORDED_UNIT_COUNT", value: units, derivationClass: "NORMALIZED_RECORDED", permittedEvaluationUses: ["PRELIMINARY_SCREENING", "PRESELECT_WITH_CONFIRMATION", "CONFLICT_DETECTION"] });
  const living = positiveNumber(input.totalLivingArea);
  if (living !== null) facts.push({ ...base, factType: "TOTAL_LIVING_AREA", value: living, derivationClass: "DIRECT_RECORDED", permittedEvaluationUses: ["PRELIMINARY_SCREENING"] });
  const improvement = positiveNumber(input.assessedImprovementValue);
  if (improvement !== null) facts.push({ ...base, factType: "ASSESSED_IMPROVEMENT_VALUE", value: improvement, derivationClass: "DIRECT_RECORDED", permittedEvaluationUses: ["PRELIMINARY_SCREENING"] });
  if (use.assessorAduHint) facts.push({ ...base, authorityClass: "RECORDED_HINT", factType: "ASSESSOR_ADU_HINT", value: true, derivationClass: "RECORDED_HINT", permittedEvaluationUses: ["CONFLICT_DETECTION"] });
  if (typeof input.garageConversionMarker === "string" && input.garageConversionMarker.trim().toUpperCase() === "Y") facts.push({ ...base, authorityClass: "RECORDED_HINT", factType: "ASSESSOR_GARAGE_CONVERSION_HINT", value: true, derivationClass: "RECORDED_HINT", permittedEvaluationUses: ["CONFLICT_DETECTION"] });

  return {
    provenance: "RECORDED_PROPERTY_CHARACTERISTIC",
    use,
    recordedUnitCount: units,
    preliminaryDwellingState: state,
    eligibleForPreselection: input.acquisitionValid !== false && conflicts.length === 0 &&
      (state === "RECORDED_SINGLE_FAMILY_LIKELY" || state === "RECORDED_MULTIFAMILY_LIKELY"),
    facts,
    conflictReasons: conflicts,
    currentnessLimit: "Recorded assessor characteristics may lag current as-built conditions and require homeowner confirmation.",
  };
}

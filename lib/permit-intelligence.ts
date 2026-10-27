import { normalizeAddress } from "./parcel-lookup-contract";

export type PermitStatus =
  | "APPLIED"
  | "UNDER_REVIEW"
  | "ISSUED"
  | "FINALED_COMPLETE"
  | "EXPIRED"
  | "WITHDRAWN"
  | "UNKNOWN";

export type PermitCategory =
  | "NEW_DWELLING"
  | "ADU"
  | "JADU"
  | "ADDITION"
  | "GARAGE_CONVERSION"
  | "ACCESSORY_BUILDING"
  | "DEMOLITION"
  | "REMODEL"
  | "ELECTRICAL"
  | "PLUMBING"
  | "MECHANICAL"
  | "GRADING"
  | "RETAINING_WALL"
  | "SOLAR"
  | "OTHER";

export type PermitCategoryConfidence = "EXPLICIT" | "DETERMINISTIC_DERIVED" | "UNRESOLVED";
export type PermitLinkageState = "PARCEL_LINKED" | "ADDRESS_GROUP_LINKED" | "UNRESOLVED";
export type PermitCompleteness = "COMPLETE_FOR_QUERY" | "PAGINATED_COMPLETE" | "TRUNCATED" | "UNKNOWN_COMPLETENESS";
export type PermitChangeState =
  | "NO_PERMIT_CHANGE_FOUND"
  | "LATER_PERMIT_CHANGE_OBSERVED"
  | "ACTIVE_CHANGE_IN_PROGRESS"
  | "PERMIT_HISTORY_TRUNCATED"
  | "PERMIT_HISTORY_UNKNOWN";

const STATUS_MAP: Readonly<Record<string, PermitStatus>> = {
  "APPLICATION RECEIVED": "APPLIED",
  APPLIED: "APPLIED",
  "APPROVED: PERMIT FEES DUE": "UNDER_REVIEW",
  "IN REVIEW": "UNDER_REVIEW",
  "PLAN CHECK": "UNDER_REVIEW",
  "PLAN CHECK EXPIRED": "EXPIRED",
  "UNDER REVIEW": "UNDER_REVIEW",
  ISSUED: "ISSUED",
  "UNDER CONSTRUCTION": "ISSUED",
  FINAL: "FINALED_COMPLETE",
  FINALED: "FINALED_COMPLETE",
  "CLOSED - FINAL": "FINALED_COMPLETE",
  COFO: "FINALED_COMPLETE",
  COMPLETED: "FINALED_COMPLETE",
  "COMPLETED (PASS)": "FINALED_COMPLETE",
  "FINALED WITH COFO": "FINALED_COMPLETE",
  "INSPECTIONS COMPLETE": "FINALED_COMPLETE",
  "INSPECTIONS FINALED": "FINALED_COMPLETE",
  "EXP APPL": "EXPIRED",
  EXPIRED: "EXPIRED",
  WITHDRWN: "WITHDRAWN",
  WITHDRAWN: "WITHDRAWN",
  "WITHDRAWN (CLOSED)": "WITHDRAWN",
};

export function normalizePermitStatus(rawStatus: string | null | undefined): PermitStatus {
  const key = rawStatus?.trim().toUpperCase() ?? "";
  return STATUS_MAP[key] ?? "UNKNOWN";
}

export interface PermitClassification {
  category: PermitCategory;
  confidence: PermitCategoryConfidence;
  basis: "RECORD_TYPE" | "DESCRIPTION" | "PROJECT_NAME" | "NONE";
}

function classifyText(value: string, basis: PermitClassification["basis"]): PermitClassification | null {
  const text = value.trim().toUpperCase();
  if (!text) return null;
  if (/\b(JADU|JUNIOR ACCESSORY DWELLING UNIT)\b/.test(text)) return { category: "JADU", confidence: "EXPLICIT", basis };
  if (/\b(ADU|ACCESSORY DWELLING UNIT|SECOND DWELLING UNIT)\b/.test(text)) return { category: "ADU", confidence: "EXPLICIT", basis };
  if (/\bGARAGE\b.*\bCONVERSION\b|\bCONVERT\b.*\bGARAGE\b/.test(text)) return { category: "GARAGE_CONVERSION", confidence: "EXPLICIT", basis };
  if (/\bDEMOLITION\b|\bDEMOLISH\b/.test(text)) return { category: "DEMOLITION", confidence: "EXPLICIT", basis };
  if (/\bNEW (SINGLE FAMILY|SINGLE-FAMILY|DWELLING|RESIDENCE|HOME)\b|\bNEW CONSTRUCTION \(RES\)/.test(text)) return { category: "NEW_DWELLING", confidence: "EXPLICIT", basis };
  if (/\bADDITION\b/.test(text)) return { category: "ADDITION", confidence: "EXPLICIT", basis };
  if (/\bRETAINING WALL\b/.test(text)) return { category: "RETAINING_WALL", confidence: "EXPLICIT", basis };
  if (/\bACCESSORY (BUILDING|STRUCTURE)\b/.test(text)) return { category: "ACCESSORY_BUILDING", confidence: "EXPLICIT", basis };
  if (/\bREMODEL(?:ING)?\b|\bALTERATION\b|\bREROOF\b/.test(text)) return { category: "REMODEL", confidence: "DETERMINISTIC_DERIVED", basis };
  if (/\bELECTRICAL\b/.test(text)) return { category: "ELECTRICAL", confidence: "DETERMINISTIC_DERIVED", basis };
  if (/\bPLUMBING\b/.test(text)) return { category: "PLUMBING", confidence: "DETERMINISTIC_DERIVED", basis };
  if (/\bMECHANICAL\b/.test(text)) return { category: "MECHANICAL", confidence: "DETERMINISTIC_DERIVED", basis };
  if (/\bGRADING\b/.test(text)) return { category: "GRADING", confidence: "DETERMINISTIC_DERIVED", basis };
  if (/\bSOLAR\b|\bPHOTOVOLTAIC\b|\bPV SYSTEM\b/.test(text)) return { category: "SOLAR", confidence: "DETERMINISTIC_DERIVED", basis };
  return null;
}

export function classifyPermit(input: {
  recordType?: string | null;
  description?: string | null;
  projectName?: string | null;
}): PermitClassification {
  for (const [value, basis] of [
    [input.recordType, "RECORD_TYPE"],
    [input.description, "DESCRIPTION"],
    [input.projectName, "PROJECT_NAME"],
  ] as const) {
    const result = classifyText(value ?? "", basis);
    if (result) return result;
  }
  return { category: "OTHER", confidence: "UNRESOLVED", basis: "NONE" };
}

export interface CanonicalPermitParcel {
  apn: string;
  normalizedAddress: string | null;
  normalizedUnitAddress?: string | null;
}

export interface PermitLinkage {
  state: PermitLinkageState;
  method:
    | "EXACT_SOURCE_APN"
    | "EXACT_PERMIT_PARCEL_NUMBER"
    | "EXACT_NORMALIZED_ADDRESS_UNIQUE"
    | "EXPLICIT_UNIT_SUBADDRESS"
    | "AMBIGUOUS_ADDRESS_CANDIDATE_SET"
    | "UNRESOLVED";
  confidence: "HIGH" | "MEDIUM" | "NONE";
  candidateApns: string[];
}

export function linkPermitRecord(input: {
  sourceApn?: string | null;
  permitParcelNumber?: string | null;
  address?: string | null;
}, parcels: CanonicalPermitParcel[]): PermitLinkage {
  const digits = (input.sourceApn ?? "").replace(/\D/g, "");
  if (digits) {
    const exact = parcels.filter((parcel) => parcel.apn === digits);
    if (exact.length === 1) return { state: "PARCEL_LINKED", method: "EXACT_SOURCE_APN", confidence: "HIGH", candidateApns: [digits] };
  }
  const permitDigits = (input.permitParcelNumber ?? "").replace(/\D/g, "");
  if (permitDigits) {
    const exact = parcels.filter((parcel) => parcel.apn === permitDigits);
    if (exact.length === 1) return { state: "PARCEL_LINKED", method: "EXACT_PERMIT_PARCEL_NUMBER", confidence: "HIGH", candidateApns: [permitDigits] };
  }
  // MaintStar appends jurisdiction/state to its street field. Parcel Lookup's
  // canonical key is the street/subaddress portion, so remove only that
  // transport suffix and reuse the existing normalizer for all parsing.
  const addressParts = (input.address ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  let streetAddress = addressParts[0] ?? "";
  const commaUnit = addressParts[1];
  if (commaUnit && !/^LA MESA\b/i.test(commaUnit) && /^#?[A-Z0-9-]+$/i.test(commaUnit)) {
    streetAddress = `${streetAddress} UNIT ${commaUnit.replace(/^#/, "")}`;
  }
  const address = normalizeAddress(streetAddress);
  if (!address) return { state: "UNRESOLVED", method: "UNRESOLVED", confidence: "NONE", candidateApns: [] };
  const explicitUnit = /\bUNIT\s+[A-Z0-9]+\b/.test(address);
  const matches = parcels.filter((parcel) => {
    if (explicitUnit && parcel.normalizedUnitAddress === address) return true;
    return parcel.normalizedAddress === address;
  });
  if (matches.length === 1) {
    return {
      state: "PARCEL_LINKED",
      method: explicitUnit ? "EXPLICIT_UNIT_SUBADDRESS" : "EXACT_NORMALIZED_ADDRESS_UNIQUE",
      confidence: explicitUnit ? "HIGH" : "MEDIUM",
      candidateApns: [matches[0].apn],
    };
  }
  if (matches.length > 1) {
    return { state: "ADDRESS_GROUP_LINKED", method: "AMBIGUOUS_ADDRESS_CANDIDATE_SET", confidence: "MEDIUM", candidateApns: matches.map((match) => match.apn).sort() };
  }
  return { state: "UNRESOLVED", method: "UNRESOLVED", confidence: "NONE", candidateApns: [] };
}

const CHANGE_CATEGORIES = new Set<PermitCategory>(["NEW_DWELLING", "ADU", "JADU", "ADDITION", "GARAGE_CONVERSION", "DEMOLITION"]);

export function derivePermitChangeState(input: {
  available: boolean;
  completeness: PermitCompleteness;
  records: Array<{ category: PermitCategory; normalizedStatus: PermitStatus }>;
}): PermitChangeState {
  if (!input.available || input.completeness === "UNKNOWN_COMPLETENESS") return "PERMIT_HISTORY_UNKNOWN";
  if (input.completeness === "TRUNCATED") return "PERMIT_HISTORY_TRUNCATED";
  const changes = input.records.filter((record) => CHANGE_CATEGORIES.has(record.category));
  if (changes.some((record) => record.normalizedStatus === "ISSUED" || record.normalizedStatus === "UNDER_REVIEW" || record.normalizedStatus === "APPLIED")) return "ACTIVE_CHANGE_IN_PROGRESS";
  if (changes.some((record) => record.normalizedStatus === "FINALED_COMPLETE")) return "LATER_PERMIT_CHANGE_OBSERVED";
  return "NO_PERMIT_CHANGE_FOUND";
}

export const PERMIT_EVIDENCE_CLASSES = [
  "PERMIT_RECORD",
  "PERMIT_STATUS_RECORD",
  "PERMIT_ADU_RECORD",
  "PERMIT_DEMOLITION_RECORD",
  "PERMIT_ADDITION_RECORD",
  "PERMIT_CHANGE_SIGNAL",
] as const;

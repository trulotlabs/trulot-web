import {
  formatApn,
  normalizeAddress,
  type ParcelLookupRecord,
} from "./parcel-lookup-contract";
import {
  getLaMesaBenchmarkInput,
  listLaMesaBenchmarkApns,
} from "./la-mesa-public-feasibility-evidence";
import { buildPublicParcelFeasibility } from "./public-parcel-feasibility";
import type {
  FrontDoorPublicEvaluation,
  LaMesaFrontDoorDataset,
} from "./la-mesa-adu-front-door";

function record(
  apn: string,
  address: string | null,
  jurisdiction: string,
  sourceObjectId: number,
): ParcelLookupRecord {
  return {
    apn,
    apnDisplay: formatApn(apn),
    parcelId: null,
    sourceObjectId,
    address,
    unit: null,
    displayAddress: address ?? `APN ${formatApn(apn)}`,
    normalizedAddress: address ? normalizeAddress(address) : null,
    normalizedUnitAddress: address ? normalizeAddress(address) : null,
    zip: null,
    jurisdiction,
    approximateAreaSqFt: 0,
    centroid: [-117, 32.77],
    geometryType: "Polygon",
    geometrySha256: "0".repeat(64),
    polygons: [],
    parcelIntelligenceAvailable: jurisdiction === "City of La Mesa",
    zoningState: "NOT_EVALUATED",
    zones: [],
    coastalState: "NOT_APPLICABLE",
    coastalValue: null,
    existingUnits: null,
  };
}

export function buildLaMesaFrontDoorDataset(): LaMesaFrontDoorDataset {
  const records: ParcelLookupRecord[] = [];
  const evaluations: Record<string, FrontDoorPublicEvaluation> = {};
  for (const [index, apn] of listLaMesaBenchmarkApns().entries()) {
    const input = getLaMesaBenchmarkInput(apn);
    if (!input) continue;
    const jurisdiction =
      input.laMesa?.selectionState === "JURISDICTION_UNRESOLVED"
        ? "Jurisdiction unresolved"
        : "City of La Mesa";
    records.push(record(apn, input.address, jurisdiction, 6_800_000 + index));
    const publicResult = buildPublicParcelFeasibility(input);
    const details = publicResult.jurisdictionDetails;
    evaluations[apn] = {
      baseZone: input.baseZoneCode,
      baseProfile: details?.developmentRules.baseProfile ?? input.laMesa?.baseProfile ?? null,
      answerCategory: details?.aduPathwaySummary.answerCategory ?? "Source unavailable",
      mappedModifierIds: details?.mappedModifiers ?? input.laMesa?.modifierIds ?? [],
      missingFacts: details?.unresolvedPredicates ?? input.laMesa?.missingPropertyFacts ?? [],
      pathwayCatalog: details?.aduPathwaySummary.pathwayCatalog ?? [],
      evidenceSources: details?.publicEvidenceSources ?? [],
      evaluationDate: details?.evaluationEffectiveDate ?? input.laMesa?.evaluationDate ?? null,
      specificPlanBoundaryUnresolved:
        input.laMesa?.missingPropertyFacts.includes("specific_plan_boundary_resolution") ?? false,
      available:
        publicResult.readiness === "READY" &&
        details !== null &&
        details.aduPathwaySummary.answerCategory !== "Outside current scope" &&
        details.aduPathwaySummary.answerCategory !== "Source unavailable",
    };
  }
  records.push(
    record("9990000100", "100 PREVIEW LN", "City of La Mesa", 6_899_001),
    record("9990000200", "100 PREVIEW LN", "City of La Mesa", 6_899_002),
    record("9990000300", "100 PREVIEW LN", "City of San Diego", 6_899_003),
  );
  return { records, evaluations };
}

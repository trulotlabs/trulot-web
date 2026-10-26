import benchmarkFacts from "@/data/la-mesa-v4-benchmark-integration-v0/benchmark-facts.json";
import benchmarkResults from "@/data/la-mesa-v4-benchmark-integration-v0/benchmark-results.json";
import type { PublicParcelFeasibilityInput } from "./public-parcel-feasibility";

const factsByApn = new Map(benchmarkFacts.benchmarks.map((row) => [row.apn, row]));
const resultsByApn = new Map(benchmarkResults.results.map((row) => [row.apn, row]));

/** Sealed, public-only Packet 67 benchmark input. No project or authenticated facts. */
export function getLaMesaBenchmarkInput(apn: string): PublicParcelFeasibilityInput | null {
  const facts = factsByApn.get(apn);
  const result = resultsByApn.get(apn);
  if (!facts || !result) return null;
  const zoneFact = facts.known_property_facts.find((fact) => fact.fact === "base_zone");
  const zone = typeof zoneFact?.value === "string" ? zoneFact.value : null;
  return {
    jurisdictionId: "CITY_OF_LA_MESA",
    parcelId: apn,
    address: facts.address,
    ruleProfileVersion: "LA_MESA_TITLE24_2026_10_04",
    baseZoneCode: zone,
    measurements: {},
    coastalContext: "NOT_APPLICABLE",
    contexts: {},
    sourceFreshness: "2026-10-26",
    laMesa: {
      evaluationDate: facts.evaluation_date,
      aduProfile: "LA_MESA_ADU_2026",
      selectionState:
        result.v4_state === "SOURCE_UNAVAILABLE"
          ? "JURISDICTION_UNRESOLVED"
          : result.v4_state === "OUTSIDE_CURRENT_SCOPE"
            ? "PROFILE_UNAVAILABLE"
            : "READY",
      baseProfile: result.base_profile,
      modifierIds: [...result.modifier_ids],
      missingPropertyFacts: [...facts.missing_property_facts],
      publicEvidenceOnly: true,
    },
  };
}

export function listLaMesaBenchmarkApns(): string[] {
  return benchmarkFacts.benchmarks.map((row) => row.apn);
}

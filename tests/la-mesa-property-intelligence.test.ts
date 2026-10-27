import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildAssessorPropertyIntelligence,
  normalizeAssessorUse,
  normalizeRecordedUnitCount,
} from "../lib/property-intelligence";
import {
  evaluateLaMesaFrontDoor,
  propertyConfirmationFor,
  resolveLaMesaFrontDoor,
  type HomeownerAnswers,
} from "../lib/la-mesa-adu-front-door";
import { buildLaMesaFrontDoorDataset } from "../lib/la-mesa-adu-front-door-server";

const dataset = buildLaMesaFrontDoorDataset();

function candidate(apn: string) {
  const result = resolveLaMesaFrontDoor(apn, dataset);
  assert.equal(result.state, "EXACT_MATCH");
  return result.candidates[0];
}

test("use-code mapping retains official code and meaning without guessing", () => {
  assert.deepEqual(normalizeAssessorUse("111", "SINGLE FAMILY RESIDENCE"), {
    originalCode: "111", sourceMeaning: "SINGLE FAMILY RESIDENCE", normalizedClass: "DETACHED_FAMILY_HINT", assessorAduHint: false,
  });
  assert.equal(normalizeAssessorUse("150", "16 - 60 UNITS GENERIC").normalizedClass, "MULTIFAMILY_HINT");
  assert.equal(normalizeAssessorUse("171", "CONDOS ATTACHED").normalizedClass, "CONDOMINIUM_HINT");
  assert.equal(normalizeAssessorUse("200", "VACANT LAND COMMERCIAL").normalizedClass, "VACANT_LAND_HINT");
  assert.equal(normalizeAssessorUse("710", "CHURCH").normalizedClass, "NONRESIDENTIAL");
  assert.equal(normalizeAssessorUse("000", "UNKNOWN").normalizedClass, "UNKNOWN_OTHER");
  const sealed = JSON.parse(readFileSync("data/la-mesa-assessor-property-intelligence-v0/use-code-mapping.json", "utf8")) as {
    mappings: Array<{ originalCode: string; sourceMeaning: string; normalizedClass: string; assessorAduHint: boolean }>;
  };
  assert.ok(sealed.mappings.length > 20);
  for (const mapping of sealed.mappings) assert.deepEqual(normalizeAssessorUse(mapping.originalCode, mapping.sourceMeaning), mapping);
});

test("unit normalization treats zero, null, malformed, and negative values as unknown", () => {
  assert.equal(normalizeRecordedUnitCount(21), 21);
  for (const value of [0, null, undefined, "2", -1, 1.5]) assert.equal(normalizeRecordedUnitCount(value), null);
});

test("fact schema is jurisdiction-neutral, typed, privacy-filtered, and excludes YEAR_EFFECTIVE", () => {
  const intel = buildAssessorPropertyIntelligence({ jurisdiction:"CITY_OF_LA_MESA",apn:"4685100900",useCode:"111",useMeaning:"SINGLE FAMILY RESIDENCE",unitQuantity:1,totalLivingArea:1572,assessedImprovementValue:233465,garageConversionMarker:"N",acquisitionValid:true });
  assert.equal(intel.provenance, "RECORDED_PROPERTY_CHARACTERISTIC");
  assert.deepEqual(intel.facts.map((fact) => fact.factType), ["ASSESSOR_USE_CLASS", "RECORDED_UNIT_COUNT", "TOTAL_LIVING_AREA", "ASSESSED_IMPROVEMENT_VALUE"]);
  for (const fact of intel.facts) {
    assert.equal(fact.jurisdiction, "CITY_OF_LA_MESA");
    assert.equal(fact.apn, "4685100900");
    assert.equal(fact.authorityClass, "RECORDED_PROPERTY_CHARACTERISTIC");
    assert.equal(fact.currentnessState, "RECORDED_NOT_CURRENT_AS_BUILT_TRUTH");
  }
  const serialized = JSON.stringify(intel);
  assert.doesNotMatch(serialized, /YEAR_EFFECTIVE|ownerName|mailingAddress|ownerocc/i);
});

test("bounded derivation detects use/count, ADU-hint, condo, and later-change conflicts", () => {
  const build = (useCode: string, unitQuantity: number, laterConflictEvidence: string[] = []) => buildAssessorPropertyIntelligence({
    jurisdiction: "TEST", apn: "1", useCode, useMeaning: "official", unitQuantity,
    totalLivingArea: 0, assessedImprovementValue: 0, garageConversionMarker: "", acquisitionValid: true, laterConflictEvidence,
  });
  assert.equal(build("111", 2).preliminaryDwellingState, "RECORDED_RESIDENTIAL_CONFLICT");
  assert.equal(build("150", 1).preliminaryDwellingState, "RECORDED_RESIDENTIAL_CONFLICT");
  assert.equal(build("171", 0).preliminaryDwellingState, "RECORDED_RESIDENTIAL_CONFLICT");
  assert.equal(build("109", 2).preliminaryDwellingState, "RECORDED_RESIDENTIAL_CONFLICT");
  assert.equal(build("111", 1, ["later"]).eligibleForPreselection, false);
  assert.equal(buildAssessorPropertyIntelligence({ jurisdiction:"TEST",apn:"1",useCode:"111",useMeaning:"official",unitQuantity:1,totalLivingArea:0,assessedImprovementValue:0,garageConversionMarker:"",acquisitionValid:false }).eligibleForPreselection, false);
  const hints = buildAssessorPropertyIntelligence({ jurisdiction:"TEST",apn:"1",useCode:"109",useMeaning:"SINGLE FAMILY RESIDENCE WITH ADU",unitQuantity:2,totalLivingArea:0,assessedImprovementValue:0,garageConversionMarker:"Y",acquisitionValid:true });
  assert.equal(hints.facts.filter((fact) => fact.factType.endsWith("HINT")).every((fact) => fact.authorityClass === "RECORDED_HINT"), true);
});

test("Bruce Ct gets recorded single-family confirmation with no raw age", () => {
  const intel = buildAssessorPropertyIntelligence({ jurisdiction:"CITY_OF_LA_MESA",apn:"4685100900",useCode:"111",useMeaning:"SINGLE FAMILY RESIDENCE",unitQuantity:1,totalLivingArea:1572,assessedImprovementValue:233465,garageConversionMarker:"N",acquisitionValid:true });
  assert.equal(intel.use.originalCode, "111");
  assert.equal(intel.recordedUnitCount, 1);
  assert.equal(intel.preliminaryDwellingState, "RECORDED_SINGLE_FAMILY_LIKELY");
  assert.equal(intel.facts.find((fact) => fact.factType === "TOTAL_LIVING_AREA")?.value, 1572);
  assert.equal(propertyConfirmationFor(intel)?.prompt, "Public property records indicate one detached residence. Is that still correct?");
});

test("multifamily, condo, missing, ADU hint, and later-development benchmarks remain bounded", () => {
  assert.equal(dataset.propertyIntelligence["4640201000"].preliminaryDwellingState, "RECORDED_MULTIFAMILY_LIKELY");
  assert.equal(propertyConfirmationFor(dataset.propertyIntelligence["4640201000"])?.prompt, "Public property records indicate multiple dwelling units. Is that still correct?");
  assert.equal(dataset.propertyIntelligence["4640203301"].preliminaryDwellingState, "RECORDED_CONDO");
  assert.equal(propertyConfirmationFor(dataset.propertyIntelligence["4640203301"])?.preselectedUse, "CONDOMINIUM");
  assert.equal(dataset.propertyIntelligence["4640202200"].preliminaryDwellingState, "RECORDED_TYPE_UNKNOWN");
  assert.equal(propertyConfirmationFor(dataset.propertyIntelligence["4640202200"]), null);
  assert.equal(dataset.propertyIntelligence["4705321100"].preliminaryDwellingState, "RECORDED_RESIDENTIAL_CONFLICT");
  assert.equal(dataset.propertyIntelligence["4705321100"].conflictReasons.includes("ASSESSOR_ADU_HINT_REQUIRES_CURRENT_CONFIGURATION_REVIEW"), true);
  assert.equal(dataset.propertyIntelligence["4944102400"].preliminaryDwellingState, "RECORDED_RESIDENTIAL_CONFLICT");
});

test("homeowner correction is preserved separately and recorded disagreement remains a conflict", () => {
  const answers: HomeownerAnswers = {
    existingUse: { value: "TWO_OR_MORE_DWELLINGS", provenance: "USER_PROVIDED" },
    aduIdea: { value: "NOT_SURE", provenance: "USER_PROVIDED" },
  };
  const result = evaluateLaMesaFrontDoor(candidate("4685100900"), dataset, answers);
  assert.equal(result.propertyIntelligence?.preliminaryDwellingState, "RECORDED_SINGLE_FAMILY_LIKELY");
  assert.equal(result.homeownerAnswers?.existingUse.provenance, "USER_PROVIDED");
  assert.equal(result.propertyFactConflicts.includes("HOMEOWNER_ANSWER_DIFFERS_FROM_RECORDED_CHARACTERISTIC"), true);
});

test("condo confirmation never derives an automatic ADU pathway", () => {
  const answers: HomeownerAnswers = {
    existingUse: { value: "CONDOMINIUM", provenance: "USER_PROVIDED" },
    aduIdea: { value: "NEW_DETACHED_ADU", provenance: "USER_PROVIDED" },
  };
  const result = evaluateLaMesaFrontDoor(candidate("4640203301"), dataset, answers);
  assert.equal(result.answerCategory, "Needs property evidence");
  assert.equal(result.pathways.length, 0);
  assert.match(result.headline, /condominium characteristic is preserved/i);
});

test("property-intelligence failure falls back to the existing blank question", () => {
  const fallback = { ...dataset, propertyIntelligence: {} };
  const result = evaluateLaMesaFrontDoor(candidate("4685100900"), fallback);
  assert.equal(result.propertyIntelligence, null);
  assert.match(result.headline, /need a few facts/i);
});

test("all 17,391 canonical parcels have an exact bounded state partition", () => {
  assert.equal(Object.keys(dataset.propertyIntelligence).length, 17391);
  const counts: Record<string, number> = {};
  for (const intelligence of Object.values(dataset.propertyIntelligence)) {
    counts[intelligence.preliminaryDwellingState] = (counts[intelligence.preliminaryDwellingState] ?? 0) + 1;
  }
  assert.deepEqual(counts, {
    RECORDED_MULTIFAMILY_LIKELY: 1138,
    RECORDED_TYPE_UNKNOWN: 1745,
    RECORDED_CONDO: 3370,
    RECORDED_SINGLE_FAMILY_LIKELY: 10633,
    RECORDED_RESIDENTIAL_CONFLICT: 505,
  });
  assert.equal(Object.values(dataset.propertyIntelligence).filter((value) => value.eligibleForPreselection).length, 11771);
});

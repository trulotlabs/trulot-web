import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DevelopmentRulesSection } from "../app/parcel/san-diego/[slug]/parcel-feasibility";
import {
  buildPublicParcelFeasibility,
  type PublicParcelFeasibilityInput,
} from "../lib/public-parcel-feasibility";
import {
  getLaMesaBenchmarkInput,
  listLaMesaBenchmarkApns,
} from "../lib/la-mesa-public-feasibility-evidence";

const supported = ["4640301100", "4912600700", "4994920400", "4640201000", "4752412200", "4904720700"];

function benchmark(apn: string): PublicParcelFeasibilityInput {
  const input = getLaMesaBenchmarkInput(apn);
  assert.ok(input);
  return input;
}

test("sealed benchmark registry contains exactly the nine Packet 63/64 parcels", () => {
  assert.deepEqual(listLaMesaBenchmarkApns(), [
    "4640301100", "4912600700", "4994920400", "4640201000", "4752412200",
    "4904720700", "4646002300", "4953350500", "4641310100",
  ]);
});

test("supported La Mesa profiles fail closed on missing dwelling evidence", () => {
  for (const apn of supported) {
    const output = buildPublicParcelFeasibility(benchmark(apn));
    assert.equal(output.readiness, "READY", apn);
    assert.equal(output.rules[0]?.state, "NEEDS_EVIDENCE", apn);
    assert.equal(output.jurisdictionDetails?.aduPathwaySummary.answerCategory, "Needs property evidence", apn);
    assert.deepEqual(output.jurisdictionDetails?.aduPathwaySummary.selectedPathwayIds, [], apn);
    assert.equal(output.jurisdictionDetails?.aduPathwaySummary.finalParcelEligibility, null, apn);
    assert.equal(output.jurisdictionDetails?.aduPathwaySummary.permitApprovalConclusion, null, apn);
    assert.ok(output.jurisdictionDetails?.unresolvedPredicates.includes("primary_dwelling_type"), apn);
  }
});

test("ordinary R1 exposes the bounded 2026 catalog without selecting a pathway", () => {
  const output = buildPublicParcelFeasibility(benchmark("4640301100"));
  const details = output.jurisdictionDetails!;
  assert.equal(details.developmentRules.baseProfile, "CITY_OF_LA_MESA::R1::LA_MESA_TITLE24_2026_10_04");
  assert.equal(details.evaluationEffectiveDate, "2026-10-26");
  assert.equal(details.aduPathwaySummary.profile, "LA_MESA_ADU_2026");
  assert.equal(details.aduPathwaySummary.pathwayCatalog.length, 7);
  assert.equal(details.aduPathwaySummary.currentDetachedSingleFamilyCount, 1);
  assert.equal(details.aduPathwaySummary.pathwayCatalog.some((path) => path.id === "SF_LOCAL_66314_ADU"), true);
  assert.equal(details.aduPathwaySummary.pathwayCatalog.some((path) => path.id === "SF_DETACHED_66323_ADU"), true);
  assert.doesNotMatch(JSON.stringify(output), /two detached|2027/i);
});

test("Scenic, Hillside, and combined overlays remain mapped context without denial", () => {
  const scenic = buildPublicParcelFeasibility(benchmark("4912600700"));
  const hillside = buildPublicParcelFeasibility(benchmark("4752412200"));
  const combined = buildPublicParcelFeasibility(benchmark("4904720700"));
  assert.deepEqual(scenic.jurisdictionDetails?.mappedModifiers, ["LM_OVERLAY_P"]);
  assert.deepEqual(hillside.jurisdictionDetails?.mappedModifiers, ["LM_OVERLAY_H"]);
  assert.deepEqual(combined.jurisdictionDetails?.mappedModifiers, ["LM_OVERLAY_MU", "LM_OVERLAY_P", "LM_OVERLAY_D"]);
  for (const output of [scenic, hillside, combined]) {
    assert.equal(output.rules[0]?.state, "NEEDS_EVIDENCE");
    assert.doesNotMatch(JSON.stringify(output), /automatic denial|numeric override/i);
  }
  assert.ok(hillside.jurisdictionDetails?.unresolvedPredicates.includes("fire_access_route"));
  assert.ok(combined.jurisdictionDetails?.unresolvedPredicates.includes("objective_overlay_standard_applicability"));
});

test("R3 zoning never establishes multifamily dwelling type", () => {
  const output = buildPublicParcelFeasibility(benchmark("4640201000"));
  assert.equal(output.baseZoneCode, "R3");
  assert.equal(output.rules[0]?.state, "NEEDS_EVIDENCE");
  assert.deepEqual(output.jurisdictionDetails?.aduPathwaySummary.selectedPathwayIds, []);
  assert.ok(output.jurisdictionDetails?.unresolvedPredicates.includes("primary_dwelling_type"));
});

test("specific-plan, jurisdiction-conflict, and unsupported cases keep distinct fail-closed states", () => {
  const specific = buildPublicParcelFeasibility(benchmark("4646002300"));
  const conflict = buildPublicParcelFeasibility(benchmark("4953350500"));
  const unsupported = buildPublicParcelFeasibility(benchmark("4641310100"));
  assert.equal(specific.rules[0]?.state, "OUTSIDE_CURRENT_SCOPE");
  assert.equal(specific.jurisdictionDetails?.aduPathwaySummary.answerCategory, "Outside current scope");
  assert.equal(conflict.rules[0]?.state, "SOURCE_UNAVAILABLE");
  assert.equal(conflict.jurisdictionDetails?.aduPathwaySummary.answerCategory, "Source unavailable");
  assert.equal(unsupported.rules[0]?.state, "OUTSIDE_CURRENT_SCOPE");
  for (const output of [specific, conflict, unsupported]) {
    assert.deepEqual(output.jurisdictionDetails?.aduPathwaySummary.selectedPathwayIds, []);
  }
});

test("2027 date and profile cannot enter the current 2026 runtime", () => {
  const input = benchmark("4640301100");
  input.laMesa = { ...input.laMesa!, evaluationDate: "2027-01-01" };
  const output = buildPublicParcelFeasibility(input);
  assert.equal(output.readiness, "UNAVAILABLE");
  assert.equal(output.errorCode, "FEASIBILITY_BUILD_FAILED");
  assert.equal(output.jurisdictionDetails, null);
});

test("private project fields are rejected at the La Mesa runtime boundary", () => {
  const input = benchmark("4640301100") as PublicParcelFeasibilityInput & { privateSurveyEvidence?: unknown };
  input.privateSurveyEvidence = { width: 50 };
  const output = buildPublicParcelFeasibility(input);
  assert.equal(output.readiness, "UNAVAILABLE");
  assert.equal(output.errorCode, "FEASIBILITY_BUILD_FAILED");
  assert.equal(output.jurisdictionDetails, null);
});

test("La Mesa sources are jurisdiction-correct and no runtime route is involved", () => {
  const output = buildPublicParcelFeasibility(benchmark("4640301100"));
  const serialized = JSON.stringify(output);
  assert.match(serialized, /cityoflamesa\.gov/);
  assert.match(serialized, /legislature\.ca\.gov/);
  assert.doesNotMatch(serialized, /sandiego\.gov|Coastal|SDA/);
  assert.equal(output.sourceRegistryAdditions.length, 4);
});


test("bounded presentation harness renders restrained copy and public source links", () => {
  const output = buildPublicParcelFeasibility(benchmark("4752412200"));
  const html = renderToStaticMarkup(createElement(DevelopmentRulesSection, { feasibility: output }));
  assert.match(html, /Development rules/);
  assert.match(html, /This check cannot be completed yet/);
  assert.match(html, /Evidence needed/);
  assert.match(html, /cityoflamesa\.gov/);
  assert.doesNotMatch(html, /private|Approved|Buildable|Guaranteed/i);
});

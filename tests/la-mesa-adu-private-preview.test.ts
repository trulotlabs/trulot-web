import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildLocalWaypointHandoff,
  evaluateLaMesaFrontDoor,
  resolveLaMesaFrontDoor,
  type HomeownerAnswers,
} from "../lib/la-mesa-adu-front-door";
import { buildLaMesaFrontDoorDataset } from "../lib/la-mesa-adu-front-door-server";

type CohortCase = {
  id: string;
  coverage: string[];
  apn: string;
  query: string;
  expectedInitialCategory: string;
  intake: null | {
    existingUse: HomeownerAnswers["existingUse"]["value"];
    aduIdea: HomeownerAnswers["aduIdea"]["value"];
    existingSpace?: NonNullable<HomeownerAnswers["existingSpace"]>["value"];
  };
  expectedResultCategory: string;
  expectedPathway: string | null;
};

const root = process.cwd();
const cohort = JSON.parse(readFileSync(`${root}/data/la-mesa-adu-private-preview-v0/acceptance-cohort.json`, "utf8")) as { cases: CohortCase[] };
const sourceValidation = JSON.parse(readFileSync(`${root}/data/la-mesa-adu-private-preview-v0/source-link-validation.json`, "utf8")) as { links: Array<{ url: string; result: string }> };
const taxonomy = JSON.parse(readFileSync(`${root}/data/la-mesa-adu-private-preview-v0/taxonomy-review.json`, "utf8")) as { categories: Array<{ category: string }> };
const acceptanceLog = JSON.parse(readFileSync(`${root}/data/la-mesa-adu-private-preview-v0/acceptance-log.json`, "utf8")) as {
  cohortSize: number;
  records: Array<{ id: string; mobileResult: string; desktopResult: string; issueClassification: string }>;
};
const browserResults = JSON.parse(readFileSync(`${root}/data/la-mesa-adu-private-preview-v0/review-evidence/browser-results.json`, "utf8")) as {
  viewports: Record<string, Record<string, Record<string, boolean | number>>>;
  consoleErrors: string[];
  pageErrors: string[];
};
const fixLog = JSON.parse(readFileSync(`${root}/data/la-mesa-adu-private-preview-v0/fix-log.json`, "utf8")) as {
  issues: Array<{ classification: string; status: string }>;
  remainingMaterialIssues: unknown[];
};
const integrity = JSON.parse(readFileSync(`${root}/data/la-mesa-adu-private-preview-v0/artifact-integrity.json`, "utf8")) as {
  files: Record<string, { bytes: number; sha256: string }>;
};
const dataset = buildLaMesaFrontDoorDataset();

function answersFor(value: NonNullable<CohortCase["intake"]>): HomeownerAnswers {
  return {
    existingUse: { value: value.existingUse, provenance: "USER_PROVIDED" },
    aduIdea: { value: value.aduIdea, provenance: "USER_PROVIDED" },
    ...(value.existingSpace
      ? { existingSpace: { value: value.existingSpace, provenance: "USER_PROVIDED" as const } }
      : {}),
  };
}

test("acceptance cohort contains the required real-parcel coverage and additional ordinary parcels", () => {
  assert.ok(cohort.cases.length >= 10);
  assert.equal(new Set(cohort.cases.map((entry) => entry.apn)).size, cohort.cases.length);
  const coverage = new Set(cohort.cases.flatMap((entry) => entry.coverage));
  for (const required of [
    "ORDINARY_R1",
    "ORDINARY_R1S",
    "SCENIC_PRESERVATION",
    "HILLSIDE",
    "R3",
    "COMBINED_OVERLAY",
    "DUPLICATE_ADDRESS",
    "MISSING_ADDRESS",
    "UNSUPPORTED",
    "JURISDICTION_CONFLICT",
    "ADDITIONAL_NON_GOLDEN",
  ]) assert.ok(coverage.has(required), required);
});

test("every cohort query resolves the intended parcel without silent ambiguous selection", () => {
  for (const entry of cohort.cases) {
    const lookup = resolveLaMesaFrontDoor(entry.query, dataset);
    const candidate = lookup.candidates.find((value) => value.apn === entry.apn);
    assert.ok(candidate, `${entry.id}: intended APN is selectable`);
    if (lookup.candidates.length > 1) {
      assert.equal(lookup.state, "MULTIPLE_MATCHES", entry.id);
      assert.equal(lookup.candidates.every((value) => value.ambiguous), true, entry.id);
    }
    if (candidate.canonicalScopeState !== "IN_SCOPE_CONFIRMED") {
      assert.equal(evaluateLaMesaFrontDoor(candidate, dataset).jurisdictionConfirmed, false, entry.id);
    }
  }
});

test("cohort initial states and homeowner-driven re-evaluation stay inside the shared engine", () => {
  for (const entry of cohort.cases) {
    const candidate = resolveLaMesaFrontDoor(entry.query, dataset).candidates.find((value) => value.apn === entry.apn);
    assert.ok(candidate, entry.id);
    const initial = evaluateLaMesaFrontDoor(candidate, dataset);
    assert.equal(initial.answerCategory, entry.expectedInitialCategory, entry.id);
    if (!entry.intake) continue;
    const final = evaluateLaMesaFrontDoor(candidate, dataset, answersFor(entry.intake));
    assert.equal(final.answerCategory, entry.expectedResultCategory, entry.id);
    assert.deepEqual(final.pathways.map((value) => value.id), entry.expectedPathway ? [entry.expectedPathway] : [], entry.id);
    assert.equal(final.homeownerAnswers?.existingUse.provenance, "USER_PROVIDED", entry.id);
    assert.ok(final.pathways.length <= 1, `${entry.id}: relevant pathway filtering`);
  }
});

test("conditional mapped-context results explain review without denial or compliance claims", () => {
  for (const apn of ["4912600700", "4752412200", "4904720700"]) {
    const candidate = resolveLaMesaFrontDoor(apn, dataset).candidates[0];
    const result = evaluateLaMesaFrontDoor(candidate, dataset, answersFor({ existingUse: "ONE_DETACHED_HOUSE", aduIdea: "NEW_DETACHED_ADU" }));
    assert.equal(result.answerCategory, "Conditional");
    assert.ok(result.mappedContexts.length > 0);
    assert.match(result.mappedContexts.map((value) => value.explanation).join(" "), /does not automatically prevent an ADU/);
    assert.doesNotMatch(JSON.stringify(result), /approved|guaranteed|whole-project compliance.*true/i);
  }
});

test("unsupported, jurisdiction-conflict, addressless, and forced failure states remain understandable", () => {
  const unsupported = cohort.cases.find((entry) => entry.id === "unsupported-tbd")!;
  const unsupportedCandidate = resolveLaMesaFrontDoor(unsupported.query, dataset).candidates[0];
  assert.match(evaluateLaMesaFrontDoor(unsupportedCandidate, dataset).headline, /found the parcel.*outside the current evaluation scope/i);

  const conflict = cohort.cases.find((entry) => entry.id === "jurisdiction-conflict")!;
  const conflictCandidate = resolveLaMesaFrontDoor(conflict.query, dataset).candidates[0];
  const conflictResult = evaluateLaMesaFrontDoor(conflictCandidate, dataset);
  assert.equal(conflictResult.answerCategory, "Source unavailable");
  assert.match(conflictResult.headline, /City jurisdiction needs review/);
  assert.doesNotMatch(JSON.stringify(conflictResult), /GIS|spatial join|overlay mismatch/i);

  const addressless = resolveLaMesaFrontDoor("4640202200", dataset).candidates[0];
  assert.match(addressless.displayAddress, /^Address unavailable · APN/);
  assert.equal(evaluateLaMesaFrontDoor(addressless, dataset).answerCategory, "Needs property evidence");

  const unavailableDataset = { ...dataset, evaluations: { ...dataset.evaluations } };
  delete unavailableDataset.evaluations["4640301100"];
  const ordinary = resolveLaMesaFrontDoor("4640301100", dataset).candidates[0];
  const failed = evaluateLaMesaFrontDoor(ordinary, unavailableDataset);
  assert.equal(failed.parcel.apn, ordinary.apn);
  assert.equal(failed.answerCategory, "Source unavailable");
  assert.equal(failed.headline, "Detailed ADU evaluation is temporarily unavailable.");
  assert.equal(failed.pathways.length, 0);
});

test("taxonomy, source roles, freshness, and public links are bounded and explicit", () => {
  assert.deepEqual(taxonomy.categories.map((value) => value.category), [
    "Likely state/local pathway available",
    "Conditional",
    "Needs property evidence",
    "Needs project details",
    "Outside current scope",
    "Source unavailable",
  ]);
  assert.equal(sourceValidation.links.every((value) => value.result === "PASS" && value.url.startsWith("https://")), true);
  const result = evaluateLaMesaFrontDoor(
    resolveLaMesaFrontDoor("4640301100", dataset).candidates[0],
    dataset,
    answersFor({ existingUse: "ONE_DETACHED_HOUSE", aduIdea: "NEW_DETACHED_ADU" }),
  );
  assert.equal(new Set(result.evidenceSources.map((value) => value.url)).size, sourceValidation.links.length);
  assert.deepEqual(new Set(result.evidenceSources.map((value) => value.url)), new Set(sourceValidation.links.map((value) => value.url)));
  assert.match(result.futureChangeNotice ?? "", /January 1, 2027/);
  assert.equal(result.evaluationDate, "2026-10-26");
  assert.doesNotMatch(JSON.stringify(result.evidenceSources), /data\/|Packet|sha256|draft/i);
});

test("optional professional-help handoff remains consent-bound and local-only", () => {
  const candidate = resolveLaMesaFrontDoor("4640301100", dataset).candidates[0];
  const result = evaluateLaMesaFrontDoor(candidate, dataset, answersFor({ existingUse: "ONE_DETACHED_HOUSE", aduIdea: "NEW_DETACHED_ADU" }));
  assert.equal(buildLocalWaypointHandoff(result, { name: "Pilot", email: "pilot@example.com", phone: "", consentToContact: false }), null);
  assert.equal(buildLocalWaypointHandoff(result, { name: "Pilot", email: "pilot@example.com", phone: "", consentToContact: true })?.delivery, "LOCAL_FIXTURE_ONLY");
});

test("machine-readable acceptance and browser evidence close every cohort case", () => {
  assert.equal(acceptanceLog.cohortSize, cohort.cases.length);
  assert.deepEqual(new Set(acceptanceLog.records.map((entry) => entry.id)), new Set(cohort.cases.map((entry) => entry.id)));
  assert.equal(acceptanceLog.records.every((entry) => entry.mobileResult === "PASS" && entry.desktopResult === "PASS"), true);
  assert.equal(acceptanceLog.records.every((entry) => entry.issueClassification === "NONE"), true);
  assert.equal(Object.keys(browserResults.viewports.mobile).length, cohort.cases.length);
  assert.equal(Object.keys(browserResults.viewports.desktop).length, cohort.cases.length);
  for (const cases of Object.values(browserResults.viewports)) {
    for (const checks of Object.values(cases)) {
      assert.equal(Object.values(checks).some((value) => value === false), false);
    }
  }
  assert.deepEqual(browserResults.consoleErrors, []);
  assert.deepEqual(browserResults.pageErrors, []);
  assert.equal(fixLog.issues[0]?.classification, "MATERIAL_FRICTION");
  assert.equal(fixLog.issues[0]?.status, "RESOLVED");
  assert.deepEqual(fixLog.remainingMaterialIssues, []);
});

test("acceptance evidence integrity manifest seals every review artifact", () => {
  assert.equal(Object.keys(integrity.files).length, 23);
  for (const [name, expected] of Object.entries(integrity.files)) {
    const content = readFileSync(`${root}/data/la-mesa-adu-private-preview-v0/${name}`);
    assert.equal(content.byteLength, expected.bytes, name);
    assert.equal(createHash("sha256").update(content).digest("hex"), expected.sha256, name);
  }
});

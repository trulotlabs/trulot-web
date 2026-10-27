import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import sitemap from "../app/sitemap";
import {
  buildLocalWaypointHandoff,
  evaluateLaMesaFrontDoor,
  laMesaAduPreviewEnabled,
  resolveLaMesaFrontDoor,
  type HomeownerAnswers,
} from "../lib/la-mesa-adu-front-door";
import { buildLaMesaFrontDoorDataset } from "../lib/la-mesa-adu-front-door-server";

const dataset = buildLaMesaFrontDoorDataset();

function exact(query: string) {
  const result = resolveLaMesaFrontDoor(query, dataset);
  assert.equal(result.state, "EXACT_MATCH");
  assert.equal(result.candidates.length, 1);
  return result.candidates[0];
}

const singleFamilyAnswers: HomeownerAnswers = {
  existingUse: { value: "ONE_DETACHED_HOUSE", provenance: "USER_PROVIDED" },
  aduIdea: { value: "NEW_DETACHED_ADU", provenance: "USER_PROVIDED" },
};

test("preview gate follows the explicit environment matrix", () => {
  const cases = [
    ["development", undefined, "1", true],
    ["test", undefined, "1", true],
    ["production", "preview", "1", true],
    ["production", "production", "1", false],
    ["production", undefined, "1", false],
    ["development", "preview", "1", true],
    ["development", "production", "1", false],
    ["production", "preview", undefined, false],
    ["production", "preview", "0", false],
    ["development", undefined, undefined, false],
    ["production", "preview", " 1", false],
    ["production", "preview", "1 ", false],
    ["production", "PREVIEW", "1", false],
  ] as const;

  for (const [NODE_ENV, VERCEL_ENV, TRULOT_LA_MESA_ADU_PREVIEW, expected] of cases) {
    assert.equal(
      laMesaAduPreviewEnabled({ NODE_ENV, VERCEL_ENV, TRULOT_LA_MESA_ADU_PREVIEW }),
      expected,
      JSON.stringify({ NODE_ENV, VERCEL_ENV, TRULOT_LA_MESA_ADU_PREVIEW }),
    );
  }
});

test("Vercel production always vetoes the preview gate", () => {
  for (const NODE_ENV of [undefined, "development", "test", "production"]) {
    for (const flag of [undefined, "0", "1", " 1", "true"]) {
      assert.equal(
        laMesaAduPreviewEnabled({ NODE_ENV, VERCEL_ENV: "production", TRULOT_LA_MESA_ADU_PREVIEW: flag }),
        false,
      );
    }
  }
});

test("Vercel Preview alone is insufficient without the exact opt-in flag", () => {
  assert.equal(laMesaAduPreviewEnabled({ NODE_ENV: "production", VERCEL_ENV: "preview" }), false);
});

test("raw and formatted APNs reuse the existing Parcel Lookup parser", () => {
  assert.equal(exact("4640301100").apn, "4640301100");
  assert.equal(exact("464-030-11-00").apn, "4640301100");
});

test("full and partial addresses resolve ranked jurisdiction-aware candidates", () => {
  const full = exact("5836 Pawnee Drive");
  assert.equal(full.jurisdiction, "CITY_OF_LA_MESA");
  assert.equal(full.confidence, "EXACT");
  const partial = resolveLaMesaFrontDoor("5836 Paw", dataset);
  assert.equal(partial.state, "PARTIAL_MATCHES");
  assert.equal(partial.candidates[0]?.apn, "4640301100");
});

test("duplicate and cross-jurisdiction addresses never select a silent first row", () => {
  const duplicate = resolveLaMesaFrontDoor("5700 Baltimore Drive", dataset);
  assert.equal(duplicate.state, "MULTIPLE_MATCHES");
  assert.equal(duplicate.candidates.every((candidate) => candidate.ambiguous), true);
  assert.match(duplicate.message ?? "", /Keep typing/);

  const crossJurisdiction = resolveLaMesaFrontDoor("3740 Riviera Drive", dataset);
  assert.equal(crossJurisdiction.state, "MULTIPLE_MATCHES");
  assert.equal(crossJurisdiction.candidates.every((candidate) => candidate.ambiguous), true);
  assert.equal(dataset.records.some((record) => record.normalizedAddress === "3740 RIVIERA DR" && record.jurisdictionId === "CITY_OF_SAN_DIEGO"), true);
});

test("out-of-jurisdiction and unresolved jurisdiction suppress La Mesa rules", () => {
  const outside = evaluateLaMesaFrontDoor(exact("4234411508"), dataset);
  assert.equal(outside.jurisdictionConfirmed, false);
  assert.equal(outside.headline, "This property is not currently confirmed within the City of La Mesa.");
  assert.equal(outside.pathways.length, 0);

  const unresolved = evaluateLaMesaFrontDoor(exact("7601960217"), dataset);
  assert.equal(unresolved.jurisdictionConfirmed, false);
  assert.equal(unresolved.answerCategory, "Source unavailable");
  assert.match(unresolved.headline, /jurisdiction needs review/);
});

test("initial supported parcel remains needs-evidence until homeowner intake", () => {
  const result = evaluateLaMesaFrontDoor(exact("4640301100"), dataset);
  assert.equal(result.answerCategory, "Needs property evidence");
  assert.equal(result.pathways.length, 0);
  assert.match(result.headline, /need a few facts/i);
});

test("single-family answers re-run the shared evaluator and select only the relevant 2026 pathway", () => {
  const result = evaluateLaMesaFrontDoor(exact("4640301100"), dataset, singleFamilyAnswers);
  assert.equal(result.answerCategory, "Conditional");
  assert.deepEqual(result.pathways.map((pathway) => pathway.id), ["SF_DETACHED_66323_ADU"]);
  assert.equal(result.homeownerAnswers?.existingUse.provenance, "USER_PROVIDED");
  assert.match(result.futureChangeNotice ?? "", /January 1, 2027/);
  assert.doesNotMatch(JSON.stringify(result), /two detached|permit approval.*true/i);
});

test("conversion intake asks only the relevant existing-space follow-up", () => {
  const answers: HomeownerAnswers = {
    existingUse: { value: "ONE_DETACHED_HOUSE", provenance: "USER_PROVIDED" },
    aduIdea: { value: "CONVERSION", provenance: "USER_PROVIDED" },
    existingSpace: { value: "NOT_SURE", provenance: "USER_PROVIDED" },
  };
  const result = evaluateLaMesaFrontDoor(exact("4640301100"), dataset, answers);
  assert.equal(result.answerCategory, "Needs project details");
  assert.deepEqual(result.pathways.map((pathway) => pathway.id), ["SF_CONVERSION_66323_ADU"]);
});

test("Scenic and Hillside contexts use restrained homeowner language", () => {
  const scenic = evaluateLaMesaFrontDoor(exact("4912600700"), dataset, singleFamilyAnswers);
  const hillside = evaluateLaMesaFrontDoor(exact("4752412200"), dataset, singleFamilyAnswers);
  assert.match(scenic.mappedContexts[0]?.label ?? "", /Scenic Preservation/);
  assert.match(hillside.mappedContexts[0]?.label ?? "", /Hillside/);
  for (const result of [scenic, hillside]) {
    assert.match(result.mappedContexts[0]?.explanation ?? "", /does not automatically prevent an ADU/);
  }
});

test("R3 does not infer multifamily and unsupported/TBD remains outside scope", () => {
  const r3 = evaluateLaMesaFrontDoor(exact("4640201000"), dataset);
  const unsupported = evaluateLaMesaFrontDoor(exact("4645231900"), dataset);
  assert.equal(r3.answerCategory, "Needs property evidence");
  assert.equal(r3.pathways.length, 0);
  assert.equal(unsupported.answerCategory, "Outside current scope");
  assert.equal(unsupported.pathways.length, 0);
});

test("lead contract requires consent and remains local-only", () => {
  const evaluation = evaluateLaMesaFrontDoor(exact("4640301100"), dataset, singleFamilyAnswers);
  assert.equal(buildLocalWaypointHandoff(evaluation, { name: "A Homeowner", email: "owner@example.com", phone: "", consentToContact: false }), null);
  const handoff = buildLocalWaypointHandoff(evaluation, { name: "A Homeowner", email: "owner@example.com", phone: "", consentToContact: true });
  assert.equal(handoff?.delivery, "LOCAL_FIXTURE_ONLY");
  assert.equal(handoff?.consentReceipt.granted, true);
  assert.deepEqual(handoff?.selectedPathwayIds, ["SF_DETACHED_66323_ADU"]);
});

test("route is noindex, noncanonical, and absent from sitemap", async () => {
  const localRequire = createRequire(import.meta.url);
  localRequire.extensions[".css"] = (module) => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }; };
  const { metadata } = await import("../app/la-mesa-adu/page");
  assert.deepEqual(metadata.robots, { index: false, follow: false, noarchive: true, nosnippet: true, noimageindex: true });
  assert.equal("alternates" in metadata, false);
  assert.equal(sitemap().some((entry) => entry.url.includes("la-mesa-adu")), false);
});

test("initial mobile-first presentation has labels, restrained branding, and no lead form", async () => {
  const localRequire = createRequire(import.meta.url);
  localRequire.extensions[".css"] = (module) => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }; };
  const { default: LaMesaAduClient } = await import("../app/la-mesa-adu/LaMesaAduClient");
  const html = renderToStaticMarkup(createElement(LaMesaAduClient, { dataset }));
  assert.match(html, /Property address or APN/);
  assert.match(html, /Powered by TruLot property intelligence/);
  assert.match(html, /Private local preview/);
  assert.match(html, /17,391 sealed La Mesa parcel records/);
  assert.doesNotMatch(html, /consent to be contacted|Approved|Buildable|Guaranteed/);
});

test("public output contains no packet paths, hashes, URL answers, or private provenance", () => {
  const result = evaluateLaMesaFrontDoor(exact("4640301100"), dataset, singleFamilyAnswers);
  const text = JSON.stringify(result);
  assert.doesNotMatch(text, /Packet 6|fixture path|sha256|PRIVATE_|private survey/i);
  assert.doesNotMatch(text, /\?existingUse|\?aduIdea/);
});

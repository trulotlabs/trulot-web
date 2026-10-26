import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPublicFeasibilityPayload,
  buildPublicParcelFeasibility,
  listPublicFeasibilityProfiles,
  type PublicParcelFeasibilityInput,
} from "../lib/public-parcel-feasibility";
import { loadFeasibilityPreviewSource } from "../lib/bounded-feasibility-preview";
import { getLocalPublicParcelFeasibilityEvidence } from "../lib/public-parcel-feasibility-evidence";

function rsInput(): PublicParcelFeasibilityInput {
  return {
    jurisdictionId: "CITY_OF_SAN_DIEGO",
    parcelId: "6341302200",
    address: "1456 27TH ST",
    ruleProfileVersion: "SD_CURRENT_2026_07_15",
    baseZoneCode: "RS-1-7",
    coastalContext: "OUTSIDE_COASTAL",
    sourceFreshness: "September 2026",
    contexts: {},
    measurements: {
      LOT_AREA: { value: 22096.32, unit: "sq ft", sourceLabel: "SanGIS public parcel area", sourceDate: "September 2026", sourceUrl: null, availability: "AVAILABLE" },
      LOT_WIDTH: { value: 94, unit: "ft", sourceLabel: "Recorded public map", sourceDate: "Recorded public map", sourceUrl: "https://arcc-acclaim.sdcounty.ca.gov/", availability: "AVAILABLE" },
      LOT_DEPTH: { value: 235.02, unit: "ft", sourceLabel: "Recorded public map", sourceDate: "Recorded public map", sourceUrl: "https://arcc-acclaim.sdcounty.ca.gov/", availability: "AVAILABLE" },
      STREET_FRONTAGE: { value: 94, unit: "ft", sourceLabel: "Recorded public map", sourceDate: "Recorded public map", sourceUrl: "https://arcc-acclaim.sdcounty.ca.gov/", availability: "AVAILABLE" },
    },
  };
}

function rmInput(): PublicParcelFeasibilityInput {
  return {
    jurisdictionId: "CITY_OF_SAN_DIEGO",
    parcelId: "5442140600",
    address: "639 N 67TH ST",
    ruleProfileVersion: "SD_CURRENT_2026_07_15",
    baseZoneCode: "RM-2-5",
    coastalContext: "OUTSIDE_COASTAL",
    sourceFreshness: "September 2026",
    measurements: {},
    contexts: {
      sda: { mapped: true, verification: "PENDING", sourceLabel: "Public SDA mapping", sourceDate: "September 2026", sourceUrl: null },
      fire: { mapped: true, verification: "VERIFIED", sourceLabel: "Public Fire mapping", sourceDate: "September 2026", sourceUrl: null },
    },
  };
}

test("profile registry is jurisdiction and version explicit", () => {
  const profiles = listPublicFeasibilityProfiles();
  assert.deepEqual(
    profiles.filter((profile) => profile.jurisdictionId === "CITY_OF_SAN_DIEGO").map((profile) => [profile.zoneCode, profile.version]),
    [
      ["RS-1-7", "SD_CURRENT_2026_07_15"],
      ["RM-2-5", "SD_CURRENT_2026_07_15"],
    ],
  );
  assert.deepEqual(
    profiles.filter((profile) => profile.jurisdictionId === "CITY_OF_LA_MESA").map((profile) => profile.zoneCode),
    ["R1E", "R1R", "R1S", "R1", "R1A", "R2", "R3", "RB"],
  );
});

test("runtime parcel evidence comes from the sanitized public truth registry", () => {
  const rs = getLocalPublicParcelFeasibilityEvidence("6341302200");
  const rm = getLocalPublicParcelFeasibilityEvidence("5442140600");
  assert.equal(rs?.measurements.LOT_WIDTH?.value, 94);
  assert.equal(rs?.measurements.LOT_DEPTH?.value, 235.02);
  assert.equal(rs?.measurements.STREET_FRONTAGE?.value, 94);
  assert.equal(rm?.fire?.mapped, true);
  assert.equal(getLocalPublicParcelFeasibilityEvidence("0000000000"), null);
});

test("1456 27th produces the sealed public summary and bounded rear rule", () => {
  const result = buildPublicParcelFeasibility(rsInput());
  assert.equal(result.readiness, "READY");
  assert.deepEqual(
    Object.fromEntries(result.summary.map((entry) => [entry.group, entry.count])),
    { MEETS_BASE_RULE: 4, CONDITIONAL: 5, NEEDS_EVIDENCE: 1, NOT_APPLICABLE: 1 },
  );
  const rear = result.rules.find((rule) => rule.id === "RS17_REAR");
  assert.match(rear?.answer ?? "", /^Current calculated rear setback rule: 23\.5 ft\./);
  assert.match(rear?.calculation ?? "", /235\.02 ft × 10% = 23\.502 ft/);
  assert.equal(result.rules.find((rule) => rule.id === "RS17_EXISTING")?.state, "NEEDS_EVIDENCE");
  assert.doesNotMatch(JSON.stringify(result), /existing structure (?:meets|complies)/i);
});

test("639 N 67th exposes RM public states and reconciled context only", () => {
  const result = buildPublicParcelFeasibility(rmInput());
  assert.equal(result.readiness, "READY");
  assert.deepEqual(
    Object.fromEntries(result.summary.map((entry) => [entry.group, entry.count])),
    { CONDITIONAL: 2, NOT_EVALUATED: 2 },
  );
  assert.equal(result.rules.some((rule) => rule.family === "BASE_ZONING"), false);
  assert.equal(result.rules.find((rule) => rule.id === "RM25_PROJECT_HEIGHT")?.state, "NOT_EVALUATED");
  assert.equal(result.rules.find((rule) => rule.id === "RM25_PROJECT_FAR")?.state, "NOT_EVALUATED");
  assert.deepEqual(
    result.contexts.map((context) => [context.type, context.verification, context.eligibility, context.regulatoryUse]),
    [
      ["SDA", "PENDING", "NOT_EVALUATED", "NOT_USED_PENDING_VERIFICATION"],
      ["FIRE", "VERIFIED", "NOT_EVALUATED", "CONTEXT_ONLY"],
    ],
  );
  assert.doesNotMatch(JSON.stringify(result), /PRJ-1111087|PRIVATE_|survey/i);
});

test("unsupported synthetic jurisdiction fails safely without SD assumptions", () => {
  const input = rsInput();
  input.jurisdictionId = "SYNTHETIC_JURISDICTION";
  input.baseZoneCode = "R-A";
  input.contexts = {};
  const result = buildPublicParcelFeasibility(input);
  assert.equal(result.readiness, "UNSUPPORTED_PROFILE");
  assert.equal(result.rules.length, 0);
  assert.equal(result.contexts.length, 0);
  assert.equal(result.sectionMessage, "Detailed development-rule evaluation is not yet available for this zone.");
});

test("missing public fact becomes evidence-needed and never a false zero", () => {
  const input = rsInput();
  input.measurements.LOT_WIDTH = { ...input.measurements.LOT_WIDTH!, value: null, availability: "MISSING" };
  const result = buildPublicParcelFeasibility(input);
  assert.equal(result.readiness, "READY");
  const width = result.rules.find((rule) => rule.id === "RS17_WIDTH");
  assert.equal(width?.state, "NEEDS_EVIDENCE");
  assert.doesNotMatch(width?.answer ?? "", /0 ft/);
});

test("public privacy gate rejects a private V4 payload", () => {
  const privatePayload = loadFeasibilityPreviewSource("private");
  assert.throws(() => assertPublicFeasibilityPayload(privatePayload));
});

test("source registry additions are deduplicated", () => {
  const result = buildPublicParcelFeasibility(rsInput());
  const keys = result.sourceRegistryAdditions.map((entry) => `${entry.url}|${entry.dataset}|${entry.publisher}`);
  assert.equal(new Set(keys).size, keys.length);
});

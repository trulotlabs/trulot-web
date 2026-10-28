#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fixture, root } from "../parcel-v1-test-fixture.mjs";

const expectedCoreColumns = [
  "apn_norm",
  "address",
  "city",
  "state",
  "situs_zip",
  "situs_community",
  "lat",
  "lng",
  "zone_name",
  "base_zone",
  "lot_area_sqft",
  "total_lvg_area",
  "nucleus_use_cd",
  "year_effective",
  "generated_at",
  "nearby_project_count",
  "nearby_active_count",
  "nearby_completed_count",
];

const loaderSource = fs.readFileSync(path.join(root, "lib/parcel-page-v1.ts"), "utf8");
const routeSource = fs.readFileSync(path.join(root, "app/parcel/san-diego/[slug]/page.tsx"), "utf8");
assert.doesNotMatch(loaderSource, /from\("parcel_page_api_v2"\)\.select\("\*"\)/);
assert.match(routeSource, /export const dynamic = "force-dynamic";/);
assert.doesNotMatch(routeSource, /preferredRegion|runtime\s*=\s*["']edge["']/);

for (const [name, overlays] of [
  ["ordinary fast", { tpa: false, ctcac: false, sda: false }],
  ["truth-positive overlay", { tpa: true, ctcac: true, sda: false }],
]) {
  const f = fixture(overlays);
  const loader = f.load(path.join(root, "lib/parcel-page-v1.ts"));
  assert.equal(loader.PARCEL_PAGE_V1_CORE_COLUMNS, expectedCoreColumns.join(","));
  const result = await loader.getParcelPageV1CoreResult("3113333800");
  assert.ok(result.data, name);
  const coreSelect = f.selectCalls().find((call) => call.name === "parcel_page_api_v2");
  assert.equal(coreSelect?.columns, expectedCoreColumns.join(","), name);
  assert.doesNotMatch(coreSelect?.columns ?? "", /(^|,)(geom|slug|page_title|meta_description|owner_name|mailing_address)(,|$)/, name);
  assert.equal(f.rpcCalls(), 1, `${name}: initial overlay remains truth-critical`);
  assert.equal(result.truth.overlays.tpa.value, overlays.tpa, name);
  assert.equal(result.truth.overlays.ctcac.value, overlays.ctcac, name);
  assert.equal(result.data.zoning.programs.find((item) => item.name === "Transit Priority Area")?.value,
    overlays.tpa ? "Applies per mapped overlay" : "Does not appear to apply — parcel is outside the current mapped TPA overlay", name);
}

const unavailable = fixture({ tpa: false, ctcac: false, sda: false }, { error: { code: "42501" } });
const unavailableResult = await unavailable.load(path.join(root, "lib/parcel-page-v1.ts")).getParcelPageV1CoreResult("3113333800");
assert.equal(unavailableResult.sourceStatus.overlays.sourceState, "source_unavailable");
assert.equal(unavailableResult.truth.overlays.tpa.state, "unavailable");
assert.equal(unavailableResult.truth.overlays.ctcac.state, "unavailable");

const deterministicTailCases = [];
for (const [name, coreDelayMs, overlayDelayMs] of [
  ["high_core", 120, 10],
  ["high_overlay", 10, 120],
  ["combined_tail", 100, 100],
  ["ordinary_fast", 10, 10],
]) {
  const f = fixture({ tpa: false, ctcac: false, sda: false }, { coreDelayMs, overlayDelayMs });
  const loader = f.load(path.join(root, "lib/parcel-page-v1.ts"));
  const started = performance.now();
  await loader.getParcelPageV1CoreResult("3113333800");
  const observedMs = +(performance.now() - started).toFixed(1);
  assert.ok(observedMs >= coreDelayMs + overlayDelayMs - 5, name);
  deterministicTailCases.push({ name, coreDelayMs, overlayDelayMs, observedMs });
}

console.log(JSON.stringify({
  result: "PASS",
  regionDecision: "REGION_INCONCLUSIVE",
  coreColumnCount: expectedCoreColumns.length,
  excludedHeavyColumns: ["geom"],
  initialOverlayClassification: "TRUTH_CRITICAL",
  cacheAdded: false,
  deterministicTailCases,
}));

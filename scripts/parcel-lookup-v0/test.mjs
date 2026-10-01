#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

function loadTs(file) {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const loaded = new Module(file);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  loaded._compile(code, file);
  return loaded.exports;
}

const lookup = loadTs(path.join(root, "lib/parcel-lookup-contract.ts"));
const loader = loadTs(path.join(root, "lib/parcel-lookup-v0.ts"));
const preview = loadTs(path.join(root, "lib/parcel-v2-preview.ts"));
const corpus = JSON.parse(fs.readFileSync(path.join(root, "data/parcel-lookup-v0/corpus.json"), "utf8"));
const benchmark = JSON.parse(fs.readFileSync(path.join(root, "data/parcel-lookup-v0/benchmark-cases.json"), "utf8"));
const synthetic = JSON.parse(fs.readFileSync(path.join(root, "data/parcel-lookup-v0/synthetic-acceptance-fixtures.json"), "utf8"));
const records = loader.loadParcelLookupRecords();

assert.equal(records.length, 49);
assert.equal(corpus.recordCount, 49);
assert.equal(benchmark.caseCount, 60);
assert.equal(benchmark.privateBenchmarkInputUsed, false);
assert.equal(synthetic.authorityClassification, "TEST_ONLY_NOT_PUBLIC_AUTHORITY_EVIDENCE");

// Strict APN normalization accepts ordinary separators and never pads or guesses.
for (const input of ["5442140600", "544-214-06-00", "544 214 06 00", "(544) 214.06.00"]) {
  const result = lookup.normalizeApnInput(input);
  assert.equal(result.state, "VALID", input);
  assert.equal(result.canonical, "5442140600", input);
  assert.equal(result.display, "544-214-06-00", input);
}
assert.equal(lookup.normalizeApnInput("544214060").state, "PREFIX");
assert.equal(lookup.normalizeApnInput("54421").state, "INVALID");
assert.equal(lookup.normalizeApnInput("054421406").state, "PREFIX");
assert.equal(lookup.normalizeApnInput("APN 5442140600").state, "INVALID");

// A test-only leading-zero identity remains a string from normalization through display/copy value.
const leadingZero = lookup.normalizeApnInput(synthetic.normalizationFixture.inputApn);
assert.equal(synthetic.normalizationFixture.classification, "SYNTHETIC_NORMALIZATION_FIXTURE");
assert.equal(leadingZero.state, "VALID");
assert.equal(leadingZero.canonical, synthetic.normalizationFixture.expectedCanonicalApn);
assert.equal(leadingZero.display, synthetic.normalizationFixture.expectedDisplayApn);
assert.equal(leadingZero.display, synthetic.normalizationFixture.expectedClipboardText);

// Deterministic address normalization handles ordinary presentation variants.
assert.equal(lookup.normalizeAddress("639 North 67th Street"), "639 N 67TH ST");
assert.equal(lookup.normalizeAddress("  639   n. 67th st. "), "639 N 67TH ST");
assert.equal(lookup.normalizeAddress("1501 Front Street #101"), "1501 FRONT ST UNIT 101");
assert.equal(lookup.normalizeAddress("2416 Adirondack Row Unit 01"), "2416 ADIRONDACK ROW UNIT 1");
assert.equal(lookup.normalizeAddress("7553 Cabrillo Avenue, San Diego, CA 92037"), "7553 CABRILLO AVE");

const exact = lookup.searchParcelLookup(records, "639 North 67th Street");
assert.equal(exact.inputType, "FULL_ADDRESS");
assert.equal(exact.state, "EXACT_MATCH");
assert.equal(exact.candidates[0].record.apn, "5442140600");

const partial = lookup.searchParcelLookup(records, "639 67");
assert.equal(partial.state, "PARTIAL_MATCHES");
assert.equal(partial.candidates[0].record.apn, "5442140600");

const apn = lookup.searchParcelLookup(records, "544-214-06-00");
assert.equal(apn.inputType, "FORMATTED_APN");
assert.equal(apn.state, "EXACT_MATCH");
assert.equal(apn.candidates[0].record.apn, "5442140600");

const stacked = lookup.searchParcelLookup(records, "1501 FRONT ST");
assert.equal(stacked.state, "MULTIPLE_MATCHES");
assert.deepEqual(stacked.candidates.map((candidate) => candidate.record.apn), ["5333641301", "5333641302"]);
assert.equal(stacked.candidates[0].record.parcelId, stacked.candidates[1].record.parcelId);
assert.equal(stacked.candidates[0].record.geometrySha256, stacked.candidates[1].record.geometrySha256);

const condo = lookup.searchParcelLookup(records, "2416 ADIRONDACK ROW");
assert.equal(condo.state, "MULTIPLE_MATCHES");
assert.deepEqual(condo.candidates.map((candidate) => candidate.record.apn), ["5891700509", "5891700510", "5891700512"]);
assert.equal(lookup.searchParcelLookup(records, "2416 ADIRONDACK ROW UNIT 2").candidates[0].record.apn, "5891700510");
assert.equal(lookup.searchParcelLookup(records, "2416 ADIRONDACK ROW UNIT 02").candidates[0].record.apn, "5891700510");

// Test-only ranking evidence never enters the sealed public-authority corpus.
const syntheticRecord = (fixture) => ({
  apn: fixture.apn,
  apnDisplay: lookup.formatApn(fixture.apn),
  parcelId: null,
  sourceObjectId: fixture.apn === "9900000001" ? 1 : 2,
  address: fixture.address,
  unit: fixture.unit,
  displayAddress: fixture.unit ? `${fixture.address} · Unit ${fixture.unit}` : fixture.address,
  normalizedAddress: lookup.normalizeAddress(fixture.address),
  normalizedUnitAddress: fixture.unit ? lookup.normalizeAddress(`${fixture.address} UNIT ${fixture.unit}`) : lookup.normalizeAddress(fixture.address),
  zip: null,
  jurisdiction: "SYNTHETIC",
  approximateAreaSqFt: 1,
  centroid: [0, 0],
  geometryType: "Polygon",
  geometrySha256: "0".repeat(64),
  polygons: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]],
  parcelIntelligenceAvailable: false,
  zoningState: "NOT_APPLICABLE",
  zones: [],
  coastalState: "NOT_APPLICABLE",
  coastalValue: null,
  existingUnits: null,
});
assert.equal(synthetic.rankingFixture.classification, "SYNTHETIC_RANKING_FIXTURE");
const syntheticRanking = lookup.searchParcelLookup(synthetic.rankingFixture.records.map(syntheticRecord), synthetic.rankingFixture.query);
assert.deepEqual(syntheticRanking.candidates.map((candidate) => candidate.record.apn), synthetic.rankingFixture.expectedApnOrder);
assert.deepEqual(syntheticRanking.candidates.map((candidate) => candidate.matchReason), synthetic.rankingFixture.expectedMatchReasons);
assert.ok(!records.some((record) => synthetic.rankingFixture.expectedApnOrder.includes(record.apn)));

const missingSitus = lookup.searchParcelLookup(records, "303-170-18-00").candidates[0].record;
assert.equal(missingSitus.address, null);
assert.equal(missingSitus.displayAddress, "APN 303-170-18-00");
assert.ok(missingSitus.polygons.flat(2).length >= 4);

assert.equal(lookup.searchParcelLookup(records, "9999999999").state, "NO_MATCH");
assert.equal(lookup.searchParcelLookup(records, "99999 NOWHERE ST").state, "NO_MATCH");
assert.equal(lookup.searchParcelLookup(records, "12345").state, "INVALID_APN");
assert.equal(lookup.searchParcelLookup(records, " ").state, "EMPTY_QUERY");
assert.equal(lookup.searchParcelLookup(records, "x").state, "MALFORMED_QUERY");
assert.equal(lookup.searchParcelLookup(records, "639 N 67TH ST", { sourceAvailable: false }).state, "SOURCE_UNAVAILABLE");

// Every benchmark case has the required deterministic outcome and rank.
const latency = [];
const quality = { exactAddress: [], exactApn: [], partialAddress: [] };
for (const testCase of benchmark.cases) {
  const started = performance.now();
  const result = lookup.searchParcelLookup(records, testCase.query);
  latency.push(performance.now() - started);
  assert.equal(result.state, testCase.expectedState, testCase.id);
  const returned = result.candidates.map((candidate) => candidate.record.apn);
  testCase.expectedTopApns.forEach((expected, index) => assert.equal(returned[index], expected, `${testCase.id} rank ${index + 1}`));
  if (testCase.intent === "exact_address") quality.exactAddress.push(returned[0] === testCase.expectedTopApns[0]);
  if (testCase.intent === "apn_exact" || testCase.intent === "missing_situs_apn") quality.exactApn.push(returned[0] === testCase.expectedTopApns[0]);
  if (testCase.intent === "partial_address") quality.partialAddress.push(returned.slice(0, 5).includes(testCase.expectedTopApns[0]));
}
assert.ok(quality.exactAddress.every(Boolean));
assert.ok(quality.exactApn.every(Boolean));
assert.ok(quality.partialAddress.every(Boolean));

// Stable geometry and approved orientation facts power the first result view.
const canonical = records.find((record) => record.apn === "5442140600");
assert.ok(canonical);
assert.equal(canonical.apnDisplay, "544-214-06-00");
assert.equal(canonical.zones[0].code, "RM-2-5");
assert.equal(canonical.coastalValue, "outside_coastal");
assert.equal(canonical.geometrySha256, "05073c1c7e7c910e4b60ce05df6c80b2fb61dd3da2d0cd99f4d42d20f3c176be");
assert.equal(canonical.parcelIntelligenceAvailable, false);
assert.ok(canonical.polygons.flat(2).length >= 4);

// Preview gate and production containment use the existing hard-disabled V2 gate.
assert.equal(preview.parcelV2PreviewEnabled({ NODE_ENV: "development" }), false);
assert.equal(preview.parcelV2PreviewEnabled({ NODE_ENV: "development", TRULOT_PARCEL_V2_PREVIEW: "1" }), true);
assert.equal(preview.parcelV2PreviewEnabled({ NODE_ENV: "test", TRULOT_PARCEL_V2_PREVIEW: "1" }), true);
assert.equal(preview.parcelV2PreviewEnabled({ NODE_ENV: "production", TRULOT_PARCEL_V2_PREVIEW: "1" }), false);
assert.equal(loader.parcelLookupFailureInjection("source-unavailable", { NODE_ENV: "production", TRULOT_PARCEL_V2_PREVIEW: "1" }), null);
assert.equal(loader.parcelLookupFailureInjection("selected-open", { NODE_ENV: "development" }), null);
assert.equal(loader.parcelLookupFailureInjection("source-unavailable", { NODE_ENV: "development", TRULOT_PARCEL_V2_PREVIEW: "1" }), "source-unavailable");
assert.equal(loader.parcelLookupFailureInjection("selected-open", { NODE_ENV: "test", TRULOT_PARCEL_V2_PREVIEW: "1" }), "selected-open");
assert.equal(loader.parcelLookupSyntheticFixtureInjection("ranking", { NODE_ENV: "production", TRULOT_PARCEL_V2_PREVIEW: "1" }), null);
assert.equal(loader.parcelLookupSyntheticFixtureInjection("ranking", { NODE_ENV: "development", TRULOT_PARCEL_V2_PREVIEW: "1" }), "ranking");
assert.equal(loader.parcelLookupSyntheticFixtureInjection("normalization", { NODE_ENV: "test", TRULOT_PARCEL_V2_PREVIEW: "1" }), "normalization");
const isolatedRankingRecords = loader.loadParcelLookupSyntheticFixture("ranking");
assert.deepEqual(lookup.searchParcelLookup(isolatedRankingRecords, "202 C ST").candidates.map((candidate) => candidate.apn ?? candidate.record.apn), ["9900000001", "9900000002"]);
const isolatedNormalizationRecord = loader.loadParcelLookupSyntheticFixture("normalization")[0];
assert.equal(isolatedNormalizationRecord.apn, "0123456789");
assert.equal(isolatedNormalizationRecord.apnDisplay, "012-345-67-89");

const routeSource = fs.readFileSync(path.join(root, "app/parcel-lookup-preview/page.tsx"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "app/parcel-lookup-preview/ParcelLookupPreviewClient.tsx"), "utf8");
const styleSource = fs.readFileSync(path.join(root, "app/parcel-lookup-preview/parcel-lookup-preview.module.css"), "utf8");
const loaderSource = fs.readFileSync(path.join(root, "lib/parcel-lookup-v0.ts"), "utf8");
assert.match(routeSource, /parcelV2PreviewEnabled\(\)/);
assert.match(routeSource, /notFound\(\)/);
assert.match(routeSource, /index: false/);
assert.match(clientSource, /navigator\.clipboard\.writeText\(selected\.apnDisplay\)/);
assert.match(clientSource, /role="combobox"/);
assert.match(clientSource, /aria-activedescendant/);
assert.match(clientSource, /ArrowDown/);
assert.match(clientSource, /ArrowUp/);
assert.match(clientSource, /Escape/);
assert.match(clientSource, /Parcel mapping shown for orientation/);
assert.match(clientSource, /does not evaluate compliance, feasibility, legal-lot status, or development capacity/);
assert.match(clientSource, /Enter an address or APN to search\./);
assert.match(clientSource, /Enter at least.*characters\./);
assert.match(clientSource, /data-lookup-state="SOURCE_UNAVAILABLE"/);
assert.match(clientSource, /data-lookup-state="SELECTED_PARCEL_UNAVAILABLE"/);
assert.match(clientSource, /Retry lookup/);
assert.match(clientSource, /Retry parcel/);
assert.match(styleSource, /\.identityCard \{ grid-row: 1;/);
assert.match(styleSource, /\.mapCard \{ grid-row: 2;/);
for (const source of [routeSource, clientSource, loaderSource]) {
  assert.doesNotMatch(source, /supabase|fetch\s*\(|parcel_page_api_v2|selected_snapshot|calculateCapacity|capacity score/i);
}
for (const file of ["app/page.tsx", "app/api/search/route.ts", "app/parcel/san-diego/[slug]/page.tsx", "app/parcel/[apn]/page.tsx", "lib/parcel-page-v1.ts", "app/sitemap.ts", "app/robots.ts"]) {
  assert.doesNotMatch(fs.readFileSync(path.join(root, file), "utf8"), /parcel-lookup-preview/);
}

// A byte change fails closed.
const corruptDir = fs.mkdtempSync(path.join(os.tmpdir(), "trulot-lookup-corrupt-"));
const corruptPath = path.join(corruptDir, "corpus.json");
fs.writeFileSync(corruptPath, `${fs.readFileSync(path.join(root, "data/parcel-lookup-v0/corpus.json"), "utf8")} `);
assert.throws(() => loader.loadParcelLookupRecords(corruptPath), /corpus seal does not match/);
fs.rmSync(corruptDir, { recursive: true, force: true });

// Rebuilds are byte-for-byte deterministic.
const rebuildDir = fs.mkdtempSync(path.join(os.tmpdir(), "trulot-lookup-rebuild-"));
const build = spawnSync(process.execPath, [path.join(here, "build.mjs"), "--output-dir", rebuildDir], { cwd: root, encoding: "utf8" });
assert.equal(build.status, 0, build.stderr);
for (const file of ["corpus.json", "benchmark-cases.json", "scoutred-comparison-contract.json"]) {
  assert.deepEqual(fs.readFileSync(path.join(rebuildDir, file)), fs.readFileSync(path.join(root, "data/parcel-lookup-v0", file)), file);
}
fs.rmSync(rebuildDir, { recursive: true, force: true });

latency.sort((a, b) => a - b);
const percentile = (p) => latency[Math.min(latency.length - 1, Math.ceil(latency.length * p) - 1)];
const rate = (values) => values.length ? values.filter(Boolean).length / values.length : 0;
const report = {
  corpusRecords: records.length,
  benchmarkCases: benchmark.caseCount,
  exactAddressTop1Rate: rate(quality.exactAddress),
  apnExactMatchRate: rate(quality.exactApn),
  partialAddressUsefulTop5Rate: rate(quality.partialAddress),
  latencyMedianMs: Number(percentile(0.5).toFixed(3)),
  latencyP95Ms: Number(percentile(0.95).toFixed(3)),
  method: "Node.js performance.now around one in-memory search per benchmark case; local bounded corpus; one sequential pass in a fresh process",
};
console.log(`PASS Parcel Lookup V0\n${JSON.stringify(report, null, 2)}`);

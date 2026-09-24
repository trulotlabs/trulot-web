import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../..");
const require = createRequire(import.meta.url);
const cache = new Map();
function load(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} }; cache.set(filename, loaded);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = name => {
    if (name === "zod") return require(name);
    assert.ok(name.startsWith("."), `Unexpected dependency ${name}`);
    return load(path.resolve(path.dirname(filename), name + (path.extname(name) ? "" : ".ts")));
  };
  vm.runInNewContext(code, { exports: loaded.exports, module: loaded, require: localRequire });
  return loaded.exports;
}
const { lookupParcelIntelligenceV2: lookup } = load(path.join(dir, "adapter.ts"));
const fixture = JSON.parse(fs.readFileSync(process.argv[2] ?? path.join(root, "data/zoning-serving-v2/golden-fixture.json"), "utf8"));
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
async function run(value) {
  return lookup(value.apn, async () => structuredClone(value.parcelResponse), async () => structuredClone(value.zoningResponse));
}
await test("found single zone keeps parcel and zoning supported", async () => { const r = await run(fixture.cases.singleZone); assert.equal(r.status, "found"); assert.equal(r.truth.parcel.state, "supported"); assert.equal(r.truth.baseZoning.state, "supported"); assert.equal(r.zoningDisplay.zones[0].role, "single"); });
await test("material split preserves every zone, percentage, and source feature", async () => { const f = fixture.cases.multiZone; const r = await run(f); assert.deepEqual([...r.truth.baseZoning.value.zones], f.expected.zoneCodes); assert.deepEqual(r.zoningDisplay.zones.map(z => z.parcelCoveragePercent), f.expected.coveragePercentages); assert.deepEqual(r.zoningDisplay.zones.map(z => [...z.sourceFeatureIds]), f.expected.sourceFeatureIds); assert.ok(r.zoningDisplay.zones.every(z => z.role === "material")); });
await test("dominant split code is analytical and does not collapse values", async () => { const r = await run(fixture.cases.multiZone); assert.equal(r.zoningDisplay.analyticalDominantZoneCode, r.truth.baseZoning.value.dominantZoneCode); assert.ok(r.zoningDisplay.zones.length > 1); });
await test("boundary sliver retains secondary code and exact evidence", async () => { const f = fixture.cases.boundarySliver; const r = await run(f); assert.equal(r.zoningDisplay.zones[0].role, "principal"); assert.ok(r.zoningDisplay.zones.slice(1).every(z => z.role === "boundary_sliver")); assert.deepEqual(r.zoningDisplay.zones.map(z => z.parcelCoveragePercent), f.expected.coveragePercentages); });
await test("unmapped zoning is unknown while parcel remains supported", async () => { const r = await run(fixture.cases.unmapped); assert.equal(r.status, "partial"); assert.equal(r.truth.parcel.state, "supported"); assert.equal(r.truth.baseZoning.state, "unknown"); assert.equal(r.reason, "zoning_unmapped"); });
await test("indeterminate zoning is partial with evidence", async () => { const r = await run(fixture.cases.indeterminate); assert.equal(r.status, "partial"); assert.equal(r.truth.baseZoning.state, "partial"); assert.ok(r.zoningDisplay.zones.length); });
await test("zoning failure leaves supported parcel available", async () => { const f = fixture.cases.singleZone; const r = await lookup(f.apn, async () => structuredClone(f.parcelResponse), async () => { throw Error("private zoning failure"); }); assert.equal(r.status, "partial"); assert.equal(r.truth.parcel.state, "supported"); assert.equal(r.truth.baseZoning.state, "unavailable"); assert.ok(!JSON.stringify(r).includes("private zoning")); });
await test("malformed zoning response is unavailable without losing parcel", async () => { const f = fixture.cases.singleZone; const r = await lookup(f.apn, async () => structuredClone(f.parcelResponse), async () => ({ broken: true })); assert.equal(r.status, "partial"); assert.equal(r.truth.parcel.state, "supported"); assert.equal(r.truth.baseZoning.state, "unavailable"); });
await test("parcel source failure makes overall lookup unavailable and skips zoning", async () => { const f = fixture.cases.singleZone; let queried = false; const r = await lookup(f.apn, async () => { throw Error("parcel failure"); }, async () => { queried = true; }); assert.equal(r.status, "source_unavailable"); assert.equal(r.truth.parcel.state, "unavailable"); assert.equal(r.truth.baseZoning.sourceState, "not_evaluated"); assert.equal(queried, false); });
await test("parcel not found makes zoning not applicable", async () => { const f = fixture.notFound; let queried = false; const r = await lookup(f.input, async () => structuredClone(f.response), async () => { queried = true; }); assert.equal(r.status, "not_found"); assert.equal(r.truth.baseZoning.state, "not_applicable"); assert.equal(queried, false); });
await test("parcel and zoning provenance remain separate", async () => { const r = await run(fixture.cases.singleZone); assert.equal(r.truth.parcel.provenance.publisher, "SanGIS"); assert.equal(r.truth.baseZoning.provenance.publisher, "City of San Diego Planning via SanGIS"); assert.notEqual(r.truth.parcel.provenance.retrievedAt, r.truth.baseZoning.provenance.retrievedAt); });
await test("null address and taxable acreage remain unknown parcel facts", async () => { const address = await run(fixture.cases.nullAddress); const acreage = await run(fixture.cases.taxableAcreageNull); assert.equal(address.parcel.address.state, "unknown"); assert.equal(acreage.parcel.taxableAcreage.state, "unknown"); });
await test("stacked APNs retain distinct routes and identical zoning evidence", async () => { const results = await Promise.all(fixture.stacked.map(run)); assert.equal(new Set(results.map(r => r.parcel.canonicalPath)).size, results.length); assert.equal(new Set(results.map(r => JSON.stringify(r.truth.baseZoning.value.evidence))).size, 1); });
await test("historical and explicit-derivative examples retain actual evidence", async () => { const historical = await run(fixture.cases.historicalKnown); const derivative = await run(fixture.cases.explicitGeometryDerivative); assert.ok(historical.truth.baseZoning.value.zones.length > 1); assert.ok(derivative.truth.baseZoning.value.evidence.some(z => z.features.some(f => f.sourceGeometryState === "EXPLICIT_MAKE_VALID"))); });
await test("adapter remains outside Parcel V1 runtime", () => { for (const file of ["lib/parcel-page-v1.ts", "app/parcel/san-diego/[slug]/page.tsx"]) assert.doesNotMatch(fs.readFileSync(path.join(root, file), "utf8"), /zoning-serving-v2|parcel_intelligence_serving_v2/); });
console.log(`${checks} integrated zoning-serving adapter checks passed.`);

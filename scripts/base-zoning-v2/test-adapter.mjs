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
function load(filename) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: loaded.exports, module: loaded, require: name => name === "zod" ? require(name) : (() => { throw Error(`Unexpected dependency ${name}`); })() });
  return loaded.exports;
}
const { lookupBaseZoningV2: lookup } = load(path.join(dir, "adapter.ts"));
const fixture = JSON.parse(fs.readFileSync(process.argv[2] ?? path.join(root, "data/base-zoning-v2/golden-fixture.json"), "utf8"));
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
const run = (key, response = { row: fixture.cases[key], receipt: fixture.receipt }) => lookup(fixture.cases[key].apn, async () => structuredClone(response));
await test("single zone is supported", async () => { const r = await run("singleZone"); assert.equal(r.fact.state, "supported"); assert.deepEqual([...r.fact.value.zones], [fixture.cases.singleZone.dominantZoneCode]); });
await test("genuine split preserves every zone", async () => { const r = await run("multiZone"); assert.equal(r.fact.state, "supported"); assert.ok(r.fact.value.zones.length > 1); assert.deepEqual([...r.fact.value.zones], fixture.cases.multiZone.zoneEvidence.map(item => item.zoneCode)); });
await test("boundary sliver preserves evidence", async () => { const r = await run("boundarySliver"); assert.equal(r.fact.state, "supported"); assert.equal(r.fact.value.mappingState, "BOUNDARY_SLIVER"); assert.equal(r.fact.value.evidence.length, 2); });
await test("unmapped is unknown and never unzoned", async () => { const r = await run("unmapped"); assert.equal(r.fact.state, "unknown"); assert.equal(r.fact.value, null); assert.match(r.fact.provenance.basis, /does not mean unzoned/); });
await test("indeterminate retains partial evidence", async () => { const r = await run("indeterminate"); assert.equal(r.fact.state, "partial"); assert.ok(r.fact.value.evidence.length); });
await test("database exception is unavailable", async () => { const r = await lookup(fixture.cases.singleZone.apn, async () => { throw Error("private"); }); assert.equal(r.fact.state, "unavailable"); assert.ok(!JSON.stringify(r).includes("private")); });
await test("malformed envelope is unavailable", async () => { const r = await run("singleZone", { row: { ...fixture.cases.singleZone, zoneEvidence: [] }, receipt: fixture.receipt }); assert.equal(r.fact.state, "unavailable"); });
await test("mismatched APN is unavailable", async () => { const r = await lookup("0000000001", async () => ({ row: fixture.cases.singleZone, receipt: fixture.receipt })); assert.equal(r.fact.state, "unavailable"); });
await test("invalid APN does not query", async () => { const r = await lookup("bad", async () => { throw Error("must not query"); }); assert.equal(r.reason, "invalid_request"); });
await test("adapter remains offline", () => { for (const file of ["lib/parcel-page-v1.ts", "app/parcel/san-diego/[slug]/page.tsx"]) assert.doesNotMatch(fs.readFileSync(path.join(root, file), "utf8"), /base-zoning-v2|base_zoning_city_sd_v2/); });
console.log(`${checks} Base Zoning V2 adapter checks passed.`);

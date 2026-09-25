import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { normalizeProperties, readContract } from "../parcel-base-v2.mjs";
const dir = path.dirname(fileURLToPath(import.meta.url)); const root = path.resolve(dir, "../..");
const require = createRequire(import.meta.url);
function load(filename) {
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = (name) => {
    if (name === "zod") return require(name);
    assert.ok(name.startsWith("."), `Unexpected runtime dependency ${name}`);
    const target = path.resolve(path.dirname(filename), name + ".ts");
    assert.equal(target, path.join(root, "lib/parcel-slug.ts"));
    return load(target);
  };
  vm.runInNewContext(code, { exports: loadedModule.exports, module: loadedModule, require: localRequire }); return loadedModule.exports;
}
const { lookupParcelServingV2: lookup, routeApn } = load(path.join(dir, "adapter.ts"));
const fixtures = JSON.parse(fs.readFileSync(process.argv[2] ?? path.join(root, "data/parcel-serving-v2/adapter-fixtures.json"), "utf8"));
const base = fixtures.ordinary; let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
const run = (response = base.response, input = base.input) => lookup(input, async () => structuredClone(response));
await test("real serving row maps into Parcel Truth identity", async () => { const r = await run(); assert.equal(r.status, "found"); assert.equal(r.truth.parcel.value.apn, base.input); assert.equal(r.truth.parcel.sourceState, "available"); });
await test("canonical slug round trip and incorrect slug redirect", async () => { const a = await run(); const b = await run(base.response, a.data.canonicalSlug); assert.equal(b.data.redirectTo, null); assert.equal((await run(base.response, base.input + "-wrong-address")).data.redirectTo, a.data.canonicalPath); });
await test("route prefix does not replace parcel identity", async () => assert.equal((await run(base.response, "apn-" + base.input)).status, "found"));
await test("strict APN route rejects short padded legacy input", async () => { for (const input of ["12345678", "123456789", "123-456-78", "nonsense", "12345678901"]) { assert.equal(routeApn(input), null); assert.equal((await lookup(input, async () => { throw Error("must not query"); })).status, "invalid_request"); } });
await test("successful scoped empty lookup is not-found", async () => { const r = await run(fixtures.notFound.response, fixtures.notFound.input); assert.equal(r.status, "not_found"); assert.equal(r.truth.parcel.value, false); assert.equal(r.truth.parcel.sourceState, "available"); });
await test("database exception is unavailable, not absent", async () => { const r = await lookup(base.input, async () => { throw Error("private database diagnostic"); }); assert.equal(r.status, "source_unavailable"); assert.equal(r.truth.parcel.value, null); assert.ok(!JSON.stringify(r).includes("private database")); });
await test("database error response fails even with empty rows", async () => assert.equal((await run({ ...fixtures.notFound.response, error: { code: "42P01" } })).status, "source_unavailable"));
await test("missing receipt cannot support absence", async () => assert.equal((await run({ rows: [], quarantinedCount: 0 })).status, "source_unavailable"));
await test("null response cannot support absence", async () => assert.equal((await run(null)).status, "source_unavailable"));
for (const key of Object.keys(fixtures).filter(k => k.startsWith("quarantined"))) {
  await test(`${key} never selects an arbitrary source row`, async () => { const r = await run(fixtures[key].response, fixtures[key].input); assert.equal(r.status, "partial"); assert.equal(r.reason, "quarantined_apn"); assert.equal(r.data, null); assert.equal(r.truth.parcel.value, null); });
}
await test("unexpected duplicate serving response remains ambiguous", async () => { const r = await run({ ...base.response, rows: [base.response.rows[0], { ...base.response.rows[0], source_object_id: 9999999 }] }); assert.equal(r.status, "partial"); assert.equal(r.reason, "ambiguous_apn"); assert.equal(r.data, null); });
await test("stacked parcels retain separate APN routes", async () => { const a = await run(fixtures.stacked0.response, fixtures.stacked0.input); const b = await run(fixtures.stacked1.response, fixtures.stacked1.input); assert.equal(a.status, "found"); assert.equal(b.status, "found"); assert.equal(a.data.row.parcel_id, b.data.row.parcel_id); assert.equal(a.data.row.geometry_sha256, b.data.row.geometry_sha256); assert.notEqual(a.data.canonicalPath, b.data.canonicalPath); });
await test("address-null source stays unknown with APN-only route", async () => { const f = fixtures.missingAddress; const r = await run(f.response, f.input); assert.equal(r.truth.parcel.value.address, null); assert.equal(r.data.address.state, "unknown"); assert.equal(r.data.canonicalSlug, "apn-"+f.input); });
for (const [field, value] of [["geom", null], ["centroid", null], ["point_on_surface", null], ["address", ""], ["approximate_geometry_area_sqft", 0], ["situs_juris", "CN"], ["apn_norm", "0000000000"], ["acquisition_id", "wrong"]]) {
  await test(`invalid/mismatched ${field} cannot become supported identity`, async () => { const r = structuredClone(base.response); r.rows[0][field] = value; assert.equal((await run(r)).status, "source_unavailable"); });
}
await test("missing acreage stays unknown, recorded zero remains zero", async () => { for (const value of [null, 0]) { const r = structuredClone(base.response); r.rows[0].taxable_acreage = value; const result = await run(r); assert.equal(result.data.taxableAcreage.value, value); assert.equal(result.data.taxableAcreage.state, value === null ? "unknown" : "supported"); } });
await test("geometry area is derived and never conflated with acreage", async () => { const r = await run(); assert.equal(r.data.geometryAreaSqFt.derivation, "deterministic_derived"); assert.equal(r.data.taxableAcreage.derivation, "recorded"); assert.match(r.data.geometryAreaSqFt.provenance.basis, /not legal lot area/); });
await test("receipt resolves acquisition identity and preserves unknown import time", async () => { const r = await run(); assert.equal(r.truth.parcel.provenance.datasetId, "parcel_base_sangis_v2"); assert.equal(r.truth.parcel.provenance.importedAt, null); assert.match(r.truth.parcel.provenance.methodology, new RegExp(base.response.receipt.artifact_sha256)); });
await test("enrichments remain not evaluated, not empty/false", async () => { const r = await run(); for (const f of [r.truth.permits, ...Object.values(r.truth.overlays)]) { assert.equal(f.sourceState, "not_evaluated"); assert.equal(f.value, null); assert.equal(f.provenance.publisher, null); } });
const properties = JSON.parse(fs.readFileSync(path.join(root,"data/parcel-base-v2/golden-fixture.json"))).featureCollection.features[0].properties;
for (const fields of [{ situs_address: null }, { situs_address: 0 }, { situs_street: null }, { situs_street: "  " }]) {
  await test(`address composition requires number and street ${JSON.stringify(fields)}`, () => assert.equal(normalizeProperties({ ...properties, ...fields }, readContract()).row.address, null));
}
await test("malformed situs components rejected by original contract", () => assert.ok(normalizeProperties({ ...properties, situs_address: "not-number" }, readContract()).errors.includes("FIELD_TYPE:situs_address")));
await test("suite/building retained separately without invented unit address", () => { const r = normalizeProperties({ ...properties, situs_suite: "UNIT 7", situs_building: "B" }, readContract()); assert.equal(r.row.situsComponents.situs_suite,"UNIT 7"); assert.ok(!r.row.address.includes("UNIT 7")); });
await test("offline rehearsal adapter remains outside canonical data loading", () => {
  assert.doesNotMatch(fs.readFileSync(path.join(root,"lib/parcel-page-v1.ts"),"utf8"),/scripts\/parcel-serving-v2\/adapter|parcel_serving_rehearsal/);
  const page = fs.readFileSync(path.join(root,"app/parcel/san-diego/[slug]/page.tsx"),"utf8");
  assert.doesNotMatch(page,/scripts\/parcel-serving-v2\/adapter|parcel_serving_rehearsal/);
  assert.match(page,/runParcelServingV2Shadow/);
});
console.log(`${checks} Parcel Serving V2 adapter checks passed.`);

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const cache = new Map();

function load(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = (name) => {
    if (name === "server-only") return {};
    if (name === "@supabase/supabase-js") {
      return { createClient: () => { throw new Error("Runtime client must not be constructed in pure tests"); } };
    }
    if (!name.startsWith(".")) return require(name);
    return load(path.resolve(path.dirname(filename), name + (path.extname(name) ? "" : ".ts")));
  };
  vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: localRequire, process, console });
  return loadedModule.exports;
}

const adapter = load(path.join(root, "lib/parcel-serving-v2.ts"));
const shadow = load(path.join(root, "lib/parcel-serving-v2-shadow.ts"));
const slug = load(path.join(root, "lib/parcel-slug.ts"));
let checks = 0;

async function test(name, run) {
  await run();
  checks += 1;
  console.log(`PASS ${name}`);
}

const hash = "a".repeat(64);
const baseRow = {
  schema_version: 1,
  parcel_acquisition_id: "sangis-20260924T183743Z",
  parcel_source_object_id: 101,
  apn_norm: "5470501600",
  parcel_id: 501,
  address: "123 MAIN ST",
  situs_components: { situs_address: 123, situs_street: "MAIN", situs_suffix: "ST" },
  situs_zip: "92101-1234",
  jurisdiction: "SD",
  geom: { type: "Polygon", coordinates: [[[-117.1, 32.7], [-117.0, 32.7], [-117.0, 32.8], [-117.1, 32.7]]] },
  centroid: { type: "Point", coordinates: [-117.05, 32.75] },
  point_on_surface: { type: "Point", coordinates: [-117.05, 32.75] },
  centroid_within: true,
  approximate_geometry_area_sqft: 5000.25,
  taxable_acreage: null,
  geometry_sha256: hash,
  parcel_native_crs: "EPSG:2230",
  parcel_artifact_crs: "EPSG:4326",
  zoning_acquisition_id: "zoning-city-sd-20260924T201131Z",
  mapping_method_version: "base-zoning-city-sd-v2-area-coverage-v1",
  zoning_mapping_state: "SINGLE_ZONE",
  dominant_zone_code: "RS-1-7",
  dominant_coverage_percent: 100,
  secondary_coverage_percent: 0,
  total_covered_percent: 100,
  uncovered_percent: 0,
  distinct_zone_count: 1,
  repaired_source_feature_count: 0,
  zoning_evidence: [{
    zoneCode: "RS-1-7",
    intersectedAreaSqFt: 5000.25,
    parcelCoveragePercent: 100,
    features: [{ sourceObjectId: 7, sourceGeometryState: "VALID_SOURCE", intersectedAreaSqFt: 5000.25 }],
  }],
  provenance: {
    parcelAcquisitionId: "sangis-20260924T183743Z",
    parcelSourceObjectId: 101,
    parcelArtifactSha256: hash,
    zoningAcquisitionId: "zoning-city-sd-20260924T201131Z",
    zoningArtifactSha256: hash,
    mappingMethodVersion: "base-zoning-city-sd-v2-area-coverage-v1",
    importRunId: "123e4567-e89b-42d3-a456-426614174000",
  },
};

const lookup = (row = baseRow, error = null, input = baseRow.apn_norm) =>
  adapter.getParcelServingV2Result(input, async () => ({ data: structuredClone(row), error }));

await test("found result preserves exact identity, provenance and area semantics", async () => {
  const result = await lookup();
  assert.equal(result.status, "found");
  assert.equal(result.data.apn, baseRow.apn_norm);
  assert.equal(result.data.geometryAreaLabel, "Approximate geometry-derived parcel area (not legal lot area)");
  assert.equal(result.data.taxableAcreage, null);
  assert.equal(result.truth.parcel.state, "supported");
  assert.equal(result.truth.baseZoning.value.zoneEvidence.length, 1);
  assert.equal(result.truth.permits.sourceState, "not_evaluated");
  assert.equal(result.truth.overlays.sda.sourceState, "not_evaluated");
});

await test("null address remains null and produces APN-only canonical slug", async () => {
  const result = await lookup({ ...baseRow, address: null });
  assert.equal(result.data.address, null);
  assert.equal(result.data.canonicalSlug, `apn-${baseRow.apn_norm}`);
});

await test("source failure is unavailable rather than absence", async () => {
  const result = await adapter.getParcelServingV2Result(baseRow.apn_norm, async () => ({ data: null, error: { code: "timeout" } }));
  assert.equal(result.status, "source_unavailable");
  assert.equal(result.truth.parcel.value, null);
});

await test("successful empty query is authoritative not-found", async () => {
  const result = await adapter.getParcelServingV2Result(baseRow.apn_norm, async () => ({ data: null, error: null }));
  assert.equal(result.status, "not_found");
  assert.equal(result.truth.parcel.value, false);
});

await test("malformed and identity-mismatched rows fail closed", async () => {
  assert.equal((await lookup({ ...baseRow, geometry_sha256: "bad" })).status, "malformed_result");
  assert.equal((await lookup({ ...baseRow, apn_norm: "0000000000" })).status, "malformed_result");
});

await test("unmapped and indeterminate zoning stay partial", async () => {
  for (const state of ["UNMAPPED", "INDETERMINATE"]) {
    const result = await lookup({ ...baseRow, zoning_mapping_state: state, dominant_zone_code: null, dominant_coverage_percent: null, zoning_evidence: [] });
    assert.equal(result.status, "partial");
    assert.equal(result.truth.baseZoning.state, "partial");
  }
});

await test("exact and fully formatted APNs are accepted without padding", async () => {
  assert.equal(adapter.normalizeParcelServingV2Apn("5470501600"), "5470501600");
  assert.equal(adapter.normalizeParcelServingV2Apn("547-050-16-00"), "5470501600");
  for (const input of ["54705016", "547050160", "547-050-16", "005470501600"])
    assert.equal(adapter.normalizeParcelServingV2Apn(input), null);
});

await test("legacy 8/9-digit route behavior is classified instead of silently inherited", () => {
  assert.equal(adapter.resolveV2RouteApn("547-050-16-main-st").status, "legacy_padding_required");
  assert.equal(adapter.resolveV2RouteApn("547050160-main-st").status, "legacy_padding_required");
  assert.equal(adapter.resolveV2RouteApn("547-050-16-00-main-st").status, "exact");
  assert.equal(slug.extractApnFromSlug("547-050-16-main-st"), "0054705016");
});

await test("changed address changes canonical path while exact APN stays stable", async () => {
  const current = await lookup();
  const changed = await lookup({ ...baseRow, address: "125 MAIN ST" });
  assert.notEqual(current.data.canonicalPath, changed.data.canonicalPath);
  assert.ok(current.data.canonicalPath.startsWith(`/parcel/san-diego/547-050-16-00-`));
});

await test("stacked parcels remain separate APN routes", async () => {
  const second = { ...baseRow, parcel_source_object_id: 102, apn_norm: "5470501700", provenance: { ...baseRow.provenance, parcelSourceObjectId: 102 } };
  const a = await lookup();
  const b = await lookup(second, null, second.apn_norm);
  assert.equal(a.data.provenance.parcelSourceObjectId + 1, b.data.provenance.parcelSourceObjectId);
  assert.notEqual(a.data.canonicalPath, b.data.canonicalPath);
});

await test("comparison is limited to overlapping fields and preserves split-zone ambiguity", async () => {
  const v2 = await lookup({ ...baseRow, zoning_mapping_state: "MULTI_ZONE", distinct_zone_count: 2 });
  const v1 = {
    status: "found",
    data: {
      apnNorm: baseRow.apn_norm,
      identity: { address: "123 Main Street", zip: "92101", city: "San Diego", lat: 32.75, lng: -117.05 },
      zoning: { baseCode: { value: "RS-1-7" } },
    },
  };
  const comparison = adapter.compareParcelServingV2(v1, v2, baseRow.apn_norm);
  assert.equal(comparison.fields.apn, "MATCH");
  assert.equal(comparison.fields.jurisdiction, "NORMALIZED_EQUIVALENT");
  assert.equal(comparison.fields.area, "LEGACY_SEMANTICS_UNKNOWN");
  assert.equal(comparison.fields.baseZoning, "LEGACY_SEMANTICS_UNKNOWN");
});

await test("shadow gate is default-off and production-denied", () => {
  const enabled = { TRULOT_PARCEL_V2_SHADOW: "1", NODE_ENV: "development" };
  assert.equal(shadow.parcelServingV2ShadowEnabled({}), false);
  assert.equal(shadow.parcelServingV2ShadowEnabled({ TRULOT_PARCEL_V2_SHADOW: "0", NODE_ENV: "development" }), false);
  assert.equal(shadow.parcelServingV2ShadowEnabled(enabled), true);
  assert.equal(shadow.parcelServingV2ShadowEnabled({ TRULOT_PARCEL_V2_SHADOW: "1", NODE_ENV: "test" }), true);
  assert.equal(shadow.parcelServingV2ShadowEnabled({ TRULOT_PARCEL_V2_SHADOW: "1", NODE_ENV: "production", VERCEL_ENV: "preview" }), true);
  assert.equal(shadow.parcelServingV2ShadowEnabled({ TRULOT_PARCEL_V2_SHADOW: "1", NODE_ENV: "production", VERCEL_ENV: "production" }), false);
});

await test("disabled shadow never queries and enabled failure never rejects Parcel V1", async () => {
  let queries = 0;
  const v1 = { status: "source_unavailable", data: null };
  await shadow.runParcelServingV2Shadow("547-050-16-00-main-st", v1, {
    environment: {},
    query: async () => { queries += 1; throw new Error("must not query"); },
  });
  assert.equal(queries, 0);
  await shadow.runParcelServingV2Shadow("547-050-16-00-main-st", v1, {
    environment: { TRULOT_PARCEL_V2_SHADOW: "1", NODE_ENV: "test" },
    query: async () => { queries += 1; throw new Error("private source error"); },
    log: () => {},
  });
  assert.equal(queries, 1);
});

await test("migration remains isolated and public route uses post-response shadow work", () => {
  const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260925090000_parcel_serving_v2_shadow_foundation.sql"), "utf8");
  assert.match(migration, /create schema if not exists trulot_v2/i);
  assert.doesNotMatch(migration, /(?:alter|drop|truncate)\s+(?:table|view)\s+(?:public\.)?parcel_page_api_v2/i);
  assert.match(migration, /revoke all on schema trulot_v2 from public/i);
  const page = fs.readFileSync(path.join(root, "app/parcel/san-diego/[slug]/page.tsx"), "utf8");
  assert.match(page, /after\(\(\) => runParcelServingV2Shadow/);
});

if (process.argv[2]) {
  await test("real rehearsal serving row satisfies the production adapter", async () => {
    const row = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    const result = await adapter.getParcelServingV2Result(row.apn_norm, async () => ({ data: row, error: null }));
    assert.ok(["found", "partial"].includes(result.status));
    assert.equal(result.data.apn, row.apn_norm);
    assert.equal(result.data.provenance.importRunId, row.provenance.importRunId);
  });
}

console.log(`${checks} Parcel Serving V2 production-shadow checks passed.`);

#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
function loadTs(file) {
  const absolute = path.join(root, file);
  const priorTsLoader = Module._extensions[".ts"];
  Module._extensions[".ts"] = (loaded, filename) => {
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    loaded._compile(code, filename);
  };
  try {
    return Module.createRequire(import.meta.url)(absolute);
  } finally {
    if (priorTsLoader) Module._extensions[".ts"] = priorTsLoader;
    else delete Module._extensions[".ts"];
  }
}

const production = loadTs("lib/parcel-lookup-production-v0.ts");
assert.equal(production.parcelLookupProductionEnabled({}), false);
assert.equal(production.parcelLookupProductionEnabled({ TRULOT_PARCEL_LOOKUP_V0: "0" }), false);
assert.equal(production.parcelLookupProductionEnabled({ TRULOT_PARCEL_LOOKUP_V0: "1" }), true);

const row = (overrides = {}) => ({
  apn: "5442140600",
  apn_display: "544-214-06-00",
  address: "639 N 67TH ST",
  normalized_address: "639 N 67TH ST",
  normalized_unit_address: "639 N 67TH ST",
  zip: "92114",
  jurisdiction: "SD",
  longitude: -117.057,
  latitude: 32.711,
  approximate_area_sqft: 6250,
  ...overrides,
});

const exact = await production.executeParcelLookupProduction(
  { query: "639 North 67th Street", limit: 10 },
  async ({ queryType }) => queryType === "EXACT_ADDRESS" ? [row()] : [],
);
assert.equal(exact.ok, true);
assert.equal(exact.body.contractVersion, "parcel-lookup-production-v0-p45");
assert.equal(exact.body.state, "EXACT_MATCH");
assert.equal(exact.body.selected.apnDisplay, "544-214-06-00");
assert.equal(exact.body.selected.approximateAreaSqFt, 6250);
assert.deepEqual(Object.keys(exact.body.candidates[0]).sort(), ["address", "apn", "apnDisplay", "displayAddress", "jurisdiction", "orientation", "zip"]);
assert.doesNotMatch(JSON.stringify(exact.body), /source_object|geometry_sha|parcel_id|trulot_v2|sql/i);

const exactApn = await production.executeParcelLookupProduction(
  { query: "544-214-06-00" },
  async ({ queryType, query }) => {
    assert.equal(queryType, "EXACT_APN");
    assert.equal(query, "5442140600");
    return [row()];
  },
);
assert.equal(exactApn.body.state, "EXACT_MATCH");

const prefix = await production.executeParcelLookupProduction(
  { query: "544214" },
  async ({ queryType, limit }) => {
    assert.equal(queryType, "APN_PREFIX");
    assert.equal(limit, 11);
    return [row()];
  },
);
assert.equal(prefix.ok, true);

const calls = [];
const partial = await production.executeParcelLookupProduction(
  { query: "639 67" },
  async (request) => {
    calls.push(request);
    return request.queryType === "AUTOCOMPLETE" ? [row()] : [];
  },
);
assert.deepEqual(calls.map((call) => call.queryType), ["EXACT_ADDRESS", "AUTOCOMPLETE"]);
assert.equal(calls[1].limit, 50);
assert.equal(partial.body.state, "PARTIAL_MATCHES");

const multiple = await production.executeParcelLookupProduction(
  { query: "1501 FRONT ST" },
  async () => [
    row({ apn: "5333641301", apn_display: "533-364-13-01", address: "1501 FRONT ST", normalized_address: "1501 FRONT ST", normalized_unit_address: "1501 FRONT ST" }),
    row({ apn: "5333641302", apn_display: "533-364-13-02", address: "1501 FRONT ST", normalized_address: "1501 FRONT ST", normalized_unit_address: "1501 FRONT ST" }),
  ],
);
assert.equal(multiple.body.state, "MULTIPLE_MATCHES");
assert.equal(multiple.body.ambiguous, true);
assert.equal(multiple.body.selected, null);

for (const request of [
  { query: "" },
  { query: "x" },
  { query: "54421" },
  { query: "a ".repeat(13) },
  { query: "x".repeat(161) },
  { query: "639 N\n67TH ST" },
  { query: "639 N 67TH ST", limit: 11 },
  { query: "639 N 67TH ST", limit: 1.5 },
]) {
  const outcome = await production.executeParcelLookupProduction(request, async () => { throw new Error("must not query"); });
  assert.equal(outcome.status, 400, JSON.stringify(request));
  assert.equal(outcome.body.state, "INVALID_QUERY");
}

const unavailable = await production.executeParcelLookupProduction(
  { query: "639 N 67TH ST" },
  async () => { throw new Error("provider relation secret"); },
);
assert.equal(unavailable.status, 503);
assert.equal(unavailable.body.state, "DATABASE_UNAVAILABLE");
assert.doesNotMatch(JSON.stringify(unavailable.body), /provider|relation|secret/i);

const aborted = new AbortController();
aborted.abort();
const timeout = await production.executeParcelLookupProduction(
  { query: "639 N 67TH ST" },
  async () => { throw new Error("aborted"); },
  { signal: aborted.signal },
);
assert.equal(timeout.status, 504);
assert.equal(timeout.body.state, "TIMEOUT");

const migration = read("supabase/migrations/20261001203830_parcel_lookup_v0_bounded.sql");
for (const required of [
  "sangis-20260924T183743Z",
  "724ff836-eedc-594e-93c5-c80a63de65f7",
  "parcel_lookup_v0_apn_prefix_idx",
  "parcel_lookup_v0_address_exact_idx",
  "parcel_lookup_v0_unit_address_exact_idx",
  "parcel_lookup_v0_address_search_idx",
  "security definer",
  "set search_path = ''",
  "set statement_timeout = '1500ms'",
  "grant execute on function public.parcel_lookup_v0_search",
  "extensions.geometry(Point, 4326)",
  "extensions.st_x(item.point_on_surface)",
  "extensions.st_y(item.point_on_surface)",
]) assert.ok(migration.toLowerCase().includes(required.toLowerCase()), required);
assert.ok(migration.includes("sangis-20260924T183743Z"));
assert.ok(!migration.includes("SANGIS-20260924T183743Z"));
assert.doesNotMatch(migration, /lower\s*\(\s*(?:\w+\.)?acquisition_id\s*\)/i);
assert.doesNotMatch(migration, /acquisition_id\s+ilike/i);
assert.doesNotMatch(migration, /public\.st_[xy]\s*\(/i);
const postgresRehearsal = read("scripts/parcel-lookup-production-v0/postgres-rehearsal.mjs");
assert.ok(postgresRehearsal.includes('const expectedAcquisition = "sangis-20260924T183743Z"'));
assert.ok(postgresRehearsal.includes('const alteredCaseAcquisition = "SANGIS-20260924T183743Z"'));
assert.ok(postgresRehearsal.includes("alteredCaseRunRejected: true"));
assert.ok(postgresRehearsal.includes("create extension if not exists postgis with schema extensions"));
assert.ok(postgresRehearsal.includes("hostilePublicPostgisShadowsIgnored: \"PASS\""));
assert.doesNotMatch(migration, /grant\s+select\s+on\s+.*parcel_lookup_v0/i);
assert.doesNotMatch(migration, /^\s*execute\s+/im);
assert.match(migration, /revoke all on table trulot_v2\.parcel_lookup_v0[\s\S]*service_role/i);

const server = read("lib/parcel-lookup-production-server.ts");
assert.doesNotMatch(server, /console\.(info|log)\([^)]*(query|body)/i);
assert.ok(server.includes("queryLengthBucket"));
assert.ok(server.includes("tokenCountBucket"));
assert.ok(server.includes("errorClass"));

const api = read("app/api/parcel-lookup/route.ts");
assert.ok(api.includes("parcelLookupProductionEnabled"));
assert.ok(api.includes('"Cache-Control": "private, no-store, max-age=0"'));
assert.ok(api.includes('"X-Robots-Tag"'));
assert.ok(api.includes('key !== "q" && key !== "limit"'));
assert.ok(api.includes('getAll("q").length !== 1'));
assert.doesNotMatch(api, /failure|fixture|source_object|geometry_sha|selected_snapshot/i);

const productionPage = read("app/parcel-lookup/page.tsx");
assert.ok(productionPage.includes("parcelLookupProductionEnabled"));
assert.ok(productionPage.includes('dataSource="bounded-production-api"'));
assert.ok(productionPage.includes("notFound()"));

const rollback = read("docs/sql/parcel-lookup-v0-rollback.sql");
assert.match(rollback, /drop function if exists public\.parcel_lookup_v0_search/);
assert.match(rollback, /drop table if exists trulot_v2\.parcel_lookup_v0/);
assert.doesNotMatch(rollback, /drop.*parcel_base_sangis_v2|delete|truncate/i);

for (const file of [
  "app/parcel/san-diego/[slug]/page.tsx",
  "lib/parcel-page-v1.ts",
  "app/page.tsx",
  "app/sitemap.ts",
  "app/robots.ts",
  "docs/sql/parcel-lookup-production-v0-design.sql",
]) {
  const baseline = execFileSync("git", ["show", `9eb954031d0efa9831f515decb8b3b1078ff492e:${file}`], { cwd: root });
  assert.deepEqual(fs.readFileSync(path.join(root, file)), baseline, `${file} changed outside Packet 45 scope`);
}

console.log("PASS Packet 45 API contract, validation, error, feature-flag, security-static, rollback, and preservation tests");

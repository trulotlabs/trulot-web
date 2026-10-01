#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const report = JSON.parse(read("data/parcel-lookup-production-v0/rehearsal.json"));
assert.equal(report.source.acquisitionId, "sangis-20260924T183743Z");
assert.equal(report.source.validatedRunId, "724ff836-eedc-594e-93c5-c80a63de65f7");
assert.equal(report.source.normalizedRowsSha256, "95c92f14bf4489946c6632f8032c2e08735b8fec11940cdace69db19c0625868");
assert.equal(report.source.productionAccessed, false);
assert.equal(report.source.acceptedCountywideRows, 1_088_430);
assert.equal(report.source.cityRows, 393_733);
assert.equal(report.source.distinctCityApns, 393_733);
assert.equal(report.engine.productionPostgresClaimed, false);
const postgresReport = JSON.parse(read("data/parcel-lookup-production-v0/postgres-rehearsal.json"));
assert.equal(postgresReport.source.acquisitionId, "sangis-20260924T183743Z");
assert.equal(postgresReport.source.alteredCaseRunRejected, true);
assert.equal(postgresReport.source.normalizedRowsSha256, "95c92f14bf4489946c6632f8032c2e08735b8fec11940cdace69db19c0625868");
assert.equal(postgresReport.correctness.rows, 393_733);
assert.equal(postgresReport.correctness.distinctApns, 393_733);
assert.equal(postgresReport.correctness.apnSetSha256, "93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25");
for (const key of ["exactApn", "exactAddress", "autocomplete"]) {
  assert.equal(report.timings[key].sampleCount, 200);
  assert.equal(report.timings[key].targetMet, true);
  assert.ok(report.timings[key].p95Ms < report.timings[key].targetP95Ms);
}
for (const key of ["exactApn", "apnPrefix", "exactAddress", "partialAutocomplete", "multipleMatches", "missingAddress", "stackedParcels"]) {
  assert.equal(report.coverage[key], true, key);
}
assert.equal(report.coverage.mapPayload, "point_only");
assert.equal(report.coverage.missingAddressCount, 14_846);
assert.match(report.plans.exactApn.join(" "), /PRIMARY KEY/);
assert.match(report.plans.exactAddress.join(" "), /address_exact_idx/);
assert.match(report.plans.autocomplete.join(" "), /VIRTUAL TABLE INDEX/);

const sql = read("docs/sql/parcel-lookup-production-v0-design.sql");
for (const required of [
  "create table trulot_v2.parcel_lookup_v0",
  "address_search_vector tsvector generated always",
  "text_pattern_ops",
  "using gin (address_search_vector)",
  "enable row level security",
  "revoke all on table trulot_v2.parcel_lookup_v0 from public, anon, authenticated",
  "revoke all on table trulot_v2.parcel_lookup_v0 from service_role",
  "rollback;",
]) assert.match(sql.toLowerCase(), new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(sql, /\b(from|join)\s+trulot_v2\.(selected_snapshot|parcel_serving_v2|parcel_intelligence_serving_v2|base_zoning\w*)/i);
assert.doesNotMatch(sql, /^\s+(zone|coastal|structure|standard|compliance|capacity|feasibility)_\w+\s+/im);
assert.doesNotMatch(sql, /grant\s+select\s+on\s+table\s+trulot_v2\.parcel_lookup_v0/i);
assert.doesNotMatch(sql, /create\s+policy/i);

const contract = read("lib/parcel-lookup-production-v0.ts");
for (const required of ["ParcelLookupProductionV0", "ParcelLookupProductionCandidate", "POINT_ONLY", "Approximate geometry area", "MAX_RESULTS = 10"]) {
  assert.ok(contract.includes(required), required);
}
const publicIdentityContract = contract.slice(
  contract.indexOf("export type ParcelLookupProductionCandidate"),
  contract.indexOf("export type ParcelLookupProductionRequest"),
);
assert.doesNotMatch(publicIdentityContract, /zone|coastal|structure|standard|compliance|capacity|feasibility|adu|sb9|sb79/i);

const design = read("docs/parcel-lookup-production-v0.md");
for (const required of [
  "dedicated private search materialization",
  "never reads `selected_snapshot`",
  "Copy APN",
  "X-Robots-Tag: noindex, nofollow",
  "Stage 0",
  "Stage 3",
  "AWAITING_INDEPENDENT_EVIDENCE",
  "PostgreSQL `EXPLAIN",
  "no implicit fallback",
]) assert.ok(design.includes(required), required);

const changed = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root, encoding: "utf8" })
  .split("\n").filter(Boolean).map((line) => line.slice(3));
const protectedPaths = [
  "app/page.tsx",
  "app/api/search/route.ts",
  "app/parcel/san-diego/[slug]/page.tsx",
  "app/parcel/[apn]/page.tsx",
  "lib/parcel-page-v1.ts",
  "app/sitemap.ts",
  "app/robots.ts",
  "supabase/migrations/20260925090000_parcel_serving_v2_shadow_foundation.sql",
];
for (const file of protectedPaths) assert.ok(!changed.includes(file), `${file} must remain unchanged`);
assert.ok(changed.every((file) => [
  "data/parcel-lookup-production-v0/",
  "docs/parcel-lookup-production-v0.md",
  "docs/parcel-lookup-production-v0-runbook.md",
  "docs/sql/parcel-lookup-production-v0-design.sql",
  "lib/parcel-lookup-production-v0.ts",
  "scripts/parcel-lookup-production-v0/",
  "scripts/parcel-lookup-v0/test-acceptance.mjs",
  "supabase/migrations/20261001203830_parcel_lookup_v0_bounded.sql",
].some((allowed) => file === allowed || file.startsWith(allowed))), `unexpected changed path: ${changed.join(", ")}`);

console.log("PASS Packet 44 architecture, security containment, full-corpus evidence, and preservation tests");

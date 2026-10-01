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
  const code = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const loaded = new Module(file);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(path.join(root, file)));
  loaded._compile(code, file);
  return loaded.exports;
}

const lookup = loadTs("lib/parcel-lookup-contract.ts");
const loader = loadTs("lib/parcel-lookup-v0.ts");
const fixture = JSON.parse(read("data/parcel-lookup-v0/synthetic-acceptance-fixtures.json"));
assert.equal(fixture.authorityClassification, "TEST_ONLY_NOT_PUBLIC_AUTHORITY_EVIDENCE");

const ranking = lookup.searchParcelLookup(loader.loadParcelLookupSyntheticFixture("ranking"), fixture.rankingFixture.query);
assert.deepEqual(ranking.candidates.map((candidate) => candidate.record.apn), fixture.rankingFixture.expectedApnOrder);
assert.deepEqual(ranking.candidates.map((candidate) => candidate.matchReason), fixture.rankingFixture.expectedMatchReasons);
assert.equal(ranking.state, "EXACT_MATCH");

const leadingZero = loader.loadParcelLookupSyntheticFixture("normalization")[0];
assert.equal(leadingZero.apn, "0123456789");
assert.equal(lookup.normalizeApnInput(leadingZero.apn).canonical, "0123456789");
assert.equal(leadingZero.apnDisplay, "012-345-67-89");

for (const value of ["source-unavailable", "selected-open"]) {
  assert.equal(loader.parcelLookupFailureInjection(value, { NODE_ENV: "production", TRULOT_PARCEL_V2_PREVIEW: "1" }), null);
  assert.equal(loader.parcelLookupFailureInjection(value, { NODE_ENV: "development" }), null);
  assert.equal(loader.parcelLookupFailureInjection(value, { NODE_ENV: "development", TRULOT_PARCEL_V2_PREVIEW: "1" }), value);
}
for (const value of ["ranking", "normalization"]) {
  assert.equal(loader.parcelLookupSyntheticFixtureInjection(value, { NODE_ENV: "production", TRULOT_PARCEL_V2_PREVIEW: "1" }), null);
  assert.equal(loader.parcelLookupSyntheticFixtureInjection(value, { NODE_ENV: "test", TRULOT_PARCEL_V2_PREVIEW: "1" }), value);
}

const client = read("app/parcel-lookup-preview/ParcelLookupPreviewClient.tsx");
const styles = read("app/parcel-lookup-preview/parcel-lookup-preview.module.css");
const route = read("app/parcel-lookup-preview/page.tsx");
for (const text of [
  "Enter an address or APN to search.",
  "Enter at least ${PARCEL_LOOKUP_QUERY_THRESHOLD} characters.",
  'data-lookup-state="SOURCE_UNAVAILABLE"',
  'data-lookup-state="SELECTED_PARCEL_UNAVAILABLE"',
  "Retry lookup",
  "Retry parcel",
  "Copy APN",
]) assert.ok(client.includes(text), text);
assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.identityCard \{ grid-row: 1;/);
assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.mapCard \{ grid-row: 2;/);
assert.match(route, /parcelLookupFailureInjection/);
assert.match(route, /parcelLookupSyntheticFixtureInjection/);
assert.doesNotMatch(client, /satellite|neighbor parcel/i);

for (const file of [
  "app/parcel/san-diego/[slug]/page.tsx",
  "lib/parcel-page-v1.ts",
  "docs/sql/parcel-lookup-production-v0-design.sql",
]) {
  const baseline = execFileSync("git", ["show", `1697069306691aa543a98f4d97184bb0da88a2b5:${file}`], { cwd: root });
  assert.deepEqual(fs.readFileSync(path.join(root, file)), baseline, `${file} changed outside Packet 43B scope`);
}

console.log("PASS Packet 43B acceptance blockers, injection containment, and preservation tests");

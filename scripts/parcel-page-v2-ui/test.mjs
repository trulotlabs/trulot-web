#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const out = path.join(root, "data/parcel-page-v2-ui");

function loadTs(file) {
  const source = fs.readFileSync(file, "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file }).outputText;
  const loaded = new Module(file);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  loaded._compile(code, file);
  return loaded.exports;
}

const { adaptParcelIntelligenceV2 } = loadTs(path.join(here, "adapter.ts"));
const { renderParcelPageV2 } = loadTs(path.join(here, "renderer.ts"));
const source = JSON.parse(fs.readFileSync(path.join(root, "data/parcel-intelligence-v2/fixture-results.json"), "utf8"));
const byApn = new Map(source.results.map((item) => [item.result.identity.apn, item.result]));
const model = (apn) => adaptParcelIntelligenceV2(structuredClone(byApn.get(apn)));
const html = (apn) => renderParcelPageV2(model(apn));

// Contract rejects any upstream result that claims forbidden conclusions.
for (const field of ["parcel_compliance_evaluated", "development_capacity_calculated", "standards_blended", "production_runtime_wired"]) {
  const attack = structuredClone(byApn.get("6341302200"));
  attack[field] = true;
  assert.throws(() => adaptParcelIntelligenceV2(attack), /sealed non-compliance/);
}

// Canonical orientation and Coastal version selection/refusal.
const outside = model("6341302200");
assert.equal(outside.orientation.coastalLabel, "Outside Coastal Overlay Zone");
assert.equal(outside.orientation.standardsVersion, "sd-rs-base-standards-2026-09-30-v0");
const inside = model("3506320400");
assert.equal(inside.orientation.coastalLabel, "Inside Coastal Overlay Zone");
assert.equal(inside.orientation.standardsVersion, "sd-rs-base-standards-inside-coastal-2026-09-10-v0");
const boundary = model("3082980200");
assert.equal(boundary.orientation.coastalLabel, "Coastal applicability requires review");
assert.equal(boundary.orientation.standardsVersion, "Not selected — Coastal applicability unresolved");
assert.equal(boundary.orientation.standardsVersionState, "review");

// Conditional standards retain exact display qualifiers and inspectable conditions.
const rs17 = outside.standardsGroups[0].standards;
assert.equal(rs17.find((item) => item.label === "Minimum lot width").value, "50 ft");
assert.equal(rs17.find((item) => item.label === "Minimum corner-lot width").value, "55 ft — if corner lot");
assert.equal(rs17.find((item) => item.label === "Maximum structure height").value, "24/30 ft — condition-dependent");
assert.equal(rs17.find((item) => item.label === "Maximum floor-area ratio").value, "Varies — additional rule conditions apply");
assert.ok(rs17.filter((item) => item.state === "conditional").every((item) => item.conditions.length > 0));
assert.match(html("6341302200"), /View exact condition/);

// Split zones remain separate; unsupported non-RS evidence remains visible.
const split = model("4304211000");
assert.deepEqual(split.standardsGroups.map((item) => item.zoneCode), ["RS-1-7", "OR-1-1"]);
assert.deepEqual(split.orientation.zones.map((item) => item.code), ["RS-1-7", "OR-1-1"]);
assert.equal(split.standardsGroups[1].state, "not_applicable");
assert.match(html("4304211000"), /Standards outside this RS adapter/);
assert.equal(split.safeguards.standardsBlended, false);
assert.match(html("4304211000"), /no blended standard is selected/i);

// UNKNOWN and source-unavailable values keep explicit language, never false or zero.
const unmappedHtml = html("7600360300");
assert.match(unmappedHtml, /Existing dwelling units[\s\S]*Not yet verified/);
assert.doesNotMatch(unmappedHtml, /Existing dwelling units[\s\S]{0,500}>0</);
const unavailableHtml = html("7600300100");
assert.match(unavailableHtml, /Source currently unavailable/);
assert.doesNotMatch(unavailableHtml, />false</i);

// Source semantics: living area is not relabeled and dated footprints remain historical.
const insideHtml = html("3506320400");
assert.match(insideHtml, /Living area[\s\S]*1,610 sq ft/);
assert.doesNotMatch(insideHtml, /Gross floor area[\s\S]{0,100}1,610 sq ft/);
assert.match(insideHtml, /Building outline evidence — 2017 imagery/);
assert.match(insideHtml, /Historical plan-view outline evidence/);

// Missing address uses APN; ambiguous/unmapped cases remain review states.
const missing = model("3031701800");
assert.equal(missing.header.address, null);
assert.equal(missing.header.title, "Parcel 3031701800");
assert.equal(model("4303410600").orientation.zoningLabel, "Zoning requires review");
assert.equal(model("7600360300").orientation.zoningLabel, "Base zoning not yet mapped");

// Static accessibility and page architecture checks across every representative fixture.
const fixtures = JSON.parse(fs.readFileSync(path.join(out, "fixtures.json"), "utf8"));
assert.equal(fixtures.representative_count, 10);
for (const fixture of fixtures.fixtures) {
  const page = fs.readFileSync(path.join(root, fixture.rendering), "utf8");
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<meta name="viewport"/);
  assert.equal((page.match(/<h1\b/g) || []).length, 1);
  for (const heading of ["What applies here", "Base development standards", "Existing property facts", "What we don’t know yet", "Next investigation", "Evidence \/ How TruLot knows"]) assert.ok(page.includes(heading), `${fixture.apn}: ${heading}`);
  assert.match(page, /<summary>/);
  assert.match(page, /<span class="sr-only">Status: <\/span>/);
  assert.match(page, /Development capacity[\s\S]*Not evaluated yet/);
  assert.doesNotMatch(page, /you can build|buildable units|maximum units|compliant|meets requirement|development potential/i);
  assert.doesNotMatch(page, /\/Users\/|TRULOT_|localhost|credential/i);
}

const result = {
  result: "PASS",
  adapter_contract: "PASS",
  truth_state_rendering: "PASS",
  split_zone_rendering: "PASS",
  coastal_rendering: "PASS",
  conditional_standards: "PASS",
  structure_semantics: "PASS",
  accessibility_static: "PASS",
  representative_fixtures: fixtures.representative_count,
  source_fixture_count: source.fixture_count,
  production_runtime_wired: false,
};
fs.writeFileSync(path.join(out, "validation.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`PASS Parcel Page V2 UI adapter: ${fixtures.representative_count} representative renderings`);

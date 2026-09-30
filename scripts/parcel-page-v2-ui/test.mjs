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
const { renderParcelTechnicalEvidence } = loadTs(path.join(here, "technical-renderer.ts"));
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
assert.match(html("6341302200"), /Full rule conditions/);
assert.match(html("6341302200"), /Lot dimensions and corner condition \(3\)/);
assert.match(html("6341302200"), /Section 131\.0444 and Table 131-04H angled-building-envelope rules remain unevaluated/);
assert.ok(html("6341302200").indexOf("Density basis") < html("6341302200").indexOf("Lot dimensions and corner condition"));
assert.ok(html("6341302200").indexOf("Maximum floor-area ratio") < html("6341302200").indexOf("Lot dimensions and corner condition"));

// Split zones remain separate; unsupported non-RS evidence remains visible.
const split = model("4304211000");
assert.deepEqual(split.standardsGroups.map((item) => item.zoneCode), ["RS-1-7", "OR-1-1"]);
assert.deepEqual(split.orientation.zones.map((item) => item.code), ["RS-1-7", "OR-1-1"]);
assert.equal(split.standardsGroups[1].state, "not_applicable");
assert.match(html("4304211000"), /Detailed standards not included/);
assert.equal(split.safeguards.standardsBlended, false);
assert.match(html("4304211000"), /Different rules apply to each mapped portion/);
assert.match(html("4304211000"), /Detailed standards are available for the RS-1-7 portion only/);
assert.doesNotMatch(html("4304211000"), /no primary zone has been selected|has not selected a primary zone/i);
assert.match(html("4304211000"), /64\.3% of mapped parcel area/);
assert.match(html("4304211000"), /35\.7% of mapped parcel area/);

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

// Level 2 consolidates homeowner questions while Level 3 retains every detailed fact.
assert.match(html("6341302200"), /What still needs to be confirmed/);
assert.match(html("6341302200"), /Lot-line designations not yet verified/);
assert.doesNotMatch(html("6341302200"), /<h3>Front lot line<\/h3>|<h3>Interior-side lot lines<\/h3>|<h3>Rear lot line<\/h3>/);
assert.match(html("6341302200"), /Needed to assess which front, side, street-side, and rear setback rules apply/);
assert.doesNotMatch(html("6341302200"), /Unlocks:/);
const technicalOutside = renderParcelTechnicalEvidence(outside);
for (const detail of ["Front lot line", "Interior-side lot lines", "Street-side lot lines", "Rear lot line"]) assert.match(technicalOutside, new RegExp(detail));
assert.match(technicalOutside, /Artifact SHA-256/);
assert.match(technicalOutside, /parcel-base-v2\/sangis-/);
assert.match(technicalOutside, /base-zoning-city-sd-v2-area-coverage-v1/);
assert.match(technicalOutside, /Source feature IDs/);
assert.match(technicalOutside, /href="\/parcel-v2-preview\/6341302200"/);

// Missing address uses APN; ambiguous/unmapped cases remain review states.
const missing = model("3031701800");
assert.equal(missing.header.address, null);
assert.equal(missing.header.title, "Parcel 3031701800");
assert.equal(model("4303410600").orientation.zoningLabel, "Zoning requires review");
assert.equal(model("7600360300").orientation.zoningLabel, "Base zoning not yet mapped");

// Static accessibility and three-level architecture checks across every representative fixture.
const fixtures = JSON.parse(fs.readFileSync(path.join(out, "fixtures.json"), "utf8"));
assert.equal(fixtures.representative_count, 10);
for (const fixture of fixtures.fixtures) {
  const page = html(fixture.apn);
  const technical = renderParcelTechnicalEvidence(model(fixture.apn));
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<meta name="viewport"/);
  assert.equal((page.match(/<h1\b/g) || []).length, 1);
  for (const heading of ["Parcel orientation", "Base zoning standards", "Existing property facts", "What still needs to be confirmed", "Official sources"]) assert.ok(page.includes(heading), `${fixture.apn}: ${heading}`);
  assert.match(page, /<span class="sr-only">Status: <\/span>/);
  assert.equal((page.match(/Interpretation boundary\./g) || []).length, 1);
  assert.match(page, new RegExp(`href="/parcel-public-preview/${fixture.apn}"`));
  assert.match(page, new RegExp(`href="/parcel-v2-evidence/${fixture.apn}"`));
  assert.match(page, /SanGIS parcel records/);
  assert.match(page, /San Diego Municipal Code/);
  assert.doesNotMatch(page, /Artifact fingerprint|Record fingerprint|Artifact SHA-256|Record SHA-256|data\/parcel-|Packet 20|sealed RS|RS adapter|\bVerified\b/);
  assert.doesNotMatch(page, /you can build|buildable units|maximum units|compliant|meets requirement|development potential/i);
  assert.doesNotMatch(page, /\/Users\/|TRULOT_|localhost|credential/i);
  assert.match(technical, /Technical evidence preview/);
  assert.match(technical, /Source layers and fingerprints/);
  assert.match(technical, /Production runtime wired/);
  assert.match(technical, /<meta name="robots" content="noindex,nofollow">/);
}

const detailRoute = fs.readFileSync(path.join(root, "app/parcel-v2-preview/[apn]/page.tsx"), "utf8");
const technicalRoute = fs.readFileSync(path.join(root, "app/parcel-v2-evidence/[apn]/page.tsx"), "utf8");
for (const route of [detailRoute, technicalRoute]) {
  assert.match(route, /parcelV2PreviewEnabled\(\)/);
  assert.match(route, /robots:\s*\{[\s\S]*index:\s*false/);
  assert.doesNotMatch(route, /supabase|parcel-page-v1|selected_snapshot|fetch\s*\(/i);
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
  three_level_separation: "PASS",
  representative_fixtures: fixtures.representative_count,
  source_fixture_count: source.fixture_count,
  production_runtime_wired: false,
};
fs.writeFileSync(path.join(out, "validation.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`PASS Parcel Page V2 UI adapter: ${fixtures.representative_count} representative renderings`);

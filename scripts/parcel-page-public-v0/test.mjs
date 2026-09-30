#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

function loadTs(file) {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file }).outputText;
  const loaded = new Module(file);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  loaded._compile(code, file);
  return loaded.exports;
}

const expert = loadTs(path.join(root, "scripts/parcel-page-v2-ui/adapter.ts"));
const publicAdapter = loadTs(path.join(here, "adapter.ts"));
const renderer = loadTs(path.join(here, "renderer.ts"));
const corpus = JSON.parse(fs.readFileSync(path.join(root, "data/parcel-intelligence-v2/fixture-results.json"), "utf8"));
const byApn = new Map(corpus.results.map((entry) => [entry.result.identity.apn, entry.result]));
const model = (apn) => publicAdapter.adaptPublicParcelPageV0(expert.adaptParcelIntelligenceV2(structuredClone(byApn.get(apn))));
const html = (apn) => renderer.renderPublicParcelPageV0(model(apn));

const outside = model("6341302200");
assert.equal(outside.header.title, "1456 27th St");
assert.equal(outside.header.apnDisplay, "634-130-22-00");
assert.equal(outside.facts.find((fact) => fact.label === "Zoning").value, "RS-1-7");
assert.equal(outside.facts.find((fact) => fact.label === "Coastal status").value, "Outside Coastal Overlay Zone");
assert.equal(outside.facts.find((fact) => fact.label === "Approx. parcel area").value, "21,841 sq ft");
assert.equal(outside.facts.find((fact) => fact.label === "Existing dwelling units").value, "1");
assert.equal(outside.summary.kind, "verified_residential");
assert.match(outside.summary.meaning, /source-backed base residential standards/);
assert.equal(outside.keyStandards.zoneCode, "RS-1-7");
assert.deepEqual(outside.keyStandards.items.map((item) => item.label), ["Minimum lot area", "Front setback", "Side setbacks", "Rear setback", "Height", "Base density", "Floor-area ratio"]);
assert.match(outside.productionSeo.title, /1456 27th St, San Diego · APN 634-130-22-00 · Zoning RS-1-7/);
assert.equal(outside.productionSeo.canonicalPath, "/parcel/san-diego/634-130-22-00-1456-27th-st");

const inside = model("3506320400");
assert.equal(inside.header.title, "7553 Cabrillo Ave");
assert.equal(inside.facts.find((fact) => fact.label === "Coastal status").value, "Inside Coastal Overlay Zone");

const split = model("4304211000");
assert.equal(split.summary.kind, "split_zone");
assert.equal(split.facts[0].value, "RS-1-7 64.3% + OR-1-1 35.7%");
assert.match(split.summary.meaning, /two mapped zoning areas/);
assert.match(split.summary.materialNotice.detail, /mapped land area, not buildable area/i);
assert.deepEqual(split.splitDiagram.zones, [{ code: "RS-1-7", coverage: "64.3%" }, { code: "OR-1-1", coverage: "35.7%" }]);

assert.equal(model("3082980200").summary.kind, "coastal_review");
assert.equal(model("3082980200").summary.meaning, "Coastal applicability requires review before TruLot can select a definitive standards version.");
assert.equal(model("4303410600").summary.kind, "ambiguous_zoning");
assert.equal(model("7600360300").summary.kind, "unmapped_zoning");
assert.equal(model("5470501600").summary.kind, "non_rs");
assert.equal(model("3031701800").header.title, "Parcel 3031701800");
assert.equal(model("3031701800").summary.materialNotice.title, "Street address not available");

for (const apn of ["6341302200", "3506320400", "4304211000", "4303410600", "3082980200", "7600360300", "5470501600", "3031701800"]) {
  const page = html(apn);
  const publicModel = model(apn);
  assert.equal(publicModel.facts.length, 4);
  assert.equal(publicModel.capacityStatement, "Development capacity has not yet been evaluated.");
  assert.equal(publicModel.safeguards.parcelComplianceEvaluated, false);
  assert.equal(publicModel.safeguards.developmentCapacityCalculated, false);
  assert.equal(publicModel.safeguards.standardsBlended, false);
  assert.equal(publicModel.safeguards.productionRuntimeWired, false);
  assert.match(page, /See what&#039;s needed to evaluate this property/);
  assert.doesNotMatch(page, />Evaluate development potential</);
  assert.match(page, /performs no calculation and does not request an evaluation/);
  assert.match(page, new RegExp(`href="/parcel-v2-preview/${apn}"`));
  assert.match(page, /View zoning details and sources/);
  assert.match(page, /SanGIS parcel and County assessor records/);
  assert.match(page, /City of San Diego Base Zoning/);
  assert.doesNotMatch(page, /Legal lot width|Front lot line|Interior-side lot lines|Artifact fingerprint|Record fingerprint|Base Zoning V2|Coastal Context V0|Structure Facts V0|sealed public parcel records|Packet 20/);
  assert.doesNotMatch(page, /\bVerified\b/);
  assert.doesNotMatch(page, /development potential score|max units|likely units|opportunity rating/i);
  assert.equal((page.match(/<h1\b/g) || []).length, 1);
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<meta name="viewport"/);
  assert.equal((page.match(/Development capacity has not yet been evaluated\./g) || []).length, 1);
  assert.match(publicModel.productionSeo.description, new RegExp(publicModel.header.apnDisplay));
  assert.equal(publicModel.productionSeo.structuredData.about.identifier.value, apn);
}

assert.match(html("4304211000"), /Approximate zoning mapping/);
assert.match(html("4304211000"), /not a surveyed boundary/);
assert.doesNotMatch(html("6341302200"), /Approximate zoning mapping/);
assert.equal(model("5470501600").keyStandards, null);

const attack = model("6341302200");
attack.safeguards.developmentCapacityCalculated = true;
assert.throws(() => publicAdapter.adaptPublicParcelPageV0(attack), /sealed non-compliance/);

const route = fs.readFileSync(path.join(root, "app/parcel-public-preview/[apn]/page.tsx"), "utf8");
assert.match(route, /parcelV2PreviewEnabled\(\)/);
assert.match(route, /adaptPublicParcelPageV0/);
assert.doesNotMatch(route, /supabase|parcel-page-v1|fetch\s*\(|selected_snapshot|capacity calculat/i);
for (const protectedFile of ["scripts/parcel-page-v2-ui/adapter.ts", "app/parcel/san-diego/[slug]/page.tsx", "lib/parcel-page-v1.ts"]) {
  assert.doesNotMatch(fs.readFileSync(path.join(root, protectedFile), "utf8"), /parcel-public-preview/);
}

console.log("PASS Public Parcel Page: bounded facts, compact base standards, split diagram, honest CTA, production SEO contract, and containment safeguards");

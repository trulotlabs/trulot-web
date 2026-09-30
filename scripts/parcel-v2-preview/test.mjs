#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

function loadTs(file) {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const loaded = new Module(file);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  loaded._compile(code, file);
  return loaded.exports;
}

const preview = loadTs(path.join(root, "lib/parcel-v2-preview.ts"));
const adapter = loadTs(path.join(root, "scripts/parcel-page-v2-ui/adapter.ts"));
const renderer = loadTs(path.join(root, "scripts/parcel-page-v2-ui/renderer.ts"));

// The route is off unless the opt-in and a development/test runtime are both present.
assert.equal(preview.parcelV2PreviewEnabled({ NODE_ENV: "development" }), false);
assert.equal(preview.parcelV2PreviewEnabled({ NODE_ENV: "test" }), false);
assert.equal(preview.parcelV2PreviewEnabled({ TRULOT_PARCEL_V2_PREVIEW: "1", NODE_ENV: "development" }), true);
assert.equal(preview.parcelV2PreviewEnabled({ TRULOT_PARCEL_V2_PREVIEW: "1", NODE_ENV: "test" }), true);
assert.equal(preview.parcelV2PreviewEnabled({ TRULOT_PARCEL_V2_PREVIEW: "1", NODE_ENV: "production" }), false);
assert.equal(preview.parcelV2PreviewEnabled({ TRULOT_PARCEL_V2_PREVIEW: "true", NODE_ENV: "development" }), false);

const corpus = JSON.parse(fs.readFileSync(path.join(root, "data/parcel-intelligence-v2/fixture-results.json"), "utf8"));
assert.equal(corpus.fixture_count, 30);
for (const entry of corpus.results) {
  const loaded = preview.loadParcelV2PreviewResult(entry.result.identity.apn);
  assert.equal(loaded.state, "ready");
  assert.equal(loaded.fixtureId, entry.fixture_id);
  assert.equal(loaded.result.fingerprint_sha256, entry.result.fingerprint_sha256);
}

const scenarios = {
  canonical: ["6341302200", "3506320400", "4304211000"],
  ambiguous_zoning: ["4303410600"],
  unmapped_zoning: ["7600360300"],
  coastal_boundary: ["3082980200", "3527702600", "3515710700"],
  missing_address: ["3031701800", "6782511200"],
  source_unavailable: ["7600300100"],
  non_rs_single_zone: ["5470501600", "5891700512"],
};
for (const apns of Object.values(scenarios)) {
  for (const apn of apns) assert.equal(preview.loadParcelV2PreviewResult(apn).state, "ready", apn);
}
assert.deepEqual(preview.loadParcelV2PreviewResult("9999999999"), { state: "not_found" });
assert.deepEqual(preview.loadParcelV2PreviewResult("not-an-apn"), { state: "not_found" });

// Missing secondary evidence retains the sealed identity and fails values closed.
const sourceUnavailable = preview.loadParcelV2PreviewResult("7600300100");
assert.equal(sourceUnavailable.state, "ready");
const unavailableModel = adapter.adaptParcelIntelligenceV2(sourceUnavailable.result);
assert.equal(unavailableModel.header.apn, "7600300100");
assert.equal(unavailableModel.orientation.zoningState, "unavailable");
assert.match(renderer.renderParcelPageV2Fragment(unavailableModel), /APN 7600300100[\s\S]*Source currently unavailable/);

// The application fragment is the exact Packet 20 product body, not a second renderer.
for (const apn of scenarios.canonical) {
  const loaded = preview.loadParcelV2PreviewResult(apn);
  const model = adapter.adaptParcelIntelligenceV2(loaded.result);
  const fragment = renderer.renderParcelPageV2Fragment(model);
  const standalone = renderer.renderParcelPageV2(model);
  assert.ok(standalone.includes(fragment));
  assert.match(fragment, /At a glance/);
  assert.match(fragment, /Development capacity: Not evaluated yet/);
}

// A single-byte fixture change is rejected before any result can be rendered.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "trulot-preview-corrupt-"));
const corrupt = path.join(temp, "fixture-results.json");
const fixtureBytes = fs.readFileSync(path.join(root, "data/parcel-intelligence-v2/fixture-results.json"));
fs.writeFileSync(corrupt, Buffer.concat([fixtureBytes, Buffer.from(" ")]));
assert.throws(
  () => preview.loadParcelV2PreviewResult("6341302200", corrupt),
  /fixture seal does not match/,
);
fs.rmSync(temp, { recursive: true, force: true });

// Containment: no V1, Supabase, external API, or legacy calculation path is reachable.
const routeFile = path.join(root, "app/parcel-v2-preview/[apn]/page.tsx");
const loaderFile = path.join(root, "lib/parcel-v2-preview.ts");
const routeSource = fs.readFileSync(routeFile, "utf8");
const loaderSource = fs.readFileSync(loaderFile, "utf8");
for (const source of [routeSource, loaderSource]) {
  assert.doesNotMatch(source, /parcel-page-v1|supabase|fetch\s*\(|legacy density|adu|capacity calculat|selected_snapshot|parcel_serving_v2/i);
}
assert.match(loaderSource, /data\/parcel-intelligence-v2\/fixture-results\.json/);
assert.match(routeSource, /renderParcelPageV2Fragment/);
assert.match(routeSource, /notFound\(\)/);
assert.match(routeSource, /Preview data not available for this parcel/);

for (const file of ["app/parcel/san-diego/[slug]/page.tsx", "app/parcel/[apn]/page.tsx", "lib/parcel-page-v1.ts", "app/layout.tsx", "app/page.tsx", "app/sitemap.ts", "app/robots.ts"]) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  assert.doesNotMatch(source, /parcel-v2-preview/);
}

const sensitive = fs.readFileSync(path.join(root, "data/parcel-intelligence-v2/fixture-results.json"), "utf8");
assert.doesNotMatch(sensitive, /-----BEGIN|password|service_role|SUPABASE_ACCESS_TOKEN|postgres(?:ql)?:\/\//i);

console.log(`PASS Parcel V2 preview: ${corpus.fixture_count} sealed fixtures, explicit gate, fail-closed loader, no legacy fallback`);

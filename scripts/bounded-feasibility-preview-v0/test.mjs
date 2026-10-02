#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const preview = loadTs(path.join(root, "lib/bounded-feasibility-preview.ts"));

// Explicit opt-in and non-production runtime are both required.
assert.equal(preview.feasibilityPreviewEnabled({ NODE_ENV: "development" }), false);
assert.equal(preview.feasibilityPreviewEnabled({ NODE_ENV: "test" }), false);
assert.equal(preview.feasibilityPreviewEnabled({ NODE_ENV: "development", TRULOT_FEASIBILITY_PREVIEW: "1" }), true);
assert.equal(preview.feasibilityPreviewEnabled({ NODE_ENV: "test", TRULOT_FEASIBILITY_PREVIEW: "1" }), true);
assert.equal(preview.feasibilityPreviewEnabled({ NODE_ENV: "production", TRULOT_FEASIBILITY_PREVIEW: "1" }), false);
assert.equal(preview.feasibilityPreviewEnabled({ NODE_ENV: "development", TRULOT_FEASIBILITY_PREVIEW: "true" }), false);

assert.equal(preview.normalizePreviewMode("rs"), "rs");
assert.equal(preview.normalizePreviewMode("rm"), "rm");
assert.equal(preview.normalizePreviewMode("private"), "private");
assert.equal(preview.normalizePreviewMode("blocked"), "blocked");
assert.equal(preview.normalizePreviewMode("unknown"), "rs");

const rs = preview.loadFeasibilityPreview("rs", root);
const rm = preview.loadFeasibilityPreview("rm", root);
const privateProject = preview.loadFeasibilityPreview("private", root);
const blocked = preview.loadFeasibilityPreview("blocked", root);

assert.equal(rs.apn, "6341302200");
assert.equal(rs.overall_state, "PARTIAL_EVALUATION");
assert.equal(rs.rule_results.filter((item) => item.result_state === "MEETS_BASE_RULE").length, 4);
assert.equal(rs.rule_results.filter((item) => item.result_state === "CONDITIONAL").length, 3);
assert.equal(rs.rule_results.filter((item) => item.result_state === "NOT_APPLICABLE").length, 1);
assert.equal(rs.rule_results.filter((item) => item.result_state === "NEEDS_EVIDENCE").length, 1);

assert.equal(rm.apn, "5442140600");
assert.equal(rm.scope, "PUBLIC_PARCEL");
assert.equal(rm.private_plan_facts_present, false);
assert.match(JSON.stringify(rm), /RM-2-5/);
assert.match(JSON.stringify(rm), /1\.35/);
assert.match(JSON.stringify(rm), /40 ft/);

for (const publicPayload of [rs, rm]) {
  const text = JSON.stringify(publicPayload);
  assert.doesNotMatch(text, /PRJ-|PRIVATE_AUTHORIZED|sheet_provenance|source_sha256|\/Users\//i);
  assert.equal(publicPayload.privacy, "PUBLIC");
  assert.ok(publicPayload.provenance.every((item) => item.privacy === "PUBLIC_AUTHORITY"));
}

assert.equal(privateProject.project_id, "PRJ-1111087");
assert.equal(privateProject.privacy, "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX");
assert.equal(privateProject.public_cache, false);
assert.equal(privateProject.public_index, false);
assert.equal(privateProject.rule_results[0].scope, "PROJECT_COMPARISON");
assert.equal(blocked.rule_results.every((item) => item.result_state === "NEEDS_EVIDENCE"), true);
assert.doesNotMatch(JSON.stringify(blocked), /sensitivity/i);

// Contract failures are explicit and fail closed.
assert.throws(() => preview.validateFeasibilityPreviewPayload({}), /contract version/i);
const unknownState = clone(rs);
unknownState.rule_results[0].result_state = "LIKELY";
assert.throws(() => preview.validateFeasibilityPreviewPayload(unknownState), /unknown product state/i);
const missingBlocker = clone(blocked);
missingBlocker.rule_results[0].blocker_codes = [];
assert.throws(() => preview.validateFeasibilityPreviewPayload(missingBlocker), /missing a blocker/i);
const privateInPublic = clone(privateProject);
privateInPublic.scope = "PUBLIC_PARCEL";
privateInPublic.privacy = "PUBLIC";
assert.throws(() => preview.validateFeasibilityPreviewPayload(privateInPublic), /private evidence/i);
const unsupportedAction = clone(rs);
unsupportedAction.actions.push("ORDER_SURVEY");
assert.throws(() => preview.validateFeasibilityPreviewPayload(unsupportedAction), /unsupported action/i);
const renderer = JSON.parse(fs.readFileSync(path.join(root, "data/bounded-feasibility-product-contract-v0/renderer-contract.json"), "utf8"));
delete renderer.templates.NEEDS_EVIDENCE;
assert.throws(() => preview.validateTemplateCatalog(renderer), /template is missing/i);

// One-byte fixture changes cannot render.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "trulot-feasibility-preview-"));
const dataDir = path.join(temp, "data/bounded-feasibility-product-contract-v0");
fs.mkdirSync(dataDir, { recursive: true });
for (const { file } of Object.values(preview.FEASIBILITY_PREVIEW_FIXTURES)) {
  fs.copyFileSync(path.join(root, "data/bounded-feasibility-product-contract-v0", file), path.join(dataDir, file));
}
fs.copyFileSync(path.join(root, "data/bounded-feasibility-product-contract-v0/renderer-contract.json"), path.join(dataDir, "renderer-contract.json"));
fs.appendFileSync(path.join(dataDir, "rs-6341302200-replay.json"), " ");
assert.throws(() => preview.loadFeasibilityPreview("rs", temp), /seal does not match/i);
fs.rmSync(temp, { recursive: true, force: true });

const route = fs.readFileSync(path.join(root, "app/feasibility-preview/page.tsx"), "utf8");
const component = fs.readFileSync(path.join(root, "app/feasibility-preview/FeasibilityPreview.tsx"), "utf8");
const loader = fs.readFileSync(path.join(root, "lib/bounded-feasibility-preview.ts"), "utf8");
assert.match(route, /feasibilityPreviewEnabled\(\)/);
assert.match(route, /notFound\(\)/);
assert.match(route, /robots:\s*\{\s*index:\s*false/);
assert.match(route, /Preview contract rejected/);
assert.match(component, /What TruLot knows/);
assert.match(component, /Evidence and sources/);
assert.match(component, /Private project analysis/);
assert.match(component, /Not for public indexing/);
assert.doesNotMatch(`${route}\n${component}\n${loader}`, /supabase|fetch\s*\(|parcel-page-v1|selected_snapshot|development capacity calculat/i);

for (const file of ["app/page.tsx", "app/layout.tsx", "app/sitemap.ts", "app/robots.ts", "app/parcel/san-diego/[slug]/page.tsx", "lib/parcel-page-v1.ts"]) {
  assert.doesNotMatch(fs.readFileSync(path.join(root, file), "utf8"), /feasibility-preview/);
}

const forbidden = /\b(buildable|can build|\d+\s+units allowed|fully compliant|zoning compliant|existing structure legal|qualifies for ADU bonus)\b/i;
for (const payload of [rs, rm, privateProject, blocked]) {
  for (const item of payload.rule_results) assert.doesNotMatch(`${item.answer} ${item.why}`, forbidden);
}

const screenshotManifest = {
  "public-rs-desktop.png": "92af28b2f18bf16b12fcf5d9613924cbd3fd159917f860b94e1fb5fc0954e3cc",
  "public-rs-mobile.png": "9658b85f00a523a74b3580e30abba32aa2f7061881a11b979a6776322f8be668",
  "public-rs-rear-setback-expanded.png": "75ad1a61100d8b40a0f58c4d6efb19b3c89b0e321e57dee7db7131193d65f0d6",
  "public-rm-desktop.png": "7bb663f7683bc6f9bd06a6da76880f763e3924d670aaacd93c5d753111e33cd1",
  "public-rm-mobile.png": "ba43e8a89aff0763ca70382ae31b9f48ce6badec5783da8e766dc75e65a4c2e6",
  "public-rm-sda-context-expanded.png": "8faa29334b50e918e49b2794351dfdccc7fb995ce0ea390edb17cfa250e2c010",
  "private-project-desktop.png": "c1975c24cc7ee366db10f0726f1ea536b311478e8ffd6195f903df63099c24d6",
  "private-project-mobile.png": "64d5d8f7dff36018aa4b0a69daa75c977a12da93cfab029a7e72bb10725e44e4",
  "private-project-status-expanded.png": "3c28891ce184d1f17869ce75c0499173a5ffe7d31ef6a91f5946323d9861b2af",
  "height-far-blocked-desktop.png": "fe30c66b97b7918cdb03e987172dfd66ea83815edd6b3d7c594ae3ad0afd48e0",
};
for (const [name, expected] of Object.entries(screenshotManifest)) {
  const bytes = fs.readFileSync(path.join(root, "data/bounded-feasibility-preview-v0/review-evidence", name));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, name);
}

console.log("PASS Packet 60 preview: sealed contract payloads, route gate, deterministic states, public/private containment, failure-state rejection");

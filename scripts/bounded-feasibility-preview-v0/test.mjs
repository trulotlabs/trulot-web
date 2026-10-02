#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
Module._extensions[".ts"] = (loaded, file) => loaded._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: file }).outputText, file);
const require = Module.createRequire(import.meta.url);
const preview = require(path.join(root, "lib/bounded-feasibility-preview.ts"));
const presentation = require(path.join(root, "lib/feasibility-preview-presentation.ts"));
const clone = (value) => JSON.parse(JSON.stringify(value));

assert.equal(preview.feasibilityPreviewEnabled({ NODE_ENV: "development" }), false);
assert.equal(preview.feasibilityPreviewEnabled({ NODE_ENV: "test" }), false);
assert.equal(preview.feasibilityPreviewEnabled({ NODE_ENV: "development", TRULOT_FEASIBILITY_PREVIEW: "1" }), true);
assert.equal(preview.feasibilityPreviewEnabled({ NODE_ENV: "test", TRULOT_FEASIBILITY_PREVIEW: "1" }), true);
assert.equal(preview.feasibilityPreviewEnabled({ NODE_ENV: "production", TRULOT_FEASIBILITY_PREVIEW: "1" }), false);
assert.equal(preview.feasibilityPreviewEnabled({ NODE_ENV: "development", TRULOT_FEASIBILITY_PREVIEW: "true" }), false);

for (const mode of ["rs", "rm", "private", "blocked"]) assert.equal(preview.normalizePreviewMode(mode), mode);
assert.equal(preview.normalizePreviewMode("unknown"), "rs");

const bundles = Object.fromEntries(["rs", "rm", "private", "blocked"].map((mode) => [mode, preview.loadFeasibilityPreview(mode, root)]));
const { payload: rs, templates } = bundles.rs;
const rm = bundles.rm.payload;
const privateProject = bundles.private.payload;
const blocked = bundles.blocked.payload;

assert.equal(rs.contract_version, preview.CONTRACT_VERSION);
assert.equal(rs.items.filter((item) => item.result_state === "MEETS_BASE_RULE").length, 4);
assert.equal(rs.items.find((item) => item.rule_family === "STREET_SIDE_SETBACK").result_state, "NOT_APPLICABLE");
assert.equal(rs.items.find((item) => item.rule_family === "REAR_SETBACK").exact_calculation, "235.02 ft lot depth × 10% = 23.502 ft");
assert.equal(rm.items.find((item) => item.rule_family === "BASE_ZONING").item_kind, "FACT");
assert.equal(rm.items.find((item) => item.context_type === "SDA").context_state, "MAPPED_VERIFICATION_PENDING");
assert.equal(privateProject.project_context.application_date, "January 29, 2024");
assert.equal(privateProject.items[0].comparison_scope, "THIS_DIMENSION_ONLY");
assert.equal(blocked.items.filter((item) => item.item_kind === "RULE").every((item) => item.result_state === "CONDITIONAL"), true);
assert.equal(blocked.items.filter((item) => item.item_kind === "COMPARISON").every((item) => item.result_state === "NEEDS_EVIDENCE"), true);

for (const payload of [rs, rm]) {
  const text = JSON.stringify(payload);
  assert.doesNotMatch(text, /PRJ-|PRIVATE_AUTHORIZED|private plan|source_sha256|\/Users\//i);
  assert.equal(payload.project_context, null);
  assert.equal(payload.privacy, "PUBLIC");
}

for (const payload of [rs, rm, privateProject, blocked]) {
  const targets = new Set(payload.items.map((item) => item.item_id));
  if (payload.project_context) targets.add(payload.project_context.target_id);
  const summary = presentation.buildSummary(payload);
  const links = summary.flatMap((group) => group.items);
  assert.ok(links.length > 0);
  for (const item of links) assert.ok(targets.has(item.target), `${item.target} must resolve`);
  for (const item of payload.items) {
    assert.ok(item.evidence_entries.length > 0);
    assert.equal(presentation.renderItemAnswer(item, templates), item.answer);
  }
}

assert.throws(() => preview.validateFeasibilityPreviewPayload({}, templates), /contract version|unknown field/i);
for (const [field, bad, pattern] of [
  ["item_kind", "MYSTERY", /item kind/i], ["result_state", "LIKELY", /product state/i],
  ["comparison_scope", "WHOLE_PROJECT", /comparison scope/i], ["template_key", "UNKNOWN", /template/i],
]) {
  const candidate = clone(rs); candidate.items[0][field] = bad;
  assert.throws(() => preview.validateFeasibilityPreviewPayload(candidate, templates), pattern);
}
const badSummary = clone(rs); badSummary.items[0].summary_entries[0].group = "SUCCESS";
assert.throws(() => preview.validateFeasibilityPreviewPayload(badSummary, templates), /summary group/i);
const badEvidenceType = clone(rs); badEvidenceType.items[0].evidence_entries[0].type = "SCREENSHOT";
assert.throws(() => preview.validateFeasibilityPreviewPayload(badEvidenceType, templates), /evidence type/i);
const missingEvidence = clone(rs); missingEvidence.items[0].evidence_entries = [];
assert.throws(() => preview.validateFeasibilityPreviewPayload(missingEvidence, templates), /meaningful evidence/i);
const missingBlocker = clone(blocked); missingBlocker.items.find((item) => item.result_state === "NEEDS_EVIDENCE").blocker = null;
assert.throws(() => preview.validateFeasibilityPreviewPayload(missingBlocker, templates), /missing a blocker/i);
const privateInPublic = clone(privateProject); privateInPublic.scope = "PUBLIC_PARCEL"; privateInPublic.privacy = "PUBLIC";
assert.throws(() => preview.validateFeasibilityPreviewPayload(privateInPublic, templates), /private evidence|public scope/i);
const badAction = clone(rs); badAction.actions = [{ type: "LINK", label: "Review", destination: null }];
assert.throws(() => preview.validateFeasibilityPreviewPayload(badAction, templates), /missing a destination/i);
const badTemplates = JSON.parse(fs.readFileSync(path.join(root, "data/bounded-feasibility-product-contract-v0/renderer-contract.json"), "utf8")); delete badTemplates.templates.NEEDS_EVIDENCE;
assert.throws(() => preview.validateTemplateCatalog(badTemplates), /unknown field|invalid/i);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "trulot-feasibility-preview-"));
const dataDir = path.join(temp, "data/bounded-feasibility-product-contract-v0"); fs.mkdirSync(dataDir, { recursive: true });
for (const { file } of Object.values(preview.FEASIBILITY_PREVIEW_FIXTURES)) fs.copyFileSync(path.join(root, "data/bounded-feasibility-product-contract-v0", file), path.join(dataDir, file));
fs.copyFileSync(path.join(root, "data/bounded-feasibility-product-contract-v0/renderer-contract.json"), path.join(dataDir, "renderer-contract.json"));
fs.appendFileSync(path.join(dataDir, preview.FEASIBILITY_PREVIEW_FIXTURES.rs.file), " ");
assert.throws(() => preview.loadFeasibilityPreview("rs", temp), /seal does not match/i);
fs.rmSync(temp, { recursive: true, force: true });

const route = fs.readFileSync(path.join(root, "app/feasibility-preview/page.tsx"), "utf8");
const component = fs.readFileSync(path.join(root, "app/feasibility-preview/FeasibilityPreview.tsx"), "utf8");
const loader = fs.readFileSync(path.join(root, "lib/bounded-feasibility-preview.ts"), "utf8");
assert.match(route, /feasibilityPreviewEnabled\(\)/); assert.match(route, /notFound\(\)/); assert.match(route, /robots:\s*\{\s*index:\s*false/); assert.match(route, /Preview contract rejected/);
assert.match(component, /What TruLot knows/); assert.match(component, /Evidence and sources/); assert.match(component, /payload\.subject/); assert.match(component, /payload\.base_facts/); assert.match(component, /payload\.project_context/);
assert.doesNotMatch(`${route}\n${component}\n${loader}`, /supabase|fetch\s*\(|parcel-page-v1|selected_snapshot|development capacity calculat/i);
for (const file of ["app/page.tsx", "app/layout.tsx", "app/sitemap.ts", "app/robots.ts", "app/parcel/san-diego/[slug]/page.tsx", "lib/parcel-page-v1.ts"]) assert.doesNotMatch(fs.readFileSync(path.join(root, file), "utf8"), /feasibility-preview/);

const forbidden = /\b(buildable|can build|\d+\s+units allowed|fully compliant|zoning compliant|existing structure legal|qualifies for ADU bonus)\b/i;
for (const payload of [rs, rm, privateProject, blocked]) for (const item of payload.items) assert.doesNotMatch(`${item.answer} ${item.explanation}`, forbidden);

const evidenceDir = path.join(root, "data/bounded-feasibility-preview-v0/review-evidence");
const screenshotManifest = {
  "public-rs-desktop.png": "275a8c636798f3cdc4ea65bb1e08ab1dea7074ef87d8b4f8e555d36b6cd6caff",
  "public-rs-mobile.png": "44bd74db7b9a3afd096121ed3ddd47e52a6677366f71eaa85f5e8b34e4567f5e",
  "public-rs-rear-setback-expanded.png": "738a27e6735fe9350269f6e0b1a791ae637ef11c9004bf632e08fa5c89525dd6",
  "public-rm-desktop.png": "64c6c347b5999d8b31be226ea8cd13a479f57a1de38acf8c0380a5da4634c65b",
  "public-rm-mobile.png": "a4645fed25ddf1256d71fc523c743d107ac0c03eb76b6a37bb847215c667b0c7",
  "public-rm-sda-context-expanded.png": "082e813d1fd47e89d3b32a59ffb3c607407a195ccbff7aa032179ee2f1c78f97",
  "private-project-desktop.png": "049673b4a9bc21776c9619bc5af47a01f3b298e8da5d574b406ed85b49069636",
  "private-project-mobile.png": "340a93570f370e042e74c628e221cb9d278933cd901cea1644708f5c3a041f21",
  "private-project-status-expanded.png": "89e2463fe6602d1244bc8c94cfe4a6063944f3f51dd3dd8d782e2fbdd4c42e05",
  "height-far-blocked-desktop.png": "37e7014088ca177e0b2a806f1bcf3a73edf66972687152666048ccaa3e8425d9",
};
const evidenceReadme = fs.readFileSync(path.join(evidenceDir, "README.md"), "utf8");
for (const [name, expected] of Object.entries(screenshotManifest)) {
  const actual = createHash("sha256").update(fs.readFileSync(path.join(evidenceDir, name))).digest("hex");
  assert.equal(actual, expected, name); assert.match(evidenceReadme, new RegExp(`${name.replaceAll(".", "\\.")}[^\\n]+${expected}`));
}

console.log("PASS Packet 60 preview: sealed V1 contract payloads, hard gate, data-driven summaries/evidence, containment, and fail-closed validation");

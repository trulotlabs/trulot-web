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
const schema = preview.loadFeasibilitySchema(root);
const rm = bundles.rm.payload;
const privateProject = bundles.private.payload;
const blocked = bundles.blocked.payload;

assert.equal(rs.contract_version, preview.CONTRACT_VERSION);
const unsafeV1 = clone(rs); unsafeV1.contract_version = "bounded-feasibility-product-contract-v1-2026-10-02-p60c";
assert.throws(() => preview.validateFeasibilityPreviewPayload(unsafeV1, templates, schema), /constant/i);
assert.equal(rs.items.filter((item) => item.result_state === "MEETS_BASE_RULE").length, 4);
assert.equal(rs.items.find((item) => item.rule_family === "STREET_SIDE_SETBACK").result_state, "NOT_APPLICABLE");
assert.equal(rs.items.find((item) => item.rule_family === "REAR_SETBACK").exact_calculation, "235.02 ft lot depth × 10% = 23.502 ft");
assert.equal(rm.items.find((item) => item.rule_family === "BASE_ZONING").item_kind, "FACT");
assert.equal(rm.items.find((item) => item.context_type === "SDA").context_state, "MAPPED_VERIFICATION_PENDING");
assert.equal(privateProject.project_context.application_date, "2024-01-29");
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

assert.throws(() => preview.validateFeasibilityPreviewPayload({}, templates, schema));
for (const [field, bad] of [
  ["item_kind", "MYSTERY"], ["result_state", "LIKELY"],
  ["comparison_scope", "WHOLE_PROJECT"], ["template_key", "UNKNOWN"],
]) {
  const candidate = clone(rs); candidate.items[0][field] = bad;
  assert.throws(() => preview.validateFeasibilityPreviewPayload(candidate, templates, schema));
}
const badSummary = clone(rs); badSummary.items[0].summary_entries = [{ group: "MEETS_BASE_RULE", label: "Producer override" }];
assert.throws(() => preview.validateFeasibilityPreviewPayload(badSummary, templates, schema), /unknown field/i);
const badEvidenceType = clone(rs); badEvidenceType.items[0].evidence_entries[0].type = "SCREENSHOT";
assert.throws(() => preview.validateFeasibilityPreviewPayload(badEvidenceType, templates, schema));
const missingEvidence = clone(rs); missingEvidence.items[0].evidence_entries = [];
assert.throws(() => preview.validateFeasibilityPreviewPayload(missingEvidence, templates, schema));
const missingBlocker = clone(blocked); missingBlocker.items.find((item) => item.result_state === "NEEDS_EVIDENCE").blocker = null;
assert.throws(() => preview.validateFeasibilityPreviewPayload(missingBlocker, templates, schema));
const privateInPublic = clone(privateProject); privateInPublic.scope = "PUBLIC_PARCEL"; privateInPublic.privacy = "PUBLIC";
assert.throws(() => preview.validateFeasibilityPreviewPayload(privateInPublic, templates, schema), /public scope/i);
const badAction = clone(rs); badAction.actions = [{ type: "LINK", label: "Review", destination: null }];
assert.throws(() => preview.validateFeasibilityPreviewPayload(badAction, templates, schema));
const badTemplates = JSON.parse(fs.readFileSync(path.join(root, "data/bounded-feasibility-product-contract-v0/renderer-contract.json"), "utf8")); delete badTemplates.templates.NEEDS_EVIDENCE;
assert.throws(() => preview.validateTemplateCatalog(badTemplates), /unknown field|invalid/i);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "trulot-feasibility-preview-"));
const dataDir = path.join(temp, "data/bounded-feasibility-product-contract-v0"); fs.mkdirSync(dataDir, { recursive: true });
for (const { file } of Object.values(preview.FEASIBILITY_PREVIEW_FIXTURES)) fs.copyFileSync(path.join(root, "data/bounded-feasibility-product-contract-v0", file), path.join(dataDir, file));
fs.copyFileSync(path.join(root, "data/bounded-feasibility-product-contract-v0/renderer-contract.json"), path.join(dataDir, "renderer-contract.json"));
fs.copyFileSync(path.join(root, "data/bounded-feasibility-product-contract-v0/schema.json"), path.join(dataDir, "schema.json"));
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
  "public-rs-desktop.png": "8f8fb02f9b50355e18401690292a99840d1417bb31d5f376f956152e1971d620",
  "public-rs-mobile.png": "d2c8f9041a801deffca8cb6e1d535a36230d6c7a120af94b102f2837d068d963",
  "public-rs-rear-setback-expanded.png": "64f30af0ee0dcf0451d3174075258fda7102db31f0e1d4ef2a46a10398f2e249",
  "public-rm-desktop.png": "811ab0f02a3e7728b9364a169f0946cfd56e7fc5926dd9a302f7407b4d69ba34",
  "public-rm-mobile.png": "e4a7e2aae5a991296a89d1ddce225dd0e3abda92afaab3239b147e05c7f0c604",
  "public-rm-sda-context-expanded.png": "c41ae200c65f9b918497bcf1cf062976a984ab4b50b89ad791f99624ff3dc78b",
  "private-project-desktop.png": "e5d0ac731474e0b7c2d706f753010cb60f0eb2c7aa37fb97edbdf7d3bea884b8",
  "private-project-mobile.png": "edc92aafa57eb80b6744cbd036a87f8844ed7ebd15d3b6549434c09688ecf1a5",
  "private-project-status-expanded.png": "02b8324d305e13bd0f2d864d95914e9b2e89ba70f370da2f4b636f4834de2ea6",
  "height-far-blocked-desktop.png": "b85baaa741a8f6883e6022d9f0338bf6cde45db8719d26b2c5726c7aeed0e8ee",
};
const evidenceReadme = fs.readFileSync(path.join(evidenceDir, "README.md"), "utf8");
for (const [name, expected] of Object.entries(screenshotManifest)) {
  const actual = createHash("sha256").update(fs.readFileSync(path.join(evidenceDir, name))).digest("hex");
  assert.equal(actual, expected, name); assert.match(evidenceReadme, new RegExp(`${name.replaceAll(".", "\\.")}[^\\n]+${expected}`));
}

console.log("PASS Packet 60 preview: sealed V2 contract payloads, hard gate, derived summaries/evidence, containment, and fail-closed validation");

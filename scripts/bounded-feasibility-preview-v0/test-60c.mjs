#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
Module._extensions[".ts"] = (loaded, file) => loaded._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: file }).outputText, file);
const require = Module.createRequire(import.meta.url);
const preview = require(path.join(root, "lib/bounded-feasibility-preview.ts"));
const presentation = require(path.join(root, "lib/feasibility-preview-presentation.ts"));
const clone = (value) => JSON.parse(JSON.stringify(value));
const renderer = preview.loadFeasibilityRenderer(root); const schema = preview.loadFeasibilitySchema(root);
const load = (mode) => preview.loadFeasibilityPreview(mode, root).payload;
const validate = (payload) => preview.validateFeasibilityPreviewPayload(payload, renderer.templates, schema);
const refresh = (item) => { item.answer = presentation.renderItemAnswer(item, renderer.templates); };
const retarget = (payload, prefix) => { for (const [index, item] of payload.items.entries()) item.item_id = `${prefix}-${index + 1}`; };

const syntheticRs = clone(load("rs"));
syntheticRs.subject = { eyebrow: "Synthetic parcel test", title: "88 Test Avenue", detail: "APN 0000000001 · R-SYN · Coastal status pending" };
syntheticRs.base_facts = [{ fact_id: "zone", label: "Base zone identified", value: "R-SYN" }, { fact_id: "coastal", label: "Coastal context", value: "Pending verification" }, { fact_id: "scope", label: "Evidence scope", value: "Synthetic test evidence" }];
retarget(syntheticRs, "synthetic-rs");
const rear = syntheticRs.items.find((item) => item.rule_family === "REAR_SETBACK");
Object.assign(rear, { display_requirement: "19.7 ft current calculated rule; 12 ft table base", base_requirement: "12 ft", derived_requirement: "19.7 ft", exact_calculation: "197.04 ft × 10% = 19.704 ft", precision: { exact_value: 19.704, display_value: 19.7, decimal_places: 1, unit: "ft" } }); rear.template_values.requirement = "19.7 ft";
const input = rear.evidence_entries.find((entry) => entry.type === "COMPARISON_INPUT"); input.value = "197.04 ft × 10% = 19.704 ft; displayed as 19.7 ft; 12 ft is the table base"; input.measurements = [{ kind: "FACT", value: 197.04, unit: "ft" }, { kind: "EXACT", value: 19.704, unit: "ft" }, { kind: "DISPLAY", value: 19.7, unit: "ft" }, { kind: "REQUIREMENT", value: 12, unit: "ft" }]; refresh(rear);
assert.match(presentation.renderItemAnswer(validate(syntheticRs).items.find((item) => item.rule_family === "REAR_SETBACK"), renderer.templates), /19\.7 ft/);

const syntheticRm = clone(load("rm")); syntheticRm.subject = { eyebrow: "Synthetic parcel test", title: "91 Example Road", detail: "APN 0000000002 · RM-SYN · Coastal context unknown" }; retarget(syntheticRm, "synthetic-rm");
const zone = syntheticRm.items.find((item) => item.rule_family === "BASE_ZONING"); zone.template_values.fact = "RM-SYN"; zone.display_fact = "RM-SYN mapped zone"; refresh(zone);
const sda = syntheticRm.items.find((item) => item.context_type === "SDA"); Object.assign(sda, { template_key: "NO_MAPPED_CONTEXT", context_state: "NO_MAPPED_INTERSECTION", mapped_observation: false, verification_state: "NO_INTERSECTION", eligibility_state: "NOT_EVALUATED", regulatory_use_state: "CONTEXT_ONLY", template_values: { name: "Sustainable Development Area (SDA)" }, display_fact: "No mapped intersection recorded" }); refresh(sda);
assert.match(presentation.renderItemAnswer(validate(syntheticRm).items.find((item) => item.context_type === "SDA"), renderer.templates), /No mapped/);

const syntheticPrivate = clone(load("private")); syntheticPrivate.subject = { eyebrow: "Synthetic private analysis", title: "CASE-9002", detail: "Synthetic private fixture · Not for public indexing" }; syntheticPrivate.project_context.project_id = "CASE-9002"; syntheticPrivate.project_context.status_code = "REFERENCE_SHEETS_APPROVAL_NOT_VERIFIED"; syntheticPrivate.project_context.application_date = "2026-02-03"; syntheticPrivate.project_context.target_id = "synthetic-project-status"; retarget(syntheticPrivate, "synthetic-private");
const validatedPrivate = validate(syntheticPrivate); assert.equal(validatedPrivate.project_context.project_id, "CASE-9002"); assert.equal(presentation.formatApplicationDate(validatedPrivate.project_context.application_date), "February 3, 2026");

const actionPayload = clone(load("rs")); actionPayload.actions = [{ type: "LINK", label: "Read the source", destination: "https://example.test/source" }, { type: "INSTRUCTION", label: "Bring a current survey to review", destination: null }]; assert.equal(validate(actionPayload).actions.length, 2);
const unsafeAction = clone(actionPayload); unsafeAction.actions[0].destination = "javascript:alert(1)"; assert.throws(() => validate(unsafeAction), /unsafe/i);

for (const mutate of [(p) => { p.items[0].item_kind = "UNKNOWN"; }, (p) => { p.items[0].result_state = "LIKELY"; }, (p) => { p.items[0].summary_entries = []; }, (p) => { p.items[0].evidence_entries[0].type = "UNKNOWN"; }, (p) => { p.items[0].comparison_scope = "WHOLE_PROJECT"; }, (p) => { p.items[0].template_key = "UNKNOWN"; }]) { const candidate = clone(load("rs")); mutate(candidate); assert.throws(() => validate(candidate)); }

const rendererFiles = ["app/feasibility-preview/FeasibilityPreview.tsx", "lib/feasibility-preview-presentation.ts"].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
for (const identifier of ["6341302200", "5442140600", "PRJ-1111087", "RS17_", "RM25_", "P50_"]) assert.doesNotMatch(rendererFiles, new RegExp(identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), identifier);
assert.doesNotMatch(rendererFiles, /cardCopy|summariesFor|producer.*summary/i); assert.match(rendererFiles, /item\.evidence_entries/); assert.match(rendererFiles, /buildSummary\(payload\)/); assert.match(rendererFiles, /payload\.project_context/);
console.log("PASS Packet 60C: generic synthetic payloads, derived summaries, precision, closed enums, evidence completeness, and example-ID scan");

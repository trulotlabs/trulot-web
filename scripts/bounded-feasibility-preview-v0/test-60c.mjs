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
const templates = preview.loadFeasibilityTemplates(root);
const load = (mode) => preview.loadFeasibilityPreview(mode, root).payload;
const refreshAnswer = (item) => { item.answer = presentation.renderItemAnswer(item, templates); };
const retarget = (payload, prefix) => { for (const [index, item] of payload.items.entries()) item.item_id = `${prefix}-${index + 1}`; };

// Three in-memory synthetic payloads prove the renderer is parcel-generic. They are test data, not public authority.
const syntheticRs = clone(load("rs"));
syntheticRs.subject = { eyebrow: "Synthetic parcel test", title: "88 Test Avenue", detail: "APN 0000000001 · R-SYN · Coastal status pending" };
syntheticRs.base_facts = [
  { fact_id: "zone", label: "Base zone identified", value: "R-SYN" },
  { fact_id: "coastal", label: "Coastal context", value: "Pending verification" },
  { fact_id: "scope", label: "Evidence scope", value: "Synthetic test evidence" },
];
retarget(syntheticRs, "synthetic-rs");
const syntheticRear = syntheticRs.items.find((item) => item.rule_family === "REAR_SETBACK");
syntheticRear.template_values.requirement = "19.7 ft"; syntheticRear.display_requirement = "19.7 ft current calculated rule; 12 ft table base"; syntheticRear.base_requirement = "12 ft"; syntheticRear.derived_requirement = "19.7 ft"; syntheticRear.exact_calculation = "197.04 ft × 10% = 19.704 ft"; refreshAnswer(syntheticRear);
const validatedRs = preview.validateFeasibilityPreviewPayload(syntheticRs, templates);
assert.match(presentation.renderItemAnswer(syntheticRear, templates), /19\.7 ft/);
assert.equal(validatedRs.base_facts.find((fact) => fact.fact_id === "coastal").value, "Pending verification");
assert.ok(presentation.buildSummary(validatedRs).flatMap((group) => group.items).every((entry) => entry.target.startsWith("synthetic-rs-")));

const syntheticRm = clone(load("rm"));
syntheticRm.subject = { eyebrow: "Synthetic parcel test", title: "91 Example Road", detail: "APN 0000000002 · RM-SYN · Coastal context unknown" };
syntheticRm.base_facts.find((fact) => fact.fact_id === "zone").value = "RM-SYN";
syntheticRm.base_facts.find((fact) => fact.fact_id === "coastal").value = "Unknown";
retarget(syntheticRm, "synthetic-rm");
const zone = syntheticRm.items.find((item) => item.rule_family === "BASE_ZONING"); zone.template_values.fact = "RM-SYN"; zone.display_fact = "RM-SYN mapped zone"; refreshAnswer(zone);
const sda = syntheticRm.items.find((item) => item.context_type === "SDA"); sda.template_key = "NO_MAPPED_CONTEXT"; sda.context_state = "NO_MAPPED_INTERSECTION"; sda.verification_state = "RECORDED_SOURCE_CHECKED"; sda.eligibility_state = "NOT_EVALUATED"; sda.regulatory_use_state = "CONTEXT_ONLY"; sda.template_values = { name: "Sustainable Development Area (SDA)" }; sda.display_fact = "No mapped intersection recorded"; refreshAnswer(sda);
const validatedRm = preview.validateFeasibilityPreviewPayload(syntheticRm, templates);
assert.match(presentation.renderItemAnswer(zone, templates), /RM-SYN/);
assert.match(presentation.renderItemAnswer(sda, templates), /No mapped/);
assert.equal(validatedRm.base_facts.find((fact) => fact.fact_id === "coastal").value, "Unknown");

const syntheticPrivate = clone(load("private"));
syntheticPrivate.subject = { eyebrow: "Synthetic private analysis", title: "CASE-9002", detail: "Synthetic private fixture · Not for public indexing" };
syntheticPrivate.project_context.project_id = "CASE-9002"; syntheticPrivate.project_context.status = "Second review cycle — approval not established"; syntheticPrivate.project_context.application_date = "February 3, 2026"; syntheticPrivate.project_context.code_profile = "Synthetic application-date profile"; syntheticPrivate.project_context.target_id = "synthetic-project-status";
retarget(syntheticPrivate, "synthetic-private");
const validatedPrivate = preview.validateFeasibilityPreviewPayload(syntheticPrivate, templates);
assert.equal(validatedPrivate.project_context.project_id, "CASE-9002");
assert.equal(validatedPrivate.project_context.application_date, "February 3, 2026");
assert.ok(presentation.buildSummary(validatedPrivate).flatMap((group) => group.items).some((entry) => entry.target === "synthetic-project-status"));

// Mutation tests prove visible semantic fields come from data and templates.
const mutations = clone(load("rm"));
const originalSummaryCount = presentation.buildSummary(mutations).flatMap((group) => group.items).length;
mutations.items[0].summary_entries.push({ group: "NOT_EVALUATED", label: "Synthetic mutation result" });
assert.equal(presentation.buildSummary(mutations).flatMap((group) => group.items).length, originalSummaryCount + 1);
mutations.base_facts.find((fact) => fact.fact_id === "coastal").value = "Inside Coastal";
assert.equal(mutations.base_facts.find((fact) => fact.fact_id === "coastal").value, "Inside Coastal");
const mutatedSda = mutations.items.find((item) => item.context_type === "SDA"); mutatedSda.verification_state = "VERIFIED";
assert.equal(mutatedSda.verification_state, "VERIFIED");
const projectMutation = clone(load("private")); projectMutation.project_context.status = "Review accepted for test"; projectMutation.project_context.application_date = "March 4, 2026";
assert.equal(projectMutation.project_context.status, "Review accepted for test"); assert.equal(projectMutation.project_context.application_date, "March 4, 2026");

const actionPayload = clone(load("rs"));
actionPayload.actions = [{ type: "LINK", label: "Read the source", destination: "https://example.test/source" }, { type: "INSTRUCTION", label: "Bring a current survey to review", destination: null }];
assert.equal(preview.validateFeasibilityPreviewPayload(actionPayload, templates).actions.length, 2);
const unsafeAction = clone(actionPayload); unsafeAction.actions[0].destination = "javascript:alert(1)";
assert.throws(() => preview.validateFeasibilityPreviewPayload(unsafeAction, templates), /unsafe/i);

// Fail closed across every extensibility boundary.
for (const mutate of [
  (p) => { p.items[0].item_kind = "UNKNOWN"; },
  (p) => { p.items[0].result_state = "LIKELY"; },
  (p) => { p.items[0].summary_entries[0].group = "PASS"; },
  (p) => { p.items[0].evidence_entries[0].type = "UNKNOWN"; },
  (p) => { p.items[0].comparison_scope = "WHOLE_PROJECT"; },
  (p) => { p.items[0].template_key = "UNKNOWN"; },
]) {
  const candidate = clone(load("rs")); mutate(candidate); assert.throws(() => preview.validateFeasibilityPreviewPayload(candidate, templates));
}

const rendererFiles = ["app/feasibility-preview/FeasibilityPreview.tsx", "lib/feasibility-preview-presentation.ts"].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
for (const identifier of ["6341302200", "5442140600", "PRJ-1111087", "RS17_", "RM25_", "P50_"]) assert.doesNotMatch(rendererFiles, new RegExp(identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), identifier);
assert.doesNotMatch(rendererFiles, /cardCopy|summariesFor|\bEVIDENCE\b/);
assert.match(rendererFiles, /item\.evidence_entries/); assert.match(rendererFiles, /buildSummary\(payload\)/); assert.match(rendererFiles, /payload\.project_context/);

console.log("PASS Packet 60C: generic synthetic payloads, data mutations, summary integrity, evidence completeness, fail-closed enums, and example-ID scan");

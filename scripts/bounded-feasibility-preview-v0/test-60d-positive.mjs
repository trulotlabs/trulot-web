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
const renderer = preview.loadFeasibilityRenderer(root);
const schema = preview.loadFeasibilitySchema(root);
const load = (mode) => clone(preview.loadFeasibilityPreview(mode, root).payload);
const validate = (payload) => preview.validateFeasibilityPreviewPayload(payload, renderer.templates, schema);
const refresh = (item) => { item.answer = presentation.renderItemAnswer(item, renderer.templates); };

const rs = validate(load("rs"));
const rm = validate(load("rm"));
const privateProject = validate(load("private"));
const blocked = validate(load("blocked"));

assert.ok(rm.items.some((item) => item.item_kind === "FACT"));
assert.ok(rs.items.some((item) => item.result_state === "MEETS_BASE_RULE"));
assert.ok(rs.items.some((item) => item.result_state === "CONDITIONAL"));
assert.ok(blocked.items.some((item) => item.result_state === "NEEDS_EVIDENCE"));
assert.ok(rs.items.some((item) => item.result_state === "NOT_APPLICABLE"));
assert.ok(rm.items.some((item) => item.result_state === "NOT_EVALUATED"));
assert.ok(rm.items.some((item) => item.context_state === "MAPPED_VERIFICATION_PENDING"));
assert.ok(rm.items.some((item) => item.context_state === "MAPPED_VERIFIED"));
assert.ok(privateProject.items.some((item) => item.comparison_scope === "THIS_DIMENSION_ONLY"));

const failed = load("rs");
const failedItem = failed.items.find((item) => item.result_state === "MEETS_BASE_RULE");
failedItem.result_state = "DOES_NOT_MEET_BASE_RULE";
failedItem.template_key = "COMPARISON_DOES_NOT_MEET";
failedItem.comparison.fact_value = 4000;
failedItem.display_fact = "4,000 sq ft Code-defined area";
const failedInput = failedItem.evidence_entries.find((entry) => entry.type === "COMPARISON_INPUT");
failedInput.value = "5,000 sq ft minimum; exact Code-defined area 4,000 sq ft";
failedInput.measurements = [{ kind: "REQUIREMENT", value: 5000, unit: "sq ft" }, { kind: "FACT", value: 4000, unit: "sq ft" }];
refresh(failedItem);
const validFailed = validate(failed);
assert.ok(presentation.buildSummary(validFailed).find((group) => group.group === "DOES_NOT_MEET_BASE_RULE").items.some((entry) => entry.target === failedItem.item_id));
assert.equal(presentation.deriveStateLabel(failedItem), "Does not meet base rule");

const unavailable = load("rm");
const unavailableItem = unavailable.items.find((item) => item.context_type === "SDA");
Object.assign(unavailableItem, { context_state: "SOURCE_UNAVAILABLE", mapped_observation: null, verification_state: "SOURCE_UNAVAILABLE", eligibility_state: "SOURCE_UNAVAILABLE", regulatory_use_state: "SOURCE_UNAVAILABLE", template_key: "SOURCE_UNAVAILABLE", template_values: { name: "Sustainable Development Area (SDA)" } });
unavailableItem.evidence_entries.push({ type: "BLOCKER_EVIDENCE", label: "Source status", value: "Authoritative source unavailable", privacy: "PUBLIC_AUTHORITY", source_date: null, measurements: [], project_status_code: null });
refresh(unavailableItem); unavailable.overall_state = "SOURCE_UNAVAILABLE";
assert.equal(validate(unavailable).overall_state, "SOURCE_UNAVAILABLE");

const noIntersection = load("rm");
const noItem = noIntersection.items.find((item) => item.context_type === "SDA");
Object.assign(noItem, { context_state: "NO_MAPPED_INTERSECTION", mapped_observation: false, verification_state: "NO_INTERSECTION", eligibility_state: "NOT_EVALUATED", regulatory_use_state: "CONTEXT_ONLY", template_key: "NO_MAPPED_CONTEXT", template_values: { name: "Sustainable Development Area (SDA)" } });
refresh(noItem); validate(noIntersection);

const existing = load("private"); existing.scope = "EXISTING_STRUCTURE"; existing.items[0].comparison_scope = "EXISTING_STRUCTURE"; existing.items[0].evidence_entries.push({ type: "PRIVATE_SURVEY", label: "Current survey", value: "Survey-controlled setback evidence", privacy: "PRIVATE_AUTHORIZED_EVIDENCE", source_date: "Surveyed September 1, 2026", measurements: [], project_status_code: null }); validate(existing);

const outside = load("rs");
for (const item of outside.items.filter((candidate) => candidate.result_state !== null)) { item.result_state = "OUTSIDE_CURRENT_SCOPE"; item.comparison = null; item.blocker = null; item.template_key = "OUTSIDE_CURRENT_SCOPE"; item.template_values = { name: item.name }; refresh(item); }
outside.overall_state = "OUTSIDE_CURRENT_SCOPE"; validate(outside);

assert.deepEqual(preview.VALIDATION_ORDER, ["STRUCTURAL_SCHEMA", "SEMANTIC_INVARIANTS", "SCOPE_PRIVACY", "COMPARATOR_ARITHMETIC", "DETERMINISTIC_TEMPLATE", "EVIDENCE_TYPE_REQUIREMENTS", "EVIDENCE_VALUE_CONSISTENCY", "PRECISION_ROUNDING", "PROJECT_STATUS_EVIDENCE"]);
console.log("PASS Packet 60D positive semantics: fact, success, failure, conditional, blockers, applicability, context, source, existing-structure, and private comparison");

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
const renderer = preview.loadFeasibilityRenderer(root); const schema = preview.loadFeasibilitySchema(root);
const clone = (value) => JSON.parse(JSON.stringify(value));
const load = (mode) => clone(preview.loadFeasibilityPreview(mode, root).payload);
const validate = (payload) => preview.validateFeasibilityPreviewPayload(payload, renderer.templates, schema);
const refresh = (item) => { item.answer = presentation.renderItemAnswer(item, renderer.templates); };
const firstComparison = (payload) => payload.items.find((item) => item.result_state === "MEETS_BASE_RULE" && item.item_kind === "COMPARISON");
const setInput = (item, comparator, requirement, fact, qualifier) => { item.comparison = { comparator, requirement_value: requirement, fact_value: fact, unit: "sq ft" }; item.display_requirement = `${requirement} sq ft ${qualifier}`; item.display_fact = `${fact} sq ft`; item.template_values.requirement = `${requirement} sq ft ${qualifier}`; const entry = item.evidence_entries.find((value) => value.type === "COMPARISON_INPUT"); entry.value = `${requirement} sq ft ${qualifier}; ${fact} sq ft fact`; entry.measurements = [{ kind: "REQUIREMENT", value: requirement, unit: "sq ft" }, { kind: "FACT", value: fact, unit: "sq ft" }]; refresh(item); };

const cases = [
  ["MIN_FALSE_MARKED_MEETS", "COMPARISON_DIRECTION", () => { const p = load("rs"); setInput(firstComparison(p), "MIN", 5000, 4000, "minimum"); return p; }],
  ["MIN_TRUE_MARKED_FAILS", "COMPARISON_DIRECTION", () => { const p = load("rs"); const i = firstComparison(p); i.result_state = "DOES_NOT_MEET_BASE_RULE"; i.template_key = "COMPARISON_DOES_NOT_MEET"; refresh(i); return p; }],
  ["MAX_FALSE_MARKED_MEETS", "COMPARISON_DIRECTION", () => { const p = load("rs"); setInput(firstComparison(p), "MAX", 5000, 6000, "maximum"); return p; }],
  ["MAX_TRUE_MARKED_FAILS", "COMPARISON_DIRECTION", () => { const p = load("rs"); const i = firstComparison(p); setInput(i, "MAX", 5000, 4000, "maximum"); i.result_state = "DOES_NOT_MEET_BASE_RULE"; i.template_key = "COMPARISON_DOES_NOT_MEET"; refresh(i); return p; }],
  ["DISPLAY_REQUIREMENT_EVIDENCE_MISMATCH", "DISPLAY_REQUIREMENT_MISMATCH", () => { const p = load("rs"); firstComparison(p).display_requirement = "6,000 sq ft minimum"; return p; }],
  ["PUBLIC_PROJECT_CONCLUSION", "PUBLIC_SCOPE_CONCLUSIVE", () => { const p = load("rs"); firstComparison(p).comparison_scope = "PROJECT_SPECIFIC"; return p; }],
  ["PUBLIC_EXISTING_CONCLUSION", "PUBLIC_SCOPE_CONCLUSIVE", () => { const p = load("rs"); firstComparison(p).comparison_scope = "EXISTING_STRUCTURE"; return p; }],
  ["MAP_ONLY_ELIGIBILITY", "ELIGIBILITY_EVIDENCE_REQUIRED", () => { const p = load("rm"); const i = p.items.find((item) => item.context_type === "SDA"); Object.assign(i, { context_state: "MAPPED_VERIFIED", verification_state: "VERIFIED", eligibility_state: "ELIGIBLE", regulatory_use_state: "APPLIES", template_key: "MAPPED_CONTEXT" }); i.evidence_entries.push({ type: "VERIFICATION_RECORD", label: "Verification", value: "Source verified", privacy: "PUBLIC_AUTHORITY", source_date: "Verified October 2, 2026", measurements: [], project_status_code: null }); refresh(i); return p; }],
  ["ISSUED_WITHOUT_ISSUANCE_EVIDENCE", "PROJECT_STATUS_CONFLICT", () => { const p = load("private"); p.project_context.status_code = "CITY_ISSUED"; return p; }],
  ["CONCLUSIVE_WITHOUT_MEASUREMENTS", "COMPARISON_MEASUREMENTS_REQUIRED", () => { const p = load("rs"); firstComparison(p).evidence_entries.find((entry) => entry.type === "COMPARISON_INPUT").measurements = []; return p; }],
  ["EXACT_CALCULATION_WITHOUT_PRECISION", "PRECISION_REQUIRED", () => { const p = load("rs"); p.items.find((item) => item.rule_family === "REAR_SETBACK").precision = null; return p; }],
  ["DISPLAY_EXACT_EVIDENCE_MISMATCH", "PRECISION_VALUE_MISMATCH", () => { const p = load("rs"); const i = p.items.find((item) => item.rule_family === "REAR_SETBACK"); i.display_requirement = "19.7 ft current calculated rule; 13 ft table base"; i.derived_requirement = "19.7 ft"; return p; }],
];

for (const [name, expectedCode, make] of cases) {
  assert.throws(() => validate(make()), (error) => error?.code === expectedCode, `${name} must fail with ${expectedCode}`);
}
console.log(`PASS Packet 60E reviewer probes: ${cases.length} contradictions rejected with intended validator codes`);

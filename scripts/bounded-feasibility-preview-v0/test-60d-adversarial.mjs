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
const clone = (value) => JSON.parse(JSON.stringify(value));
const templates = preview.loadFeasibilityTemplates(root);
const schema = preview.loadFeasibilitySchema(root);
const load = (mode) => clone(preview.loadFeasibilityPreview(mode, root).payload);
const validate = (payload) => preview.validateFeasibilityPreviewPayload(payload, templates, schema);
const item = (payload, predicate) => payload.items.find(predicate);

const cases = [
  ["fact-success-badge-and-summary", () => { const p = load("rm"); const i = item(p, (x) => x.item_kind === "FACT"); i.state_label = "Meets base rule"; i.summary_entries = [{ group: "MEETS_BASE_RULE", label: "Base zone" }]; return p; }],
  ["context-success-badge-and-summary", () => { const p = load("rm"); const i = item(p, (x) => x.context_type === "SDA"); i.state_label = "Meets base rule"; i.summary_entries = [{ group: "MEETS_BASE_RULE", label: "SDA" }]; return p; }],
  ["pending-context-claims-verified-eligible-applies", () => { const p = load("rm"); const i = item(p, (x) => x.context_type === "SDA"); i.verification_state = "VERIFIED"; i.eligibility_state = "ELIGIBLE"; i.regulatory_use_state = "APPLIES"; return p; }],
  ["not-applicable-in-success-summary", () => { const p = load("rs"); item(p, (x) => x.result_state === "NOT_APPLICABLE").summary_entries = [{ group: "MEETS_BASE_RULE", label: "Street-side setback" }]; return p; }],
  ["conditional-with-success-badge", () => { const p = load("rs"); item(p, (x) => x.result_state === "CONDITIONAL").state_label = "Meets base rule"; return p; }],
  ["failed-result-with-positive-semantics", () => { const p = load("rs"); const i = item(p, (x) => x.result_state === "MEETS_BASE_RULE"); i.result_state = "DOES_NOT_MEET_BASE_RULE"; return p; }],
  ["blocked-payload-claims-base-evaluated", () => { const p = load("blocked"); p.overall_state = "BASE_PARCEL_RULES_EVALUATED"; return p; }],
  ["arbitrary-approved-project-status", () => { const p = load("private"); p.project_context.status_code = "Approved — permit issued"; return p; }],
  ["existing-structure-public-privacy-bypass", () => { const p = load("private"); p.scope = "EXISTING_STRUCTURE"; p.privacy = "PUBLIC"; p.items.forEach((i) => { i.privacy = "PUBLIC"; i.evidence_entries.forEach((e) => { e.privacy = "PUBLIC_AUTHORITY"; }); }); p.provenance.forEach((e) => { e.privacy = "PUBLIC_AUTHORITY"; }); return p; }],
  ["private-evidence-type-mistagged-public", () => { const p = load("rs"); p.items[0].evidence_entries[0].type = "PRIVATE_PLAN_STATUS"; p.items[0].evidence_entries[0].privacy = "PUBLIC_AUTHORITY"; return p; }],
  ["private-project-id-hidden-in-public-subject", () => { const p = load("rs"); p.subject.title = "PRJ-9999999"; return p; }],
  ["display-derived-evidence-mismatch", () => { const p = load("rs"); const i = item(p, (x) => x.rule_family === "REAR_SETBACK"); i.display_requirement = "19.7 ft current calculated rule; 13 ft table base"; i.derived_requirement = "19.7 ft"; return p; }],
  ["evidence-text-structured-value-mismatch", () => { const p = load("rs"); const i = item(p, (x) => x.rule_family === "REAR_SETBACK"); i.evidence_entries.find((e) => e.type === "COMPARISON_INPUT").value = "19.7 ft selected calculation"; return p; }],
  ["successful-comparison-missing-input-evidence", () => { const p = load("rs"); p.items[0].evidence_entries = p.items[0].evidence_entries.filter((e) => e.type !== "COMPARISON_INPUT"); return p; }],
  ["needs-evidence-missing-blocker-evidence", () => { const p = load("blocked"); const i = item(p, (x) => x.result_state === "NEEDS_EVIDENCE"); i.evidence_entries = i.evidence_entries.filter((e) => e.type !== "BLOCKER_EVIDENCE"); return p; }],
  ["failed-result-without-failure-summary", () => { const p = load("rs"); const i = item(p, (x) => x.result_state === "MEETS_BASE_RULE"); i.result_state = "DOES_NOT_MEET_BASE_RULE"; i.template_key = "MINIMUM_COMPARISON_DOES_NOT_MEET"; i.answer = templates[i.template_key].replace("{requirement}", i.template_values.requirement).replace("{name}", i.template_values.name); i.summary_entries = []; return p; }],
  ["positive-answer-with-failed-state", () => { const p = load("rs"); item(p, (x) => x.result_state === "MEETS_BASE_RULE").result_state = "DOES_NOT_MEET_BASE_RULE"; return p; }],
  ["failed-answer-with-success-state", () => { const p = load("rs"); const i = item(p, (x) => x.result_state === "MEETS_BASE_RULE"); i.answer = `Does not meet the ${i.template_values.requirement} ${i.template_values.name} rule.`; return p; }],
  ["private-type-with-public-tag", () => { const p = load("private"); const e = p.items[0].evidence_entries.find((x) => x.type === "PRIVATE_PLAN_FACT"); e.privacy = "PUBLIC_AUTHORITY"; return p; }],
  ["not-evaluated-missing-blocker-evidence", () => { const p = load("rm"); const i = item(p, (x) => x.result_state === "NOT_EVALUATED"); i.evidence_entries = i.evidence_entries.filter((e) => e.type !== "BLOCKER_EVIDENCE"); return p; }],
  ["invalid-project-application-date", () => { const p = load("private"); p.project_context.application_date = "Approved yesterday"; return p; }],
];

const accepted = [];
for (const [name, make] of cases) {
  try { validate(make()); accepted.push(name); } catch { /* rejection is the required behavior */ }
}
assert.deepEqual(accepted, [], `Adversarial payloads accepted: ${accepted.join(", ")}`);
console.log(`PASS Packet 60D adversarial: ${cases.length} contradictory payloads rejected`);

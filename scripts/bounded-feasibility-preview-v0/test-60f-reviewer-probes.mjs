#!/usr/bin/env node
import assert from "node:assert/strict";
import { addEvidence, comparisonItem, currentSurvey, expectCode, load, measurement, presentation, setValues } from "./test-60f-helpers.mjs";

const cases = [
  ["headline requirement mismatch", "DUPLICATE_CONCLUSIVE_AUTHORITY", () => { const p = load("rs"); comparisonItem(p).template_values.requirement = "30,000 sq ft"; return p; }],
  ["headline fact mismatch", "DUPLICATE_ANSWER_AUTHORITY", () => { const p = load("private"); comparisonItem(p).answer = "The proposed 8 ft setback meets the selected rule."; return p; }],
  ["rule semantic comparator mismatch", "RULE_SEMANTIC_MISMATCH", () => { const p = load("rs"); const i = comparisonItem(p); i.comparison.rule_semantic = "MAXIMUM_LIMIT"; i.evidence_entries.find((e) => e.rule_binding).rule_binding.rule_semantic = "MAXIMUM_LIMIT"; return p; }],
  ["rule label mismatch", "RULE_LABEL_MISMATCH", () => { const p = load("rs"); comparisonItem(p).comparison.rule_label = "maximum height"; return p; }],
  ["unit mismatch", "UNIT_MISMATCH", () => { const p = load("rs"); const i = comparisonItem(p); const fact = measurement(i, i.comparison.fact_measurement_id); fact.unit = "ft"; fact.dimension = "LENGTH"; return p; }],
  ["evidence measurement mismatch", "EVIDENCE_MEASUREMENT_MISMATCH", () => { const p = load("rs"); const i = comparisonItem(p); const fact = measurement(i, i.comparison.fact_measurement_id); fact.evidence_refs = [i.evidence_entries[0].evidence_id]; return p; }],
  ["exact calculation mismatch", "EXACT_CALCULATION_MISMATCH", () => { const p = load("rs"); const i = p.items.find((x) => x.calculation); measurement(i, i.calculation.result_measurement_id).exact_value = 99; return p; }],
  ["status evidence contradiction", "STATUS_PROSE_CONTRADICTION", () => { const p = load("private"); p.items[0].evidence_entries.find((e) => e.project_status).value = "City issued"; return p; }],
  ["missing survey date", "SURVEY_DATE_REQUIRED", () => { const p = load("private"); p.scope = "EXISTING_STRUCTURE"; const i = comparisonItem(p); i.comparison_scope = "EXISTING_STRUCTURE"; addEvidence(i, { type: "PRIVATE_SURVEY", label: "Survey", value: "Current survey", source_date: null, survey_currentness: currentSurvey }); return p; }],
  ["unresolved currentness", "SURVEY_CURRENTNESS_UNRESOLVED", () => { const p = load("private"); p.scope = "EXISTING_STRUCTURE"; const i = comparisonItem(p); i.comparison_scope = "EXISTING_STRUCTURE"; addEvidence(i, { type: "PRIVATE_SURVEY", label: "Survey", value: "Survey", source_date: "Surveyed 2026-09-01", survey_currentness: { ...currentSurvey, currentness: "CURRENTNESS_UNRESOLVED" } }); return p; }],
  ["stale later-change reconciliation", "SURVEY_CURRENTNESS_UNRESOLVED", () => { const p = load("private"); p.scope = "EXISTING_STRUCTURE"; const i = comparisonItem(p); i.comparison_scope = "EXISTING_STRUCTURE"; addEvidence(i, { type: "PRIVATE_SURVEY", label: "Historical survey", value: "Historical position", source_date: "Surveyed 2020-01-01", survey_currentness: { ...currentSurvey, later_change_reconciliation: "UNRESOLVED" } }); return p; }],
  ["missing private plan fact", "PRIVATE_PLAN_FACT_REQUIRED", () => { const p = load("private"); p.items[0].evidence_entries = p.items[0].evidence_entries.filter((e) => e.type !== "PRIVATE_PLAN_FACT"); return p; }],
  ["producer-authored display unit", "DUPLICATE_CONCLUSIVE_AUTHORITY", () => { const p = load("rs"); comparisonItem(p).display_fact = "22,096 acres"; return p; }],
];
for (const [, code, make] of cases) expectCode(assert, code, make);

const near = load("rs"); const nearItem = comparisonItem(near); setValues(nearItem, 5000, 4999.6); nearItem.measurements.forEach((m) => { m.display_policy.decimal_places = 0; m.display_policy.max_decimal_places = 0; });
const rendered = presentation.deriveComparisonPresentation(nearItem);
assert.equal(rendered.resultState, "DOES_NOT_MEET_BASE_RULE");
assert.notEqual(rendered.displayRequirement, rendered.displayFact);
assert.match(rendered.displayFact, /^</);

console.log(`PASS Packet 60F reviewer probes: ${cases.length} contradictions rejected with reason-specific codes; threshold rounding remains ordered`);

#!/usr/bin/env node
import assert from "node:assert/strict";
import { addEvidence, comparisonItem, currentSurvey, expectCode, load, measurement, setValues, validate } from "./test-60f-helpers.mjs";

const factMutation = load("rs"); const factItem = comparisonItem(factMutation); setValues(factItem, 5000, 4000); assert.equal(validate(factMutation).items.find((item) => item.item_id === factItem.item_id).result_state, "DOES_NOT_MEET_BASE_RULE");
const requirementMutation = load("rs"); const requirementItem = comparisonItem(requirementMutation); setValues(requirementItem, 30000, 22096.32); assert.equal(validate(requirementMutation).items.find((item) => item.item_id === requirementItem.item_id).result_state, "DOES_NOT_MEET_BASE_RULE");
const precisionMutation = load("rs"); const precisionItem = comparisonItem(precisionMutation); setValues(precisionItem, 5000, 4999.6); precisionItem.measurements.forEach((m) => { m.display_policy.decimal_places = 0; m.display_policy.max_decimal_places = 0; }); const precisionResult = validate(precisionMutation).items.find((item) => item.item_id === precisionItem.item_id); assert.notEqual(precisionResult.display_requirement, precisionResult.display_fact);

const rejecting = [
  ["rule semantic", "RULE_SEMANTIC_MISMATCH", () => { const p = load("rs"); comparisonItem(p).comparison.rule_semantic = "MAXIMUM_LIMIT"; return p; }],
  ["unit", "UNIT_DIMENSION_MISMATCH", () => { const p = load("rs"); measurement(comparisonItem(p), comparisonItem(p).comparison.fact_measurement_id).unit = "ft"; return p; }],
  ["project status", "PROJECT_STATUS_CONFLICT", () => { const p = load("private"); p.project_context.status_code = "CITY_ISSUED"; return p; }],
  ["status evidence", "STATUS_PROSE_CONTRADICTION", () => { const p = load("private"); p.items[0].evidence_entries.find((e) => e.project_status).value = "Issuance proven"; return p; }],
  ["plan fact evidence", "PRIVATE_PLAN_FACT_REQUIRED", () => { const p = load("private"); p.items[0].evidence_entries = p.items[0].evidence_entries.filter((e) => e.type !== "PRIVATE_PLAN_FACT"); return p; }],
  ["calculation result", "EXACT_CALCULATION_MISMATCH", () => { const p = load("rs"); const i = p.items.find((x) => x.calculation); measurement(i, i.calculation.result_measurement_id).exact_value += 1; return p; }],
  ["survey date", "SURVEY_DATE_REQUIRED", () => { const p = load("private"); p.scope = "EXISTING_STRUCTURE"; p.items[0].comparison_scope = "EXISTING_STRUCTURE"; addEvidence(p.items[0], { type: "PRIVATE_SURVEY", source_date: null, survey_currentness: currentSurvey }); return p; }],
  ["survey currentness", "SURVEY_CURRENTNESS_UNRESOLVED", () => { const p = load("private"); p.scope = "EXISTING_STRUCTURE"; p.items[0].comparison_scope = "EXISTING_STRUCTURE"; addEvidence(p.items[0], { type: "PRIVATE_SURVEY", source_date: "2026-09-01", survey_currentness: { ...currentSurvey, structure_edge: "UNRESOLVED" } }); return p; }],
];
for (const [, code, make] of rejecting) expectCode(assert, code, make);
console.log(`PASS Packet 60F mutation suite: 3 authoritative-value mutations safely re-derived and ${rejecting.length} contradictions rejected`);

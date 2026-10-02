#!/usr/bin/env node
import assert from "node:assert/strict";
import { comparisonItem, expectCode, load, measurement } from "./test-60f-helpers.mjs";

const cases = [
  ["old V3 result override", "DUPLICATE_CONCLUSIVE_AUTHORITY", () => { const p = load("rs"); comparisonItem(p).result_state = "DOES_NOT_MEET_BASE_RULE"; return p; }],
  ["producer answer override", "DUPLICATE_ANSWER_AUTHORITY", () => { const p = load("rs"); comparisonItem(p).answer = "Meets something else."; return p; }],
  ["authority binding mismatch", "AUTHORITATIVE_RULE_BINDING_MISMATCH", () => { const p = load("rs"); comparisonItem(p).evidence_entries.find((e) => e.rule_binding).rule_binding.requirement_measurement_id = "wrong"; return p; }],
  ["dimension mismatch", "UNIT_DIMENSION_MISMATCH", () => { const p = load("rs"); const i = comparisonItem(p); measurement(i, i.comparison.fact_measurement_id).dimension = "LENGTH"; return p; }],
  ["issued without evidence", "PROJECT_STATUS_CONFLICT", () => { const p = load("private"); p.project_context.status_code = "CITY_ISSUED"; return p; }],
  ["calculation prose override", "DUPLICATE_CALCULATION_AUTHORITY", () => { const p = load("rs"); p.items.find((i) => i.calculation).exact_calculation = "wrong"; return p; }],
];
for (const [, code, make] of cases) expectCode(assert, code, make);
console.log(`PASS Packet 60E reviewer regression: ${cases.length} contradictions rejected with intended codes`);

#!/usr/bin/env node
import assert from "node:assert/strict";
import { clone, load, presentation, preview, renderer, schema, validate } from "./test-60f-helpers.mjs";

for (const mode of ["rs", "rm", "private", "blocked"]) {
  const source = load(mode); const hydrated = validate(source);
  for (const raw of source.items) {
    assert.equal(raw.answer, null);
    const item = hydrated.items.find((candidate) => candidate.item_id === raw.item_id);
    assert.equal(item.answer, presentation.renderItemAnswer(item, renderer.templates));
    if (!raw.comparison) continue;
    assert.equal(raw.result_state, null); assert.equal(raw.template_key, null); assert.deepEqual(raw.template_values, {}); assert.equal(raw.display_requirement, null); assert.equal(raw.display_fact, null);
    const ids = new Set(raw.measurements.map((measurement) => measurement.measurement_id)); assert.ok(ids.has(raw.comparison.requirement_measurement_id)); assert.ok(ids.has(raw.comparison.fact_measurement_id));
    const binding = raw.evidence_entries.find((entry) => entry.rule_binding)?.rule_binding; assert.deepEqual(binding, { rule_semantic: raw.comparison.rule_semantic, requirement_measurement_id: raw.comparison.requirement_measurement_id });
    const derived = presentation.deriveComparisonPresentation(item); assert.equal(item.result_state, derived.resultState); assert.equal(item.display_requirement, derived.displayRequirement); assert.equal(item.display_fact, derived.displayFact); assert.equal(item.answer, derived.answer);
  }
}

const privateSource = load("private"); const statusRaw = privateSource.items[0].evidence_entries.find((entry) => entry.project_status); assert.equal(statusRaw.value, null); const statusHydrated = validate(privateSource).items[0].evidence_entries.find((entry) => entry.project_status); assert.equal(statusHydrated.value, renderer.projectStatusLabels.SUBMITTAL_ISSUANCE_NOT_PROVEN);
const rsSource = load("rs"); const calculationRaw = rsSource.items.find((item) => item.calculation); assert.equal(calculationRaw.exact_calculation, null); assert.equal(calculationRaw.derived_requirement, null); const calculationHydrated = validate(rsSource).items.find((item) => item.calculation); assert.equal(calculationHydrated.exact_calculation, "235.02 ft lot depth × 10% = 23.502 ft");

const old = clone(rsSource); old.contract_version = "bounded-feasibility-product-contract-v3-2026-10-02-p60e"; assert.throws(() => preview.validateFeasibilityPreviewPayload(old, renderer.templates, schema), (error) => error.code === "STRUCTURAL_SCHEMA");
const serialized = JSON.stringify(rsSource); for (const legacy of ["\"comparator\"", "requirement_value", "fact_value", "project_status_code", "\"precision\""]) assert.doesNotMatch(serialized, new RegExp(legacy));
console.log("PASS Packet 60F evidence binding: canonical source is authority-free prose, all conclusive product output is deterministically hydrated, and V3 fails closed");

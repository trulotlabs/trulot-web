#!/usr/bin/env node
import assert from "node:assert/strict";
import { load, presentation, preview, setValues, comparisonItem, validate } from "./test-60f-helpers.mjs";

const rs = validate(load("rs")); const rm = validate(load("rm")); const privateProject = validate(load("private")); const blocked = validate(load("blocked"));
assert.ok(rm.items.some((item) => item.item_kind === "FACT")); assert.ok(rs.items.some((item) => item.result_state === "MEETS_BASE_RULE")); assert.ok(rs.items.some((item) => item.result_state === "CONDITIONAL")); assert.ok(blocked.items.some((item) => item.result_state === "NEEDS_EVIDENCE")); assert.ok(rs.items.some((item) => item.result_state === "NOT_APPLICABLE")); assert.ok(rm.items.some((item) => item.result_state === "NOT_EVALUATED")); assert.ok(rm.items.some((item) => item.context_state === "MAPPED_VERIFICATION_PENDING")); assert.ok(rm.items.some((item) => item.context_state === "MAPPED_VERIFIED")); assert.ok(privateProject.items.some((item) => item.comparison_scope === "THIS_DIMENSION_ONLY"));

const failed = load("rs"); const failedItem = comparisonItem(failed); setValues(failedItem, 5000, 4000); const failedValidated = validate(failed); assert.ok(presentation.buildSummary(failedValidated).find((group) => group.group === "DOES_NOT_MEET_BASE_RULE").items.some((entry) => entry.target === failedItem.item_id)); assert.equal(presentation.deriveStateLabel(failedValidated.items.find((item) => item.item_id === failedItem.item_id)), "Does not meet base rule");

const unavailable = load("rm"); const sda = unavailable.items.find((item) => item.context_type === "SDA"); Object.assign(sda, { context_state: "SOURCE_UNAVAILABLE", mapped_observation: null, verification_state: "SOURCE_UNAVAILABLE", eligibility_state: "SOURCE_UNAVAILABLE", regulatory_use_state: "SOURCE_UNAVAILABLE", template_key: "SOURCE_UNAVAILABLE", template_values: { name: "Sustainable Development Area (SDA)" } }); unavailable.overall_state = "SOURCE_UNAVAILABLE"; assert.equal(validate(unavailable).overall_state, "SOURCE_UNAVAILABLE");

assert.deepEqual(preview.VALIDATION_ORDER, ["STRUCTURAL_SCHEMA", "SEMANTIC_INVARIANTS", "SCOPE_PRIVACY", "RULE_SEMANTIC_BINDING", "COMPARISON_ARITHMETIC", "DETERMINISTIC_DERIVATION", "EVIDENCE_TYPE_REQUIREMENTS", "MEASUREMENT_REFERENCE_INTEGRITY", "UNIT_DIMENSION_BINDING", "CALCULATION_BINDING", "DISPLAY_ORDER_PRESERVATION", "PROJECT_STATUS_EVIDENCE", "EXISTING_STRUCTURE_CURRENTNESS"]);
console.log("PASS Packet 60D positive regression: fact, success/failure, conditional, blockers, context, and private scoped comparison");

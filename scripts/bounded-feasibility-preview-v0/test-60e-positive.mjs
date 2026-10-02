#!/usr/bin/env node
import assert from "node:assert/strict";
import { addEvidence, comparisonItem, currentSurvey, load, presentation, renderer, setSemantic, setValues, validate } from "./test-60f-helpers.mjs";

const outcomes = [
  ["MINIMUM_REQUIREMENT", "MINIMUM_LOT_AREA", 5000, 6000, "MEETS_BASE_RULE"],
  ["MINIMUM_REQUIREMENT", "MINIMUM_LOT_AREA", 5000, 4000, "DOES_NOT_MEET_BASE_RULE"],
  ["MAXIMUM_LIMIT", "MAXIMUM_TEST_LIMIT", 5000, 4000, "MEETS_BASE_RULE"],
  ["MAXIMUM_LIMIT", "MAXIMUM_TEST_LIMIT", 5000, 6000, "DOES_NOT_MEET_BASE_RULE"],
  ["EXACT_REQUIREMENT", "EXACT_TEST_RULE", 5000, 5000, "MEETS_BASE_RULE"],
  ["EXACT_REQUIREMENT", "EXACT_TEST_RULE", 5000, 5001, "DOES_NOT_MEET_BASE_RULE"],
];
for (const [semantic, family, requirement, fact, state] of outcomes) { const p = load("rs"); const item = comparisonItem(p); setSemantic(item, semantic, family); setValues(item, requirement, fact); assert.equal(validate(p).items.find((x) => x.item_id === item.item_id).result_state, state); }

const near = load("rs"); const nearItem = comparisonItem(near); setValues(nearItem, 5000, 4999.6); const nearValidated = validate(near); const nearResult = nearValidated.items.find((x) => x.item_id === nearItem.item_id); assert.equal(nearResult.result_state, "DOES_NOT_MEET_BASE_RULE"); assert.notEqual(nearResult.display_requirement, nearResult.display_fact);

for (const mode of ["rs", "rm", "private", "blocked"]) assert.doesNotThrow(() => validate(load(mode)));
const privateProject = validate(load("private")); assert.match(privateProject.items[0].answer, /proposed 6\.0 ft/); assert.equal(presentation.buildSummary(privateProject)[0].group, "MEETS_SELECTED_RULE");

const issued = load("private"); issued.project_context.status_code = "CITY_ISSUED"; const issuedEvidence = issued.items[0].evidence_entries.find((entry) => entry.project_status); issuedEvidence.project_status.status_code = "CITY_ISSUED"; issuedEvidence.project_status.issuance_record_id = "ISS-TEST-1"; issuedEvidence.project_status.issuance_date = "2026-09-30"; const issuedValidated = validate(issued); assert.equal(issuedValidated.project_context.status_code, "CITY_ISSUED"); assert.equal(issuedValidated.items[0].evidence_entries.find((entry) => entry.project_status).value, renderer.projectStatusLabels.CITY_ISSUED);

const existing = load("private"); existing.scope = "EXISTING_STRUCTURE"; existing.items[0].comparison_scope = "EXISTING_STRUCTURE"; addEvidence(existing.items[0], { type: "PRIVATE_SURVEY", label: "Current as-built survey", value: "Survey-controlled existing frame geometry", source_date: "Surveyed September 1, 2026", survey_currentness: currentSurvey }); assert.equal(validate(existing).items[0].result_state, "MEETS_BASE_RULE");

const needs = load("private"); needs.scope = "EXISTING_STRUCTURE"; needs.overall_state = "MORE_EVIDENCE_NEEDED"; const needsItem = needs.items[0]; needsItem.comparison = null; needsItem.result_state = "NEEDS_EVIDENCE"; needsItem.template_key = "NEEDS_EVIDENCE"; needsItem.template_values = { blocker: "A current survey tying the building frame to the property lines is needed." }; needsItem.comparison_scope = "EXISTING_STRUCTURE"; needsItem.blocker = { code: "CURRENT_SURVEY_STRUCTURE_GEOMETRY", missing: "A current survey tying the building frame to the property lines is needed.", why: "The rule does not establish existing geometry." }; addEvidence(needsItem, { type: "BLOCKER_EVIDENCE", label: "Evidence needed", value: "Current survey-controlled building-frame geometry" }); assert.equal(validate(needs).items[0].result_state, "NEEDS_EVIDENCE");

const calc = validate(load("rs")).items.find((item) => item.calculation); assert.equal(calc.exact_calculation, "235.02 ft lot depth × 10% = 23.502 ft");
console.log("PASS Packet 60E/V4 positive fixtures: minimum, maximum, exact, near-threshold, private status/fact, current structure, and exact calculation");

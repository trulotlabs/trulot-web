#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { load, root, validate } from "./test-60f-helpers.mjs";

const rs = validate(load("rs")); const rm = validate(load("rm")); const privateProject = validate(load("private")); const blocked = validate(load("blocked"));
const byFamily = (payload, family) => payload.items.filter((item) => item.rule_family === family);
assert.equal(byFamily(rm, "BASE_ZONING")[0].item_kind, "FACT"); assert.equal(rm.items.find((item) => item.context_type === "SDA").context_state, "MAPPED_VERIFICATION_PENDING"); assert.equal(rm.items.find((item) => item.context_type === "FIRE").context_state, "MAPPED_VERIFIED"); assert.equal(privateProject.items[0].comparison_scope, "THIS_DIMENSION_ONLY"); assert.equal(privateProject.items[0].result_state, "MEETS_BASE_RULE"); assert.equal(byFamily(blocked, "STRUCTURE_HEIGHT").find((item) => item.item_kind === "RULE").result_state, "CONDITIONAL"); assert.equal(byFamily(blocked, "STRUCTURE_HEIGHT").find((item) => item.item_kind === "COMPARISON").result_state, "NEEDS_EVIDENCE");
const rear = byFamily(rs, "REAR_SETBACK")[0]; assert.equal(rear.derived_requirement, "23.5 ft"); assert.equal(rear.base_requirement, "13 ft"); assert.equal(rear.exact_calculation, "235.02 ft lot depth × 10% = 23.502 ft"); assert.equal(byFamily(rs, "STREET_SIDE_SETBACK")[0].result_state, "NOT_APPLICABLE");
for (const payload of [rs, rm, privateProject, blocked]) for (const item of payload.items) { assert.ok(item.answer); assert.ok(item.evidence_entries.length); assert.ok(item.evidence_entries.every((entry) => entry.label && entry.value)); }
const component = fs.readFileSync(path.join(root, "app/feasibility-preview/FeasibilityPreview.tsx"), "utf8"); const presentation = fs.readFileSync(path.join(root, "lib/feasibility-preview-presentation.ts"), "utf8"); assert.doesNotMatch(component, /items\.slice|<button/); assert.match(component, /item\.evidence_entries\.map/); assert.match(presentation, /summaryForItem/); assert.doesNotMatch(`${component}\n${presentation}`, /cardCopy|summariesFor|COMMON_RS|BLOCKER_COPY/);
console.log("PASS Packet 60B regression: taxonomy, contexts, calculation precision, summaries, evidence, and containment remain encoded in V4");

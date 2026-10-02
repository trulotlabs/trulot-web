#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const component = read("app/feasibility-preview/FeasibilityPreview.tsx");
const presentation = read("lib/feasibility-preview-presentation.ts");
const css = read("app/feasibility-preview/feasibility-preview.module.css");
const fixtures = ["public-rs-replay.json", "public-rm-replay.json", "private-project-replay.json", "blocked-project-replay.json"].map((file) => JSON.parse(read(`data/bounded-feasibility-product-contract-v0/${file}`)));
const [rs, rm, privateProject, blocked] = fixtures;
const byFamily = (payload, family) => payload.items.filter((item) => item.rule_family === family);

assert.equal(byFamily(rm, "BASE_ZONING")[0].item_kind, "FACT");
assert.equal(byFamily(rm, "BASE_ZONING")[0].result_state, null);
assert.equal(rm.items.find((item) => item.context_type === "SDA").state_label, "Mapped context");
assert.equal(rm.items.find((item) => item.context_type === "FIRE").state_label, "Mapped context");
assert.equal(privateProject.items[0].comparison_scope, "THIS_DIMENSION_ONLY");
assert.equal(privateProject.items[0].state_label, "Meets setback rule");
assert.equal(byFamily(blocked, "STRUCTURE_HEIGHT").find((item) => item.item_kind === "RULE").result_state, "CONDITIONAL");
assert.equal(byFamily(blocked, "STRUCTURE_HEIGHT").find((item) => item.item_kind === "COMPARISON").result_state, "NEEDS_EVIDENCE");

const sda = rm.items.find((item) => item.context_type === "SDA");
assert.equal(sda.context_state, "MAPPED_VERIFICATION_PENDING");
assert.equal(sda.verification_state, "Pending");
assert.equal(sda.eligibility_state, "Not evaluated");
assert.equal(sda.regulatory_use_state, "Not used pending verification");

const rear = byFamily(rs, "REAR_SETBACK")[0];
assert.equal(rear.derived_requirement, "23.5 ft");
assert.equal(rear.base_requirement, "13 ft");
assert.equal(rear.exact_calculation, "235.02 ft lot depth × 10% = 23.502 ft");
assert.equal(byFamily(rs, "STREET_SIDE_SETBACK")[0].result_state, "NOT_APPLICABLE");

for (const payload of fixtures) {
  const targets = new Set(payload.items.map((item) => item.item_id)); if (payload.project_context) targets.add(payload.project_context.target_id);
  for (const item of payload.items) {
    assert.ok(item.evidence_entries.length > 0);
    assert.ok(item.evidence_entries.every((entry) => entry.label && entry.value));
    for (const summary of item.summary_entries) assert.ok(targets.has(item.item_id) && summary.label);
  }
}
assert.equal(privateProject.project_context.status, "Fourth construction-document submittal — issuance not proven");
assert.equal(privateProject.project_context.application_date, "January 29, 2024");
assert.match(privateProject.project_context.code_profile, /Ordinance O-21618/);

assert.doesNotMatch(component, /items\.slice|<button/); assert.doesNotMatch(css, /nth-child\(n\+4\)/);
assert.match(component, /href={`#\$\{item\.target\}`}/); assert.match(component, /item\.evidence_entries\.map/);
assert.match(component, /payload\.base_facts\.map/); assert.match(component, /project\.status/); assert.match(component, /project\.application_date/); assert.match(component, /project\.code_profile/);
assert.match(presentation, /item\.summary_entries/); assert.match(presentation, /payload\.project_context\.summary_entries/);
assert.doesNotMatch(`${component}\n${presentation}`, /cardCopy|summariesFor|COMMON_RS|BLOCKER_COPY/);

const allCopy = JSON.stringify(fixtures);
assert.match(allCopy, /Very High Fire Hazard Severity Zone \(VHFHSZ\)/);
assert.match(allCopy, /22,096 sq ft Code-defined area/);
assert.doesNotMatch(allCopy, /not accepted|numerator and denominator were not sealed|eligibility predicates|retained boundary sliver/);
assert.match(allCopy, /Private authorized evidence · excluded from public caching and indexing/);

console.log("PASS Packet 60B regression: accepted taxonomy, SDA state, rear precision, summary targets, evidence, language, and containment remain encoded in V1 data");

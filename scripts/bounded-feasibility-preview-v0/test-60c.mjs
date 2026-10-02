#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { load, measurement, presentation, root, validate } from "./test-60f-helpers.mjs";

const syntheticRs = load("rs"); syntheticRs.subject = { eyebrow: "Synthetic parcel test", title: "88 Test Avenue", detail: "APN 0000000001 · R-SYN" }; const rear = syntheticRs.items.find((item) => item.calculation); const input = measurement(rear, rear.calculation.input_measurement_id); const result = measurement(rear, rear.calculation.result_measurement_id); input.exact_value = 197.04; result.exact_value = 19.704; rear.base_requirement = "12 ft"; const rs = validate(syntheticRs); assert.equal(rs.items.find((item) => item.calculation).exact_calculation, "197.04 ft lot depth × 10% = 19.704 ft");

const syntheticRm = load("rm"); const sda = syntheticRm.items.find((item) => item.context_type === "SDA"); Object.assign(sda, { template_key: "NO_MAPPED_CONTEXT", context_state: "NO_MAPPED_INTERSECTION", mapped_observation: false, verification_state: "NO_INTERSECTION", eligibility_state: "NOT_EVALUATED", regulatory_use_state: "CONTEXT_ONLY", template_values: { name: "Sustainable Development Area (SDA)" } }); assert.match(validate(syntheticRm).items.find((item) => item.context_type === "SDA").answer, /No mapped/);

const syntheticPrivate = load("private"); syntheticPrivate.project_context.project_id = "CASE-9002"; syntheticPrivate.project_context.status_code = "REFERENCE_SHEETS_APPROVAL_NOT_VERIFIED"; syntheticPrivate.project_context.application_date = "2026-02-03"; const status = syntheticPrivate.items[0].evidence_entries.find((entry) => entry.project_status); status.project_status.plan_project_id = "CASE-9002"; status.project_status.status_code = "REFERENCE_SHEETS_APPROVAL_NOT_VERIFIED"; const privateResult = validate(syntheticPrivate); assert.equal(privateResult.project_context.project_id, "CASE-9002"); assert.equal(presentation.formatApplicationDate(privateResult.project_context.application_date), "February 3, 2026");

const actions = load("rs"); actions.actions = [{ type: "LINK", label: "Read source", destination: "https://example.test/source" }, { type: "INSTRUCTION", label: "Bring survey", destination: null }]; assert.equal(validate(actions).actions.length, 2); const unsafe = load("rs"); unsafe.actions = [{ type: "LINK", label: "Unsafe", destination: "javascript:alert(1)" }]; assert.throws(() => validate(unsafe), (error) => error.code === "ACTION_DESTINATION");

const rendererFiles = ["app/feasibility-preview/FeasibilityPreview.tsx", "lib/feasibility-preview-presentation.ts"].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n"); for (const identifier of ["6341302200", "5442140600", "PRJ-1111087", "RS17_", "RM25_", "P50_"]) assert.doesNotMatch(rendererFiles, new RegExp(identifier));
console.log("PASS Packet 60C regression: generic fixtures, derived calculations/summaries, closed actions, and renderer neutrality");

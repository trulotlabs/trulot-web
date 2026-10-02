#!/usr/bin/env node
import assert from "node:assert/strict";
import { expectCode, load } from "./test-60f-helpers.mjs";

const cases = [
  ["producer summary", "STRUCTURAL_SCHEMA", () => { const p = load("rs"); p.items[0].summary_entries = []; return p; }],
  ["context matrix", "CONTEXT_SEMANTICS", () => { const p = load("rm"); p.items.find((i) => i.context_type === "SDA").verification_state = "VERIFIED"; return p; }],
  ["overall override", "OVERALL_STATE_MISMATCH", () => { const p = load("blocked"); p.overall_state = "BASE_PARCEL_RULES_EVALUATED"; return p; }],
  ["arbitrary status", "STRUCTURAL_SCHEMA", () => { const p = load("private"); p.project_context.status_code = "Approved"; return p; }],
  ["public privacy bypass", "PRIVATE_SCOPE_PRIVACY", () => { const p = load("private"); p.scope = "EXISTING_STRUCTURE"; p.privacy = "PUBLIC"; return p; }],
  ["private evidence in public", "PUBLIC_PRIVATE_EVIDENCE", () => { const p = load("rs"); p.items[0].evidence_entries[0].type = "PRIVATE_PLAN_STATUS"; return p; }],
  ["missing comparison evidence", "EVIDENCE_MEASUREMENT_MISMATCH", () => { const p = load("rs"); p.items[0].evidence_entries = p.items[0].evidence_entries.filter((e) => e.type !== "COMPARISON_INPUT"); return p; }],
  ["missing blocker", "BLOCKER_EVIDENCE_REQUIRED", () => { const p = load("blocked"); const i = p.items.find((x) => x.result_state === "NEEDS_EVIDENCE"); i.evidence_entries = i.evidence_entries.filter((e) => e.type !== "BLOCKER_EVIDENCE"); return p; }],
];
for (const [, code, make] of cases) expectCode(assert, code, make);
console.log(`PASS Packet 60D adversarial regression: ${cases.length} semantic/privacy contradictions rejected`);

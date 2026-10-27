import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  PROPERTY_INTELLIGENCE_AUTHORITY_ORDER,
  applyHomeownerFacts,
  selectPropertyQuestions,
  toV4PropertyIntelligenceInput,
  type ComposedPropertyIntelligence,
} from "../lib/property-intelligence-composition";

const rows = gunzipSync(readFileSync("data/la-mesa-property-intelligence-composition-v0/composed-property-intelligence.ndjson.gz"))
  .toString("utf8").trim().split("\n").map((line) => JSON.parse(line) as ComposedPropertyIntelligence);
const byApn = new Map(rows.map((row) => [row.parcelIdentity.apn, row]));
const get = (apn: string) => {
  const row = byApn.get(apn);
  assert.ok(row, apn);
  return row;
};

test("authority ordering is explicit and never removes conflicts", () => {
  assert.deepEqual(PROPERTY_INTELLIGENCE_AUTHORITY_ORDER, [
    "EXPLICIT_FINALED_PERMIT_FACT", "EXPLICIT_ISSUED_CHANGE_SIGNAL", "RECORDED_ASSESSOR_CHARACTERISTIC", "OFFICIAL_OBSERVATIONAL_GEOMETRY", "USER_PROVIDED",
  ]);
  assert.ok(get("4641801100").conflicts.some((conflict) => conflict.conflictType === "LATER_CHANGE_VS_RECORDED_STATE"));
  assert.ok(get("4641801100").conflicts.some((conflict) => conflict.conflictType === "OLDER_GEOMETRY_VS_LATER_CHANGE"));
});
test("Bruce remains a bounded recorded confirmation without a footprint prompt", () => {
  const value = get("4685100900");
  assert.equal(value.preliminaryDwellingState, "SINGLE_FAMILY_LIKELY");
  assert.equal(value.currentnessState, "RECORDED_CURRENT_ENOUGH_FOR_PRESELECTION");
  assert.equal(value.recordedUnitCount, null);
  assert.deepEqual(selectPropertyQuestions(value), {
    primary: { kind: "RECORDED_CONFIRMATION", prompt: "Public property records indicate one detached residence. Is that still correct?", preselectedUse: "ONE_DETACHED_HOUSE" },
    accessory: null,
  });
});

test("finaled and active change states block stale preselection", () => {
  const finaled = get("4641801100");
  assert.equal(finaled.currentnessState, "LATER_CHANGE_OBSERVED");
  assert.equal(finaled.explicitAduPermitEvidence, "FINALED");
  assert.equal(finaled.eligibleForPreselection, false);
  assert.equal(selectPropertyQuestions(finaled).primary?.kind, "CURRENT_CONFIGURATION");
  const active = get("4944102400");
  assert.equal(active.currentnessState, "ACTIVE_CHANGE_IN_PROGRESS");
  assert.equal(toV4PropertyIntelligenceInput(active).activeChange, true);
  assert.equal(active.eligibleForPreselection, false);
});

test("expired ADU evidence is retained without completed-ADU inference", () => {
  const expired = get("4705321100");
  assert.equal(expired.permitChangeSignal, "EXPIRED_OR_WITHDRAWN_PROPOSAL");
  assert.equal(expired.explicitAduPermitEvidence, "EXPIRED_OR_WITHDRAWN");
  assert.notEqual(expired.currentnessState, "LATER_CHANGE_OBSERVED");
  assert.equal(expired.preliminaryDwellingState, "CONFLICTING");
});

test("condo, missing, and accessory cases fail closed at their exact boundaries", () => {
  const condo = get("4640203301");
  assert.equal(condo.preliminaryDwellingState, "CONDO");
  assert.equal(condo.structureObservation.stackedOrAmbiguous, true);
  assert.equal(condo.permittedEvaluationUses.PATHWAY_SELECTION, false);
  assert.equal(selectPropertyQuestions(condo).primary?.kind, "CONDO_CONFIRMATION");
  const missing = get("4640202200");
  assert.equal(missing.currentnessState, "CURRENTNESS_UNKNOWN");
  assert.equal(selectPropertyQuestions(missing).primary, null);
  const accessory = get("4635801000");
  assert.match(selectPropertyQuestions(accessory).accessory?.prompt ?? "", /Older mapping.*detached secondary structure/);
  assert.equal(accessory.explicitAduPermitEvidence, "NONE");
});

test("homeowner corrections remain user-provided and preserve recorded disagreement", () => {
  const value = applyHomeownerFacts(get("4685100900"), {
    existingUse: { value: "TWO_OR_MORE_DWELLINGS", provenance: "USER_PROVIDED" },
    aduIdea: { value: "NOT_SURE", provenance: "USER_PROVIDED" },
  });
  assert.equal(value.recordedDwellingState, "RECORDED_SINGLE_FAMILY_LIKELY");
  assert.equal(value.homeownerFacts?.existingUse.provenance, "USER_PROVIDED");
  assert.ok(value.conflicts.some((conflict) => conflict.conflictType === "HOMEOWNER_VS_RECORDED_STATE"));
  const v4 = toV4PropertyIntelligenceInput(value);
  assert.equal(v4.preliminaryDwellingState, "MULTIFAMILY_LIKELY");
  assert.equal(v4.dwellingStateProvenance, "USER_PROVIDED");
});

test("all canonical parcels compose and presentation DTOs exclude raw source records", () => {
  assert.equal(rows.length, 17391);
  assert.equal(byApn.size, 17391);
  assert.equal(rows.filter((row) => row.permitEvidenceScope === "BOUNDED_PACKET_74_COHORT").length, 50);
  assert.equal(rows.every((row) => row.permittedEvaluationUses.COMPLIANCE === false), true);
  const serialized = JSON.stringify(rows);
  assert.doesNotMatch(serialized, /nucleus_|ownerocc|mailingAddress|rawStatus|sourceGeometrySha256|representativePoint|coordinates/i);
});

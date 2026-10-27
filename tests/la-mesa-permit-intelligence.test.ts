import assert from "node:assert/strict";
import test from "node:test";
import { classifyPermit, derivePermitChangeState, linkPermitRecord, normalizePermitStatus } from "../lib/permit-intelligence";

test("permit statuses map explicitly and unknown vocabulary fails closed", () => {
  assert.equal(normalizePermitStatus("FINAL"), "FINALED_COMPLETE");
  assert.equal(normalizePermitStatus("Finaled"), "FINALED_COMPLETE");
  assert.equal(normalizePermitStatus("Inspections Complete"), "FINALED_COMPLETE");
  assert.equal(normalizePermitStatus("Finaled with CofO"), "FINALED_COMPLETE");
  assert.equal(normalizePermitStatus("WITHDRWN"), "WITHDRAWN");
  assert.equal(normalizePermitStatus("Plan Check Expired"), "EXPIRED");
  assert.equal(normalizePermitStatus("Issued"), "ISSUED");
  assert.equal(normalizePermitStatus("Withdrawn"), "WITHDRAWN");
  assert.equal(normalizePermitStatus("Approved (Closed)"), "UNKNOWN");
  assert.equal(normalizePermitStatus("new portal vocabulary"), "UNKNOWN");
});

test("taxonomy requires explicit ADU language and preserves vague remodels", () => {
  assert.deepEqual(classifyPermit({ recordType: "Accessory Dwelling Unit" }), { category: "ADU", confidence: "EXPLICIT", basis: "RECORD_TYPE" });
  assert.deepEqual(classifyPermit({ description: "Junior Accessory Dwelling Unit conversion" }), { category: "JADU", confidence: "EXPLICIT", basis: "DESCRIPTION" });
  assert.equal(classifyPermit({ description: "Convert existing garage to living space" }).category, "GARAGE_CONVERSION");
  assert.deepEqual(classifyPermit({ recordType: "Combo Building Permit", description: "Interior remodel" }), { category: "REMODEL", confidence: "DETERMINISTIC_DERIVED", basis: "DESCRIPTION" });
  assert.deepEqual(classifyPermit({ recordType: "Combo Building Permit", description: "Residential work" }), { category: "OTHER", confidence: "UNRESOLVED", basis: "NONE" });
});

test("linkage reuses canonical normalization and never forces common addresses", () => {
  const parcels = [
    { apn: "1", normalizedAddress: "6910 BRUCE CT", normalizedUnitAddress: "6910 BRUCE CT" },
    { apn: "2", normalizedAddress: "5700 BALTIMORE DR", normalizedUnitAddress: "5700 BALTIMORE DR UNIT 1" },
    { apn: "3", normalizedAddress: "5700 BALTIMORE DR", normalizedUnitAddress: "5700 BALTIMORE DR UNIT 2" },
  ];
  assert.equal(linkPermitRecord({ address: "6910 Bruce Ct, La Mesa, CA 91942" }, parcels).state, "PARCEL_LINKED");
  const group = linkPermitRecord({ address: "5700 Baltimore Dr, La Mesa, CA" }, parcels);
  assert.equal(group.state, "ADDRESS_GROUP_LINKED");
  assert.deepEqual(group.candidateApns, ["2", "3"]);
  assert.equal(linkPermitRecord({ address: "5700 Baltimore Dr #2" }, parcels).candidateApns[0], "3");
  assert.equal(linkPermitRecord({ address: "5700 Baltimore Dr, 2, La Mesa, CA" }, parcels).candidateApns[0], "3");
  assert.equal(linkPermitRecord({ address: "unknown" }, parcels).state, "UNRESOLVED");
});

test("later-change state distinguishes finaled, active, truncated, and unavailable history", () => {
  assert.equal(derivePermitChangeState({ available: true, completeness: "COMPLETE_FOR_QUERY", records: [{ category: "ADU", normalizedStatus: "FINALED_COMPLETE" }] }), "LATER_PERMIT_CHANGE_OBSERVED");
  assert.equal(derivePermitChangeState({ available: true, completeness: "COMPLETE_FOR_QUERY", records: [{ category: "ADU", normalizedStatus: "ISSUED" }] }), "ACTIVE_CHANGE_IN_PROGRESS");
  assert.equal(derivePermitChangeState({ available: true, completeness: "TRUNCATED", records: [] }), "PERMIT_HISTORY_TRUNCATED");
  assert.equal(derivePermitChangeState({ available: false, completeness: "UNKNOWN_COMPLETENESS", records: [] }), "PERMIT_HISTORY_UNKNOWN");
  assert.equal(derivePermitChangeState({ available: true, completeness: "COMPLETE_FOR_QUERY", records: [{ category: "SOLAR", normalizedStatus: "FINALED_COMPLETE" }] }), "NO_PERMIT_CHANGE_FOUND");
});

/* eslint-disable @typescript-eslint/no-explicit-any -- validator reads sealed JSON artifacts */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dir = join(root, "data/la-mesa-permit-intelligence-v0");
const read = (name: string) => JSON.parse(readFileSync(join(dir, name), "utf8"));
const integrity = read("integrity.json");
for (const [name, expected] of Object.entries(integrity.files) as Array<[string, { bytes: number; sha256: string }]>) {
  const path = join(dir, name);
  assert.equal(statSync(path).size, expected.bytes, `${name} byte count`);
  assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), expected.sha256, `${name} sha256`);
}
const cohort = read("cohort-results.json");
assert.equal(cohort.rows.length, 50);
assert.equal(new Set(cohort.rows.map((row: any) => row.apn)).size, 50);
assert.equal(cohort.metrics.successfulQueries, 50);
assert.equal(cohort.metrics.normalizedRecordCount, 825);
assert.equal(cohort.metrics.completenessRateAmongSuccessful, 1);
for (const apn of ["4685100900", "4705321100", "4641801100", "4944102400", "4640201000", "4640203301"]) {
  assert.ok(cohort.rows.some((row: any) => row.apn === apn), `required case ${apn}`);
}
const condo = cohort.rows.find((row: any) => row.apn === "4640203301");
assert.equal(condo.recordsReturned, 361);
assert.equal(condo.completeness, "PAGINATED_COMPLETE");
assert.deepEqual(condo.linkageCounts, { PARCEL_LINKED: 230, ADDRESS_GROUP_LINKED: 126, UNRESOLVED: 5 });
const cases = read("case-traces.json");
assert.equal(cases.bruceCourt.records.length, 3);
assert.match(cases.aduHint.finding.conclusion, /Plan Check Expired/);
assert.match(cases.finaledAdu.finding.conclusion, /PERMIT_DERIVED_ADU_RECORD/);
assert.equal(cases.finaledAdu.cohort.currentnessState, "LATER_PERMIT_CHANGE_OBSERVED");
assert.equal(cases.activeDevelopment.cohort.currentnessState, "ACTIVE_CHANGE_IN_PROGRESS");
assert.equal(cases.condoCommonAddress.finding.dwellingConfigurationEffect, "NO_GROUP_RECORD_INDIVIDUAL_INFERENCE");
const contract = read("source-contract.json");
assert.equal(contract.pagination.commonAddressResultCount, 361);
assert.match(contract.pagination.pageBoundaryProof, /^PASS:/);
assert.match(contract.pagination.deterministicOrdering, /^PASS:/);
assert.match(contract.pagination.moreThan100Retrievable, /^PASS:/);
assert.equal(contract.apnReturned, false);
const decision = read("decision.json");
assert.equal(decision.decision, "LA_MESA_PERMIT_INTELLIGENCE_RECON_ONLY");
const records = read("normalized-permit-records.json").records;
const statuses = new Set(["APPLIED", "UNDER_REVIEW", "ISSUED", "FINALED_COMPLETE", "EXPIRED", "WITHDRAWN", "UNKNOWN"]);
const categories = new Set(["NEW_DWELLING", "ADU", "JADU", "ADDITION", "GARAGE_CONVERSION", "ACCESSORY_BUILDING", "DEMOLITION", "REMODEL", "ELECTRICAL", "PLUMBING", "MECHANICAL", "GRADING", "RETAINING_WALL", "SOLAR", "OTHER"]);
for (const record of records) {
  assert.ok(statuses.has(record.normalizedStatus), `status ${record.normalizedStatus}`);
  assert.ok(categories.has(record.recordCategory), `category ${record.recordCategory}`);
  assert.ok(record.evidenceReference);
}
const serialized = JSON.stringify({ cohort, records, contract });
assert.doesNotMatch(serialized, /bearer\s+[a-z0-9._~-]+|access[_-]?token["'=:\s]+[a-z0-9._~-]+|password["'=:\s]+[^,}\s]+|set-cookie|authorization\s*:/i);
console.log(`Packet 74 validation PASS: ${cohort.rows.length} queries, ${cohort.metrics.normalizedRecordCount} normalized records`);

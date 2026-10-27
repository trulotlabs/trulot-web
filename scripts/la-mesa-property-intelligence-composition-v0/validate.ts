import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { selectPropertyQuestions, type ComposedPropertyIntelligence } from "../../lib/property-intelligence-composition";

const ROOT = process.cwd();
const DIR = join(ROOT, "data/la-mesa-property-intelligence-composition-v0");
const sha = (content: Buffer) => createHash("sha256").update(content).digest("hex");
const integrity = JSON.parse(readFileSync(join(DIR, "artifact-integrity.json"), "utf8")) as { composedContentSha256: string; files: Record<string, { bytes: number; sha256: string }> };
for (const [name, expected] of Object.entries(integrity.files)) {
  const content = readFileSync(join(DIR, name));
  assert.equal(content.byteLength, expected.bytes, name);
  assert.equal(sha(content), expected.sha256, name);
}
const content = gunzipSync(readFileSync(join(DIR, "composed-property-intelligence.ndjson.gz")));
assert.equal(sha(content), integrity.composedContentSha256);
const rows = content.toString("utf8").trim().split("\n").map((line) => JSON.parse(line) as ComposedPropertyIntelligence);
assert.equal(rows.length, 17391);
assert.equal(new Set(rows.map((row) => row.parcelIdentity.apn)).size, 17391);
assert.deepEqual(new Set(rows.map((row) => row.parcelIdentity.jurisdiction)), new Set(["CITY_OF_LA_MESA"]));
assert.equal(rows.filter((row) => row.permitEvidenceScope === "BOUNDED_PACKET_74_COHORT").length, 50);
assert.equal(rows.filter((row) => selectPropertyQuestions(row).accessory !== null).length, 2110);
assert.equal(rows.every((row) => row.permittedEvaluationUses.COMPLIANCE === false), true);
const serialized = JSON.stringify(rows);
assert.doesNotMatch(serialized, /nucleus_|ownerocc|mailingAddress|rawStatus|sourceGeometrySha256|representativePoint|coordinates/i);
assert.doesNotMatch(serialized, /Bearer\s+|BEGIN .*PRIVATE KEY|password["']?\s*:/i);
const cases = JSON.parse(readFileSync(join(DIR, "case-results.json"), "utf8")).cases;
assert.equal(cases.bruceCourt.composition.currentnessState, "RECORDED_CURRENT_ENOUGH_FOR_PRESELECTION");
assert.equal(cases.finaledAdu.composition.currentnessState, "LATER_CHANGE_OBSERVED");
assert.equal(cases.activeDevelopment.composition.currentnessState, "ACTIVE_CHANGE_IN_PROGRESS");
assert.equal(cases.expiredAdu.composition.explicitAduPermitEvidence, "EXPIRED_OR_WITHDRAWN");
assert.equal(cases.condo.composition.preliminaryDwellingState, "CONDO");
assert.equal(cases.missingData.questions.primary, null);
assert.match(cases.accessoryStructure.questions.accessory.prompt, /Older mapping/);
console.log("Packet 76 composition validation: PASS");

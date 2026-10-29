import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { searchParcelLookup, type ParcelLookupRecord } from "../../lib/parcel-lookup-contract.ts";
import {
  answerRealUserPilotSession,
  startRealUserPilotSession,
} from "../../lib/san-diego-real-user-pilot-core.ts";

const root = process.cwd();
const corpus = JSON.parse(await readFile(join(root, "data/parcel-lookup-v0/corpus.json"), "utf8"));
const records = corpus.records as ParcelLookupRecord[];

for (const [query, expectedApn] of [["1456 27TH ST", "6341302200"], ["639 N 67TH ST", "5442140600"]]) {
  const result = searchParcelLookup(records, query, { maximumResults: 10 });
  assert.equal(result.state, "EXACT_MATCH");
  assert.equal(result.candidates[0]?.record.apn, expectedApn);
}
const duplicate = searchParcelLookup(records, "1501 FRONT ST", { maximumResults: 10 });
assert.equal(duplicate.state, "MULTIPLE_MATCHES");
assert.ok(duplicate.candidates.length > 1);

const benchmarkCases = [
  ["27th", "6341302200"],
  ["67th", "5442140600"],
  ["multifamily", "2735701200"],
  ["condo", "2672311001"],
  ["active-adu", "2692122900"],
  ["expired-adu", "2672413900"],
] as const;

for (const [name, apn] of benchmarkCases) {
  const session = await startRealUserPilotSession({ sessionId: `ux-${name}`, apn, organizationId: "packet-103a" });
  assert.doesNotMatch(session.questions.join(" "), /dwelling-state|taxonomy|pathway/i);
  const answered = await answerRealUserPilotSession({
    sessionId: `ux-${name}`,
    organizationId: "packet-103a",
    confirmation: name === "active-adu" ? "NOT_SURE" : "YES",
    projectIntent: name === "multifamily" ? "MULTIPLE_ADUS" : "GENERAL",
  });
  const visible = JSON.stringify(answered.result);
  assert.doesNotMatch(visible, /multifamily pathway|single-family pathway|LATER_CHANGE_OBSERVED|COMMON_PARCEL|PRJ-/i);
  assert.ok(answered.result.nextAction);
  assert.ok(Array.isArray(answered.result.whatYouToldUs));
}

const multifamily = await startRealUserPilotSession({ sessionId: "plain-multi", apn: "2735701200", organizationId: "packet-103a" });
assert.match(multifamily.questions[0], /more than one dwelling unit/i);
const condo = await startRealUserPilotSession({ sessionId: "plain-condo", apn: "2672311001", organizationId: "packet-103a" });
assert.match(condo.questions[0], /condominium property/i);
const multipleAdu = await answerRealUserPilotSession({ sessionId: "plain-multi", organizationId: "packet-103a", confirmation: "YES", projectIntent: "MULTIPLE_ADUS" });
assert.equal(multipleAdu.projectIntent, "MULTIPLE_ADUS");
assert.doesNotMatch(multipleAdu.result.preliminaryGuidance, /pathway/i);

await startRealUserPilotSession({ sessionId: "reset-a", apn: "6341302200", organizationId: "packet-103a" });
await answerRealUserPilotSession({ sessionId: "reset-a", organizationId: "packet-103a", confirmation: "NO", existingUse: "TWO_OR_MORE_DWELLINGS", projectIntent: "DETACHED_ADU" });
const parcelB = await startRealUserPilotSession({ sessionId: "reset-b", apn: "5442140600", organizationId: "packet-103a" });
assert.equal(parcelB.confirmation, null);
assert.equal(parcelB.projectIntent, null);
assert.deepEqual(parcelB.result.whatYouToldUs, []);

const client = await readFile(join(root, "app/private/san-diego-feasibility-pilot/pilot-client.tsx"), "utf8");
assert.match(client, /useState\(false\)[\s\S]*Use APN instead/);
assert.match(client, /useApn \? "10-digit APN" : "Property address"/);
for (const copy of [
  "Use APN instead",
  "Start over",
  "This helps TruLot choose the right rules to review.",
  "What are you thinking about building?",
  "Add multiple ADUs",
  "I&apos;m not sure — show me what&apos;s possible",
  "What TruLot knows",
  "What you told us",
  "What still needs confirmation",
  "What this means so far",
  "Next best step",
]) assert.ok(client.includes(copy), copy);
for (const participantQuestion of ["Was this clear?", "Did you trust the result?", "What would you want to do next?", "Anything confusing or wrong?"]) {
  assert.equal(client.split(participantQuestion).length - 1, 1, participantQuestion);
}
for (const hiddenTaxonomy of ["Confusion category", "Trust signal", "Question burden", "Data-quality source"]) assert.doesNotMatch(client, new RegExp(hiddenTaxonomy, "i"));
assert.doesNotMatch(client, /multifamily pathway|single-family pathway/i);

console.log("Packet 103A address selection, plain-language benchmarks, multiple-ADU intent, reset isolation, and simplified feedback: PASS");

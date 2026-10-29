import assert from "node:assert/strict";

import {
  answerRealUserPilotSession,
  realUserPilotMetrics,
  recordRealUserPilotObservation,
  startRealUserPilotSession,
} from "../../lib/san-diego-real-user-pilot-core.ts";

const organizationA = "packet-103-org-a";
const organizationB = "packet-103-org-b";
const sharedSessionId = "packet-103-shared-session";

const first = await startRealUserPilotSession({
  sessionId: sharedSessionId,
  apn: "6341302200",
  organizationId: organizationA,
});
assert.equal(first.sessionId, sharedSessionId);
assert.equal(first.result.headline, "Preliminary feasibility review");

// The same anonymous session identifier in another organization has an
// independent property-intelligence session and independent metrics.
const isolated = await startRealUserPilotSession({
  sessionId: sharedSessionId,
  apn: "5442140600",
  organizationId: organizationB,
});
assert.equal(isolated.sessionId, sharedSessionId);
assert.notDeepEqual(isolated.result.whatWeKnow, first.result.whatWeKnow);

await startRealUserPilotSession({
  sessionId: "organization-a-only",
  apn: "6341302200",
  organizationId: organizationA,
});
await assert.rejects(
  answerRealUserPilotSession({
    sessionId: "organization-a-only",
    organizationId: organizationB,
    confirmation: "YES",
  }),
  /private pilot session not found/,
);

const corrected = await answerRealUserPilotSession({
  sessionId: sharedSessionId,
  organizationId: organizationA,
  confirmation: "NO",
  existingUse: "TWO_OR_MORE_DWELLINGS",
  projectIntent: "DETACHED_ADU",
});
assert.equal(corrected.confirmation, "NO");
assert.equal(corrected.projectIntent, "DETACHED_ADU");
assert.ok(corrected.result.evidenceProvenance.includes("Recorded property record"));
assert.ok(corrected.result.evidenceProvenance.includes("Your answer"));

recordRealUserPilotObservation({
  sessionId: sharedSessionId,
  organizationId: organizationA,
  observation: {
    firstQuestion: "CORRECTED_RECORD",
    trust: "MEDIUM",
    result: "CLEAR",
    evidence: "CURRENT_PHOTO",
    desiredAction: "VERIFY_WITH_CITY",
    role: "HOMEOWNER",
    confusion: "NONE",
    trustSignal: "SOURCE_TRANSPARENCY_HELPED",
    notSureOutcome: "NOT_USED",
    questionBurden: "ACCEPTABLE",
    dataQuality: "NONE",
  },
});

const metricsA = realUserPilotMetrics(organizationA);
const metricsB = realUserPilotMetrics(organizationB);
assert.deepEqual(
  {
    sessionsStarted: metricsA.sessionsStarted,
    preliminaryResultsReached: metricsA.preliminaryResultsReached,
    corrections: metricsA.corrections,
    observations: metricsA.observations,
  },
  { sessionsStarted: 2, preliminaryResultsReached: 1, corrections: 1, observations: 1 },
);
assert.equal(metricsB.sessionsStarted, 1);
assert.equal(metricsB.preliminaryResultsReached, 0);
assert.deepEqual(metricsA.projectIntents, { DETACHED_ADU: 1 });
assert.deepEqual(metricsA.trustSignals, { SOURCE_TRANSPARENCY_HELPED: 1 });
assert.deepEqual(metricsA.questionBurden, { ACCEPTABLE: 1 });

const serializedMetrics = JSON.stringify({ metricsA, metricsB });
assert.doesNotMatch(serializedMetrics, /6341302200|5442140600|packet-103-shared-session/);

const fallback = await startRealUserPilotSession({
  sessionId: "packet-103-not-found",
  apn: "0000000000",
  organizationId: organizationA,
});
assert.match(fallback.result.whatWeKnow.join(" "), /needs confirmation/i);
assert.equal(fallback.result.headline, "Preliminary feasibility review");

console.log(
  "Packet 103 organization isolation, process persistence, correction preservation, fallback, and content-free metrics: PASS",
);

import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyFootprintRoles,
  deriveStructureCurrentness,
  structureObservationPrompt,
} from "../lib/structure-observation";

const primary = {
  observationId: "primary",
  footprintAreaSqft: 2_000,
  parcelCoverageRatio: 1,
  separationFromLargestFeet: null,
  parcelEdgeClearanceFeet: 8,
  stackedOrCommonParcelAmbiguity: false,
};

test("bounded geometry roles emit an observational accessory candidate", () => {
  const roles = classifyFootprintRoles([
    primary,
    {
      observationId: "secondary",
      footprintAreaSqft: 500,
      parcelCoverageRatio: 0.98,
      separationFromLargestFeet: 12,
      parcelEdgeClearanceFeet: 2,
      stackedOrCommonParcelAmbiguity: false,
    },
  ]);
  assert.equal(roles[0].role, "PRIMARY_FOOTPRINT_CANDIDATE");
  assert.deepEqual(roles[1], {
    observationId: "secondary",
    role: "SECONDARY_FOOTPRINT_CANDIDATE",
    accessoryStructureCandidate: true,
  });
});

test("stacked parcels and threshold failures fail closed", () => {
  assert.ok(
    classifyFootprintRoles([{ ...primary, stackedOrCommonParcelAmbiguity: true }]).every(
      (result) => result.role === "STACKED_PARCEL_FOOTPRINT" && !result.accessoryStructureCandidate,
    ),
  );
  const tooClose = classifyFootprintRoles([
    primary,
    { ...primary, observationId: "secondary", footprintAreaSqft: 400, separationFromLargestFeet: 1 },
  ]);
  assert.equal(tooClose[1].role, "AMBIGUOUS_FOOTPRINT");
});

test("currentness composition never treats an old outline as current by default", () => {
  assert.equal(
    deriveStructureCurrentness({ observedFootprintCount: 1, stackedOrCommonParcelAmbiguity: false, assessorFactAvailable: false }),
    "OBSERVATIONAL_STALE",
  );
  assert.equal(
    deriveStructureCurrentness({ observedFootprintCount: 1, stackedOrCommonParcelAmbiguity: false, assessorFactAvailable: true }),
    "CURRENTNESS_PARTIAL",
  );
  assert.equal(
    deriveStructureCurrentness({
      observedFootprintCount: 1,
      stackedOrCommonParcelAmbiguity: false,
      assessorFactAvailable: true,
      permitChangeState: "LATER_PERMIT_CHANGE_OBSERVED",
    }),
    "LATER_CHANGE_OBSERVED",
  );
  assert.equal(
    deriveStructureCurrentness({ observedFootprintCount: 0, stackedOrCommonParcelAmbiguity: false, assessorFactAvailable: false }),
    "CURRENTNESS_UNKNOWN",
  );
});

test("user language remains observational and suppresses stale candidates", () => {
  assert.equal(
    structureObservationPrompt({ accessoryStructureCandidate: true, currentnessState: "CURRENTNESS_PARTIAL" }),
    "Older mapping shows a detached secondary structure on the parcel. Is that structure still there?",
  );
  assert.equal(
    structureObservationPrompt({ accessoryStructureCandidate: true, currentnessState: "LATER_CHANGE_OBSERVED" }),
    "Older mapping may no longer reflect the current property configuration.",
  );
  assert.equal(structureObservationPrompt({ accessoryStructureCandidate: false, currentnessState: "CURRENTNESS_PARTIAL" }), null);
});

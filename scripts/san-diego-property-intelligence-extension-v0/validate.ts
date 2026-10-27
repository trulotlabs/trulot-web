import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildAssessorPropertyIntelligence } from "../../lib/property-intelligence";
import { composePropertyIntelligence, selectPropertyQuestions, toV4PropertyIntelligenceInput } from "../../lib/property-intelligence-composition";
import { classifyPermit, derivePermitChangeState, linkPermitRecord, normalizePermitStatus } from "../../lib/permit-intelligence";

const DIR = join(process.cwd(), "data/san-diego-property-intelligence-extension-v0");
const json = <T>(name: string): T => JSON.parse(readFileSync(join(DIR, name), "utf8")) as T;
const sha = (value: Buffer): string => createHash("sha256").update(value).digest("hex");
const integrity = json<{ files: Record<string, { bytes: number; sha256: string }> }>("artifact-integrity.json");
for (const [name, expected] of Object.entries(integrity.files)) { const content = readFileSync(join(DIR, name)); assert.equal(content.byteLength, expected.bytes, name); assert.equal(sha(content), expected.sha256, name); }

const population = json<{ rows: number; distinctApns: number; duplicates: number; parcelV2: { apnSetFingerprint: string } }>("population-integrity.json");
assert.deepEqual([population.rows, population.distinctApns, population.duplicates], [393733, 393733, 0]);
assert.equal(population.parcelV2.apnSetFingerprint, "93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25");
const metrics = json<{ dwellingStates: Record<string, number>; currentnessStates: Record<string, number>; units: { positive: number; zeroOrUnknown: number; malformedOrNull: number }; currentnessQualifiedForIntegration: number }>("population-metrics.json");
assert.equal(Object.values(metrics.dwellingStates).reduce((sum: number, value) => sum + Number(value), 0), 393733);
assert.equal(Object.values(metrics.currentnessStates).reduce((sum: number, value) => sum + Number(value), 0), 393733);
assert.equal(metrics.units.positive + metrics.units.zeroOrUnknown + metrics.units.malformedOrNull, 393733);
assert.equal(metrics.currentnessQualifiedForIntegration, 0);
const mapping = json<{ packet73MappingCount: number; reusableUnchanged: { count: number }; additionalObserved: { count: number }; ambiguousNew: { codes: string[] }; additionalSupportedByExistingGenericClass: { count: number }; unsupported: { count: number; codes: string[] } }>("use-code-mapping.json");
assert.equal(mapping.packet73MappingCount, 99);
assert.equal(mapping.reusableUnchanged.count, 99);
assert.equal(mapping.additionalObserved.count, 105);
assert.equal(mapping.ambiguousNew.codes.length, 9);
assert.equal(mapping.additionalSupportedByExistingGenericClass.count, 96);
assert.equal(mapping.unsupported.count, 21);
assert.equal(mapping.unsupported.codes.includes("000"), true);
assert.equal(mapping.unsupported.codes.includes("180"), true);
type CohortItem = { apn: string; assessor: { preliminaryDwellingState: string; recordedUnitCount: number | null }; composition: { currentnessState: string } };
const cohort = json<{ count: number; rows: CohortItem[]; namedBenchmarks: Record<string, { privateProjectEvidenceExcluded?: boolean }> }>("benchmark-cohort.json");
assert.equal(cohort.count, 25);
assert.equal(new Set(cohort.rows.map((row) => row.apn)).size, 25);
for (const apn of ["6341302200", "5442140600"]) {
  const item = cohort.rows.find((row) => row.apn === apn);
  assert.ok(item);
  assert.equal(item.assessor.preliminaryDwellingState, "RECORDED_SINGLE_FAMILY_LIKELY");
  assert.equal(item.assessor.recordedUnitCount, 1);
  assert.equal(item.composition.currentnessState, "RECORDED_STALE_POSSIBLE");
}
assert.equal(cohort.namedBenchmarks["5442140600"].privateProjectEvidenceExcluded, true);

const artifactText = ["population-integrity.json", "assessor-coverage.json", "use-code-mapping.json", "population-metrics.json", "structure-coverage.json", "permit-inventory.json", "benchmark-cohort.json", "composition-and-rights.json", "accuracy-uplift.json", "decision.json", "README.md"].map((name) => readFileSync(join(DIR, name), "utf8")).join("\n");
assert.doesNotMatch(artifactText, /PRJ-\d+|Google Drive|\/Users\/ops|PRIVATE_OPERATOR|source_sha256/i);
assert.doesNotMatch(artifactText, /Bearer\s+|BEGIN .*PRIVATE KEY|password["']?\s*:|SUPABASE_ACCESS_TOKEN/i);

assert.equal(normalizePermitStatus("Issued"), "ISSUED");
assert.equal(normalizePermitStatus("Plan Check Expired"), "EXPIRED");
assert.equal(normalizePermitStatus("Withdrawn (Closed)"), "WITHDRAWN");
assert.equal(normalizePermitStatus("Closed"), "UNKNOWN");
assert.equal(classifyPermit({ description: "Convert garage to ADU" }).category, "ADU");
assert.equal(classifyPermit({ description: "Demolition of dwelling" }).category, "DEMOLITION");
assert.equal(derivePermitChangeState({ available: true, completeness: "COMPLETE_FOR_QUERY", records: [{ category: "ADU", normalizedStatus: "ISSUED" }] }), "ACTIVE_CHANGE_IN_PROGRESS");
assert.equal(derivePermitChangeState({ available: true, completeness: "COMPLETE_FOR_QUERY", records: [{ category: "ADU", normalizedStatus: "FINALED_COMPLETE" }] }), "LATER_PERMIT_CHANGE_OBSERVED");
assert.equal(derivePermitChangeState({ available: true, completeness: "COMPLETE_FOR_QUERY", records: [{ category: "DEMOLITION", normalizedStatus: "FINALED_COMPLETE" }, { category: "NEW_DWELLING", normalizedStatus: "ISSUED" }] }), "ACTIVE_CHANGE_IN_PROGRESS");
assert.equal(linkPermitRecord({ sourceApn: "634-130-22-00" }, [{ apn: "6341302200", normalizedAddress: "1456 27TH ST" }]).state, "PARCEL_LINKED");
assert.equal(linkPermitRecord({ address: "100 COMMON ST" }, [{ apn: "1", normalizedAddress: "100 COMMON ST" }, { apn: "2", normalizedAddress: "100 COMMON ST" }]).state, "ADDRESS_GROUP_LINKED");

const derived = buildAssessorPropertyIntelligence({ jurisdiction: "CITY_OF_SAN_DIEGO", apn: "test", useCode: "110", useMeaning: "SFR", unitQuantity: 1, totalLivingArea: 1000, assessedImprovementValue: 1, garageConversionMarker: "N" });
const base = { jurisdiction: "CITY_OF_SAN_DIEGO", apn: "test", assessor: { recordedDwellingState: derived.preliminaryDwellingState, recordedUnitCount: derived.recordedUnitCount, eligibleForPreselection: derived.eligibleForPreselection, assessorHints: [], conflictReasons: [], evidenceReference: "test:assessor" }, structure: { observedFootprintCount: 1, accessoryStructureCandidate: false, stackedOrAmbiguous: false, observationDate: "2017-Spring", currentnessState: "CURRENTNESS_UNKNOWN", evidenceReference: "test:structure" } };
const noPermit = composePropertyIntelligence({ ...base, permit: { scope: "NOT_AVAILABLE", changeSignal: "NO_BOUNDED_PERMIT_EVIDENCE", explicitAduEvidence: "NONE", evidenceReference: null } });
const active = composePropertyIntelligence({ ...base, permit: { scope: "BOUNDED_PACKET_74_COHORT", changeSignal: "ACTIVE_EXPLICIT_CHANGE", explicitAduEvidence: "ACTIVE", evidenceReference: "test:active" } });
const finaled = composePropertyIntelligence({ ...base, permit: { scope: "BOUNDED_PACKET_74_COHORT", changeSignal: "FINALED_EXPLICIT_CHANGE", explicitAduEvidence: "FINALED", evidenceReference: "test:finaled" } });
const expired = composePropertyIntelligence({ ...base, permit: { scope: "BOUNDED_PACKET_74_COHORT", changeSignal: "EXPIRED_OR_WITHDRAWN_PROPOSAL", explicitAduEvidence: "EXPIRED_OR_WITHDRAWN", evidenceReference: "test:expired" } });
const multifamily = buildAssessorPropertyIntelligence({ jurisdiction: "CITY_OF_SAN_DIEGO", apn: "multi", useCode: "130", useMeaning: "MULTIFAMILY", unitQuantity: 4, totalLivingArea: 3000, assessedImprovementValue: 1, garageConversionMarker: "N" });
assert.equal(noPermit.currentnessState, "RECORDED_STALE_POSSIBLE");
assert.equal(active.currentnessState, "ACTIVE_CHANGE_IN_PROGRESS");
assert.equal(finaled.currentnessState, "LATER_CHANGE_OBSERVED");
assert.equal(expired.preliminaryDwellingState, "SINGLE_FAMILY_LIKELY");
assert.equal(multifamily.preliminaryDwellingState, "RECORDED_MULTIFAMILY_LIKELY");
assert.equal(selectPropertyQuestions(active).primary?.kind, "CURRENT_CONFIGURATION");
assert.equal(toV4PropertyIntelligenceInput(active).activeChange, true);
assert.equal(active.permittedEvaluationUses.COMPLIANCE, false);
const decision = json<{ decision: string; runtimeIntegration: boolean }>("decision.json");
assert.match(decision.decision, /^SAN_DIEGO_PROPERTY_INTELLIGENCE_EXTENSION_RECON_ONLY:/);
assert.equal(decision.runtimeIntegration, false);
console.log("Packet 77 San Diego property-intelligence validation: PASS");

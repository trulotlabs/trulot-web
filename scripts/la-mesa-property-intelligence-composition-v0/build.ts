import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  PROPERTY_INTELLIGENCE_AUTHORITY_ORDER,
  composePropertyIntelligence,
  selectPropertyQuestions,
  type BoundedPermitSummary,
  type ComposedPropertyIntelligence,
  type RecordedAssessorSummary,
  type StructureObservationSummary,
} from "../../lib/property-intelligence-composition";

const ROOT = process.cwd();
const OUT = join(ROOT, "data/la-mesa-property-intelligence-composition-v0");
mkdirSync(OUT, { recursive: true });

function readGzipRows<T>(path: string): T[] {
  return gunzipSync(readFileSync(join(ROOT, path))).toString("utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}
function readJson<T>(path: string): T { return JSON.parse(readFileSync(join(ROOT, path), "utf8")) as T; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function writeJson(name: string, value: unknown): void { writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 2)}\n`); }
function sha(data: Buffer | string): string { return createHash("sha256").update(data).digest("hex"); }
function fileSha(path: string): string { return sha(readFileSync(path)); }

type AssessorRow = {
  apn: string;
  preliminaryDwellingState: RecordedAssessorSummary["recordedDwellingState"];
  eligibleForPreselection: boolean;
  conflictReasons: string[];
};
type StructureRow = {
  apn: string;
  observedFootprintCount: number;
  accessoryStructureCandidate: boolean;
  stackedOrAmbiguousCount: number;
  geometryDate: string;
  observationalCurrentnessState: string;
};
type PermitRow = {
  apn: string;
  currentnessState: "NO_PERMIT_CHANGE_FOUND" | "LATER_PERMIT_CHANGE_OBSERVED" | "ACTIVE_CHANGE_IN_PROGRESS";
  categoryCounts: Record<string, number>;
  statusCounts: Record<string, number>;
};

const assessorRows = readGzipRows<AssessorRow>("data/la-mesa-assessor-property-intelligence-v0/property-characteristics.ndjson.gz");
const structureRows = readGzipRows<StructureRow>("data/la-mesa-building-currentness-v0/parcel-structure-summaries.ndjson.gz");
const permitRows = readJson<{ rows: PermitRow[] }>("data/la-mesa-permit-intelligence-v0/cohort-results.json").rows;
const structureByApn = new Map(structureRows.map((row) => [row.apn, row]));
const permitByApn = new Map(permitRows.map((row) => [row.apn, row]));

function permitSummary(apn: string): BoundedPermitSummary {
  const row = permitByApn.get(apn);
  if (!row) return { scope: "NOT_AVAILABLE", changeSignal: "NO_BOUNDED_PERMIT_EVIDENCE", explicitAduEvidence: "NONE", evidenceReference: null };
  const evidenceReference = `packet74:cohort-results.json#${apn}`;
  if (row.currentnessState === "ACTIVE_CHANGE_IN_PROGRESS") {
    return { scope: "BOUNDED_PACKET_74_COHORT", changeSignal: "ACTIVE_EXPLICIT_CHANGE", explicitAduEvidence: (row.categoryCounts.ADU ?? 0) > 0 ? "ACTIVE" : "NONE", evidenceReference };
  }
  if (row.currentnessState === "LATER_PERMIT_CHANGE_OBSERVED") {
    return { scope: "BOUNDED_PACKET_74_COHORT", changeSignal: "FINALED_EXPLICIT_CHANGE", explicitAduEvidence: (row.categoryCounts.ADU ?? 0) > 0 ? "FINALED" : "NONE", evidenceReference };
  }
  if ((row.categoryCounts.ADU ?? 0) > 0 && ((row.statusCounts.EXPIRED ?? 0) > 0 || (row.statusCounts.WITHDRAWN ?? 0) > 0)) {
    return { scope: "BOUNDED_PACKET_74_COHORT", changeSignal: "EXPIRED_OR_WITHDRAWN_PROPOSAL", explicitAduEvidence: "EXPIRED_OR_WITHDRAWN", evidenceReference };
  }
  return { scope: "BOUNDED_PACKET_74_COHORT", changeSignal: "NO_CHANGE_FOUND_IN_BOUNDED_QUERY", explicitAduEvidence: "NONE", evidenceReference };
}

const composed = assessorRows.map((assessor): ComposedPropertyIntelligence => {
  const structure = structureByApn.get(assessor.apn);
  if (!structure) throw new Error(`missing Packet 75 summary for ${assessor.apn}`);
  const assessorInput: RecordedAssessorSummary = {
    recordedDwellingState: assessor.preliminaryDwellingState,
    recordedUnitCount: null,
    eligibleForPreselection: assessor.eligibleForPreselection,
    assessorHints: assessor.conflictReasons.filter((reason) => /ADU|GARAGE/i.test(reason)),
    conflictReasons: assessor.conflictReasons,
    evidenceReference: `packet73:property-characteristics.ndjson.gz#${assessor.apn}`,
  };
  const structureInput: StructureObservationSummary = {
    observedFootprintCount: structure.observedFootprintCount,
    accessoryStructureCandidate: structure.accessoryStructureCandidate,
    stackedOrAmbiguous: structure.stackedOrAmbiguousCount > 0,
    observationDate: structure.geometryDate,
    currentnessState: structure.observationalCurrentnessState,
    evidenceReference: `packet75:parcel-structure-summaries.ndjson.gz#${assessor.apn}`,
  };
  return composePropertyIntelligence({ jurisdiction: "CITY_OF_LA_MESA", apn: assessor.apn, assessor: assessorInput, permit: permitSummary(assessor.apn), structure: structureInput });
}).sort((a, b) => a.parcelIdentity.apn.localeCompare(b.parcelIdentity.apn));

if (composed.length !== 17391 || new Set(composed.map((row) => row.parcelIdentity.apn)).size !== 17391) throw new Error("canonical population mismatch");
const ndjson = Buffer.from(composed.map((row) => `${canonical(row)}\n`).join(""));
writeFileSync(join(OUT, "composed-property-intelligence.ndjson.gz"), gzipSync(ndjson, { level: 9 }));

const currentnessCounts: Record<string, number> = {};
const dwellingCounts: Record<string, number> = {};
for (const row of composed) {
  currentnessCounts[row.currentnessState] = (currentnessCounts[row.currentnessState] ?? 0) + 1;
  dwellingCounts[row.preliminaryDwellingState] = (dwellingCounts[row.preliminaryDwellingState] ?? 0) + 1;
}
const questions = composed.map((row) => selectPropertyQuestions(row));
const metrics = {
  denominator: composed.length,
  preselectionReady: composed.filter((row) => row.eligibleForPreselection).length,
  confirmationRequired: questions.filter((row) => row.primary !== null).length,
  conflict: composed.filter((row) => row.conflicts.length > 0).length,
  activeChange: composed.filter((row) => row.currentnessState === "ACTIVE_CHANGE_IN_PROGRESS").length,
  unknown: composed.filter((row) => row.currentnessState === "CURRENTNESS_UNKNOWN").length,
  condo: composed.filter((row) => row.preliminaryDwellingState === "CONDO").length,
  accessoryCandidateTailored: questions.filter((row) => row.accessory !== null).length,
  currentnessStates: Object.fromEntries(Object.entries(currentnessCounts).sort()),
  dwellingStates: Object.fromEntries(Object.entries(dwellingCounts).sort()),
  boundedPermitEvidenceParcels: composed.filter((row) => row.permitEvidenceScope === "BOUNDED_PACKET_74_COHORT").length,
};
writeJson("population-metrics.json", metrics);

writeJson("question-reduction.json", {
  packet73Baseline: { confirmationPrompt: 15141, blankExistingUsePrompt: 2250 },
  packet76: {
    recordedOrCondoConfirmationPrompt: questions.filter((row) => row.primary?.kind === "RECORDED_CONFIRMATION" || row.primary?.kind === "CONDO_CONFIRMATION").length,
    blankExistingUsePrompt: questions.filter((row) => row.primary === null).length,
    conflictSpecificPrompt: questions.filter((row) => row.primary?.kind === "CURRENT_CONFIGURATION").length,
    accessoryStructureTailoredPrompt: questions.filter((row) => row.accessory !== null).length,
  },
  interpretation: "Conflict prompts replace unsafe recorded preselection; accessory prompts are conditional follow-ups rather than extra independent confirmations.",
});

const stalePreselectionPrevented = composed.filter((row) => {
  const assessor = assessorRows.find((item) => item.apn === row.parcelIdentity.apn);
  return assessor?.eligibleForPreselection && !row.eligibleForPreselection;
}).length;
writeJson("accuracy-uplift.json", {
  parcelsWithExplicitCurrentnessQualification: composed.length,
  parcelsWithConflictsPreserved: metrics.conflict,
  staleRecordedPreselectionsPrevented: stalePreselectionPrevented,
  parcelsWithAccessoryStructureContext: metrics.accessoryCandidateTailored,
  limitation: "These are currentness and question-selection improvements, not final eligibility accuracy.",
});

const caseApns = {
  bruceCourt: "4685100900",
  finaledAdu: "4641801100",
  activeDevelopment: "4944102400",
  expiredAdu: "4705321100",
  condo: "4640203301",
  missingData: "4640202200",
  accessoryStructure: "4635801000",
};
writeJson("case-results.json", {
  cases: Object.fromEntries(Object.entries(caseApns).map(([name, apn]) => {
    const value = composed.find((row) => row.parcelIdentity.apn === apn);
    if (!value) throw new Error(`missing case ${apn}`);
    return [name, { composition: value, questions: selectPropertyQuestions(value) }];
  })),
});

writeJson("contract.json", {
  contractVersion: "jurisdiction-neutral-property-intelligence-composition-v0",
  fields: ["parcelIdentity", "recordedDwellingState", "recordedUnitCount", "condoState", "assessorHints", "permitChangeSignal", "explicitAduPermitEvidence", "structureObservation", "currentnessState", "conflicts", "homeownerFacts", "provenanceReferences", "permittedEvaluationUses"],
  presentationExclusions: ["raw assessor field names", "raw permit histories", "raw footprint polygons", "owner identity", "mailing address"],
  v4Boundary: "V4 consumes only the normalized V4 property-intelligence input, never source records directly.",
});
writeJson("authority-order.json", { order: PROPERTY_INTELLIGENCE_AUTHORITY_ORDER, doctrine: "Ordering governs preliminary support, stale-assumption invalidation, and question selection. Conflicts are retained and never silently overwritten." });
writeJson("evaluation-use-matrix.json", {
  recordedDwellingState: { pathwaySelection: "WITH_CONFIRMATION", preliminaryScreening: true, questionPreselection: true, currentnessWarning: true, compliance: false },
  explicitPermitChange: { pathwaySelection: false, preliminaryScreening: true, questionPreselection: false, currentnessWarning: true, compliance: false },
  structureObservation: { pathwaySelection: false, preliminaryScreening: true, questionPreselection: "TAILOR_ONLY", currentnessWarning: true, compliance: false },
  homeownerFact: { pathwaySelection: "PRELIMINARY_ONLY", preliminaryScreening: true, questionPreselection: false, currentnessWarning: false, compliance: false },
  conflict: { pathwaySelection: false, preliminaryScreening: true, questionPreselection: "CONFLICT_PROMPT", currentnessWarning: true, compliance: false },
});
writeJson("runtime-storage-design.json", {
  migrationApplied: false,
  futureTables: ["property_fact", "permit_evidence", "structure_observation", "property_intelligence_conflict", "composed_currentness_snapshot"],
  runtimeInput: "sealed composed derived facts only",
  failClosed: "If the composed artifact is missing or corrupt, the protected preview uses Packet 68 blank homeowner intake and parcel/zoning evaluation continues.",
  rightsBoundary: ["no live permit query", "no raw permit history", "no raw footprint polygon", "no raw assessor presentation fields"],
});
writeJson("san-diego-applicability.json", {
  activated: false,
  reusable: ["authority classes", "currentness state machine", "conflict object", "question selection", "V4 normalized input", "fail-closed behavior"],
  immediateTransfer: "Assessor-derived contract can transfer after a separately sealed San Diego artifact and source-rights review.",
  gaps: ["bounded San Diego permit-change evidence", "authorized current structure observations", "San Diego-specific source completeness/currentness", "runtime acceptance cohort"],
});
writeJson("decision.json", {
  decision: "LA_MESA_PROPERTY_INTELLIGENCE_COMPOSITION_READY",
  nextStep: "SAN_DIEGO_PROPERTY_INTELLIGENCE_EXTENSION",
  rationale: "The composition engine, conflicts, questions, V4 boundary, fail-closed behavior, and protected-preview integration are bounded. Extending the reusable assessor/currentness contract to San Diego offers the largest next accuracy payoff without waiting for unresolved La Mesa bulk-permit rights.",
});
writeFileSync(join(OUT, "README.md"), `# La Mesa property intelligence composition v0\n\nPacket 76 composes sealed assessor, bounded permit, structure-observation, and homeowner facts without discarding conflicts. The protected preview consumes only this derived DTO. No raw permit history or footprint polygon is included.\n\nPopulation: ${metrics.denominator.toLocaleString()} canonical parcels. Bounded permit evidence remains limited to ${metrics.boundedPermitEvidenceParcels} Packet 74 cohort parcels and must not be interpreted as citywide permit coverage.\n\nBrowser acceptance for the six canonical cases is recorded in \`browser-results.json\`; it is local protected-preview evidence, not production evidence.\n\nRun \`npx tsx scripts/la-mesa-property-intelligence-composition-v0/build.ts\` and \`npx tsx scripts/la-mesa-property-intelligence-composition-v0/validate.ts\`.\n`);

const files: Record<string, { bytes: number; sha256: string }> = {};
for (const name of readdirSync(OUT).sort()) {
  if (name === "artifact-integrity.json") continue;
  const path = join(OUT, name);
  if (statSync(path).isFile()) files[name] = { bytes: statSync(path).size, sha256: fileSha(path) };
}
writeJson("artifact-integrity.json", { schemaVersion: "la-mesa-property-intelligence-composition-v0", algorithm: "sha256", composedContentSha256: sha(ndjson), files });
console.log(JSON.stringify(metrics, null, 2));

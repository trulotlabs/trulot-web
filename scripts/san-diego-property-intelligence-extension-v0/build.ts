import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { buildAssessorPropertyIntelligence } from "../../lib/property-intelligence";
import {
  composePropertyIntelligence,
  selectPropertyQuestions,
  toV4PropertyIntelligenceInput,
  type ComposedPropertyIntelligence,
} from "../../lib/property-intelligence-composition";

const ROOT = process.cwd();
const OUT = join(ROOT, "data/san-diego-property-intelligence-extension-v0");
const ASSESSOR = "/Users/ops/trulot-data/structure-facts-v0/building-outlines-city-20260930T161931Z/parcel-assessor-source.csv.gz";
const STRUCTURES = "/Users/ops/trulot-data/structure-facts-v0/building-outlines-city-20260930T161931Z/parcel-footprint-summary.ndjson";
const DENOMINATOR = 393_733;
mkdirSync(OUT, { recursive: true });

type AssessorRow = Record<string, string> & { apn: string; unitqty: string; nucleus_use_cd: string; total_lvg_area: string; garage_conversion: string; year_effective: string };
type StructureRow = { apn: string; footprint_state: string; direct_source_object_ids: number[]; stack_group_source_object_ids: number[]; ambiguous_source_object_ids: number[] };

function csvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { result.push(current); current = ""; }
    else current += character;
  }
  result.push(current);
  return result;
}

function loadAssessor(): AssessorRow[] {
  const lines = gunzipSync(readFileSync(ASSESSOR)).toString("utf8").trimEnd().split("\n");
  const headers = csvLine(lines.shift() ?? "");
  return lines.map((line) => Object.fromEntries(headers.map((header, index) => [header, csvLine(line.replace(/\r$/, ""))[index] ?? ""])) as AssessorRow);
}

function loadStructures(): Map<string, StructureRow> {
  return new Map(readFileSync(STRUCTURES, "utf8").trim().split("\n").map((line) => {
    const row = JSON.parse(line) as StructureRow;
    return [row.apn, row];
  }));
}

const numberOrNull = (value: string): number | null => value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
const increment = (target: Record<string, number>, key: string): void => { target[key] = (target[key] ?? 0) + 1; };
const writeJson = (name: string, value: unknown): void => writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 2)}\n`);
const sha = (content: Buffer | string): string => createHash("sha256").update(content).digest("hex");

const rows = loadAssessor().sort((left, right) => left.apn.localeCompare(right.apn));
const structureByApn = loadStructures();
if (rows.length !== DENOMINATOR || new Set(rows.map((row) => row.apn)).size !== DENOMINATOR) throw new Error("City parcel population mismatch");
if (structureByApn.size !== DENOMINATOR || rows.some((row) => !structureByApn.has(row.apn))) throw new Error("structure join mismatch");

const packet73 = JSON.parse(readFileSync(join(ROOT, "data/la-mesa-assessor-property-intelligence-v0/use-code-mapping.json"), "utf8")) as { mappings: Array<{ originalCode: string; sourceMeaning: string }> };
const packet73ByCode = new Map(packet73.mappings.map((mapping) => [mapping.originalCode, mapping.sourceMeaning]));
const useCodes: Record<string, number> = {};
const useClasses: Record<string, string> = {};
const states: Record<string, number> = {};
const currentness: Record<string, number> = {};
const footprintStates: Record<string, number> = {};
const units = { positive: 0, zeroOrUnknown: 0, malformedOrNull: 0, useUnitConflicts: 0 };
const questions = { confirmationReady: 0, blankQuestion: 0, conflictSpecific: 0, condoSpecific: 0 };
let eligible = 0;
let assessorConflicts = 0;
let geometryConflicts = 0;
let composedConflictParcels = 0;
let accessoryCandidates = 0;
let livingAreaPositive = 0;
let garageHints = 0;
let yearEffectivePresent = 0;

type Benchmark = { apn: string; address: string; strata: string[]; assessor: ReturnType<typeof buildAssessorPropertyIntelligence>; footprintState: string; composition: ComposedPropertyIntelligence; v4: ReturnType<typeof toV4PropertyIntelligenceInput> };
const cohort = new Map<string, Benchmark>();
const wanted = new Set(["RECORDED_SINGLE_FAMILY_LIKELY", "RECORDED_MULTIFAMILY_LIKELY", "RECORDED_CONDO", "RECORDED_RESIDENTIAL_CONFLICT", "RECORDED_TYPE_UNKNOWN", "ASSESSOR_ADU_HINT", "GARAGE_CONVERSION_HINT", "ONE_FOOTPRINT", "MULTIPLE_FOOTPRINTS", "NO_FOOTPRINT_RECORD", "AMBIGUOUS_ONLY", "STACKED_GROUP_WITH_FOOTPRINTS", "STACKED_GROUP_WITHOUT_FOOTPRINTS", "ADDITIONAL_USE_CODE", "UNSUPPORTED_USE_CODE"]);
const filled = new Set<string>();

for (const row of rows) {
  const code = row.nucleus_use_cd.trim().padStart(3, "0");
  increment(useCodes, code);
  const rawUnit = row.unitqty.trim();
  const unit = numberOrNull(rawUnit);
  if (!rawUnit || unit === null || !Number.isInteger(unit)) units.malformedOrNull += 1;
  else if (unit > 0) units.positive += 1;
  else units.zeroOrUnknown += 1;
  if ((numberOrNull(row.total_lvg_area) ?? 0) > 0) livingAreaPositive += 1;
  if (row.garage_conversion.trim().toUpperCase() === "Y") garageHints += 1;
  if (row.year_effective.trim()) yearEffectivePresent += 1;

  const assessor = buildAssessorPropertyIntelligence({ jurisdiction: "CITY_OF_SAN_DIEGO", apn: row.apn, useCode: code, useMeaning: packet73ByCode.get(code) ?? "NOT_MAPPED_IN_PACKET_73", unitQuantity: unit, totalLivingArea: numberOrNull(row.total_lvg_area), assessedImprovementValue: null, garageConversionMarker: row.garage_conversion, acquisitionValid: true });
  useClasses[code] = assessor.use.normalizedClass;
  increment(states, assessor.preliminaryDwellingState);
  if (assessor.eligibleForPreselection) eligible += 1;
  if (assessor.conflictReasons.length) assessorConflicts += 1;
  if (assessor.conflictReasons.some((reason) => /UNITS|CONDO_UNIT/.test(reason))) units.useUnitConflicts += 1;

  const footprint = structureByApn.get(row.apn)!;
  increment(footprintStates, footprint.footprint_state);
  const ambiguous = footprint.footprint_state.startsWith("STACKED_") || footprint.footprint_state === "AMBIGUOUS_ONLY" || footprint.ambiguous_source_object_ids.length > 0;
  const directCount = footprint.direct_source_object_ids.length;
  const accessory = directCount > 1 && !ambiguous && assessor.recordedUnitCount === 1;
  if (ambiguous) geometryConflicts += 1;
  if (accessory) accessoryCandidates += 1;
  const composition = composePropertyIntelligence({
    jurisdiction: "CITY_OF_SAN_DIEGO",
    apn: row.apn,
    assessor: { recordedDwellingState: assessor.preliminaryDwellingState, recordedUnitCount: assessor.recordedUnitCount, eligibleForPreselection: assessor.eligibleForPreselection, assessorHints: assessor.conflictReasons.filter((reason) => /ADU|GARAGE/.test(reason)), conflictReasons: assessor.conflictReasons, evidenceReference: `sangis-arcc-parcel-base-20260924:${row.apn}` },
    permit: { scope: "NOT_AVAILABLE", changeSignal: "NO_BOUNDED_PERMIT_EVIDENCE", explicitAduEvidence: "NONE", evidenceReference: null },
    structure: { observedFootprintCount: directCount, accessoryStructureCandidate: accessory, stackedOrAmbiguous: ambiguous, observationDate: "2017-Spring", currentnessState: "CURRENTNESS_UNKNOWN", evidenceReference: `packet39:parcel-footprint-summary.ndjson#${row.apn}` },
  });
  if (composition.conflicts.length > 0) composedConflictParcels += 1;
  increment(currentness, composition.currentnessState);
  const selected = selectPropertyQuestions(composition).primary;
  if (selected?.kind === "RECORDED_CONFIRMATION") questions.confirmationReady += 1;
  else if (selected?.kind === "CONDO_CONFIRMATION") questions.condoSpecific += 1;
  else if (selected?.kind === "CURRENT_CONFIGURATION") questions.conflictSpecific += 1;
  else questions.blankQuestion += 1;

  const strata = [assessor.preliminaryDwellingState, footprint.footprint_state];
  if (assessor.use.assessorAduHint) strata.push("ASSESSOR_ADU_HINT");
  if (row.garage_conversion.trim().toUpperCase() === "Y") strata.push("GARAGE_CONVERSION_HINT");
  if (!packet73ByCode.has(code)) strata.push("ADDITIONAL_USE_CODE");
  if (code === "100" || code === "444") strata.push("UNSUPPORTED_USE_CODE");
  const named = row.apn === "6341302200" || row.apn === "5442140600";
  if (named || strata.some((stratum) => wanted.has(stratum) && !filled.has(stratum)) || cohort.size < 25) {
    cohort.set(row.apn, { apn: row.apn, address: [row.situs_address, row.situs_street, row.situs_suffix].filter((part) => part.trim()).join(" "), strata, assessor, footprintState: footprint.footprint_state, composition, v4: toV4PropertyIntelligenceInput(composition) });
    strata.forEach((stratum) => filled.add(stratum));
  }
}

const selectedCohort = [...cohort.values()].slice(0, 25);
for (const apn of ["6341302200", "5442140600"]) if (!selectedCohort.some((item) => item.apn === apn)) selectedCohort[selectedCohort.length - (apn === "6341302200" ? 1 : 2)] = cohort.get(apn)!;
if (selectedCohort.length !== 25 || new Set(selectedCohort.map((item) => item.apn)).size !== 25) throw new Error("cohort mismatch");

const reused = Object.keys(useCodes).filter((code) => packet73ByCode.has(code)).sort();
const additional = Object.keys(useCodes).filter((code) => !packet73ByCode.has(code)).sort();
const ambiguousNew = additional.filter((code) => useClasses[code] === "UNKNOWN_OTHER");
const unsupported = Object.keys(useCodes).filter((code) => useClasses[code] === "UNKNOWN_OTHER").sort();

writeJson("population-integrity.json", { rows: DENOMINATOR, distinctApns: DENOMINATOR, duplicates: 0, parcelV2: { acquisitionId: "sangis-20260924T183743Z", rawSourceSha256: "07913d1007d0e2f5b80c681c19c76bb1338f4b06d99c401c1784744bbd1a4544", apnSetFingerprint: "93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25", fullRowFingerprint: "a30e506477248e46a66416821b8d12f58cec07e60a065860af5c0d595062006f" }, localSortedNewlineApnSha256: sha(`${rows.map((row) => row.apn).join("\n")}\n`) });
writeJson("assessor-coverage.json", { denominator: DENOMINATOR, fields: { NUCLEUS_USE_CD: { available: true, observedCodes: Object.keys(useCodes).length }, UNITQTY: { available: true, ...units }, TOTAL_LVG_AREA: { available: true, positive: livingAreaPositive, unknownOrZero: DENOMINATOR - livingAreaPositive }, ASR_IMPR: { available: true, retainedInRawAcquisition: true, positive: 373847, zeroOrOther: 19886, meaning: "assessed improvement value, never area", measurement: "scan-raw-assessor.py over the sealed raw acquisition, restricted to the accepted 393,733 APNs" }, assessorAduHint: { available: true, count: (useCodes["109"] ?? 0) + (useCodes["112"] ?? 0), limit: "hint only" }, garageConversionMarker: { available: true, affirmative: garageHints, limit: "hint only" }, YEAR_EFFECTIVE: { available: true, present: yearEffectivePresent, usedAsAge: false } }, semantics: "The same sealed SanGIS/County ARCC field definitions apply countywide; these are recorded characteristics, not legal/current as-built truth." });
writeJson("use-code-mapping.json", { observedCodeCount: Object.keys(useCodes).length, packet73MappingCount: packet73ByCode.size, reusableUnchanged: { count: reused.length, codes: reused, parcels: reused.reduce((sum, code) => sum + useCodes[code], 0) }, additionalObserved: { count: additional.length, codes: additional, parcels: additional.reduce((sum, code) => sum + useCodes[code], 0) }, additionalSupportedByExistingGenericClass: { count: additional.length - ambiguousNew.length, codes: additional.filter((code) => !ambiguousNew.includes(code)) }, ambiguousNew: { codes: ambiguousNew, parcels: ambiguousNew.reduce((sum, code) => sum + useCodes[code], 0), action: "remain unknown pending mapping review" }, unsupported: { count: unsupported.length, codes: unsupported, parcels: unsupported.reduce((sum, code) => sum + useCodes[code], 0), action: "remain unknown" }, normalizedClassByCode: Object.fromEntries(Object.entries(useClasses).sort()), countsByCode: Object.fromEntries(Object.entries(useCodes).sort()) });
writeJson("population-metrics.json", { denominator: DENOMINATOR, units, dwellingStates: Object.fromEntries(Object.entries(states).sort()), prePermitStructureEligible: eligible, prePermitStructureIneligible: DENOMINATOR - eligible, currentnessStates: Object.fromEntries(Object.entries(currentness).sort()), currentnessQualifiedForIntegration: 0, assessorConflictParcels: assessorConflicts, geometryConflictParcels: geometryConflicts, composedConflictParcels, accessoryContextCandidates: accessoryCandidates, questionSelection: questions });
writeJson("structure-coverage.json", { source: "City of San Diego/SANDAG Building Outlines", sourceRecords: 386217, observationVintage: "Spring 2017 imagery baseline", parcelDenominator: DENOMINATOR, states: Object.fromEntries(Object.entries(footprintStates).sort()), directHistoricalFootprintParcels: (footprintStates.ONE_FOOTPRINT ?? 0) + (footprintStates.MULTIPLE_FOOTPRINTS ?? 0), currentStructureGeometrySupportedCitywide: 0, dwellingCountInferred: false, rights: "public GIS; bounded summaries only; raw polygons not repackaged" });
writeJson("permit-inventory.json", { runtimeContract: "public.parcel_permit_terminal_v2", knownSystems: ["City of San Diego Accela Citizen Access", "OpenDSD approvals index"], availableFields: ["record_id", "record_number", "record_type", "status", "normalized_stage", "opened_date", "issued_date", "finaled_date", "completed_date", "expired_date", "last_activity_date", "address_full", "apn_norm", "description", "project_id"], sealedCitywideRecordCorpusAvailableLocally: false, recordsMeasured: 0, parcelCoverageMeasured: 0, linkage: { exactApn: 0, uniqueAddress: 0, ambiguous: 0, unresolved: 0, state: "NOT_MEASURABLE" }, evidenceClassesSupportedByGenericCode: ["ADU", "JADU", "ADDITION", "GARAGE_CONVERSION", "DEMOLITION", "NEW_DWELLING"], normalizedStatuses: ["APPLIED", "UNDER_REVIEW", "ISSUED", "FINALED_COMPLETE", "EXPIRED", "WITHDRAWN", "UNKNOWN"], cancelledVocabularyBoundary: "Cancelled/void vocabulary must preserve the original status and map to the withdrawn/cancelled terminal class only after City vocabulary is observed in a sealed corpus; ambiguous CLOSED remains UNKNOWN from status alone.", limitation: "Schemas, normalizers, and bounded public observations exist, but no sealed Citywide permit rows/acquisition receipt were found. No production query or reacquisition was performed." });
writeJson("benchmark-cohort.json", { count: selectedCohort.length, rows: selectedCohort, permitStrataGaps: { knownAdu: "assessor hint only; no Citywide permit proof", activeProject: "synthetic contract test only", expiredOrCancelled: "synthetic contract test only", noPermitHistory: "not asserted because the corpus is unavailable" }, namedBenchmarks: { "6341302200": { zoningStratum: "RS-1-7", recordedState: "RECORDED_SINGLE_FAMILY_LIKELY", recordedUnits: 1, recordedLivingAreaSqFt: 988, assessedImprovementValue: 113000, rawYearEffectiveCode: "10", yearEffectiveUsedAsAge: false, boundedPublicPermitObservation: "address-linked plumbing record with no stated configuration change", complianceEvidenceSufficient: false }, "5442140600": { zoningStratum: "RM-2-5", recordedState: "RECORDED_SINGLE_FAMILY_LIKELY", recordedUnits: 1, recordedLivingAreaSqFt: 719, assessedImprovementValue: 68814, rawYearEffectiveCode: "50", yearEffectiveUsedAsAge: false, privateProjectEvidenceExcluded: true, publicPermitComposition: "NOT_AVAILABLE", currentness: "RECORDED_STALE_POSSIBLE" } } });
writeJson("composition-and-rights.json", { genericArchitecture: { contract: "jurisdiction-neutral-property-intelligence-composition-v0", authorityOrderChanged: false, currentnessStateMachineChanged: false, conflictModelChanged: false, questionSelectionChanged: false, v4ContractChanged: false }, sourceAdapters: ["Citywide SanGIS assessor selection", "City historical outline summary", "City permit corpus unavailable"], sourceRights: [{ source: "sealed SanGIS/County ARCC parcel acquisition", classification: "ALREADY_LAWFULLY_HELD_SEALED_AND_PUBLIC_REUSE_ALLOWED", outputBoundary: "bounded derived recorded characteristics" }, { source: "sealed City/SANDAG Building Outlines acquisition", classification: "ALREADY_LAWFULLY_HELD_SEALED_AND_PUBLIC_REUSE_ALLOWED", outputBoundary: "bounded summaries; no raw polygon redisplay" }, { source: "City permit runtime schema and bounded observations", classification: "INTERNAL_ONLY_UNTIL_CITYWIDE_ACQUISITION_AND_RIGHTS_RECEIPT", outputBoundary: "no Citywide claims" }, { source: "unsealed City permit corpus", classification: "RIGHTS_AND_COMPLETENESS_UNCLEAR", outputBoundary: "not used" }, { source: "operator project corpus", classification: "PRIVATE_NOT_PUBLIC", outputBoundary: "not used" }], publicInputs: ["sealed SanGIS/ARCC assessor fields", "public City/SANDAG historical outline summaries", "bounded public permit observation for the named RS benchmark narrative only"], privateEvidenceExcluded: true, privateDetailsPersisted: false, redisplayRightsExpanded: false, allowedUses: ["pathway selection after confirmation", "preliminary screening", "homeowner questions", "currentness warning"], prohibitedUses: ["zoning truth change", "rule-profile change", "Coastal change", "SDA change", "compliance", "capacity"] });
writeJson("accuracy-uplift.json", { recordedPropertyCoverage: DENOMINATOR - (states.RECORDED_TYPE_UNKNOWN ?? 0), currentnessQualifiedCoverage: 0, conflictsDetected: composedConflictParcels, assessorConflictParcels: assessorConflicts, geometryConflictParcels: geometryConflicts, laterChangeDetected: 0, stalePreselectionHeldOutByDecision: eligible, accessoryContextCandidates: accessoryCandidates, limitation: "Coverage and held-out currentness counts are not final feasibility accuracy percentages; conflict subtype counts overlap and the unique union is reported separately." });
writeJson("decision.json", { decision: "SAN_DIEGO_PROPERTY_INTELLIGENCE_EXTENSION_RECON_ONLY: sealed Citywide permit/currentness evidence is unavailable and the Citywide structure layer is historical Spring 2017 observation only", runtimeIntegration: false, nextStep: "CITYWIDE_RULE_PROFILE_EXPANSION", futureSmallestIntegration: ["recorded-property confirmation", "explicit currentness warning", "normalized permit change signal after a sealed corpus exists", "no raw permit/footprint display"], packet11Frozen: true, productionDependency: false });
writeFileSync(join(OUT, "README.md"), `# San Diego property intelligence extension v0\n\nPacket 77 executes the Packet 76 jurisdiction-neutral assessor, conflict, currentness, question-selection, and V4 adapters over ${DENOMINATOR.toLocaleString()} sealed City parcels. It commits aggregate and 25-parcel benchmark evidence only. No production source was queried, and no raw permit history, footprint polygons, owner data, or private project details are repackaged.\n\nThe decision is recon-only because no sealed Citywide permit corpus is locally available and the Citywide structure observation is the Spring 2017 historical outline layer.\n`);

const files: Record<string, { bytes: number; sha256: string }> = {};
for (const name of readdirSync(OUT).sort()) {
  if (name === "artifact-integrity.json") continue;
  const path = join(OUT, name);
  if (statSync(path).isFile()) files[name] = { bytes: statSync(path).size, sha256: sha(readFileSync(path)) };
}
writeJson("artifact-integrity.json", { schemaVersion: "san-diego-property-intelligence-extension-v0", algorithm: "sha256", files });
console.log(JSON.stringify({ rows: DENOMINATOR, states, currentness, eligible, questions, cohort: selectedCohort.length }, null, 2));

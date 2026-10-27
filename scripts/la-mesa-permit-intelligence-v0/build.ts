/* eslint-disable @typescript-eslint/no-explicit-any -- frozen external portal JSON is validated while normalizing */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  classifyPermit,
  derivePermitChangeState,
  linkPermitRecord,
  normalizePermitStatus,
  type CanonicalPermitParcel,
  type PermitCompleteness,
} from "../../lib/permit-intelligence";

const ROOT = process.cwd();
const OUT = join(ROOT, "data/la-mesa-permit-intelligence-v0");
const CAPTURE = join(OUT, "source-captures/maintstar-bounded-capture.json");

type Json = Record<string, unknown>;

function json(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readNdjsonGzip(path: string): Json[] {
  return gunzipSync(readFileSync(path)).toString("utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function writeJson(name: string, value: unknown) {
  writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 2)}\n`);
}

function sha(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function normalizeRecord(query: any, record: any, index: number, parcels: CanonicalPermitParcel[]) {
  const classification = classifyPermit({
    recordType: `${record.msType ?? ""} ${record.type ?? ""}`,
    description: record.description,
    projectName: record.projectName,
  });
  const status = normalizePermitStatus(record.status);
  const linkage = linkPermitRecord({ address: record.address }, parcels);
  const prefix = String(record.datePrefix ?? "").toUpperCase();
  return {
    jurisdiction: "CITY_OF_LA_MESA",
    cohortQueryApn: query.apn,
    parcelApn: linkage.state === "PARCEL_LINKED" ? linkage.candidateApns[0] : null,
    normalizedAddress: record.address ? String(record.address).split(",", 1)[0].toUpperCase() : null,
    recordNumber: record.number ?? record.projectNumber ?? null,
    recordType: record.type ?? null,
    recordSubtype: record.msType ?? null,
    recordCategory: classification.category,
    classificationConfidence: classification.confidence,
    classificationBasis: classification.basis,
    createdApplicationDate: record.createdDate ?? null,
    issueDate: prefix.startsWith("ISSUED") ? record.dateVal ?? null : null,
    finalDate: prefix.startsWith("FINALED") || prefix === "CLOSED" ? record.dateVal ?? null : null,
    visibleMilestoneDate: record.dateVal ?? null,
    visibleMilestoneLabel: record.datePrefix ?? null,
    rawStatus: record.status ?? null,
    normalizedStatus: status,
    description: record.description ?? null,
    projectName: record.projectName ?? null,
    sourceUrl: "https://h9.maintstar.co/LaMesa/portal/",
    sourceReference: record.msValue ?? record.projectMsValue ?? null,
    retrievalDate: "2026-10-27",
    sourceAuthority: "PERMIT_RECORD",
    linkageMethod: linkage.method,
    linkageConfidence: linkage.confidence,
    linkageState: linkage.state,
    candidateApns: linkage.candidateApns,
    currentnessRelevance: ["ADU", "JADU", "NEW_DWELLING", "ADDITION", "GARAGE_CONVERSION", "DEMOLITION"].includes(classification.category)
      ? "POTENTIAL_LATER_CONFIGURATION_CHANGE"
      : "PERMIT_ACTIVITY_CONTEXT_ONLY",
    evidenceReference: `maintstar-bounded-capture.json#query-${query.cohortIndex ?? query.index + 1}-record-${index + 1}`,
    rawSourceRecordReference: `source-captures/maintstar-bounded-capture.json#query-${query.cohortIndex ?? query.index + 1}-record-${index + 1}`,
  };
}

function completenessFor(query: any, paginationProof: any[]): PermitCompleteness {
  if (query.httpStatus !== 200) return "UNKNOWN_COMPLETENESS";
  if ((query.records ?? []).length < 100) return "COMPLETE_FOR_QUERY";
  const pages = paginationProof.filter((page) => page.query === query.query && page.httpStatus === 200);
  if (!pages.length) return "TRUNCATED";
  const ordered = pages.sort((a, b) => a.skip - b.skip);
  const last = ordered.at(-1);
  return last && last.records.length < last.take ? "PAGINATED_COMPLETE" : "TRUNCATED";
}

mkdirSync(OUT, { recursive: true });
const capture = json(CAPTURE) as any;
const serving = readNdjsonGzip(join(ROOT, "data/la-mesa-parcel-lookup-serving-v0/serving-rows.ndjson.gz"));
const parcels: CanonicalPermitParcel[] = serving.map((row: any) => ({ apn: row.apnNormalized, normalizedAddress: row.normalizedAddress, normalizedUnitAddress: row.normalizedUnitAddress }));
const assessor = new Map(readNdjsonGzip(join(ROOT, "data/la-mesa-assessor-property-intelligence-v0/property-characteristics.ndjson.gz")).map((row: any) => [row.apn, row]));

const normalizedRecords: any[] = [];
const cohort = capture.cohort.map((query: any, index: number) => {
  query.index = index;
  const completeness = completenessFor(query, capture.paginationProof ?? []);
  const records = (query.records ?? []).map((record: any, recordIndex: number) => normalizeRecord(query, record, recordIndex, parcels));
  const ambiguousCandidateApns = [...new Set(records.filter((record: any) => record.linkageState === "ADDRESS_GROUP_LINKED").flatMap((record: any) => record.candidateApns))].sort();
  for (const record of records) {
    if (record.linkageState !== "ADDRESS_GROUP_LINKED") continue;
    record.candidateApns = [];
    record.addressGroupCandidateCount = ambiguousCandidateApns.length;
    record.addressGroupReference = `cohort-results.json#query-${index + 1}`;
  }
  normalizedRecords.push(...records);
  const linkageCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  for (const record of records) {
    linkageCounts[record.linkageState] = (linkageCounts[record.linkageState] ?? 0) + 1;
    statusCounts[record.normalizedStatus] = (statusCounts[record.normalizedStatus] ?? 0) + 1;
    categoryCounts[record.recordCategory] = (categoryCounts[record.recordCategory] ?? 0) + 1;
  }
  return {
    cohortIndex: index + 1,
    apn: query.apn,
    address: query.address,
    query: query.query,
    queryKind: query.queryKind,
    categories: query.categories,
    httpStatus: query.httpStatus,
    recordsReturned: records.length,
    completeness,
    linkageCounts,
    statusCounts,
    categoryCounts,
    ambiguousCandidateApns,
    latencyMs: query.latencyMs,
    currentnessState: derivePermitChangeState({
      available: query.httpStatus === 200,
      completeness,
      records: records.map((record: any) => ({ category: record.recordCategory, normalizedStatus: record.normalizedStatus })),
    }),
  };
});

const findRecords = (apn: string) => normalizedRecords.filter((record) => record.cohortQueryApn === apn);
const trace = (apn: string, finding: Json, includeRecords = true) => {
  const records = findRecords(apn);
  return {
    apn,
    assessorState: assessor.get(apn) ?? null,
    cohort: cohort.find((row: any) => row.apn === apn) ?? null,
    recordSummary: {
      count: records.length,
      firstEvidenceReference: records.at(0)?.evidenceReference ?? null,
      lastEvidenceReference: records.at(-1)?.evidenceReference ?? null,
    },
    records: includeRecords ? records : [],
    finding,
  };
};

const cases = {
  bruceCourt: trace("4685100900", {
    conclusion: "Finaled reroof/building/plumbing activity supplies maintenance currentness context only; no record explicitly establishes an ADU or second dwelling.",
    dwellingConfigurationEffect: "NONE",
  }),
  aduHint: trace("4705321100", {
    conclusion: "An explicit attached-SF ADU application is visible, but its status is Plan Check Expired. It confirms an ADU proposal, not completed work, and does not resolve the assessor hint.",
    dwellingConfigurationEffect: "CONFLICT_PRESERVED",
  }),
  finaledAdu: trace("4641801100", {
    conclusion: "The source explicitly labels a detached-SF Accessory Dwelling Unit Finaled and includes a passed final inspection. This supports PERMIT_DERIVED_ADU_RECORD and a later-change signal, but not current occupancy, present unit count, or as-built geometry.",
    dwellingConfigurationEffect: "PERMIT_DERIVED_ADU_RECORD_REQUIRES_CONFIRMATION",
  }),
  activeDevelopment: trace("4944102400", {
    conclusion: "Issued five-or-more-family new construction and ongoing construction/encroachment records corroborate active later development. Completion and current configuration are not established, so assessor preselection remains invalidated and CONFLICTING_EVIDENCE is preserved.",
    dwellingConfigurationEffect: "ACTIVE_CHANGE_IN_PROGRESS",
  }),
  multifamily: trace("4640201000", {
    conclusion: "Three address-level records do not explicitly establish 21 units. They add activity currentness but do not strengthen or replace the recorded multifamily unit count.",
    dwellingConfigurationEffect: "RECORDED_MULTIFAMILY_REMAINS_CONFIRMATION_REQUIRED",
  }),
  condoCommonAddress: trace("4640203301", {
    conclusion: "The 361-record common-address result has 230 exact unit/subaddress links, 126 ADDRESS_GROUP_LINKED records, and 5 unresolved records. The source returns no APN. Only exact unit/subaddress matches may link to an individual condo APN; bare-address group records cannot be assigned to the selected APN.",
    dwellingConfigurationEffect: "NO_GROUP_RECORD_INDIVIDUAL_INFERENCE",
  }, false),
};

const countBy = (values: string[]) => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));
const successful = cohort.filter((row: any) => row.httpStatus === 200);
const complete = successful.filter((row: any) => ["COMPLETE_FOR_QUERY", "PAGINATED_COMPLETE"].includes(row.completeness));
const linked = normalizedRecords.filter((record) => record.linkageState === "PARCEL_LINKED");
const metrics = {
  cohortQueries: cohort.length,
  successfulQueries: successful.length,
  sourceUnavailableQueries: cohort.length - successful.length,
  queriesWithRecords: successful.filter((row: any) => row.recordsReturned > 0).length,
  cohortHitRate: successful.length ? successful.filter((row: any) => row.recordsReturned > 0).length / successful.length : 0,
  normalizedRecordCount: normalizedRecords.length,
  completenessRateAmongSuccessful: successful.length ? complete.length / successful.length : 0,
  parcelLinkageRate: normalizedRecords.length ? linked.length / normalizedRecords.length : 0,
  completenessStates: countBy(cohort.map((row: any) => row.completeness)),
  linkageStates: countBy(normalizedRecords.map((record) => record.linkageState)),
  categoryDistribution: countBy(normalizedRecords.map((record) => record.recordCategory)),
  normalizedStatusDistribution: countBy(normalizedRecords.map((record) => record.normalizedStatus)),
  rawStatusVocabulary: [...new Set(normalizedRecords.map((record) => record.rawStatus).filter(Boolean))].sort(),
  latencyMs: {
    sessionSetup: capture.sessionSetupLatencyMs,
    minimum: Math.min(...successful.map((row: any) => row.latencyMs)),
    maximum: Math.max(...successful.map((row: any) => row.latencyMs)),
    mean: successful.reduce((sum: number, row: any) => sum + row.latencyMs, 0) / successful.length,
  },
  warning: "This deliberately stratified 50-query cohort is not a population estimate.",
};

writeJson("source-contract.json", {
  schemaVersion: "la-mesa-maintstar-source-contract-v0",
  portal: capture.sourceUrl,
  portalVersion: capture.portalVersion,
  anonymousSearch: true,
  loginRequiredForSearch: false,
  request: capture.requestContract,
  responseShape: { envelope: ["data", "total", "showMoreMode"], visibleRecordFields: ["number", "createdDate", "msType", "type", "dateVal", "datePrefix", "address", "status", "description", "msValue"] },
  apnReturned: false,
  pagination: capture.paginationContract,
  rateBehavior: capture.rateBehavior,
  schemaDriftReceipt: { rawStatuses: metrics.rawStatusVocabulary, portalBundleSha256: capture.portalBundleSha256, configurationSha256: capture.configurationSha256 },
});
writeJson("permit-schema.json", {
  schemaVersion: "jurisdiction-neutral-permit-record-v0",
  requiredFields: ["jurisdiction", "parcelApn", "normalizedAddress", "recordNumber", "recordType", "recordCategory", "createdApplicationDate", "issueDate", "finalDate", "visibleMilestoneDate", "rawStatus", "normalizedStatus", "description", "projectName", "sourceUrl", "retrievalDate", "sourceAuthority", "linkageMethod", "linkageConfidence", "linkageState", "currentnessRelevance", "evidenceReference"],
  missingDateDoctrine: "Missing dates remain null; visible milestone dates are never relabeled as issue/final dates without the source label.",
});
writeJson("normalized-permit-records.json", { schemaVersion: "la-mesa-permit-intelligence-v0", records: normalizedRecords });
writeJson("cohort-results.json", { schemaVersion: "la-mesa-permit-cohort-v0", metrics, rows: cohort });
writeJson("case-traces.json", cases);
writeJson("doctrine.json", {
  sourceTermsClassification: "PUBLIC_ACCESS_REUSE_UNCLEAR",
  completeness: ["COMPLETE_FOR_QUERY", "PAGINATED_COMPLETE", "TRUNCATED", "UNKNOWN_COMPLETENESS"],
  linkageHierarchy: ["EXACT_SOURCE_APN", "EXACT_PERMIT_PARCEL_NUMBER", "EXACT_NORMALIZED_ADDRESS_UNIQUE", "EXPLICIT_UNIT_SUBADDRESS", "AMBIGUOUS_ADDRESS_CANDIDATE_SET", "UNRESOLVED"],
  currentnessPriority: ["LATER_FINALED_PERMIT", "LATER_ISSUED_PERMIT", "ASSESSOR_SNAPSHOT", "OLDER_FINALED_PERMIT", "OBSERVATIONAL_FOOTPRINT", "HOMEOWNER_ASSERTION"],
  legalBoundaries: ["Finaled records establish the displayed permit status, not current occupancy, present unit count, absence of later demolition, current as-built geometry, or whole-property compliance.", "Issued, under-review, expired, and withdrawn records never establish completed work.", "No result never means no property change."],
  failClosed: "Unavailable, incomplete, truncated, ambiguous, or terms-blocked permit intelligence leaves assessor/property state unchanged and marks permit intelligence unavailable.",
  homeownerQuestions: { finaledExplicitAdu: "Public permit records indicate an ADU was completed. Is that still correct?", activeAdu: "Public records show an ADU project may be underway. What is currently on the property?", suppressConfirmation: false },
  publicDisplay: "Do not expose full histories or descriptions before rights/product review; a future UI may summarize 'Public permit records show...' with a source link.",
});
writeJson("decision.json", {
  decision: "LA_MESA_PERMIT_INTELLIGENCE_RECON_ONLY",
  reasons: ["The public portal exposes no automation, storage, bulk-ingestion, or public-redisplay terms.", "The endpoint enforces an undocumented HTTP 429 throttle without Retry-After guidance.", "Search responses do not return APNs, so common-address results remain group-linked.", "The endpoint reports total=-1; completeness requires explicit pagination to a short page."],
  currentAcquisitionRecommendation: "MANUAL_OPERATOR_VERIFICATION",
  longTermAcquisitionRecommendation: "PUBLIC_API_OR_CITY_BULK_EXPORT",
  smallestNextSourceRightsAction: "Request a City of La Mesa permit export or API plus written authorization for internal automated reuse and bounded public summaries.",
  nextEngineeringPacket: "LA_MESA_BUILDING_CURRENTNESS_LAYER",
  integrationDesign: "assessor facts + permit facts + structure observations + homeowner facts -> conflict/currentness resolution -> V4 feasibility",
});

writeFileSync(join(OUT, "README.md"), `# La Mesa permit intelligence v0\n\nPacket 74 is a bounded, local-only reconnaissance artifact from 50 stratified La Mesa parcel/address searches against the official public MaintStar portal on 2026-10-27. It preserves permit evidence as a separate authority class. It is not a citywide dataset, population estimate, legal-status determination, current unit count, or authorization for public redisplay.\n\nThe result is **RECON ONLY** because automation/reuse terms are not published, the endpoint returned an undocumented 429 throttle, source APNs are absent, and completeness requires explicit pagination. The current safe path is manual/operator verification. The long-term path is a City-provided export/API with written reuse terms.\n\nThe normalized artifact intentionally retains the portal's public raw fields inside each evidence record for auditability. No owner, applicant, account, credential, token, cookie, or private environment value is included.\n`);

const files = [
  ...readdirSync(OUT).filter((name) => name !== "integrity.json" && statSync(join(OUT, name)).isFile()),
  "source-captures/maintstar-bounded-capture.json",
].sort();
writeJson("integrity.json", {
  schemaVersion: "la-mesa-permit-intelligence-integrity-v0",
  algorithm: "sha256",
  files: Object.fromEntries(files.map((name) => [name, { bytes: statSync(join(OUT, name)).size, sha256: sha(join(OUT, name)) }])),
});

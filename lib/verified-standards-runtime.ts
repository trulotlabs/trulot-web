import { createHash } from "node:crypto";
import bundleJson from "../data/runtime/verified-residential-standards-v2.json";
import receiptJson from "../data/runtime/verified-residential-standards-v2.receipt.json";
import {
  VERIFIED_STANDARDS_BUNDLE_SHA256,
  VERIFIED_STANDARDS_RECORD_COUNT,
  VERIFIED_STANDARDS_RECORD_IDS_SHA256,
  VERIFIED_STANDARDS_RELEASE_VERSION,
  VERIFIED_STANDARDS_SCHEMA_VERSION,
  VERIFIED_STANDARDS_SOURCE_MANIFEST_SHA256,
} from "./verified-standards-runtime-seal";
import type { FactProvenance, TruthFact } from "./parcel-truth";
import type {
  VerifiedStandardsByZone,
  VerifiedStandardsContext,
  VerifiedStandardsJson,
  VerifiedStandardsMappingState,
  VerifiedStandardsParameter,
  VerifiedStandardsResult,
} from "./verified-standards-types";

type BundleEntry = {
  ruleId: string;
  zoneCode: string;
  sealedOrigin: "BASELINE_97" | "PACKET_17_116";
  sealedRecordCanonical: string;
  sealedRecordSha256: string;
  sourceRecord?: VerifiedStandardsJson;
};
type RuntimeBundle = {
  schemaVersion: string;
  releaseVersion: string;
  ruleSetVersion: string;
  recordCount: number;
  recordIds: string[];
  recordIdsFingerprint: string;
  sourceEvidenceManifest: VerifiedStandardsJson;
  sourceEvidenceManifestFingerprint: string;
  reviewDecisionIdentity: VerifiedStandardsJson;
  shared: { authorityMetadata: VerifiedStandardsJson; source: VerifiedStandardsJson };
  records: BundleEntry[];
};

const runtimeBundle = bundleJson as unknown as RuntimeBundle;
const runtimeReceipt = receiptJson as unknown as Record<string, unknown>;
const approvedContext = {
  evaluation_date: "2026-09-24",
  coastal_context: "outside",
  application_context: "new_application",
  airport_context: "outside_miramar_transition",
} as const;
const coverageQualifier = "Only reviewed base-zone standards are shown. Additional rules may apply, and parcel-specific conditions remain unresolved. TruLot has not determined compliance or development capacity.";

export function canonicalVerifiedStandardsJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalVerifiedStandardsJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalVerifiedStandardsJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalVerifiedStandardsJson(value)).digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function object(value: unknown): value is VerifiedStandardsJson {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function validateVerifiedStandardsBundle(
  value: unknown,
  receipt: unknown = runtimeReceipt,
): { valid: true; bundle: RuntimeBundle } | { valid: false; reason: string } {
  if (!object(value) || !object(receipt)) return { valid: false, reason: "malformed_bundle" };
  const candidate = value as unknown as RuntimeBundle;
  if (candidate.schemaVersion !== VERIFIED_STANDARDS_SCHEMA_VERSION ||
      candidate.releaseVersion !== VERIFIED_STANDARDS_RELEASE_VERSION ||
      candidate.recordCount !== VERIFIED_STANDARDS_RECORD_COUNT ||
      !Array.isArray(candidate.records) || !Array.isArray(candidate.recordIds)) {
    return { valid: false, reason: "bundle_identity_mismatch" };
  }
  if (receipt.schemaVersion !== "verified-residential-standards-runtime-receipt/v1" ||
      receipt.releaseVersion !== VERIFIED_STANDARDS_RELEASE_VERSION ||
      receipt.recordCount !== VERIFIED_STANDARDS_RECORD_COUNT) {
    return { valid: false, reason: "receipt_identity_mismatch" };
  }
  if (sha256(candidate) !== VERIFIED_STANDARDS_BUNDLE_SHA256 ||
      receipt.bundleCanonicalSha256 !== VERIFIED_STANDARDS_BUNDLE_SHA256) {
    return { valid: false, reason: "bundle_integrity_mismatch" };
  }
  if (candidate.recordIds.length !== VERIFIED_STANDARDS_RECORD_COUNT ||
      candidate.records.length !== VERIFIED_STANDARDS_RECORD_COUNT ||
      new Set(candidate.recordIds).size !== VERIFIED_STANDARDS_RECORD_COUNT ||
      sha256(candidate.recordIds) !== VERIFIED_STANDARDS_RECORD_IDS_SHA256 ||
      candidate.recordIdsFingerprint !== VERIFIED_STANDARDS_RECORD_IDS_SHA256 ||
      receipt.recordIdsFingerprint !== VERIFIED_STANDARDS_RECORD_IDS_SHA256) {
    return { valid: false, reason: "membership_mismatch" };
  }
  if (sha256(candidate.sourceEvidenceManifest) !== VERIFIED_STANDARDS_SOURCE_MANIFEST_SHA256 ||
      candidate.sourceEvidenceManifestFingerprint !== VERIFIED_STANDARDS_SOURCE_MANIFEST_SHA256 ||
      receipt.sourceEvidenceManifestFingerprint !== VERIFIED_STANDARDS_SOURCE_MANIFEST_SHA256) {
    return { valid: false, reason: "source_manifest_mismatch" };
  }
  let baseline = 0;
  let packet17 = 0;
  for (let index = 0; index < candidate.records.length; index += 1) {
    const entry = candidate.records[index];
    if (!object(entry) || typeof entry.sealedRecordCanonical !== "string") {
      return { valid: false, reason: "record_parse_failure" };
    }
    let sealedRecord: unknown;
    try { sealedRecord = JSON.parse(entry.sealedRecordCanonical); } catch { return { valid: false, reason: "record_parse_failure" }; }
    if (!object(sealedRecord) || entry.ruleId !== candidate.recordIds[index] ||
        entry.ruleId !== sealedRecord.rule_id || entry.zoneCode !== sealedRecord.zone_code ||
        sha256Text(entry.sealedRecordCanonical) !== entry.sealedRecordSha256) {
      return { valid: false, reason: "record_integrity_mismatch" };
    }
    if (entry.sealedOrigin === "BASELINE_97" && object(entry.sourceRecord)) baseline += 1;
    else if (entry.sealedOrigin === "PACKET_17_116" && !entry.sourceRecord) packet17 += 1;
    else return { valid: false, reason: "record_origin_mismatch" };
  }
  if (baseline !== 97 || packet17 !== 116) return { valid: false, reason: "membership_partition_mismatch" };
  if (/\/private\/tmp|\/Users\/ops\//.test(canonicalVerifiedStandardsJson(candidate))) {
    return { valid: false, reason: "local_path_leak" };
  }
  return { valid: true, bundle: candidate };
}

let cachedValidation: ReturnType<typeof validateVerifiedStandardsBundle> | null = null;
export function verifiedStandardsBundleStatus(): ReturnType<typeof validateVerifiedStandardsBundle> {
  cachedValidation ??= validateVerifiedStandardsBundle(runtimeBundle);
  return cachedValidation;
}

function parameter(entry: BundleEntry, bundle: RuntimeBundle): VerifiedStandardsParameter {
  const sealed = JSON.parse(entry.sealedRecordCanonical) as VerifiedStandardsJson;
  const sourceRecord = entry.sealedOrigin === "BASELINE_97" ? entry.sourceRecord! : sealed.source_record as VerifiedStandardsJson;
  const common = {
    display_safe: true as const,
    parcel_application_safe: false as const,
    project_applicability_determined: false as const,
    compliance_determined: false as const,
    capacity_determined: false as const,
    sealed_origin: entry.sealedOrigin,
    sealed_record: sealed,
    sealed_record_sha256: entry.sealedRecordSha256,
    rule_set_version: String(sourceRecord.rule_set_version),
    source_section: String(sourceRecord.source_section),
    source_sha256: entry.sealedOrigin === "BASELINE_97"
      ? String(sealed.source_sha256)
      : String((bundle.shared.authorityMetadata.sources as Record<string, { sha256: string }>)[String(sourceRecord.source_id)].sha256),
    source_evidence: (entry.sealedOrigin === "BASELINE_97" ? sealed.source_evidence : sourceRecord.source_evidence) as VerifiedStandardsJson,
    source_record: sourceRecord,
    source: bundle.shared.source,
    authority_metadata: bundle.shared.authorityMetadata,
  };
  if (entry.sealedOrigin === "PACKET_17_116") return { ...sealed, ...common } as VerifiedStandardsParameter;
  const standardType = String(sealed.standard_type);
  return {
    ...sealed,
    family: "lot_dimensions",
    safety_level: "DISPLAY_SAFE_PARAMETER",
    expression: {
      kind: "scalar", value: sealed.value, unit: sealed.unit, operator: sealed.operator,
      semantics: "Sealed base-zone table parameter; no parcel comparison performed.",
    },
    required_predicates: [{
      id: standardType === "corner_lot_width_min" ? "corner_lot_status" : "LEGAL_LOT_AND_PREMISES_GEOMETRY",
      state: "UNRESOLVED", value: null,
    }],
    ...common,
  } as unknown as VerifiedStandardsParameter;
}

function provenance(value: VerifiedStandardsParameter): FactProvenance {
  return {
    sourceId: "residential",
    datasetId: value.rule_set_version,
    sourceLabel: "San Diego Municipal Code residential base-zone table",
    publisher: "City of San Diego",
    sourceUrl: String(value.source.url),
    effectiveAt: null,
    retrievedAt: typeof value.source.acquired_at === "string" ? value.source.acquired_at : null,
    importedAt: null,
    viewCalculatedAt: null,
    methodology: `${value.rule_id}; sha256=${value.source_sha256}; sealed-expanded-213`,
    basis: "Display-safe source parameter; exact expression and unresolved conditions retained. Parcel application, compliance, and capacity have not been determined.",
  };
}

function contextApproved(context: VerifiedStandardsContext): boolean {
  return context.evaluation_date === approvedContext.evaluation_date &&
    context.coastal_context === approvedContext.coastal_context &&
    context.application_context === approvedContext.application_context &&
    context.airport_context === approvedContext.airport_context;
}

export function selectCompiledVerifiedStandards(
  zoneCode: string,
  context: VerifiedStandardsContext,
  requestedRuleIds?: string[],
): VerifiedStandardsByZone {
  const status = verifiedStandardsBundleStatus();
  if (!status.valid) return { zoneCode, state: "unavailable", reason: status.reason, parameters: [] };
  if (!contextApproved(context)) return { zoneCode, state: "unknown", reason: "operative_context_unresolved", parameters: [] };
  const entries = status.bundle.records.filter(entry => entry.zoneCode === zoneCode);
  if (!entries.length) return { zoneCode, state: "unknown", reason: "no_sealed_parameters", parameters: [] };
  const byId = new Map(entries.map(entry => [entry.ruleId, entry]));
  const wanted = requestedRuleIds ?? entries.map(entry => entry.ruleId);
  if (!wanted.length || wanted.some(ruleId => typeof ruleId !== "string" || !byId.has(ruleId))) {
    return { zoneCode, state: "unknown", reason: "excluded_or_unreviewed_rule", parameters: [] };
  }
  const parameters = [...new Set(wanted)].sort().map(ruleId => parameter(byId.get(ruleId)!, status.bundle));
  const facts = parameters.map(value => ({ state: "supported", value, sourceState: "available",
    derivation: "conditional", provenance: provenance(value) } satisfies TruthFact<VerifiedStandardsParameter>));
  return { zoneCode, state: "supported", reason: "sealed_display_safe_parameter_catalogue", parameters: facts };
}

export function expectedVerifiedStandardsParameters(zoneCode: string): VerifiedStandardsParameter[] {
  const selected = selectCompiledVerifiedStandards(zoneCode, approvedContext);
  return selected.state === "supported"
    ? selected.parameters.flatMap(item => item.state === "supported" ? [item.value] : [])
    : [];
}

export function isVerifiedStandardsParameter(value: unknown, zoneCode: string): value is VerifiedStandardsParameter {
  if (!object(value)) return false;
  const expected = expectedVerifiedStandardsParameters(zoneCode)
    .find(parameterValue => parameterValue.rule_id === value.rule_id);
  return Boolean(expected && canonicalVerifiedStandardsJson(expected) === canonicalVerifiedStandardsJson(value));
}

export function resolveCompiledVerifiedStandards(input: {
  apn: string;
  zoneCodes: string[];
  mappingState: VerifiedStandardsMappingState;
  context: VerifiedStandardsContext;
}): VerifiedStandardsResult | null {
  const status = verifiedStandardsBundleStatus();
  if (!status.valid || !/^\d{10}$/.test(input.apn) || !input.zoneCodes.length ||
      input.mappingState === "UNMAPPED" || input.mappingState === "INDETERMINATE") return null;
  const zones = [...new Set(input.zoneCodes)].sort();
  const standards = zones.map(zone => selectCompiledVerifiedStandards(zone, input.context));
  if (standards.some(item => item.state !== "supported")) return null;
  return {
    parcelIntelligence: { truth: {
      parcel: { state: "supported", value: { apn: input.apn } },
      baseZoning: { state: "supported", value: { mappingState: input.mappingState, zones } },
    } },
    standards,
    membership: "EXPANDED_213",
    display_safe: true,
    parcel_application_safe: false,
    project_applicability_determined: false,
    display: { title: "Verified residential standards", qualifier: coverageQualifier, zones: standards },
  };
}

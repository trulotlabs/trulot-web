import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const FEASIBILITY_PREVIEW_ENV = "TRULOT_FEASIBILITY_PREVIEW";
export const PRODUCT_STATES = [
  "MEETS_BASE_RULE",
  "DOES_NOT_MEET_BASE_RULE",
  "CONDITIONAL",
  "NEEDS_EVIDENCE",
  "NOT_APPLICABLE",
  "NOT_EVALUATED",
  "SOURCE_UNAVAILABLE",
  "OUTSIDE_CURRENT_SCOPE",
] as const;
export const OVERALL_STATES = [
  "BASE_PARCEL_RULES_EVALUATED",
  "PARTIAL_EVALUATION",
  "MORE_EVIDENCE_NEEDED",
  "OUTSIDE_CURRENT_SCOPE",
  "SOURCE_UNAVAILABLE",
] as const;

export type ProductState = (typeof PRODUCT_STATES)[number];
export type OverallState = (typeof OVERALL_STATES)[number];
export type PreviewMode = "rs" | "rm" | "private" | "blocked";

export type EvidenceSource = {
  artifact: string;
  privacy: "PUBLIC_AUTHORITY" | "PRIVATE_AUTHORIZED_EVIDENCE";
};

export type RuleResult = {
  card_id: string;
  rule_name: string;
  rule_family: string;
  scope: "PARCEL_RULE" | "PROJECT_COMPARISON" | "EXISTING_STRUCTURE_COMPLIANCE" | "PROGRAM_OR_OVERLAY";
  requirement: string | null;
  fact: string | null;
  result_state: ProductState;
  answer: string;
  why: string;
  evidence: EvidenceSource[];
  blocker_codes: string[];
  unresolved_condition: string | null;
  legal_version_context: string;
  privacy: "PUBLIC" | "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX";
  actions: string[];
};

export type PreviewPayload = {
  contract_version: string;
  scope: "PUBLIC_PARCEL" | "PRIVATE_PROJECT" | "EXISTING_STRUCTURE";
  privacy: "PUBLIC" | "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX";
  apn?: string;
  project_id?: string;
  application_date?: string;
  code_profile?: string;
  plan_status?: string;
  public_cache?: boolean;
  public_index?: boolean;
  private_plan_facts_present?: boolean;
  whole_project_compliance?: boolean;
  overall_state: OverallState;
  summary: {
    verified: string[];
    conditional: string[];
    needs_evidence: string[];
    not_evaluated: string[];
  };
  rule_results: RuleResult[];
  evidence_state: Record<string, unknown>;
  actions: string[];
  provenance: EvidenceSource[];
};

type PreviewEnvironment = {
  NODE_ENV?: string;
  TRULOT_FEASIBILITY_PREVIEW?: string;
};

const CONTRACT_VERSION = "bounded-feasibility-product-contract-v0-2026-10-02-p59";
const DATA_DIR = "data/bounded-feasibility-product-contract-v0";
const FIXTURES: Record<PreviewMode, { file: string; sha256: string }> = {
  rs: { file: "rs-6341302200-replay.json", sha256: "2f61fe7794cb2625b8dd1be86ee3b7af1bdd6adecd16e678a72279d7be33973d" },
  rm: { file: "rm-5442140600-public-replay.json", sha256: "844952b2889506bbdd97b75d8e87da123d9d5315cf16859a3a326ef2afebf9cd" },
  private: { file: "private-prj-1111087-replay.json", sha256: "2babfb578599810645ea0ea3e38006a20f3ea6872f2f2d0e91adc71f99bb2d94" },
  blocked: { file: "blocked-height-far-replay.json", sha256: "d61292149e7a7fb7904ed19e5affca7accfbceb49e815b07cae7b431b0593be2" },
};
const SUPPORTED_ACTIONS = new Set(["REVIEW_SOURCE", "SEE_EVIDENCE_NEEDED", "VIEW_ZONING_DETAILS"]);
const PROHIBITED_COPY = /\b(buildable|can build|\d+\s+units allowed|fully compliant|zoning compliant|existing structure legal|qualifies for ADU bonus)\b/i;
const PUBLIC_PRIVATE_MARKERS = /PRJ-|PRIVATE_AUTHORIZED|plan_status|application_date|code_profile|source_sha256|sheet_provenance|operator file/i;
const RENDERER_FIXTURE = { file: "renderer-contract.json", sha256: "51513966599e4aba51a1190f20c013a5e9566066f98c121579ff5d49583335a9" };

export class FeasibilityPreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeasibilityPreviewError";
  }
}

export function feasibilityPreviewEnabled(environment: PreviewEnvironment = process.env): boolean {
  return environment.TRULOT_FEASIBILITY_PREVIEW === "1"
    && (environment.NODE_ENV === "development" || environment.NODE_ENV === "test");
}

function fail(message: string): never {
  throw new FeasibilityPreviewError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) fail(`${label} is invalid`);
  return value;
}

function validateSource(value: unknown): EvidenceSource {
  if (!isRecord(value) || typeof value.artifact !== "string") fail("Evidence source is invalid");
  if (value.privacy !== "PUBLIC_AUTHORITY" && value.privacy !== "PRIVATE_AUTHORIZED_EVIDENCE") fail("Evidence privacy is invalid");
  return value as EvidenceSource;
}

export function validateFeasibilityPreviewPayload(value: unknown): PreviewPayload {
  if (!isRecord(value)) fail("Preview payload is malformed");
  if (value.contract_version !== CONTRACT_VERSION) fail("Preview contract version does not match");
  if (value.scope !== "PUBLIC_PARCEL" && value.scope !== "PRIVATE_PROJECT" && value.scope !== "EXISTING_STRUCTURE") fail("Preview scope is invalid");
  if (value.privacy !== "PUBLIC" && value.privacy !== "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX") fail("Preview privacy is invalid");
  if (!OVERALL_STATES.includes(value.overall_state as OverallState)) fail("Unknown overall state");
  if (!isRecord(value.summary)) fail("Preview summary is malformed");
  const summary = {
    verified: stringArray(value.summary.verified, "Verified summary"),
    conditional: stringArray(value.summary.conditional, "Conditional summary"),
    needs_evidence: stringArray(value.summary.needs_evidence, "Needs-evidence summary"),
    not_evaluated: stringArray(value.summary.not_evaluated, "Not-evaluated summary"),
  };
  if (!Array.isArray(value.rule_results)) fail("Rule results are malformed");
  const ruleResults = value.rule_results.map((candidate) => {
    if (!isRecord(candidate)) fail("Rule card is malformed");
    if (!PRODUCT_STATES.includes(candidate.result_state as ProductState)) fail("Unknown product state");
    for (const key of ["card_id", "rule_name", "rule_family", "answer", "why", "legal_version_context"] as const) {
      if (typeof candidate[key] !== "string") fail(`Rule card ${key} is missing`);
    }
    if (!Array.isArray(candidate.evidence)) fail("Rule evidence is malformed");
    candidate.evidence.map(validateSource);
    const blockers = stringArray(candidate.blocker_codes, "Rule blockers");
    const actions = stringArray(candidate.actions, "Rule actions");
    if (candidate.result_state === "NEEDS_EVIDENCE" && blockers.length === 0) fail("Needs-evidence rule is missing a blocker");
    if (actions.some((action) => !SUPPORTED_ACTIONS.has(action))) fail("Rule contains an unsupported action");
    if (PROHIBITED_COPY.test(`${candidate.answer} ${candidate.why}`)) fail("Rule contains prohibited product copy");
    return candidate as RuleResult;
  });
  const actions = stringArray(value.actions, "Preview actions");
  if (actions.some((action) => !SUPPORTED_ACTIONS.has(action))) fail("Preview contains an unsupported action");
  if (!isRecord(value.evidence_state) || !Array.isArray(value.provenance)) fail("Preview evidence state is malformed");
  value.provenance.map(validateSource);
  const payload = { ...value, summary, rule_results: ruleResults, actions } as PreviewPayload;
  const serialized = JSON.stringify(payload);
  if (payload.scope === "PUBLIC_PARCEL") {
    if (payload.privacy !== "PUBLIC" || PUBLIC_PRIVATE_MARKERS.test(serialized)) fail("Private evidence cannot render in public scope");
    if (payload.provenance.some((item) => item.privacy !== "PUBLIC_AUTHORITY")) fail("Public preview provenance contains private evidence");
  } else if (payload.scope === "PRIVATE_PROJECT") {
    if (payload.privacy !== "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX") fail("Private preview is not fully contained");
    if (payload.public_cache !== undefined && payload.public_cache !== false) fail("Private preview cache flag is invalid");
    if (payload.public_index !== undefined && payload.public_index !== false) fail("Private preview index flag is invalid");
  }
  return payload;
}

function readSealedJson(filePath: string, expectedSha256: string): unknown {
  let bytes: Buffer;
  try {
    bytes = readFileSync(filePath);
  } catch {
    fail("Preview fixture cannot be read");
  }
  if (createHash("sha256").update(bytes).digest("hex") !== expectedSha256) fail("Preview fixture seal does not match");
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("Preview fixture JSON is malformed");
  }
}

export function validateTemplateCatalog(value: unknown): Record<ProductState, string> {
  if (!isRecord(value) || value.free_form_conclusion_generation !== false || !isRecord(value.templates)) fail("Renderer contract is malformed");
  for (const state of PRODUCT_STATES) {
    if (typeof value.templates[state] !== "string" || value.templates[state].length === 0) fail(`Renderer template is missing for ${state}`);
  }
  return value.templates as Record<ProductState, string>;
}

export function normalizePreviewMode(value: string | string[] | undefined): PreviewMode {
  return value === "rm" || value === "private" || value === "blocked" ? value : "rs";
}

export function loadFeasibilityPreview(mode: PreviewMode, root = process.cwd()): PreviewPayload {
  const fixture = FIXTURES[mode];
  validateTemplateCatalog(readSealedJson(path.join(root, DATA_DIR, RENDERER_FIXTURE.file), RENDERER_FIXTURE.sha256));
  const filePath = path.join(root, DATA_DIR, fixture.file);
  return validateFeasibilityPreviewPayload(readSealedJson(filePath, fixture.sha256));
}

export const FEASIBILITY_PREVIEW_FIXTURES = FIXTURES;

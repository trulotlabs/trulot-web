import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const FIXTURE_PATH = "data/parcel-intelligence-v2/fixture-results.json";
const EXPECTED_FILE_SHA256 = "ee8f8aa742e6dc60d57303fd388c870c1bdbc32f097a87f807d962da23b7a85d";
const EXPECTED_CANONICAL_OUTPUT_SHA256 = "597645ff258e4c03760ade98cc9f6aecb1033eae5138b89006955089895b7d22";
const EXPECTED_CONTRACT_VERSION = "parcel-intelligence-v2-2026-09-30-v1";
const EXPECTED_FIXTURE_COUNT = 30;

type PreviewEnvironment = {
  NODE_ENV?: string;
  TRULOT_PARCEL_V2_PREVIEW?: string;
};

type FixtureResult = {
  identity?: { apn?: unknown };
  fingerprint_sha256?: unknown;
  parcel_compliance_evaluated?: unknown;
  development_capacity_calculated?: unknown;
  standards_blended?: unknown;
  production_runtime_wired?: unknown;
  [key: string]: unknown;
};

type FixtureEntry = {
  fixture_id?: unknown;
  coverage_tags?: unknown;
  result?: FixtureResult;
};

type FixtureCorpus = {
  canonical_output_sha256?: unknown;
  contract_version?: unknown;
  fixture_count?: unknown;
  results?: FixtureEntry[];
};

export type ParcelV2PreviewLoadResult =
  | { state: "ready"; fixtureId: string; coverageTags: string[]; result: FixtureResult }
  | { state: "not_found" };

export class ParcelV2PreviewFixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParcelV2PreviewFixtureError";
  }
}

export function parcelV2PreviewEnabled(environment: PreviewEnvironment = process.env): boolean {
  return environment.TRULOT_PARCEL_V2_PREVIEW === "1"
    && (environment.NODE_ENV === "development" || environment.NODE_ENV === "test");
}

function fail(message: string): never {
  throw new ParcelV2PreviewFixtureError(message);
}

function readSealedCorpus(filePath: string): FixtureCorpus {
  try {
    const bytes = readFileSync(filePath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== EXPECTED_FILE_SHA256) fail("Parcel V2 preview fixture seal does not match");
    return JSON.parse(bytes.toString("utf8")) as FixtureCorpus;
  } catch (error) {
    if (error instanceof ParcelV2PreviewFixtureError) throw error;
    fail("Parcel V2 preview fixture cannot be read");
  }
}

function validateCorpus(corpus: FixtureCorpus): Map<string, FixtureEntry> {
  if (corpus.canonical_output_sha256 !== EXPECTED_CANONICAL_OUTPUT_SHA256) fail("Parcel V2 canonical output seal does not match");
  if (corpus.contract_version !== EXPECTED_CONTRACT_VERSION) fail("Parcel V2 contract version does not match");
  if (corpus.fixture_count !== EXPECTED_FIXTURE_COUNT || corpus.results?.length !== EXPECTED_FIXTURE_COUNT) fail("Parcel V2 fixture count does not match");

  const fixtures = new Map<string, FixtureEntry>();
  for (const entry of corpus.results) {
    const result = entry.result;
    if (!result) fail("Parcel V2 fixture result is missing");
    const apn = result?.identity?.apn;
    if (typeof entry.fixture_id !== "string" || !Array.isArray(entry.coverage_tags) || !entry.coverage_tags.every((tag) => typeof tag === "string")) fail("Parcel V2 fixture metadata is invalid");
    if (typeof apn !== "string" || !/^\d{10}$/.test(apn) || fixtures.has(apn)) fail("Parcel V2 fixture identity is invalid");
    if (typeof result.fingerprint_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(result.fingerprint_sha256)) fail("Parcel V2 fixture fingerprint is invalid");
    if (result.parcel_compliance_evaluated !== false || result.development_capacity_calculated !== false || result.standards_blended !== false || result.production_runtime_wired !== false) fail("Parcel V2 fixture exceeds preview contract");
    fixtures.set(apn, entry);
  }
  return fixtures;
}

let sealedFixtures: Map<string, FixtureEntry> | undefined;

export function loadParcelV2PreviewResult(
  apn: string,
  fixturePath = path.join(process.cwd(), FIXTURE_PATH),
): ParcelV2PreviewLoadResult {
  if (!/^\d{10}$/.test(apn)) return { state: "not_found" };
  const fixtures = fixturePath === path.join(process.cwd(), FIXTURE_PATH)
    ? (sealedFixtures ??= validateCorpus(readSealedCorpus(fixturePath)))
    : validateCorpus(readSealedCorpus(fixturePath));
  const fixture = fixtures.get(apn);
  if (!fixture?.result) return { state: "not_found" };
  return {
    state: "ready",
    fixtureId: fixture.fixture_id as string,
    coverageTags: fixture.coverage_tags as string[],
    result: fixture.result,
  };
}

export const PARCEL_V2_PREVIEW_FIXTURE_PATH = FIXTURE_PATH;

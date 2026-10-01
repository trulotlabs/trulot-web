import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ParcelLookupRecord } from "./parcel-lookup-contract";

const CORPUS_PATH = "data/parcel-lookup-v0/corpus.json";
const SYNTHETIC_ACCEPTANCE_PATH = "data/parcel-lookup-v0/synthetic-acceptance-fixtures.json";
const EXPECTED_CONTRACT = "parcel-lookup-v0-2026-10-01-p43";
const EXPECTED_RECORD_COUNT = 49;
const EXPECTED_FILE_SHA256 = "1b7daa08bf603303c06a6461048e9afdd0e1ec686cccdf9ec70dfe877a1939cd";
const EXPECTED_CANONICAL_SHA256 = "bba3b91fabf73a1a4c124b27d7d502bc519ff3ebec27c16c7a5833576bb24df5";

type LookupCorpus = {
  contractVersion?: unknown;
  recordCount?: unknown;
  canonicalSha256?: unknown;
  records?: ParcelLookupRecord[];
};

export class ParcelLookupFixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParcelLookupFixtureError";
  }
}

export type ParcelLookupFailureInjection = "source-unavailable" | "selected-open";
export type ParcelLookupSyntheticFixture = "ranking" | "normalization";
type ParcelLookupPreviewEnv = { NODE_ENV?: string; TRULOT_PARCEL_V2_PREVIEW?: string };

export function parcelLookupFailureInjection(
  value: unknown,
  env: ParcelLookupPreviewEnv = process.env,
): ParcelLookupFailureInjection | null {
  if (env.NODE_ENV === "production" || env.TRULOT_PARCEL_V2_PREVIEW !== "1") return null;
  return value === "source-unavailable" || value === "selected-open" ? value : null;
}

export function parcelLookupSyntheticFixtureInjection(
  value: unknown,
  env: ParcelLookupPreviewEnv = process.env,
): ParcelLookupSyntheticFixture | null {
  if (env.NODE_ENV === "production" || env.TRULOT_PARCEL_V2_PREVIEW !== "1") return null;
  return value === "ranking" || value === "normalization" ? value : null;
}

export function loadParcelLookupSyntheticFixture(
  fixture: ParcelLookupSyntheticFixture,
  fixturePath = path.join(process.cwd(), SYNTHETIC_ACCEPTANCE_PATH),
): ParcelLookupRecord[] {
  const source = JSON.parse(readFileSync(fixturePath, "utf8")) as {
    authorityClassification?: unknown;
    rankingFixture?: {
      classification?: unknown;
      records?: Array<{ apn: string; address: string; unit: string | null }>;
    };
    normalizationFixture?: {
      classification?: unknown;
      inputApn?: unknown;
      expectedDisplayApn?: unknown;
    };
  };
  if (source.authorityClassification !== "TEST_ONLY_NOT_PUBLIC_AUTHORITY_EVIDENCE") {
    fail("Synthetic Parcel Lookup fixture authority classification does not match");
  }
  const makeRecord = (record: { apn: string; address: string | null; unit: string | null }, index: number): ParcelLookupRecord => {
    const normalizedAddress = record.address ? record.address : null;
    const normalizedUnitAddress = normalizedAddress && record.unit ? `${normalizedAddress} UNIT ${record.unit}` : normalizedAddress;
    const apnDisplay = `${record.apn.slice(0, 3)}-${record.apn.slice(3, 6)}-${record.apn.slice(6, 8)}-${record.apn.slice(8)}`;
    return {
      apn: record.apn,
      apnDisplay,
      parcelId: null,
      sourceObjectId: 9_900_000 + index,
      address: record.address,
      unit: record.unit,
      displayAddress: record.address ? `${record.address}${record.unit ? ` · Unit ${record.unit}` : ""}` : `APN ${apnDisplay}`,
      normalizedAddress,
      normalizedUnitAddress,
      zip: null,
      jurisdiction: "Synthetic test fixture",
      approximateAreaSqFt: 1,
      centroid: [-117, 32.7],
      geometryType: "Polygon",
      geometrySha256: "0".repeat(64),
      polygons: [[[[-117.001, 32.7], [-117, 32.7], [-117, 32.701], [-117.001, 32.7]]]],
      parcelIntelligenceAvailable: false,
      zoningState: "NOT_APPLICABLE",
      zones: [],
      coastalState: "NOT_APPLICABLE",
      coastalValue: null,
      existingUnits: null,
    };
  };
  if (fixture === "ranking") {
    if (source.rankingFixture?.classification !== "SYNTHETIC_RANKING_FIXTURE" || source.rankingFixture.records?.length !== 2) {
      fail("Synthetic ranking fixture does not match");
    }
    return source.rankingFixture.records.map((record, index) => makeRecord(record, index));
  }
  if (source.normalizationFixture?.classification !== "SYNTHETIC_NORMALIZATION_FIXTURE"
    || typeof source.normalizationFixture.inputApn !== "string"
    || typeof source.normalizationFixture.expectedDisplayApn !== "string") {
    fail("Synthetic normalization fixture does not match");
  }
  const record = makeRecord({ apn: source.normalizationFixture.inputApn, address: null, unit: null }, 3);
  if (record.apnDisplay !== source.normalizationFixture.expectedDisplayApn) fail("Synthetic normalization display does not match");
  return [record];
}

function fail(message: string): never {
  throw new ParcelLookupFixtureError(message);
}

function readCorpus(filePath: string): LookupCorpus {
  try {
    const bytes = readFileSync(filePath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== EXPECTED_FILE_SHA256) fail("Parcel Lookup V0 corpus seal does not match");
    return JSON.parse(bytes.toString("utf8")) as LookupCorpus;
  } catch (error) {
    if (error instanceof ParcelLookupFixtureError) throw error;
    fail("Parcel Lookup V0 corpus cannot be read");
  }
}

function validateCorpus(corpus: LookupCorpus): ParcelLookupRecord[] {
  if (corpus.contractVersion !== EXPECTED_CONTRACT) fail("Parcel Lookup V0 contract does not match");
  if (corpus.recordCount !== EXPECTED_RECORD_COUNT || corpus.records?.length !== EXPECTED_RECORD_COUNT) {
    fail("Parcel Lookup V0 record count does not match");
  }
  if (corpus.canonicalSha256 !== EXPECTED_CANONICAL_SHA256) fail("Parcel Lookup V0 canonical seal does not match");
  const seen = new Set<string>();
  for (const record of corpus.records) {
    if (!/^\d{10}$/.test(record.apn) || seen.has(record.apn)) fail("Parcel Lookup V0 APN identity is invalid");
    if (!/^[a-f0-9]{64}$/.test(record.geometrySha256) || !record.polygons.length) fail("Parcel Lookup V0 geometry is invalid");
    seen.add(record.apn);
  }
  return corpus.records;
}

let sealedRecords: ParcelLookupRecord[] | undefined;

export function loadParcelLookupRecords(
  corpusPath = path.join(process.cwd(), CORPUS_PATH),
): ParcelLookupRecord[] {
  if (corpusPath === path.join(process.cwd(), CORPUS_PATH)) {
    return (sealedRecords ??= validateCorpus(readCorpus(corpusPath)));
  }
  return validateCorpus(readCorpus(corpusPath));
}

export const PARCEL_LOOKUP_CORPUS_PATH = CORPUS_PATH;

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ParcelLookupRecord } from "./parcel-lookup-contract";

const CORPUS_PATH = "data/parcel-lookup-v0/corpus.json";
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

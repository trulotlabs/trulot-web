import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type {
  FrontDoorPublicEvaluation,
  LaMesaFrontDoorDataset,
  LaMesaFrontDoorSearchRecord,
} from "./la-mesa-adu-front-door";

type ServingArtifactRow = {
  apnNormalized: string;
  apnFormatted: string;
  situsAddressRaw: string | null;
  normalizedAddress: string | null;
  normalizedUnitAddress: string | null;
  unit: string | null;
  jurisdictionId: LaMesaFrontDoorSearchRecord["jurisdictionId"];
  jurisdictionDisplayName: string;
  canonicalScopeState: LaMesaFrontDoorSearchRecord["canonicalScopeState"];
};

type EvaluationArtifactRow = FrontDoorPublicEvaluation & { apn: string };

const ARTIFACT_ROOT = "data/la-mesa-parcel-lookup-serving-v0";
let cached: LaMesaFrontDoorDataset | null = null;

function loadRows<T>(name: string): T[] {
  const compressed = readFileSync(join(process.cwd(), ARTIFACT_ROOT, name));
  return gunzipSync(compressed)
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function toSearchRecord(
  row: ServingArtifactRow,
  authority: LaMesaFrontDoorSearchRecord["authority"],
): LaMesaFrontDoorSearchRecord {
  const displayAddress = row.situsAddressRaw
    ? `${row.situsAddressRaw}${row.unit ? ` Unit ${row.unit}` : ""}`
    : `Address unavailable · APN ${row.apnFormatted}`;
  return {
    apn: row.apnNormalized,
    apnDisplay: row.apnFormatted,
    address: row.situsAddressRaw,
    unit: row.unit,
    displayAddress,
    normalizedAddress: row.normalizedAddress,
    normalizedUnitAddress: row.normalizedUnitAddress,
    jurisdictionId: row.jurisdictionId,
    jurisdictionDisplayName: row.jurisdictionDisplayName,
    canonicalScopeState: row.canonicalScopeState,
    authority,
  };
}

export function buildLaMesaFrontDoorDataset(): LaMesaFrontDoorDataset {
  if (cached) return cached;
  const canonical = loadRows<ServingArtifactRow>("serving-rows.ndjson.gz");
  const comparison = loadRows<ServingArtifactRow>("cross-jurisdiction-comparison.ndjson.gz");
  const evaluationRows = loadRows<EvaluationArtifactRow>("evaluation-index.ndjson.gz");
  cached = {
    canonicalCount: canonical.length,
    records: [
      ...canonical.map((row) => toSearchRecord(row, "SEALED_PUBLIC_SERVING")),
      ...comparison.map((row) => toSearchRecord(row, "CROSS_JURISDICTION_COMPARISON")),
    ],
    evaluations: Object.fromEntries(
      evaluationRows.map(({ apn, ...evaluation }) => [apn, evaluation]),
    ),
  };
  return cached;
}

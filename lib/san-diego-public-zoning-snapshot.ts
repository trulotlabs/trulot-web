import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { normalizeApnDigits } from "./parcel-slug";

export const SAN_DIEGO_PUBLIC_ZONING_SNAPSHOT_VERSION = "sd-public-zoning-2026-10-27-v0" as const;
export const SAN_DIEGO_PUBLIC_ZONING_MANIFEST_SHA256 = "8ef738de1739c2670566f3ac64e659bec320d4cdcbd257b2e6c371bbbfabfc5c" as const;
export const SAN_DIEGO_PUBLIC_ZONING_ROWS = 393_733;
export const SAN_DIEGO_PUBLIC_ZONING_APN_FINGERPRINT = "93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25" as const;

export type SanDiegoZoningState = "SINGLE_ZONE" | "MULTI_ZONE" | "BOUNDARY_SLIVER" | "UNMAPPED" | "INDETERMINATE";
export type SanDiegoCoastalState = "OUTSIDE_COASTAL" | "INSIDE_COASTAL" | "BOUNDARY_AMBIGUOUS";
export type SanDiegoProfileSupportState =
  | "SUPPORTED_MODIFIER_REVIEW_REQUIRED"
  | "COASTAL_REVIEW_REQUIRED"
  | "UNSUPPORTED_PROFILE"
  | "MAPPING_REVIEW_REQUIRED";

export type SanDiegoPublicZoningDto = {
  apn: string;
  jurisdiction: "CITY_OF_SAN_DIEGO";
  zoningState: SanDiegoZoningState;
  selectedZone: string | null;
  dominantZone: string | null;
  materialZones: Array<{ zone: string; parcelSharePercent: number; role: "MATERIAL" | "BOUNDARY_SLIVER" }>;
  coastalState: SanDiegoCoastalState;
  profileSupportState: SanDiegoProfileSupportState;
  profileVersion: string | null;
  modifierReviewState: "REQUIRED" | "NOT_APPLICABLE";
  sourceReceipt: {
    snapshotVersion: typeof SAN_DIEGO_PUBLIC_ZONING_SNAPSHOT_VERSION;
    parcelAcquisition: string;
    zoningAcquisition: string;
    coastalVersion: string;
    classificationVersion: string;
    packet79ArtifactSha256: string;
    profileRegistrySha256: string;
  };
};

export type SanDiegoPublicZoningResult =
  | { state: "found"; zoning: SanDiegoPublicZoningDto; cacheKey: string }
  | { state: "not_found"; zoning: null; cacheKey: string }
  | { state: "source_unavailable"; zoning: null; cacheKey: string; reason: string };

type SnapshotManifest = {
  schemaVersion: number;
  snapshotVersion: string;
  rowCount: number;
  distinctApns: number;
  apnFingerprint: string;
  shards: Array<{ prefix: string; file: string; rows: number; sha256: string }>;
};

type SnapshotMetric = { name: "snapshot_found" | "snapshot_not_found" | "snapshot_unavailable"; value: number };
type SnapshotReaderOptions = {
  rootDir?: string;
  expectedManifestSha256?: string;
  metricSink?: (metric: SnapshotMetric) => void;
};

const DEFAULT_ROOT = join(process.cwd(), "data/san-diego-public-zoning-snapshot-v0");

function defaultSnapshotMetricSink(metric: SnapshotMetric): void {
  console.info(JSON.stringify({
    event: "trulot_sd_public_zoning_snapshot",
    metric: metric.name,
    snapshotVersion: SAN_DIEGO_PUBLIC_ZONING_SNAPSHOT_VERSION,
    value: metric.value,
  }));
}

export function sanDiegoPublicZoningSnapshotEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.TRULOT_SD_PUBLIC_ZONING_SNAPSHOT === "1";
}

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isDto(value: unknown, prefix: string): value is SanDiegoPublicZoningDto {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<SanDiegoPublicZoningDto>;
  return typeof row.apn === "string"
    && /^\d{10}$/.test(row.apn)
    && row.apn.startsWith(prefix)
    && row.jurisdiction === "CITY_OF_SAN_DIEGO"
    && ["SINGLE_ZONE", "MULTI_ZONE", "BOUNDARY_SLIVER", "UNMAPPED", "INDETERMINATE"].includes(row.zoningState ?? "")
    && ["OUTSIDE_COASTAL", "INSIDE_COASTAL", "BOUNDARY_AMBIGUOUS"].includes(row.coastalState ?? "")
    && ["SUPPORTED_MODIFIER_REVIEW_REQUIRED", "COASTAL_REVIEW_REQUIRED", "UNSUPPORTED_PROFILE", "MAPPING_REVIEW_REQUIRED"].includes(row.profileSupportState ?? "")
    && (row.selectedZone === null || typeof row.selectedZone === "string")
    && (row.dominantZone === null || typeof row.dominantZone === "string")
    && Array.isArray(row.materialZones)
    && row.materialZones.every((item) => item
      && typeof item.zone === "string"
      && typeof item.parcelSharePercent === "number"
      && ["MATERIAL", "BOUNDARY_SLIVER"].includes(item.role))
    && row.sourceReceipt?.snapshotVersion === SAN_DIEGO_PUBLIC_ZONING_SNAPSHOT_VERSION
    && typeof row.sourceReceipt.parcelAcquisition === "string"
    && typeof row.sourceReceipt.zoningAcquisition === "string"
    && typeof row.sourceReceipt.coastalVersion === "string"
    && typeof row.sourceReceipt.classificationVersion === "string";
}

export function createSanDiegoPublicZoningReader(options: SnapshotReaderOptions = {}) {
  const root = options.rootDir ?? DEFAULT_ROOT;
  const expectedManifest = options.expectedManifestSha256 ?? SAN_DIEGO_PUBLIC_ZONING_MANIFEST_SHA256;
  let manifestCache: SnapshotManifest | null = null;
  const shardCache = new Map<string, Map<string, SanDiegoPublicZoningDto>>();

  function loadManifest(): SnapshotManifest {
    if (manifestCache) return manifestCache;
    const bytes = readFileSync(join(root, "manifest.json"));
    if (digest(bytes) !== expectedManifest) throw new Error("manifest_fingerprint_mismatch");
    const manifest = JSON.parse(bytes.toString("utf8")) as SnapshotManifest;
    const population = manifest.shards.reduce((sum, shard) => sum + shard.rows, 0);
    if (
      manifest.schemaVersion !== 1
      || manifest.snapshotVersion !== SAN_DIEGO_PUBLIC_ZONING_SNAPSHOT_VERSION
      || manifest.rowCount !== SAN_DIEGO_PUBLIC_ZONING_ROWS
      || manifest.distinctApns !== SAN_DIEGO_PUBLIC_ZONING_ROWS
      || manifest.apnFingerprint !== SAN_DIEGO_PUBLIC_ZONING_APN_FINGERPRINT
      || population !== SAN_DIEGO_PUBLIC_ZONING_ROWS
    ) throw new Error("manifest_population_or_version_mismatch");
    manifestCache = manifest;
    return manifest;
  }

  function loadShard(prefix: string, manifest: SnapshotManifest): Map<string, SanDiegoPublicZoningDto> | null {
    const cacheKey = `${manifest.snapshotVersion}:${prefix}`;
    const cached = shardCache.get(cacheKey);
    if (cached) return cached;
    const receipt = manifest.shards.find((item) => item.prefix === prefix);
    if (!receipt) return null;
    const bytes = readFileSync(join(root, receipt.file));
    if (digest(bytes) !== receipt.sha256) throw new Error("shard_fingerprint_mismatch");
    const lines = gunzipSync(bytes).toString("utf8").split("\n").filter(Boolean);
    if (lines.length !== receipt.rows) throw new Error("shard_population_mismatch");
    const rows = new Map<string, SanDiegoPublicZoningDto>();
    for (const line of lines) {
      const row: unknown = JSON.parse(line);
      if (!isDto(row, prefix) || rows.has(row.apn)) throw new Error("shard_schema_or_identity_mismatch");
      rows.set(row.apn, row);
    }
    shardCache.set(cacheKey, rows);
    while (shardCache.size > 4) shardCache.delete(shardCache.keys().next().value as string);
    return rows;
  }

  return {
    lookup(rawApn: string): SanDiegoPublicZoningResult {
      const rawDigits = rawApn.replace(/\D/g, "");
      const apn = normalizeApnDigits(rawApn);
      const fallbackKey = `${SAN_DIEGO_PUBLIC_ZONING_SNAPSHOT_VERSION}:${apn.slice(0, 3)}`;
      if (rawDigits.length !== 10 || !/^\d{10}$/.test(apn)) {
        (options.metricSink ?? defaultSnapshotMetricSink)({ name: "snapshot_unavailable", value: 1 });
        return { state: "source_unavailable", zoning: null, cacheKey: fallbackKey, reason: "invalid_apn" };
      }
      try {
        const manifest = loadManifest();
        const cacheKey = `${manifest.snapshotVersion}:${apn.slice(0, 3)}`;
        const shard = loadShard(apn.slice(0, 3), manifest);
        const zoning = shard?.get(apn) ?? null;
        if (!zoning) {
          (options.metricSink ?? defaultSnapshotMetricSink)({ name: "snapshot_not_found", value: 1 });
          return { state: "not_found", zoning: null, cacheKey };
        }
        (options.metricSink ?? defaultSnapshotMetricSink)({ name: "snapshot_found", value: 1 });
        return { state: "found", zoning, cacheKey };
      } catch (error) {
        (options.metricSink ?? defaultSnapshotMetricSink)({ name: "snapshot_unavailable", value: 1 });
        return {
          state: "source_unavailable",
          zoning: null,
          cacheKey: fallbackKey,
          reason: error instanceof Error ? error.message : "snapshot_load_failed",
        };
      }
    },
    clearCache(): void {
      manifestCache = null;
      shardCache.clear();
    },
  };
}

const defaultReader = createSanDiegoPublicZoningReader();

export function getSanDiegoPublicZoning(rawApn: string): SanDiegoPublicZoningResult {
  return defaultReader.lookup(rawApn);
}

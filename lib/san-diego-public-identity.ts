import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { canonicalParcelIdentity, type CanonicalParcelIdentity, type StructuredPublicAddress } from "./parcel-identity";
import { normalizeApnDigits } from "./parcel-slug-core";

export const SAN_DIEGO_PUBLIC_IDENTITY_VERSION = "sd-public-identity-2026-10-27-v0" as const;
export const SAN_DIEGO_PUBLIC_IDENTITY_MANIFEST_SHA256 = "34f96a186c510710c62bc59cceb8a12a89bb60f388a3d10b38b44beb9ce71ab4" as const;
export const SAN_DIEGO_PUBLIC_IDENTITY_ROWS = 393_733;

type IdentityRow = {
  apn: string;
  jurisdiction: "san-diego";
  address: StructuredPublicAddress;
  canonicalSlug: string;
  canonicalPath: string;
  canonicalUrl: string;
};
type Manifest = { schemaVersion: number; identityVersion: string; parcelIdentityVersion: string; rowCount: number; distinctApns: number; shards: Array<{ prefix: string; file: string; rows: number; sha256: string }> };
type Options = { rootDir?: string; expectedManifestSha256?: string; metricSink?: (metric: { name: "identity_found" | "identity_not_found" | "identity_unavailable"; value: number }) => void };
export type SanDiegoPublicIdentityResult =
  | { state: "found"; identity: CanonicalParcelIdentity; address: StructuredPublicAddress; cacheKey: string }
  | { state: "not_found"; identity: null; address: null; cacheKey: string }
  | { state: "source_unavailable"; identity: null; address: null; cacheKey: string; reason: string };

const DEFAULT_ROOT = join(process.cwd(), "data/san-diego-public-identity-v0");
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function defaultMetricSink(metric: { name: string; value: number }) {
  console.info(JSON.stringify({ event: "trulot_sd_public_identity", identityVersion: SAN_DIEGO_PUBLIC_IDENTITY_VERSION, metric: metric.name, value: metric.value }));
}
function isRow(value: unknown, prefix: string): value is IdentityRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<IdentityRow>;
  return typeof row.apn === "string" && /^\d{10}$/.test(row.apn) && row.apn.startsWith(prefix)
    && row.jurisdiction === "san-diego" && row.address?.version === "public-address-v1"
    && Array.isArray(row.address.canonicalAddressTokens) && row.address.canonicalAddressTokens.every((token) => typeof token === "string")
    && typeof row.canonicalSlug === "string" && typeof row.canonicalPath === "string" && typeof row.canonicalUrl === "string";
}

export function createSanDiegoPublicIdentityReader(options: Options = {}) {
  const root = options.rootDir ?? DEFAULT_ROOT;
  const expectedManifest = options.expectedManifestSha256 ?? SAN_DIEGO_PUBLIC_IDENTITY_MANIFEST_SHA256;
  let manifestCache: Manifest | null = null;
  const shardCache = new Map<string, Map<string, IdentityRow>>();
  function manifest() {
    if (manifestCache) return manifestCache;
    const bytes = readFileSync(join(root, "manifest.json"));
    if (digest(bytes) !== expectedManifest) throw new Error("identity_manifest_fingerprint_mismatch");
    const value = JSON.parse(bytes.toString("utf8")) as Manifest;
    if (value.schemaVersion !== 1 || value.identityVersion !== SAN_DIEGO_PUBLIC_IDENTITY_VERSION || value.parcelIdentityVersion !== "parcel-identity-v2" || value.rowCount !== SAN_DIEGO_PUBLIC_IDENTITY_ROWS || value.distinctApns !== SAN_DIEGO_PUBLIC_IDENTITY_ROWS || value.shards.reduce((sum, shard) => sum + shard.rows, 0) !== SAN_DIEGO_PUBLIC_IDENTITY_ROWS) throw new Error("identity_manifest_population_or_version_mismatch");
    manifestCache = value; return value;
  }
  function shard(prefix: string, value: Manifest) {
    const cacheKey = `${value.identityVersion}:${prefix}`;
    const cached = shardCache.get(cacheKey); if (cached) return cached;
    const receipt = value.shards.find((item) => item.prefix === prefix); if (!receipt) return null;
    const bytes = readFileSync(join(root, receipt.file)); if (digest(bytes) !== receipt.sha256) throw new Error("identity_shard_fingerprint_mismatch");
    const lines = gunzipSync(bytes).toString("utf8").split("\n").filter(Boolean); if (lines.length !== receipt.rows) throw new Error("identity_shard_population_mismatch");
    const rows = new Map<string, IdentityRow>();
    for (const line of lines) { const row: unknown = JSON.parse(line); if (!isRow(row, prefix) || rows.has(row.apn)) throw new Error("identity_shard_schema_or_identity_mismatch"); rows.set(row.apn, row); }
    shardCache.set(cacheKey, rows); while (shardCache.size > 4) shardCache.delete(shardCache.keys().next().value as string); return rows;
  }
  return {
    lookup(rawApn: string): SanDiegoPublicIdentityResult {
      const digits = rawApn.replace(/\D/g, ""); const apn = normalizeApnDigits(rawApn); const fallbackKey = `${SAN_DIEGO_PUBLIC_IDENTITY_VERSION}:${apn.slice(0, 3)}`;
      if (digits.length !== 10) { (options.metricSink ?? defaultMetricSink)({ name: "identity_unavailable", value: 1 }); return { state: "source_unavailable", identity: null, address: null, cacheKey: fallbackKey, reason: "invalid_apn" }; }
      try {
        const m = manifest(); const cacheKey = `${m.identityVersion}:${apn.slice(0, 3)}`; const row = shard(apn.slice(0, 3), m)?.get(apn) ?? null;
        if (!row) { (options.metricSink ?? defaultMetricSink)({ name: "identity_not_found", value: 1 }); return { state: "not_found", identity: null, address: null, cacheKey }; }
        const identity = canonicalParcelIdentity({ apn, jurisdiction: "san-diego", structuredAddress: row.address, provenance: row.address.provenance });
        if (identity.canonicalSlug !== row.canonicalSlug || identity.canonicalPath !== row.canonicalPath || identity.canonicalUrl !== row.canonicalUrl) throw new Error("identity_runtime_canonical_mismatch");
        (options.metricSink ?? defaultMetricSink)({ name: "identity_found", value: 1 }); return { state: "found", identity, address: row.address, cacheKey };
      } catch (error) {
        (options.metricSink ?? defaultMetricSink)({ name: "identity_unavailable", value: 1 });
        return { state: "source_unavailable", identity: null, address: null, cacheKey: fallbackKey, reason: error instanceof Error ? error.message : "identity_load_failed" };
      }
    },
    clearCache() { manifestCache = null; shardCache.clear(); },
  };
}

const defaultReader = createSanDiegoPublicIdentityReader();
export function getSanDiegoPublicIdentity(rawApn: string) { return defaultReader.lookup(rawApn); }

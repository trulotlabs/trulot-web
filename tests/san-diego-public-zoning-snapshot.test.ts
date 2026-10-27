import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import publicSitemap from "../app/sitemap";
import integrity from "../data/san-diego-public-zoning-snapshot-v0/integrity.json";
import manifest from "../data/san-diego-public-zoning-snapshot-v0/manifest.json";
import profileRegistry from "../data/san-diego-residential-rule-coverage-final-v0/final-profile-registry.json";
import { effectiveParcelIndexState, sanDiegoIndexingRequested } from "../lib/parcel-indexing";
import { activeParcelSitemapEntries } from "../lib/parcel-sitemap";
import {
  createSanDiegoPublicZoningReader,
  SAN_DIEGO_PUBLIC_ZONING_APN_FINGERPRINT,
  SAN_DIEGO_PUBLIC_ZONING_MANIFEST_SHA256,
  SAN_DIEGO_PUBLIC_ZONING_ROWS,
  SAN_DIEGO_PUBLIC_ZONING_SNAPSHOT_VERSION,
  sanDiegoPublicZoningSnapshotEnabled,
} from "../lib/san-diego-public-zoning-snapshot";

const root = "data/san-diego-public-zoning-snapshot-v0";
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

function tempSnapshot(mutator?: (value: typeof manifest) => void, shardApn = "6341302200") {
  const dir = mkdtempSync(join(tmpdir(), "trulot-sd-zoning-"));
  mkdirSync(join(dir, "shards"));
  const value = structuredClone(manifest);
  mutator?.(value);
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(join(dir, "manifest.json"), bytes);
  const file = `shards/${shardApn.slice(0, 3)}.ndjson.gz`;
  copyFileSync(join(root, file), join(dir, file));
  return { dir, rootDir: dir, expectedManifestSha256: sha(bytes), file };
}

test("sealed snapshot and profile registry integrity are exact", () => {
  assert.equal(profileRegistry.profiles.length, 31);
  assert.equal(sha(readFileSync(`${root}/manifest.json`)), SAN_DIEGO_PUBLIC_ZONING_MANIFEST_SHA256);
  for (const [file, expected] of Object.entries(integrity.files)) {
    assert.equal(sha(readFileSync(`${root}/${file}`)), expected, file);
  }
  assert.equal(manifest.rowCount, SAN_DIEGO_PUBLIC_ZONING_ROWS);
  assert.equal(manifest.distinctApns, SAN_DIEGO_PUBLIC_ZONING_ROWS);
  assert.equal(manifest.apnFingerprint, SAN_DIEGO_PUBLIC_ZONING_APN_FINGERPRINT);
  assert.equal(manifest.futureSdACohort, 318_701);
  assert.deepEqual(manifest.zoningStateCounts, {
    BOUNDARY_SLIVER: 1_097, INDETERMINATE: 1_641, MULTI_ZONE: 73_064,
    SINGLE_ZONE: 317_604, UNMAPPED: 327,
  });
});

test("all 393,733 public DTOs reproduce population, identity fingerprint, and profile binding", () => {
  const apns = new Set<string>();
  const states: Record<string, number> = {};
  const profiles: Record<string, number> = {};
  let rows = 0;
  let futureSdACohort = 0;
  for (const shard of manifest.shards) {
    const lines = gunzipSync(readFileSync(`${root}/${shard.file}`)).toString("utf8").trim().split("\n");
    assert.equal(lines.length, shard.rows, shard.file);
    for (const line of lines) {
      const row = JSON.parse(line) as { apn: string; zoningState: string; selectedZone: string | null; coastalState: string; materialZones: unknown[]; profileSupportState: string; sourceReceipt: Record<string, string> };
      assert.equal(apns.has(row.apn), false, row.apn);
      apns.add(row.apn);
      states[row.zoningState] = (states[row.zoningState] ?? 0) + 1;
      profiles[row.profileSupportState] = (profiles[row.profileSupportState] ?? 0) + 1;
      assert.equal(row.sourceReceipt.snapshotVersion, SAN_DIEGO_PUBLIC_ZONING_SNAPSHOT_VERSION);
      assert.ok(row.sourceReceipt.zoningAcquisition);
      if (
        ["SINGLE_ZONE", "BOUNDARY_SLIVER"].includes(row.zoningState)
        && row.selectedZone
        && row.coastalState
        && row.materialZones.length > 0
      ) futureSdACohort += 1;
      rows += 1;
    }
  }
  assert.equal(rows, SAN_DIEGO_PUBLIC_ZONING_ROWS);
  assert.equal(apns.size, SAN_DIEGO_PUBLIC_ZONING_ROWS);
  assert.deepEqual(states, manifest.zoningStateCounts);
  assert.deepEqual(profiles, manifest.profileSupportCounts);
  assert.equal(futureSdACohort, 318_701);
});

test("adapter preserves every zoning, coastal, and profile review state", () => {
  const reader = createSanDiegoPublicZoningReader();
  const cases = [
    ["6341302200", "SINGLE_ZONE", "OUTSIDE_COASTAL", "SUPPORTED_MODIFIER_REVIEW_REQUIRED"],
    ["3061953000", "BOUNDARY_SLIVER", "OUTSIDE_COASTAL", "UNSUPPORTED_PROFILE"],
    ["4304211000", "MULTI_ZONE", "OUTSIDE_COASTAL", "MAPPING_REVIEW_REQUIRED"],
    ["4303410600", "INDETERMINATE", "OUTSIDE_COASTAL", "MAPPING_REVIEW_REQUIRED"],
    ["7600360300", "UNMAPPED", "INSIDE_COASTAL", "MAPPING_REVIEW_REQUIRED"],
    ["3506320400", "SINGLE_ZONE", "INSIDE_COASTAL", "SUPPORTED_MODIFIER_REVIEW_REQUIRED"],
    ["4360200200", "SINGLE_ZONE", "BOUNDARY_AMBIGUOUS", "COASTAL_REVIEW_REQUIRED"],
  ] as const;
  for (const [apn, state, coastal, profile] of cases) {
    const result = reader.lookup(apn);
    assert.equal(result.state, "found", apn);
    if (result.state === "found") {
      assert.equal(result.zoning.zoningState, state);
      assert.equal(result.zoning.coastalState, coastal);
      assert.equal(result.zoning.profileSupportState, profile);
      assert.equal(result.cacheKey, `${SAN_DIEGO_PUBLIC_ZONING_SNAPSHOT_VERSION}:${apn.slice(0, 3)}`);
    }
  }
});

test("snapshot, indexing, kill switch, and sitemap gates remain independent and off", () => {
  assert.equal(sanDiegoPublicZoningSnapshotEnabled({}), false);
  assert.equal(sanDiegoPublicZoningSnapshotEnabled({ TRULOT_SD_PUBLIC_ZONING_SNAPSHOT: "1" }), true);
  assert.equal(sanDiegoIndexingRequested({}), false);
  assert.equal(sanDiegoIndexingRequested({ TRULOT_SD_PUBLIC_ZONING_SNAPSHOT: "1" }), false);
  assert.equal(sanDiegoIndexingRequested({ TRULOT_SD_INDEXING: "1" }), true);
  assert.equal(effectiveParcelIndexState("SAN_DIEGO", "INDEXABLE", { TRULOT_SD_INDEXING: "1" }), "NOINDEX_TEMPORARY");
  assert.deepEqual(activeParcelSitemapEntries(), []);
  assert.deepEqual(publicSitemap().map((entry) => entry.url), ["https://trulot.com"]);
});

test("missing APN and invalid identity fail closed with monitoring", () => {
  const metrics: string[] = [];
  const reader = createSanDiegoPublicZoningReader({ metricSink: (metric) => metrics.push(metric.name) });
  assert.equal(reader.lookup("6349999999").state, "not_found");
  assert.equal(reader.lookup("bad").state, "source_unavailable");
  assert.deepEqual(metrics, ["snapshot_not_found", "snapshot_unavailable"]);
});

test("missing, corrupt, wrong population, and unsupported version snapshots fail closed", () => {
  const missing = createSanDiegoPublicZoningReader({ rootDir: join(tmpdir(), "missing-trulot-snapshot") });
  assert.equal(missing.lookup("6341302200").state, "source_unavailable");

  const corrupt = tempSnapshot();
  writeFileSync(join(corrupt.dir, corrupt.file), "corrupt");
  assert.equal(createSanDiegoPublicZoningReader(corrupt).lookup("6341302200").state, "source_unavailable");

  const population = tempSnapshot((value) => { value.rowCount -= 1; });
  assert.equal(createSanDiegoPublicZoningReader(population).lookup("6341302200").state, "source_unavailable");

  const version = tempSnapshot((value) => { value.snapshotVersion = "unsupported"; });
  assert.equal(createSanDiegoPublicZoningReader(version).lookup("6341302200").state, "source_unavailable");
});

test("one-step rollback is environment-only and immutable cache keys are versioned", () => {
  const before = {};
  const on = { TRULOT_SD_PUBLIC_ZONING_SNAPSHOT: "1" };
  assert.equal(sanDiegoPublicZoningSnapshotEnabled(before), false);
  assert.equal(sanDiegoPublicZoningSnapshotEnabled(on), true);
  assert.equal(sanDiegoPublicZoningSnapshotEnabled(before), false);
  const result = createSanDiegoPublicZoningReader().lookup("6341302200");
  assert.equal(result.cacheKey, `${SAN_DIEGO_PUBLIC_ZONING_SNAPSHOT_VERSION}:634`);
});

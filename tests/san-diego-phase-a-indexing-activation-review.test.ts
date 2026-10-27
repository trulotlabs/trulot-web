import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import authorization from "../data/san-diego-phase-a-indexing-activation-review-v0/authorization.json";
import audits from "../data/san-diego-phase-a-indexing-activation-review-v0/audits.json";
import cohort from "../data/san-diego-phase-a-indexing-activation-review-v0/cohort.json";
import integrity from "../data/san-diego-phase-a-indexing-activation-review-v0/integrity.json";
import preview from "../data/san-diego-phase-a-indexing-activation-review-v0/sitemap-preview.json";
import snapshotManifest from "../data/san-diego-public-zoning-snapshot-v0/manifest.json";
import { effectiveParcelIndexState, emitParcelIndexMetric, sanDiegoIndexingRequested } from "../lib/parcel-indexing";
import { activeParcelSitemapEntries, isFuturePhaseACandidate } from "../lib/parcel-sitemap";
import { createSanDiegoPublicZoningReader, sanDiegoPublicZoningSnapshotEnabled } from "../lib/san-diego-public-zoning-snapshot";

const root = "data/san-diego-phase-a-indexing-activation-review-v0";
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

test("Packet 86 evidence and unpublished sitemap receipts are sealed", () => {
  for (const [file, expected] of Object.entries(integrity.files)) {
    assert.equal(sha(readFileSync(`${root}/${file}`)), expected, file);
  }
  assert.equal(preview.published, false);
  assert.equal(preview.urlCount, 318_701);
  assert.equal(preview.shardCount, 13);
  assert.equal(preview.duplicateCount, 0);
  assert.equal(preview.invalidUrlCount, 0);
});

test("all sitemap preview files contain exactly the sealed canonical population", () => {
  let count = 0;
  const urls = new Set<string>();
  for (const receipt of preview.shards) {
    const xml = gunzipSync(readFileSync(`${root}/${receipt.file}`)).toString("utf8");
    const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    assert.equal(matches.length, receipt.urls);
    for (const url of matches) {
      assert.match(url, /^https:\/\/trulot\.com\/parcel\/san-diego\/(?:apn-\d{10}|\d{3}-\d{3}-\d{2}-\d{2}-[a-z0-9-]+)$/);
      assert.equal(urls.has(url), false, url);
      urls.add(url);
    }
    assert.equal((xml.match(/<lastmod>2026-09-24<\/lastmod>/g) ?? []).length, receipt.urls);
    count += matches.length;
  }
  assert.equal(count, 318_701);
  assert.equal(urls.size, 318_701);
});

test("exact cohort and exclusions follow the closed Phase A doctrine", () => {
  assert.equal(cohort.candidateCount, 318_701);
  assert.equal(cohort.addressedCandidates, 308_934);
  assert.equal(cohort.apnOnlyCandidates, 9_767);
  assert.equal(cohort.identityAnomalies, 0);
  assert.deepEqual(cohort.exclusions, {
    zoning_state_indeterminate: 1_641,
    zoning_state_multi_zone: 73_064,
    zoning_state_unmapped: 327,
  });
  assert.equal(isFuturePhaseACandidate("SAN_DIEGO", {
    apn: "6341302200", address: "1456 27TH ST", jurisdictionConfirmed: true,
    zoningState: "SINGLE_ZONE", publicOutputSatisfied: true, identitySafe: true,
    sourceUsable: true, thin: false, sourceLastModified: "2026-09-24",
  }), true);
  for (const state of ["MULTI_ZONE", "INDETERMINATE", "UNMAPPED"]) {
    assert.equal(isFuturePhaseACandidate("SAN_DIEGO", {
      apn: "6341302200", address: null, jurisdictionConfirmed: true, zoningState: state,
      publicOutputSatisfied: true, identitySafe: true, sourceUsable: true, thin: false,
      sourceLastModified: "2026-09-24",
    }), false);
  }
});

test("snapshot, indexing, sitemap, and code kill switch remain independent", () => {
  assert.equal(sanDiegoPublicZoningSnapshotEnabled({ TRULOT_SD_PUBLIC_ZONING_SNAPSHOT: "1" }), true);
  assert.equal(sanDiegoIndexingRequested({ TRULOT_SD_PUBLIC_ZONING_SNAPSHOT: "1" }), false);
  assert.equal(sanDiegoIndexingRequested({ TRULOT_SD_INDEXING: "1" }), true);
  assert.equal(effectiveParcelIndexState("SAN_DIEGO", "INDEXABLE", { TRULOT_SD_INDEXING: "1" }), "NOINDEX_TEMPORARY");
  assert.deepEqual(activeParcelSitemapEntries(), []);
});

test("production authorization is absent and no production action is recorded", () => {
  assert.deepEqual(authorization, {
    productionActionsPerformed: [], productionDeploymentAuthorized: false,
    productionEnvironmentMutationAuthorized: false, promotionAuthorized: false, pushAuthorized: false,
  });
});

test("every required index-safety metric has a privacy-safe structured server signal", () => {
  const output: string[] = [];
  const original = console.info;
  console.info = (value?: unknown) => output.push(String(value));
  try {
    for (const name of ["route_2xx", "route_404", "source_unavailable", "noindex", "canonical_mismatch", "sitemap_count", "serializer_exclusion", "privacy_filter_failure"] as const) {
      emitParcelIndexMetric(undefined, { name, jurisdiction: "SAN_DIEGO", value: 1 });
    }
  } finally {
    console.info = original;
  }
  assert.equal(output.length, 8);
  for (const line of output) {
    const event = JSON.parse(line);
    assert.equal(event.event, "trulot_parcel_index");
    assert.deepEqual(Object.keys(event).sort(), ["event", "jurisdiction", "metric", "value"]);
  }
});

test("missing shard and wrong shard fingerprint fail closed", () => {
  const apn = "6341302200";
  const file = `shards/${apn.slice(0, 3)}.ndjson.gz`;

  const missingRoot = mkdtempSync(join(tmpdir(), "trulot-packet86-missing-shard-"));
  mkdirSync(join(missingRoot, "shards"));
  const missingManifest = `${JSON.stringify(snapshotManifest, null, 2)}\n`;
  writeFileSync(join(missingRoot, "manifest.json"), missingManifest);
  assert.equal(createSanDiegoPublicZoningReader({
    rootDir: missingRoot,
    expectedManifestSha256: createHash("sha256").update(missingManifest).digest("hex"),
  }).lookup(apn).state, "source_unavailable");

  const fingerprintRoot = mkdtempSync(join(tmpdir(), "trulot-packet86-wrong-fingerprint-"));
  mkdirSync(join(fingerprintRoot, "shards"));
  copyFileSync(join("data/san-diego-public-zoning-snapshot-v0", file), join(fingerprintRoot, file));
  const wrongFingerprint = structuredClone(snapshotManifest);
  const shard = wrongFingerprint.shards.find((item) => item.file === file);
  assert.ok(shard);
  shard.sha256 = "0".repeat(64);
  const fingerprintManifest = `${JSON.stringify(wrongFingerprint, null, 2)}\n`;
  writeFileSync(join(fingerprintRoot, "manifest.json"), fingerprintManifest);
  assert.equal(createSanDiegoPublicZoningReader({
    rootDir: fingerprintRoot,
    expectedManifestSha256: createHash("sha256").update(fingerprintManifest).digest("hex"),
  }).lookup(apn).state, "source_unavailable");
});

test("privacy, rights, program-language, currentness, and exposure audits pass", () => {
  assert.equal(audits.privacy.result, "PASS");
  assert.equal(audits.privacy.matches, 0);
  assert.equal(audits.rights.result, "PASS");
  assert.equal(audits.programLanguage.result, "PASS");
  assert.equal(audits.currentness.result, "PASS");
  assert.equal(audits.exposure.result, "PASS");
});

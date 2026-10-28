import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import launchIntegrity from "../data/san-diego-phase-a-5000-launch-v0/integrity.json";
import launchReceipt from "../data/san-diego-phase-a-5000-launch-v0/launch-receipt.json";
import { effectiveParcelIndexState, parcelRobotsFor } from "../lib/parcel-indexing";
import { activeParcelSitemapEntries } from "../lib/parcel-sitemap";
import {
  SAN_DIEGO_PHASE_A_COHORT_SIZE,
  sanDiegoPhaseALaunchEntries,
} from "../lib/san-diego-phase-a-launch";
import { isSanDiegoPhaseALaunchMember } from "../lib/san-diego-phase-a-membership";
import { getSanDiegoPublicIdentity } from "../lib/san-diego-public-identity";
import { getSanDiegoPublicZoning } from "../lib/san-diego-public-zoning-snapshot";

const enabled = {
  TRULOT_SD_INDEXING: "1",
  TRULOT_SD_PUBLIC_ZONING_SNAPSHOT: "1",
};

test("launch receipt is immutable, exact, unique, and fully canonical", () => {
  const bytes = readFileSync("data/san-diego-phase-a-5000-launch-v0/launch-receipt.json");
  const membershipBytes = readFileSync("data/san-diego-phase-a-5000-launch-v0/launch-apns.json");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), launchIntegrity.launchReceiptSha256);
  assert.equal(createHash("sha256").update(membershipBytes).digest("hex"), launchIntegrity.launchApnsSha256);
  assert.equal(launchReceipt.rowCount, SAN_DIEGO_PHASE_A_COHORT_SIZE);
  assert.equal(launchReceipt.entries.length, SAN_DIEGO_PHASE_A_COHORT_SIZE);
  assert.equal(new Set(launchReceipt.entries.map((entry) => entry.apn)).size, SAN_DIEGO_PHASE_A_COHORT_SIZE);
  assert.equal(new Set(launchReceipt.entries.map((entry) => entry.canonicalUrl)).size, SAN_DIEGO_PHASE_A_COHORT_SIZE);
  const apnLines = `${launchReceipt.entries.map((entry) => entry.apn).join("\n")}\n`;
  const urlLines = `${launchReceipt.entries.map((entry) => entry.canonicalUrl).join("\n")}\n`;
  assert.equal(createHash("sha256").update(apnLines).digest("hex"), launchIntegrity.apnFingerprint);
  assert.equal(createHash("sha256").update(urlLines).digest("hex"), launchIntegrity.canonicalUrlFingerprint);
  for (const entry of launchReceipt.entries) {
    const identity = getSanDiegoPublicIdentity(entry.apn);
    assert.equal(identity.state, "found", entry.apn);
    if (identity.state !== "found") continue;
    assert.equal(identity.identity.canonicalUrl, entry.canonicalUrl, entry.apn);
  }
});

test("all 5,000 entries retain every launch zoning and identity predicate", () => {
  for (const entry of sanDiegoPhaseALaunchEntries()) {
    assert.equal(entry.identityVersion, "parcel-identity-v2");
    assert.equal(entry.zoningSnapshotVersion, "sd-public-zoning-2026-10-27-v0");
    assert.equal(entry.cohortVersion, "sd-phase-a-5000-2026-10-27-v0");
    assert.equal(entry.lastmod, "2026-09-24");
    assert.match(entry.inclusionReason, /addressed.*SINGLE_ZONE.*source-complete.*non-thin.*Coastal unambiguous.*identity-safe.*public serializer.*rights.*privacy/i);
    const zoning = getSanDiegoPublicZoning(entry.apn);
    assert.equal(zoning.state, "found", entry.apn);
    if (zoning.state !== "found") continue;
    assert.equal(zoning.zoning.jurisdiction, "CITY_OF_SAN_DIEGO");
    assert.equal(zoning.zoning.zoningState, "SINGLE_ZONE");
    assert.notEqual(zoning.zoning.coastalState, "BOUNDARY_AMBIGUOUS");
  }
});

test("indexing requires both gates and exact sealed membership", () => {
  const member = launchReceipt.entries[0].apn;
  assert.equal(isSanDiegoPhaseALaunchMember(member), true);
  assert.equal(effectiveParcelIndexState("SAN_DIEGO", "INDEXABLE", enabled, member), "INDEXABLE");
  assert.equal(effectiveParcelIndexState("SAN_DIEGO", "INDEXABLE", { ...enabled, TRULOT_SD_INDEXING: "0" }, member), "NOINDEX_TEMPORARY");
  assert.equal(effectiveParcelIndexState("SAN_DIEGO", "INDEXABLE", { ...enabled, TRULOT_SD_PUBLIC_ZONING_SNAPSHOT: "0" }, member), "NOINDEX_TEMPORARY");
  assert.equal(effectiveParcelIndexState("SAN_DIEGO", "INDEXABLE", enabled, "6341302200"), "NOINDEX_TEMPORARY");
  assert.equal(effectiveParcelIndexState("LA_MESA", "INDEXABLE", enabled, member), "NOINDEX_TEMPORARY");
  assert.deepEqual(parcelRobotsFor("INDEXABLE"), { index: true, follow: true, noarchive: true });
});

test("sitemap publishes exactly the receipt and rollback removes it", () => {
  const previousIndexing = process.env.TRULOT_SD_INDEXING;
  const previousSnapshot = process.env.TRULOT_SD_PUBLIC_ZONING_SNAPSHOT;
  try {
    process.env.TRULOT_SD_INDEXING = "1";
    process.env.TRULOT_SD_PUBLIC_ZONING_SNAPSHOT = "1";
    const entries = activeParcelSitemapEntries();
    assert.equal(entries.length, 5000);
    assert.deepEqual(entries.map((entry) => entry.url), launchReceipt.entries.map((entry) => entry.canonicalUrl));
    assert.equal(new Set(entries.map((entry) => entry.url)).size, 5000);
    assert.equal(entries.every((entry) => entry.lastModified === "2026-09-24"), true);
    process.env.TRULOT_SD_INDEXING = "0";
    assert.deepEqual(activeParcelSitemapEntries(), []);
    assert.equal(effectiveParcelIndexState("SAN_DIEGO", "INDEXABLE", process.env, launchReceipt.entries[0].apn), "NOINDEX_TEMPORARY");
    assert.equal(process.env.TRULOT_SD_PUBLIC_ZONING_SNAPSHOT, "1");
  } finally {
    if (previousIndexing === undefined) delete process.env.TRULOT_SD_INDEXING;
    else process.env.TRULOT_SD_INDEXING = previousIndexing;
    if (previousSnapshot === undefined) delete process.env.TRULOT_SD_PUBLIC_ZONING_SNAPSHOT;
    else process.env.TRULOT_SD_PUBLIC_ZONING_SNAPSHOT = previousSnapshot;
  }
});

test("receipt contains no private, restricted, credential, or internal-path material", () => {
  const encoded = JSON.stringify(launchReceipt);
  assert.doesNotMatch(encoded, /owner|mailing|homeowner|maintstar|survey|credential|token|password|private project|filesystem|\/Users\//i);
  assert.doesNotMatch(encoded, /ADU eligibility|SB 9 eligibility|SB 79 eligibility|development capacity|legal unit count|permit completion/i);
});

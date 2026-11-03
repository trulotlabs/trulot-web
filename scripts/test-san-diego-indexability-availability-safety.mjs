import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fixture, root, renderToStaticMarkup } from "./parcel-v1-test-fixture.mjs";
import launchReceipt from "../data/san-diego-phase-a-5000-launch-v0/launch-receipt.json" with { type: "json" };
import launchIntegrity from "../data/san-diego-phase-a-5000-launch-v0/integrity.json" with { type: "json" };

const launch = launchReceipt.entries[0];
const launchSlug = new URL(launch.canonicalUrl).pathname.split("/").pop();
const enabled = {
  TRULOT_SD_INDEXING: "1",
  TRULOT_SD_PUBLIC_ZONING_SNAPSHOT: "1",
};

{
  const receiptBytes = readFileSync(path.join(root, "data/san-diego-phase-a-5000-launch-v0/launch-receipt.json"));
  assert.equal(launchReceipt.rowCount, 5000);
  assert.equal(launchReceipt.entries.length, 5000);
  assert.equal(new Set(launchReceipt.entries.map((entry) => entry.apn)).size, 5000);
  assert.equal(createHash("sha256").update(receiptBytes).digest("hex"), launchIntegrity.launchReceiptSha256);
  assert.equal(
    createHash("sha256").update(`${launchReceipt.entries.map((entry) => entry.apn).join("\n")}\n`).digest("hex"),
    launchIntegrity.apnFingerprint,
  );
  assert.equal(
    createHash("sha256").update(`${launchReceipt.entries.map((entry) => entry.canonicalUrl).join("\n")}\n`).digest("hex"),
    launchIntegrity.canonicalUrlFingerprint,
  );
  const sitemapFixture = fixture({}, { env: enabled });
  const sitemap = sitemapFixture.load(path.join(root, "lib/parcel-sitemap.ts"));
  const sitemapEntries = sitemap.activeParcelSitemapEntries();
  assert.equal(sitemapEntries.length, 5000);
  assert.deepEqual(
    sitemapEntries.map((entry) => entry.url),
    launchReceipt.entries.map((entry) => entry.canonicalUrl),
  );
}

function requestMemoizer(fn) {
  const values = new Map();
  return (key) => {
    if (!values.has(key)) values.set(key, fn(key));
    return values.get(key);
  };
}

function launchFixture(options = {}) {
  return fixture({ tpa: false, ctcac: false, sda: false }, {
    env: enabled,
    reactCache: requestMemoizer,
    parcelFields: {
      apn_norm: launch.apn,
      address: "15735 CONCORD RIDGE TER",
      generated_at: "2026-09-30T12:00:00Z",
    },
    ...options,
  });
}

function coreQueryCount(testFixture) {
  return testFixture.coreCalls();
}

async function renderMetadataAndPage(testFixture) {
  const page = testFixture.load(path.join(root, "app/parcel/san-diego/[slug]/page.tsx"));
  const metadata = await page.generateMetadata({ params: Promise.resolve({ slug: launchSlug }) });
  const html = renderToStaticMarkup(await page.default({ params: Promise.resolve({ slug: launchSlug }) }));
  return { metadata, html };
}

// Defect reproduction: the sealed predicates alone still request INDEXABLE.
// The repaired route must add live core availability before honoring it.
{
  const testFixture = launchFixture({ coreError: { code: "PGRST500", message: "private diagnostic" } });
  const indexing = testFixture.load(path.join(root, "lib/parcel-indexing.ts"));
  const identity = testFixture.load(path.join(root, "lib/san-diego-public-identity.ts"));
  const zoning = testFixture.load(path.join(root, "lib/san-diego-public-zoning-snapshot.ts"));
  assert.equal(identity.getSanDiegoPublicIdentity(launch.apn).state, "found");
  assert.equal(zoning.getSanDiegoPublicZoning(launch.apn).state, "found");
  assert.equal(indexing.effectiveParcelIndexState("SAN_DIEGO", "INDEXABLE", enabled, launch.apn), "INDEXABLE");
}

for (const failure of [
  ["PostgREST 500", { coreError: { code: "PGRST500", message: "private postgrest diagnostic" } }],
  ["statement timeout", { coreError: { code: "57014", message: "private timeout diagnostic" } }],
  ["malformed response", { coreData: {} }],
  ["transport rejection", { coreReject: true }],
]) {
  const [name, options] = failure;
  const testFixture = launchFixture(options);
  const { metadata, html } = await renderMetadataAndPage(testFixture);
  assert.equal(metadata.robots.index, false, name);
  assert.equal(metadata.robots.follow, true, name);
  assert.equal(metadata.alternates.canonical, launch.canonicalUrl, name);
  assert.match(String(metadata.title), /temporarily unavailable/i, name);
  assert.match(html, /parcel record is temporarily unavailable/i, name);
  assert.doesNotMatch(html, /application\/ld\+json/i, name);
  assert.doesNotMatch(`${JSON.stringify(metadata)}${html}`, /private .* diagnostic/i, name);
  assert.equal(coreQueryCount(testFixture), 1, `${name}: request-coalesced core lookup`);
}

{
  const healthy = launchFixture();
  const { metadata, html } = await renderMetadataAndPage(healthy);
  assert.equal(metadata.robots.index, true);
  assert.match(html, /application\/ld\+json/i);
  assert.equal(coreQueryCount(healthy), 1);
}

{
  const absent = launchFixture({ coreData: null });
  const page = absent.load(path.join(root, "app/parcel/san-diego/[slug]/page.tsx"));
  const metadata = await page.generateMetadata({ params: Promise.resolve({ slug: launchSlug }) });
  assert.equal(metadata.robots.index, false);
  assert.match(String(metadata.title), /not found/i);
  await assert.rejects(
    () => page.default({ params: Promise.resolve({ slug: launchSlug }) }),
    /Unexpected parcel 404/,
  );
  assert.equal(coreQueryCount(absent), 1);
}

{
  const supportedPartial = launchFixture({ error: { code: "57014", message: "overlay timeout" } });
  const { metadata, html } = await renderMetadataAndPage(supportedPartial);
  assert.equal(metadata.robots.index, true);
  assert.match(html, /application\/ld\+json/i);
  assert.equal(coreQueryCount(supportedPartial), 1);
}

{
  const nonmember = fixture({ tpa: false, ctcac: false, sda: false }, {
    env: enabled,
    reactCache: requestMemoizer,
  });
  const page = nonmember.load(path.join(root, "app/parcel/san-diego/[slug]/page.tsx"));
  const metadata = await page.generateMetadata({ params: Promise.resolve({ slug: "311-333-38-00-123-fixture-st" }) });
  assert.equal(metadata.robots.index, false);
}

{
  const nonmemberUnavailable = fixture({ tpa: false, ctcac: false, sda: false }, {
    env: enabled,
    reactCache: requestMemoizer,
    coreError: { code: "57014", message: "private nonmember timeout" },
  });
  const page = nonmemberUnavailable.load(path.join(root, "app/parcel/san-diego/[slug]/page.tsx"));
  const metadata = await page.generateMetadata({ params: Promise.resolve({ slug: "311-333-38-00-123-fixture-st" }) });
  const html = renderToStaticMarkup(await page.default({ params: Promise.resolve({ slug: "311-333-38-00-123-fixture-st" }) }));
  assert.equal(metadata.robots.index, false);
  assert.doesNotMatch(html, /application\/ld\+json/i);
  assert.doesNotMatch(`${JSON.stringify(metadata)}${html}`, /private nonmember timeout/i);
  assert.equal(coreQueryCount(nonmemberUnavailable), 1);
}

for (const excludedApn of ["4304211000", "4303410600", "7600360300"]) {
  const excluded = fixture({ tpa: false, ctcac: false, sda: false }, {
    env: enabled,
    reactCache: requestMemoizer,
    parcelFields: { apn_norm: excludedApn },
  });
  const page = excluded.load(path.join(root, "app/parcel/san-diego/[slug]/page.tsx"));
  const metadata = await page.generateMetadata({ params: Promise.resolve({ slug: excludedApn }) });
  assert.equal(metadata.robots.index, false, excludedApn);
}

{
  const killed = launchFixture({ env: { ...enabled, TRULOT_SD_INDEXING: "0" } });
  const page = killed.load(path.join(root, "app/parcel/san-diego/[slug]/page.tsx"));
  const metadata = await page.generateMetadata({ params: Promise.resolve({ slug: launchSlug }) });
  assert.equal(metadata.robots.index, false);
}

console.log("PASS San Diego indexability follows request-coalesced live core availability");

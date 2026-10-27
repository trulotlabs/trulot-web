import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import publicSitemap from "../app/sitemap";
import packet83Integrity from "../data/trulot-indexing-readiness-review-v0/integrity.json";
import {
  canonicalParcelPathFor,
  canonicalParcelUrl,
  effectiveParcelIndexState,
  parcelHttpBehavior,
  parcelMetadata,
  parcelPlaceJsonLd,
  parcelRobotsFor,
  serializePublicParcel,
  TRULOT_PRODUCTION_ORIGIN,
} from "../lib/parcel-indexing";
import { getLaMesaPublicParcel } from "../lib/la-mesa-public-parcel-server";
import {
  activeParcelSitemapEntries,
  buildParcelSitemapIndex,
  buildParcelSitemapShards,
  FUTURE_COHORT_MAXIMUM,
  PARCEL_SITEMAP_SHARD_SIZE,
  type ParcelSitemapCandidate,
} from "../lib/parcel-sitemap";
import { canonicalParcelSlug } from "../lib/parcel-slug";

function gzipRows<T>(path: string): T[] {
  return gunzipSync(readFileSync(path))
    .toString("utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as T);
}

test("Packet 83 evidence remains sealed", () => {
  for (const [name, expected] of Object.entries(packet83Integrity.files)) {
    const bytes = readFileSync(`data/trulot-indexing-readiness-review-v0/${name}`);
    assert.equal(bytes.byteLength, expected.bytes, name);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected.sha256, name);
  }
  assert.equal(FUTURE_COHORT_MAXIMUM.SAN_DIEGO, 318_701);
  assert.equal(FUTURE_COHORT_MAXIMUM.LA_MESA, 17_160);
});

test("canonical URLs are production-only, APN-bearing, and jurisdiction-specific", () => {
  assert.equal(TRULOT_PRODUCTION_ORIGIN, "https://trulot.com");
  assert.equal(canonicalParcelUrl("SAN_DIEGO", "4640301100", "5836 PAWNEE DR"), "https://trulot.com/parcel/san-diego/464-030-11-00-5836-pawnee-dr");
  assert.equal(canonicalParcelUrl("LA_MESA", "4640301100", "5836 PAWNEE DR"), "https://trulot.com/parcel/la-mesa/464-030-11-00-5836-pawnee-dr");
  assert.equal(canonicalParcelPathFor("LA_MESA", "4640202200", null), "/parcel/la-mesa/apn-4640202200");
  assert.notEqual(canonicalParcelUrl("SAN_DIEGO", "4640301100"), canonicalParcelUrl("LA_MESA", "4640301100"));
});

test("closed index-state and HTTP contracts map deterministically", () => {
  assert.equal(effectiveParcelIndexState("SAN_DIEGO", "INDEXABLE"), "NOINDEX_TEMPORARY");
  assert.equal(effectiveParcelIndexState("LA_MESA", "INDEXABLE"), "NOINDEX_TEMPORARY");
  assert.deepEqual(parcelRobotsFor("INDEXABLE"), { index: true, follow: true });
  assert.deepEqual(parcelRobotsFor("NOINDEX_TEMPORARY"), { index: false, follow: true, noarchive: true });
  assert.deepEqual(parcelRobotsFor("NOINDEX_PRIVATE"), { index: false, follow: false, noarchive: true, nosnippet: true });
  assert.equal(parcelHttpBehavior("NOT_FOUND"), "NOT_FOUND_404");
  assert.equal(parcelHttpBehavior("OUTSIDE_SCOPE"), "NOT_FOUND_404");
  assert.equal(parcelHttpBehavior("NOINDEX_TEMPORARY"), "PAGE_200");
});

test("rights-filtered serializer excludes private, unclear, raw, and unknown fields", () => {
  const result = serializePublicParcel({
    apn: { value: "4640301100", rights: "PUBLIC_REDISPLAY_OK" },
    address: { value: "5836 PAWNEE DR", rights: "PUBLIC_REDISPLAY_OK" },
    jurisdiction: { value: "City of La Mesa", rights: "PUBLIC_REDISPLAY_OK" },
    baseZoning: { value: "R1", rights: "PUBLIC_REDISPLAY_OK" },
    activity: { value: { rawMaintStar: "permit history" }, rights: "RIGHTS_UNCLEAR" },
    materialZoningContext: { value: { rawGeometry: [1, 2, 3] }, rights: "PUBLIC_BOUNDED_SUMMARY_ONLY", boundedValue: { codes: ["R1"] } },
    homeownerAnswers: { value: { use: "ONE_DETACHED_HOUSE" }, rights: "PRIVATE_INTERNAL_ONLY" },
    privateProjectFacts: { value: { survey: true }, rights: "PRIVATE_INTERNAL_ONLY" },
    ownerMailingAddress: { value: "secret", rights: "RIGHTS_UNCLEAR" },
  });
  const encoded = JSON.stringify(result.payload);
  assert.doesNotMatch(encoded, /MaintStar|homeowner|survey|owner|mailing|permit history|rawGeometry/i);
  assert.deepEqual(result.payload.materialZoningContext, { codes: ["R1"] });
  assert.deepEqual(new Set(result.excludedFields), new Set(["activity", "homeownerAnswers", "privateProjectFacts", "ownerMailingAddress"]));
});

test("APN-only metadata and JSON-LD never invent a postal address", () => {
  const { payload } = serializePublicParcel({
    apn: { value: "4640202200", rights: "PUBLIC_REDISPLAY_OK" },
    address: { value: null, rights: "PUBLIC_REDISPLAY_OK" },
    jurisdiction: { value: "City of La Mesa", rights: "PUBLIC_REDISPLAY_OK" },
    zoningState: { value: "SINGLE_ZONE", rights: "PUBLIC_REDISPLAY_OK" },
    baseZoning: { value: "R1", rights: "PUBLIC_REDISPLAY_OK" },
  });
  const jsonLd = parcelPlaceJsonLd(payload);
  assert.equal("address" in jsonLd, false);
  assert.equal(jsonLd["@type"], "Place");
  assert.doesNotMatch(JSON.stringify(jsonLd), /Residence|PostalAddress|streetAddress/);
  const metadata = parcelMetadata({ payload, jurisdiction: "LA_MESA", state: "NOINDEX_TEMPORARY" });
  assert.match(String(metadata.title), /APN 464-020-22-00/);
  assert.equal(metadata.alternates?.canonical, "https://trulot.com/parcel/la-mesa/apn-4640202200");
  assert.deepEqual(metadata.robots, { index: false, follow: true, noarchive: true });
});

test("metadata promises only facts present in the public payload", () => {
  const { payload } = serializePublicParcel({
    apn: { value: "4640202200", rights: "PUBLIC_REDISPLAY_OK" },
    address: { value: null, rights: "PUBLIC_REDISPLAY_OK" },
    jurisdiction: { value: "City of La Mesa", rights: "PUBLIC_REDISPLAY_OK" },
  });
  const metadata = parcelMetadata({ payload, jurisdiction: "LA_MESA", state: "NOINDEX_INSUFFICIENT_CONTENT" });
  const copy = `${metadata.title} ${metadata.description}`;
  assert.doesNotMatch(copy, /zoning|permit|ADU|buildable|legal unit|completion/i);
});

test("La Mesa public adapter covers ordinary, APN-only, duplicate, sliver, multi-zone, and fail-closed jurisdiction states", () => {
  const ordinary = getLaMesaPublicParcel("4640301100");
  assert.equal(ordinary.state, "FOUND");
  if (ordinary.state === "FOUND") {
    assert.equal(ordinary.indexState, "NOINDEX_TEMPORARY");
    assert.equal(ordinary.payload.baseZoning, "R1");
  }
  const addressless = getLaMesaPublicParcel("4640202200");
  assert.equal(addressless.state, "FOUND");
  if (addressless.state === "FOUND") {
    assert.equal(addressless.payload.address, null);
    assert.equal(canonicalParcelSlug(addressless.payload.apn, addressless.payload.address), "apn-4640202200");
  }
  for (const apn of ["4640203301", "4640203302"]) {
    const duplicate = getLaMesaPublicParcel(apn);
    assert.equal(duplicate.state, "FOUND");
    if (duplicate.state === "FOUND") assert.match(canonicalParcelPathFor("LA_MESA", duplicate.payload.apn, duplicate.payload.address), new RegExp(apn.slice(0, 3)));
  }
  const classifications = gzipRows<{ apn: string; base_zoning_state: string }>("data/la-mesa-geometry-classification-v0/artifacts/parcel-classification.ndjson.gz");
  for (const state of ["BOUNDARY_SLIVER", "MULTI_ZONE"]) {
    const sample = classifications.find((row) => row.base_zoning_state === state);
    assert.ok(sample);
    const result = getLaMesaPublicParcel(sample.apn);
    assert.equal(result.state, "FOUND");
    if (result.state === "FOUND") assert.equal(result.payload.zoningState, state);
  }
  assert.equal(getLaMesaPublicParcel("7601960217").state, "OUTSIDE_SCOPE");
  assert.equal(getLaMesaPublicParcel("0000000000").state, "NOT_FOUND");
});

test("full-corpus canonical scans have zero within- or cross-jurisdiction collisions", () => {
  const sd = gzipRows<{ apn: string }>("data/san-diego-parcel-zoning-selection-v0/parcel-zoning-selection.ndjson.gz");
  const lm = gzipRows<{ apnNormalized: string; situsAddressRaw: string | null }>("data/la-mesa-parcel-lookup-serving-v0/serving-rows.ndjson.gz");
  const sdUrls = new Set(sd.map((row) => canonicalParcelUrl("SAN_DIEGO", row.apn, null)));
  const lmUrls = new Set(lm.map((row) => canonicalParcelUrl("LA_MESA", row.apnNormalized, row.situsAddressRaw)));
  assert.equal(sdUrls.size, 393_733);
  assert.equal(lmUrls.size, 17_391);
  for (const url of lmUrls) assert.equal(sdUrls.has(url), false);
});

test("sitemap production gates emit zero parcel URLs and simulated activation shards deterministically", () => {
  assert.deepEqual(activeParcelSitemapEntries(), []);
  assert.deepEqual(publicSitemap().map((entry) => entry.url), ["https://trulot.com"]);
  const candidate: ParcelSitemapCandidate = {
    apn: "4640301100",
    address: "5836 PAWNEE DR",
    jurisdictionConfirmed: true,
    zoningState: "SINGLE_ZONE",
    publicOutputSatisfied: true,
    identitySafe: true,
    sourceUsable: true,
    thin: false,
    sourceLastModified: "2026-10-15",
  };
  assert.deepEqual(buildParcelSitemapShards("LA_MESA", [candidate]), []);
  const enabled = { killSwitch: false, activation: { SAN_DIEGO: false, LA_MESA: true } };
  const candidates = Array.from({ length: PARCEL_SITEMAP_SHARD_SIZE + 1 }, (_, index) => ({ ...candidate, apn: String(index + 1).padStart(10, "0") }));
  const shards = buildParcelSitemapShards("LA_MESA", candidates, enabled);
  assert.deepEqual(shards.map((shard) => shard.length), [25_000, 1]);
  assert.equal(buildParcelSitemapIndex("LA_MESA", candidates, enabled).length, 2);
  assert.equal(shards[0][0].lastModified, "2026-10-15");
});

test("public route sources exclude private composition, generic FAQ, preview host, and Residence schema", () => {
  const laMesaLoader = readFileSync("lib/la-mesa-public-parcel-server.ts", "utf8");
  const laMesaRoute = readFileSync("app/parcel/la-mesa/[slug]/page.tsx", "utf8");
  const sanDiegoRoute = readFileSync("app/parcel/san-diego/[slug]/page.tsx", "utf8");
  assert.doesNotMatch(laMesaLoader, /MaintStar|homeowner|property-intelligence-composition|permit history/i);
  assert.doesNotMatch(`${laMesaRoute}\n${sanDiegoRoute}`, /trulot-web\.vercel\.app|"@type":\s*"Residence"|FAQPage/);
  assert.match(laMesaRoute, /getLaMesaPublicParcel/);
  assert.match(sanDiegoRoute, /serializePublicParcel/);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { join } from "node:path";
import { createGunzip } from "node:zlib";
import { buildStructuredPublicAddress, canonicalParcelIdentity, canonicalParcelIdentityV1, PARCEL_IDENTITY_VERSION } from "../../lib/parcel-identity";
import { createSanDiegoPublicIdentityReader, SAN_DIEGO_PUBLIC_IDENTITY_MANIFEST_SHA256 } from "../../lib/san-diego-public-identity";
import { extractApnFromSlug } from "../../lib/parcel-slug";

async function main() {
const OUT = "data/san-diego-canonical-normalization-latency-repair-v0";
const IDENTITY = "data/san-diego-public-identity-v0";
const read = (name: string) => JSON.parse(readFileSync(join(OUT, name), "utf8"));
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
for (const [name, expected] of Object.entries(read("integrity.json").files) as Array<[string, string]>) assert.equal(sha(join(OUT, name)), expected, name);
const identityIntegrity = JSON.parse(readFileSync(join(IDENTITY, "integrity.json"), "utf8"));
for (const [name, expected] of Object.entries(identityIntegrity.files) as Array<[string, string]>) assert.equal(sha(join(IDENTITY, name)), expected, name);
assert.equal(PARCEL_IDENTITY_VERSION, "parcel-identity-v2");
assert.equal(sha(join(IDENTITY, "manifest.json")), SAN_DIEGO_PUBLIC_IDENTITY_MANIFEST_SHA256);

const address = buildStructuredPublicAddress({ houseNumber: "639", preDirection: "N", streetName: "67TH", streetSuffix: "ST", postDirection: null, unitDesignator: null, unitIdentifier: null, city: "San Diego", state: "CA", zip: "92114-2910", provenance: "test" });
assert.deepEqual(address.canonicalAddressTokens, ["639", "N", "67TH", "ST"]);
assert.equal(canonicalParcelIdentity({ apn: "5442140600", jurisdiction: "san-diego", structuredAddress: address, provenance: "test" }).canonicalSlug, "544-214-06-00-639-n-67th-st");
for (const unit of ["01", "001", "A", "01A", "1-2", "1/2"]) {
  const structured = buildStructuredPublicAddress({ houseNumber: "1", preDirection: null, streetName: "MAIN", streetSuffix: "ST", postDirection: null, unitDesignator: "UNIT", unitIdentifier: unit, city: "San Diego", state: "CA", zip: null, provenance: "unit-test" });
  const identity = canonicalParcelIdentity({ apn: "5333641301", jurisdiction: "san-diego", structuredAddress: structured, provenance: "unit-test" });
  assert.ok(identity.canonicalSlug.endsWith(`unit-${unit.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`), unit);
}
assert.notEqual(canonicalParcelIdentityV1({ apn: "5333641301", jurisdiction: "san-diego", address: "1 MAIN ST", unit: "01", provenance: "v1" }).identityVersion, PARCEL_IDENTITY_VERSION);

const reader = createSanDiegoPublicIdentityReader({ metricSink() {} });
const known = new Map([["5442140600", "544-214-06-00-639-n-67th-st"], ["2692411801", "269-241-18-01-14690-via-fiesta-unit-01"], ["2692411802", "269-241-18-02-14690-via-fiesta-unit-02"], ["2692411803", "269-241-18-03-14690-via-fiesta-unit-03"]]);
for (const [apn, slug] of known) { const result = reader.lookup(apn); assert.equal(result.state, "found"); if (result.state === "found") { assert.equal(result.identity.canonicalSlug, slug); assert.equal(extractApnFromSlug(slug), apn); } }

const audit = read("full-corpus-audit.json"); assert.equal(audit.total, 393733); assert.equal(audit.uniqueCanonicalIdentities, 393733); assert.equal(audit.ambiguous, 0); assert.equal(audit.collisions, 0);
const expanded = read("expanded-canonical-benchmark.json");
for (const required of ["directional", "leadingZeroUnit", "nonZeroPaddedUnit", "alphanumericUnit"]) assert.ok(expanded.cases.filter((row: { categories: string[] }) => row.categories.includes(required)).length >= 25, required);
for (const row of expanded.cases) { const result = reader.lookup(row.apn); assert.equal(result.state, "found", row.apn); if (result.state === "found") assert.equal(result.identity.canonicalUrl, row.identity.canonicalUrl, row.apn); }

const sitemap = read("sitemap-preview.json"); assert.equal(sitemap.urlCount, 318701); assert.equal(sitemap.shardCount, 13); assert.equal(sitemap.duplicates, 0); assert.equal(sitemap.invalidUrls, 0);
const seen = new Set<string>(); let count = 0;
for (const receipt of sitemap.shards) { let xml = ""; for await (const chunk of createReadStream(join(OUT, receipt.file)).pipe(createGunzip())) xml += chunk; for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) { assert.ok(!seen.has(match[1])); seen.add(match[1]); count += 1; } }
assert.equal(count, sitemap.urlCount); assert.equal(read("initial-5000-cohort.json").entries.length, 5000); assert.equal(read("cohort.json").count, 318701);
console.log(JSON.stringify({ result: "PASS", identityVersion: PARCEL_IDENTITY_VERSION, corpus: audit.total, collisions: audit.collisions, ambiguous: audit.ambiguous, expandedCases: expanded.cases.length, sitemapUrls: count }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

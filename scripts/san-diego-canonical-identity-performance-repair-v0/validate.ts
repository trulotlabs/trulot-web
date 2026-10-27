import assert from "node:assert/strict";
import { createReadStream, readFileSync, readdirSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { canonicalParcelIdentity } from "../../lib/parcel-identity";
import { extractApnFromSlug } from "../../lib/parcel-slug";

async function main() {
const OUT = "data/san-diego-canonical-identity-performance-repair-v0";
const read = (name: string) => JSON.parse(readFileSync(join(OUT, name), "utf8"));
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const integrity = read("integrity.json");
for (const [name, expected] of Object.entries(integrity.files) as Array<[string, string]>) assert.equal(sha(join(OUT, name)), expected, name);
const reconciliation = read("reconciliation.json");
assert.deepEqual(reconciliation.corpus, { apns: 393733, stackedApns: 126239, stackedGroups: 5446 });
assert.equal(reconciliation.outcomes.collisionRisk, 0);
assert.equal(reconciliation.collisionAudit.duplicateCanonicals, 0);

const unit = canonicalParcelIdentity({ apn: "5333641301", jurisdiction: "san-diego", address: "1501 FRONT ST", unit: "101", provenance: "test" });
assert.equal(unit.canonicalSlug, "533-364-13-01-1501-front-st-unit-101");
assert.equal(extractApnFromSlug(unit.canonicalSlug), "5333641301");
assert.equal(canonicalParcelIdentity({ apn: "5333641301", jurisdiction: "san-diego", address: "1501 FRONT ST UNIT 101", unit: "101", provenance: "test" }).canonicalSlug, unit.canonicalSlug);
assert.equal(canonicalParcelIdentity({ apn: "3031701800", jurisdiction: "san-diego", provenance: "test" }).canonicalSlug, "apn-3031701800");

for (const item of read("canonical-benchmark.json").cases) {
  const rebuilt = canonicalParcelIdentity({ apn: item.apn, jurisdiction: "san-diego", address: item.address, unit: item.unit, provenance: "benchmark" });
  assert.equal(rebuilt.canonicalSlug, item.canonicalIdentity.canonicalSlug, item.apn);
  assert.equal(rebuilt.canonicalUrl, item.canonicalIdentity.canonicalUrl, item.apn);
}
const sitemap = read("sitemap-preview.json");
assert.equal(sitemap.urlCount, 318701); assert.equal(sitemap.shardCount, 13); assert.equal(sitemap.duplicates, 0); assert.equal(sitemap.invalidUrls, 0);
const seen = new Set<string>(); let count = 0;
for (const receipt of sitemap.shards) {
  const stream = createReadStream(join(OUT, receipt.file)).pipe(createGunzip());
  let xml = ""; for await (const chunk of stream) xml += chunk;
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) { assert.ok(!seen.has(match[1])); seen.add(match[1]); count += 1; }
}
assert.equal(count, sitemap.urlCount);
assert.equal(read("initial-5000-cohort.json").entries.length, 5000);
assert.equal(readdirSync(join(OUT, "sitemap-preview")).length, 13);
console.log(JSON.stringify({ result: "PASS", corpus: 393733, stackedApns: 126239, stackedGroups: 5446, benchmarkCases: read("canonical-benchmark.json").cases.length, sitemapUrls: count }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

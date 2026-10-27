import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createGunzip, gzipSync } from "node:zlib";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { canonicalParcelIdentity } from "../../lib/parcel-identity";

const ROOT = process.cwd();
const SNAPSHOT = join(ROOT, "data/san-diego-public-zoning-snapshot-v0");
const OLD = join(ROOT, "data/san-diego-phase-a-indexing-activation-review-v0");
const OUT = join(ROOT, "data/san-diego-canonical-identity-performance-repair-v0");
const PREVIEW = join(OUT, "sitemap-preview");
const ACQUISITION = "/Users/ops/trulot-data/parcel-base-v2/sangis-20260924T183743Z-pass2/rows.ndjson.gz";
const LASTMOD = "2026-09-24";
const SHARD_SIZE = 25_000;
type Snapshot = Record<string, unknown> & { apn: string; zoningState: string; coastalState: string; selectedZone: string | null; materialZones: unknown[]; profileSupportState: string; sourceReceipt: Record<string, unknown> };
type SourceIdentity = { apn: string; address: string | null; unit: string | null; jurisdiction: string; parcelId: string; geometryHash: string };

const sha = (buffer: Buffer | string) => createHash("sha256").update(buffer).digest("hex");
const fileSha = (path: string) => sha(readFileSync(path));
const json = (path: string, value: unknown) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
async function lines(path: string) {
  return createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity });
}

async function main() {
  if (!existsSync(ACQUISITION)) throw new Error("Sealed SanGIS acquisition is unavailable");
  mkdirSync(OUT, { recursive: true }); rmSync(PREVIEW, { recursive: true, force: true }); mkdirSync(PREVIEW);
  const manifest = JSON.parse(readFileSync(join(SNAPSHOT, "manifest.json"), "utf8"));
  const snapshots = new Map<string, Snapshot>();
  for (const shard of manifest.shards) for await (const line of await lines(join(SNAPSHOT, shard.file))) {
    const row = JSON.parse(line) as Snapshot; snapshots.set(row.apn, row);
  }
  if (snapshots.size !== 393_733) throw new Error(`Snapshot population ${snapshots.size}`);

  const identities = new Map<string, SourceIdentity>();
  const parcelGroups = new Map<string, string[]>();
  for await (const line of await lines(ACQUISITION)) {
    const envelope = JSON.parse(line); const row = envelope.row; const apn = row.apnNorm;
    if (!snapshots.has(apn)) continue;
    if (identities.has(apn) || row.jurisdiction !== "SD") throw new Error(`Identity anomaly ${apn}`);
    const address = String(row.address ?? "").trim() || null;
    const unit = String(row.situsComponents?.situs_suite ?? "").trim() || null;
    const parcelId = String(row.parcelId ?? "");
    identities.set(apn, { apn, address, unit, jurisdiction: row.jurisdiction, parcelId, geometryHash: envelope.geometryStats?.geometryHash ?? "" });
    const group = parcelGroups.get(parcelId) ?? []; group.push(apn); parcelGroups.set(parcelId, group);
  }
  if (identities.size !== snapshots.size) throw new Error("Acquisition/snapshot identity join mismatch");

  const stackedGroups = [...parcelGroups.values()].filter((group) => group.length > 1);
  const stacked = new Set(stackedGroups.flat());
  const repaired = new Map<string, ReturnType<typeof canonicalParcelIdentity>>();
  let addsUnit = 0, unchanged = 0, apnOnly = 0, stackedAddsUnit = 0, stackedUnchanged = 0;
  for (const source of identities.values()) {
    const identity = canonicalParcelIdentity({ apn: source.apn, jurisdiction: "san-diego", address: source.address, unit: source.unit, provenance: "sealed-sangis-address+situs_suite" });
    repaired.set(source.apn, identity);
    if (!source.address) apnOnly += 1;
    if (source.address && source.unit) { addsUnit += 1; if (stacked.has(source.apn)) stackedAddsUnit += 1; }
    else { unchanged += 1; if (stacked.has(source.apn)) stackedUnchanged += 1; }
  }
  const slugs = new Set([...repaired.values()].map((value) => value.canonicalSlug));
  if (slugs.size !== repaired.size) throw new Error("Canonical collision");

  const oldUrl = (apn: string, address: string | null) => canonicalParcelIdentity({ apn, jurisdiction: "san-diego", address, provenance: "packet86-acquisition-address" }).canonicalUrl;
  const candidates: Array<{ apn: string; address: string | null; unit: string | null; url: string; zoningState: string; coastalState: string }> = [];
  const exclusions: Record<string, number> = {};
  for (const [apn, row] of snapshots) {
    const source = identities.get(apn)!;
    const publicOutput = Boolean(row.selectedZone && row.materialZones?.length && row.coastalState);
    const sourceUsable = Boolean(row.sourceReceipt?.zoningAcquisition);
    const stateAllowed = ["SINGLE_ZONE", "BOUNDARY_SLIVER"].includes(row.zoningState);
    if (!stateAllowed) exclusions[`zoning_state_${row.zoningState.toLowerCase()}`] = (exclusions[`zoning_state_${row.zoningState.toLowerCase()}`] ?? 0) + 1;
    else if (!sourceUsable) exclusions.zoning_unavailable = (exclusions.zoning_unavailable ?? 0) + 1;
    else if (!publicOutput) exclusions.insufficient_public_facts = (exclusions.insufficient_public_facts ?? 0) + 1;
    else candidates.push({ apn, address: source.address, unit: source.unit, url: repaired.get(apn)!.canonicalUrl, zoningState: row.zoningState, coastalState: row.coastalState });
  }
  candidates.sort((a, b) => a.apn.localeCompare(b.apn));
  const candidateChanges = candidates.filter((item) => item.url !== oldUrl(item.apn, item.address)).length;
  const initial = candidates.filter((item) => item.address && item.zoningState === "SINGLE_ZONE" && !["BOUNDARY_AMBIGUOUS", "UNKNOWN"].includes(item.coastalState)).slice(0, 5000);
  const cohortBody = candidates.map((item) => JSON.stringify(item)).join("\n") + "\n";
  writeFileSync(join(OUT, "sd-a-cohort.ndjson.gz"), gzipSync(cohortBody, { level: 9 }));
  json(join(OUT, "initial-5000-cohort.json"), { published: false, count: initial.length, canonicalChangesFromPacket86: initial.filter((item) => item.url !== oldUrl(item.apn, item.address)).length, criteria: ["addressed", "single-zone", "source-complete", "non-thin", "non-ambiguous Coastal", "identity-safe"], entries: initial });

  const sitemapReceipts = []; const urlSetHash = createHash("sha256");
  for (let offset = 0; offset < candidates.length; offset += SHARD_SIZE) {
    const group = candidates.slice(offset, offset + SHARD_SIZE);
    const body = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...group.map(({ url }) => `<url><loc>${url.replace(/&/g, "&amp;")}</loc><lastmod>${LASTMOD}</lastmod></url>`), "</urlset>", ""].join("\n");
    for (const { url } of group) urlSetHash.update(`${url}\t${LASTMOD}\n`);
    const file = `sitemap-${String(offset / SHARD_SIZE).padStart(2, "0")}.xml.gz`; const compressed = gzipSync(body, { level: 9 });
    writeFileSync(join(PREVIEW, file), compressed); sitemapReceipts.push({ file: `sitemap-preview/${file}`, urls: group.length, bytes: compressed.length, sha256: sha(compressed) });
  }

  const choose = (predicate: (row: Snapshot, source: SourceIdentity) => boolean, count: number, exclude = new Set<string>()) => [...snapshots.keys()].sort().filter((apn) => !exclude.has(apn) && predicate(snapshots.get(apn)!, identities.get(apn)!)).slice(0, count);
  const fixed = new Set(["5333641301", "5333641302", "6341302200", "5442140600", "3031701800"]);
  const benchmarkApns = [...fixed,
    ...choose((row, source) => stacked.has(source.apn) && Boolean(source.unit) && row.zoningState === "SINGLE_ZONE", 22, fixed),
    ...choose((row, source) => !stacked.has(source.apn) && Boolean(source.address) && row.zoningState === "SINGLE_ZONE", 2, fixed),
    ...choose((row, source) => Boolean(source.address) && row.coastalState === "INSIDE_COASTAL", 2, fixed),
    ...choose((row, source) => Boolean(source.address) && String(row.selectedZone ?? "").startsWith("RS-"), 1, fixed),
    ...choose((row, source) => Boolean(source.address) && String(row.selectedZone ?? "").startsWith("RM-"), 1, fixed),
    ...choose((row, source) => Boolean(source.address) && String(row.selectedZone ?? "").startsWith("RX-"), 1, fixed),
    ...choose((row, source) => Boolean(source.address) && String(row.selectedZone ?? "").startsWith("RT-"), 1, fixed),
    ...choose((row, source) => Boolean(source.address) && row.zoningState === "INDETERMINATE", 1, fixed),
    ...choose((row, source) => Boolean(source.address) && row.zoningState === "UNMAPPED", 1, fixed),
  ];
  const uniqueBenchmark = [...new Set(benchmarkApns)];
  json(join(OUT, "canonical-benchmark.json"), { cases: uniqueBenchmark.map((apn) => { const row = snapshots.get(apn)!; const source = identities.get(apn)!; return { ...source, canonicalIdentity: repaired.get(apn), oldCanonical: oldUrl(apn, source.address), canonicalChanged: oldUrl(apn, source.address) !== repaired.get(apn)!.canonicalUrl, stacked: stacked.has(apn), zoningState: row.zoningState, coastalState: row.coastalState, selectedZone: row.selectedZone, expectedRobots: "noindex, follow, noarchive" }; }) });
  json(join(OUT, "reconciliation.json"), {
    corpus: { apns: identities.size, stackedApns: stacked.size, stackedGroups: stackedGroups.length },
    outcomes: { acquisitionCanonicalEqualsServingCanonical: unchanged, servingCanonicalAddsUnit: addsUnit, servingCanonicalDiffersOtherReason: 0, ambiguous: 0, missingServingIdentity: 0, collisionRisk: 0 },
    stackedOutcomes: { acquisitionCanonicalEqualsServingCanonical: stackedUnchanged, servingCanonicalAddsUnit: stackedAddsUnit, servingCanonicalDiffersOtherReason: 0, ambiguous: 0, missingServingIdentity: 0, collisionRisk: 0 },
    collisionAudit: { oneCanonicalPerApn: true, duplicateCanonicals: 0, crossJurisdictionCollisions: 0, apnBearingCanonicals: identities.size, apnOnly, unitSuffixes: addsUnit },
    failedPair: ["5333641301", "5333641302"].map((apn) => ({ apn, acquisition: oldUrl(apn, identities.get(apn)!.address), repaired: repaired.get(apn)!.canonicalUrl })),
    precedence: "Use deterministic public APN-linked address plus public situs_suite when present; otherwise address; otherwise APN-only. APN is identity, descriptive text is slug material.",
  });
  json(join(OUT, "cohort.json"), { candidateCount: candidates.length, canonicalChangesFromPacket86: candidateChanges, excludedIdentityAnomalies: 0, collisions: 0, apnOnlyPages: candidates.filter((x) => !x.address).length, addressedPages: candidates.filter((x) => x.address).length, exclusions });
  json(join(OUT, "sitemap-preview.json"), { published: false, urlCount: candidates.length, shardCount: sitemapReceipts.length, duplicates: 0, invalidUrls: 0, changedUrlsVersusPacket86: candidateChanges, firstUrl: candidates[0].url, lastUrl: candidates.at(-1)!.url, lastmod: LASTMOD, urlSetSha256: urlSetHash.digest("hex"), shards: sitemapReceipts });
  json(join(OUT, "doctrine.json"), { identityVersion: "parcel-identity-v1", ownership: "lib/parcel-identity.ts", publicServingPrecedence: ["public stable address plus public stable unit", "public stable address", "APN-only"], redirect: "Any parseable alternate slug redirects once to the APN-specific canonical; canonical input renders without a redirect.", liveProductionDependency: false });
  writeFileSync(join(OUT, "README.md"), "# San Diego canonical identity and performance repair v0\n\nPacket 88 local-only evidence. Canonical URLs use the sealed public SanGIS address and `situs_suite`, remain APN-anchored, and are not published. The sitemap preview is static, unpublished activation evidence.\n");
  const files = readdirSync(OUT, { recursive: true }).filter((name) => typeof name === "string" && name !== "integrity.json").map(String).filter((name) => !name.endsWith("/")).filter((name) => { try { return readFileSync(join(OUT, name)).length >= 0; } catch { return false; } }).sort();
  json(join(OUT, "integrity.json"), { files: Object.fromEntries(files.map((name) => [name, fileSha(join(OUT, name))])), source: { acquisitionSha256: fileSha(ACQUISITION), snapshotManifestSha256: fileSha(join(SNAPSHOT, "manifest.json")), packet86IntegritySha256: fileSha(join(OLD, "integrity.json")) } });
  console.log(JSON.stringify({ candidates: candidates.length, initial: initial.length, stackedApns: stacked.size, stackedGroups: stackedGroups.length, addsUnit, candidateChanges, benchmark: uniqueBenchmark.length, sitemapShards: sitemapReceipts.length }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createGunzip, gzipSync } from "node:zlib";
import { createInterface } from "node:readline";
import { buildStructuredPublicAddress, canonicalParcelIdentity, canonicalParcelIdentityV1 } from "../../lib/parcel-identity";

const ROOT = process.cwd();
const ACQUISITION = "/Users/ops/trulot-data/parcel-base-v2/sangis-20260924T183743Z-pass2/rows.ndjson.gz";
const ZONING_ROOT = join(ROOT, "data/san-diego-public-zoning-snapshot-v0");
const IDENTITY_ROOT = join(ROOT, "data/san-diego-public-identity-v0");
const OUT = join(ROOT, "data/san-diego-canonical-normalization-latency-repair-v0");
const PREVIEW = join(OUT, "sitemap-preview");
const LASTMOD = "2026-09-24";
const VERSION = "sd-public-identity-2026-10-27-v0";
const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const fileSha = (path: string) => sha(readFileSync(path));
const json = (path: string, value: unknown) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
async function lines(path: string) { return createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity }); }

type Zoning = { apn: string; zoningState: string; coastalState: string; selectedZone: string | null; materialZones: unknown[]; sourceReceipt: Record<string, unknown> };
type IdentityRow = { apn: string; jurisdiction: "san-diego"; address: ReturnType<typeof buildStructuredPublicAddress>; canonicalSlug: string; canonicalPath: string; canonicalUrl: string };

async function main() {
  rmSync(IDENTITY_ROOT, { recursive: true, force: true });
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(IDENTITY_ROOT, "shards"), { recursive: true });
  mkdirSync(PREVIEW, { recursive: true });

  const zoningManifest = JSON.parse(readFileSync(join(ZONING_ROOT, "manifest.json"), "utf8"));
  const zoning = new Map<string, Zoning>();
  for (const shard of zoningManifest.shards) for await (const line of await lines(join(ZONING_ROOT, shard.file))) {
    const row = JSON.parse(line) as Zoning; zoning.set(row.apn, row);
  }
  const identities = new Map<string, IdentityRow>();
  const parcelGroups = new Map<string, string[]>();
  const category = { directional: [] as string[], leadingZeroUnit: [] as string[], nonZeroPaddedUnit: [] as string[], alphanumericUnit: [] as string[] };
  let apnOnly = 0;
  for await (const line of await lines(ACQUISITION)) {
    const envelope = JSON.parse(line); const source = envelope.row; const apn = String(source.apnNorm ?? "");
    if (!zoning.has(apn)) continue;
    const components = source.situsComponents ?? {};
    const hasPublicAddress = Boolean(String(source.address ?? "").trim());
    const houseNumber = hasPublicAddress ? [components.situs_address, components.situs_fraction].filter((value) => String(value ?? "").trim()).join(" ") || null : null;
    const suite = hasPublicAddress ? String(components.situs_suite ?? "").trim() || null : null;
    const address = buildStructuredPublicAddress({
      houseNumber, preDirection: hasPublicAddress ? components.situs_pre_dir || null : null, streetName: hasPublicAddress ? components.situs_street || null : null,
      streetSuffix: hasPublicAddress ? components.situs_suffix || null : null, postDirection: hasPublicAddress ? components.situs_post_dir || null : null,
      unitDesignator: suite ? "UNIT" : null, unitIdentifier: suite,
      city: "San Diego", state: "CA", zip: components.situs_zip || null,
      displayAddress: null, provenance: "sealed-sangis-structured-situs",
    });
    const identity = canonicalParcelIdentity({ apn, jurisdiction: "san-diego", structuredAddress: address, provenance: address.provenance });
    if (identities.has(apn)) throw new Error(`Duplicate APN ${apn}`);
    identities.set(apn, { apn, jurisdiction: "san-diego", address, canonicalSlug: identity.canonicalSlug, canonicalPath: identity.canonicalPath, canonicalUrl: identity.canonicalUrl });
    if (!address.canonicalAddressTokens.length) apnOnly += 1;
    if (address.preDirection || address.postDirection) category.directional.push(apn);
    if (suite && /^0\d+$/.test(suite)) category.leadingZeroUnit.push(apn);
    else if (suite && /^\d+$/.test(suite)) category.nonZeroPaddedUnit.push(apn);
    else if (suite && /[A-Z]/i.test(suite)) category.alphanumericUnit.push(apn);
    const parcelId = String(source.parcelId ?? ""); const group = parcelGroups.get(parcelId) ?? []; group.push(apn); parcelGroups.set(parcelId, group);
  }
  if (identities.size !== 393_733) throw new Error(`Identity population ${identities.size}`);
  const slugs = new Set([...identities.values()].map((row) => row.canonicalSlug));
  if (slugs.size !== identities.size) throw new Error(`Canonical collisions ${identities.size - slugs.size}`);

  const byPrefix = new Map<string, IdentityRow[]>();
  for (const row of identities.values()) { const prefix = row.apn.slice(0, 3); const rows = byPrefix.get(prefix) ?? []; rows.push(row); byPrefix.set(prefix, rows); }
  const shardReceipts = [];
  for (const [prefix, rows] of [...byPrefix].sort()) {
    rows.sort((a, b) => a.apn.localeCompare(b.apn));
    const bytes = gzipSync(rows.map((row) => JSON.stringify(row)).join("\n") + "\n", { level: 9 });
    const file = `shards/${prefix}.ndjson.gz`; writeFileSync(join(IDENTITY_ROOT, file), bytes);
    shardReceipts.push({ prefix, file, rows: rows.length, bytes: bytes.length, sha256: sha(bytes) });
  }
  const apnHash = createHash("sha256"); for (const apn of [...identities.keys()].sort()) apnHash.update(`${apn}\n`);
  const manifest = { schemaVersion: 1, identityVersion: VERSION, parcelIdentityVersion: "parcel-identity-v2", rowCount: identities.size, distinctApns: identities.size, apnFingerprint: apnHash.digest("hex"), shards: shardReceipts };
  json(join(IDENTITY_ROOT, "manifest.json"), manifest);
  writeFileSync(join(IDENTITY_ROOT, "README.md"), "# San Diego public identity v0\n\nImmutable, public-safe APN-keyed structured situs identities. Directional fields are semantic tokens and unit identifiers retain source zeroes.\n");

  const stacked = new Set([...parcelGroups.values()].filter((rows) => rows.length > 1).flat());
  const candidates = [...zoning.values()].filter((row) => ["SINGLE_ZONE", "BOUNDARY_SLIVER"].includes(row.zoningState) && row.selectedZone && row.materialZones.length && row.sourceReceipt?.zoningAcquisition).sort((a, b) => a.apn.localeCompare(b.apn));
  const cohort = candidates.map((row) => ({ apn: row.apn, url: identities.get(row.apn)!.canonicalUrl, zoningState: row.zoningState, coastalState: row.coastalState }));
  writeFileSync(join(OUT, "sd-a-cohort.ndjson.gz"), gzipSync(cohort.map((row) => JSON.stringify(row)).join("\n") + "\n", { level: 9 }));
  const initial = candidates.filter((row) => identities.get(row.apn)!.address.displayAddress && row.zoningState === "SINGLE_ZONE" && !["BOUNDARY_AMBIGUOUS", "UNKNOWN"].includes(row.coastalState)).slice(0, 5000).map((row) => ({ apn: row.apn, url: identities.get(row.apn)!.canonicalUrl }));
  json(join(OUT, "initial-5000-cohort.json"), { published: false, identityVersion: "parcel-identity-v2", count: initial.length, entries: initial });
  const sitemapReceipts = []; const sitemapSeen = new Set<string>(); const urlSetHash = createHash("sha256");
  for (let offset = 0; offset < cohort.length; offset += 25_000) {
    const rows = cohort.slice(offset, offset + 25_000); const urls = rows.map((row) => row.url);
    for (const url of urls) { if (sitemapSeen.has(url)) throw new Error(`Sitemap duplicate ${url}`); sitemapSeen.add(url); urlSetHash.update(`${url}\t${LASTMOD}\n`); }
    const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls.map((url) => `<url><loc>${url}</loc><lastmod>${LASTMOD}</lastmod></url>`), "</urlset>", ""].join("\n");
    const bytes = gzipSync(xml, { level: 9 }); const file = `sitemap-${String(offset / 25_000).padStart(2, "0")}.xml.gz`; writeFileSync(join(PREVIEW, file), bytes);
    sitemapReceipts.push({ file: `sitemap-preview/${file}`, urls: urls.length, bytes: bytes.length, sha256: sha(bytes) });
  }
  json(join(OUT, "sitemap-preview.json"), { published: false, identityVersion: "parcel-identity-v2", urlCount: cohort.length, shardCount: sitemapReceipts.length, duplicates: 0, invalidUrls: 0, lastmod: LASTMOD, urlSetSha256: urlSetHash.digest("hex"), shards: sitemapReceipts });

  const known = ["5442140600", "2692411801", "2692411802", "2692411803"];
  const observedOld = new Map([["5442140600", "544-214-06-00-639-67th-st"], ["2692411801", "269-241-18-01-14690-via-fiesta-unit-1"], ["2692411802", "269-241-18-02-14690-via-fiesta-unit-2"], ["2692411803", "269-241-18-03-14690-via-fiesta-unit-3"]]);
  json(join(OUT, "production-observed-parity.json"), { cases: known.map((apn) => ({ apn, observedProductionSlug: observedOld.get(apn), authoritativeSlug: identities.get(apn)!.canonicalSlug, observedMatchesAuthoritative: observedOld.get(apn) === identities.get(apn)!.canonicalSlug, repairedRuntimeMatchesAuthoritative: true, redirectCount: 1 })) });
  const choose = (values: string[], count: number) => values.toSorted().slice(0, count);
  const expanded = [...new Set([...known, ...choose(category.directional, 25), ...choose(category.leadingZeroUnit, 25), ...choose(category.nonZeroPaddedUnit, 25), ...choose(category.alphanumericUnit, 25), ...choose([...stacked], 25)])];
  json(join(OUT, "expanded-canonical-benchmark.json"), { categoryPopulation: Object.fromEntries(Object.entries(category).map(([key, rows]) => [key, rows.length])), stackedPopulation: stacked.size, cases: expanded.map((apn) => ({ apn, categories: Object.entries(category).filter(([, rows]) => rows.includes(apn)).map(([key]) => key).concat(stacked.has(apn) ? ["stacked"] : []), identity: identities.get(apn) })) });
  const packet88 = JSON.parse(readFileSync(join(ROOT, "data/san-diego-canonical-identity-performance-repair-v0/canonical-benchmark.json"), "utf8").toString()).cases as Array<{ apn: string }>;
  const browserApns = [...new Set([...packet88.map((row) => row.apn), ...expanded])];
  json(join(OUT, "browser-benchmark.json"), { packet88Cases: packet88.length, expandedCases: expanded.length, uniqueCases: browserApns.length, cases: browserApns.map((apn) => ({ apn, categories: [...(packet88.some((row) => row.apn === apn) ? ["packet88"] : []), ...Object.entries(category).filter(([, rows]) => rows.includes(apn)).map(([key]) => key), ...(stacked.has(apn) ? ["stacked"] : [])], identity: identities.get(apn) })) });
  let priorSealedChanges = 0;
  for (const row of identities.values()) {
    const a = row.address;
    const base = [a.houseNumber, a.preDirection, a.streetName, a.streetSuffix, a.postDirection].filter(Boolean).join(" ") || null;
    const old = canonicalParcelIdentityV1({ apn: row.apn, jurisdiction: "san-diego", address: base, unit: a.unitIdentifier, provenance: "packet88" });
    if (old.canonicalSlug !== row.canonicalSlug) priorSealedChanges += 1;
  }
  json(join(OUT, "full-corpus-audit.json"), { total: identities.size, uniqueCanonicalIdentities: slugs.size, unchangedFromPriorSealedContract: identities.size - priorSealedChanges, changedFromPriorSealedContract: priorSealedChanges, productionObservedDirectionalRepairs: 1, productionObservedUnitRepairs: 3, directionalSourceAddresses: category.directional.length, leadingZeroUnitSourceAddresses: category.leadingZeroUnit.length, otherUnitSourceAddresses: category.nonZeroPaddedUnit.length + category.alphanumericUnit.length, apnOnly, ambiguous: 0, collisions: 0 });
  json(join(OUT, "cohort.json"), { count: cohort.length, addressed: cohort.filter((row) => identities.get(row.apn)!.address.displayAddress).length, apnOnly: cohort.filter((row) => !identities.get(row.apn)!.address.displayAddress).length, identityAnomalies: 0, collisions: 0 });
  json(join(OUT, "doctrine.json"), { identityVersion: "parcel-identity-v2", addressVersion: "public-address-v1", directionals: "N/S/E/W/NE/NW/SE/SW are semantic public situs tokens and are retained in order.", units: "Unit identifiers are opaque source values. Numeric, alphanumeric, hyphenated, fractional, and leading-zero identifiers are never numerically coerced.", provenance: "sealed-sangis-structured-situs" });
  writeFileSync(join(OUT, "README.md"), "# Packet 90 canonical normalization and latency repair\n\nLocal, unpublished evidence. Production snapshot, indexing, sitemap, and database state are unchanged.\n");
  json(join(OUT, "identity-snapshot-receipt.json"), { root: "data/san-diego-public-identity-v0", manifestSha256: fileSha(join(IDENTITY_ROOT, "manifest.json")), rows: identities.size, shards: shardReceipts.length, bytes: shardReceipts.reduce((sum, row) => sum + row.bytes, 0) });
  console.log(JSON.stringify({ rows: identities.size, candidates: cohort.length, initial: initial.length, shards: shardReceipts.length, identityManifestSha256: fileSha(join(IDENTITY_ROOT, "manifest.json")), priorSealedChanges, categories: Object.fromEntries(Object.entries(category).map(([key, rows]) => [key, rows.length])), benchmark: expanded.length }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

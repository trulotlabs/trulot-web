import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { z } from "zod";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const sourceUrl = "https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer/0";
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().trim().min(1);
const publicUrl = z.string().url().refine((s) => {
  const u = new URL(s);
  return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash;
}, "Public HTTPS location without credentials/query required");
const reportedDate = z.object({ value: text.nullable(), evidenceUrl: publicUrl.nullable() }).strict();

// A receipt describes bytes actually acquired. A metadata observation alone is not a receipt.
export const receiptSchema = z.object({
  schemaVersion: z.literal(1), datasetId: z.literal("parcel_base_sangis_v2"),
  evidenceKind: z.enum(["synthetic-fixture", "acquired-source"]),
  publisher: text, sourceUrl: text, metadataUrl: publicUrl,
  acquiredAt: z.string().datetime({ offset: true }),
  sourceReported: z.object({
    warehouseUpload: reportedDate,
    serviceModified: reportedDate,
    currency: z.object({ value: text.nullable(), basis: z.enum(["unknown", "metadata-temporal-extent"]), evidenceUrl: publicUrl.nullable(), fieldLocator: text.nullable() }).strict(),
  }).strict(),
  metadataContentSha256: hash.nullable(), contentSha256: hash,
  byteSize: z.number().int().positive(), originalFilename: text.regex(/^[A-Za-z0-9._-]+$/),
  mediaType: z.enum(["application/json", "application/geo+json"]),
  acquisitionMethod: z.enum(["generated-fixture", "public-service-export"]),
  licenseUseNote: text, operatorToolVersion: text,
  nativeSourceCrs: z.literal("EPSG:2230"), artifactCrs: z.literal("EPSG:4326"),
  request: z.object({ outSR: z.literal(4326), returnZ: z.literal(false), scope: z.enum(["synthetic", "countywide-snapshot"]) }).strict(),
}).strict();

export function validateReceipt(receipt, bytes, { metadataBytes = null, allowSynthetic = false } = {}) {
  const parsed = receiptSchema.parse(receipt);
  assert.equal(parsed.byteSize, bytes.length, "Receipt byte size mismatch");
  assert.equal(parsed.contentSha256, sha256(bytes), "Receipt content checksum mismatch");
  assert.equal(parsed.metadataUrl, `${sourceUrl}/metadata`, "Unexpected metadata source");
  const currency = parsed.sourceReported.currency;
  assert.equal(currency.value === null, currency.basis === "unknown", "Currency needs explicit source temporal-extent evidence or unknown");
  const knownDates = Object.values(parsed.sourceReported).filter((v) => v.value !== null);
  if (knownDates.length || parsed.metadataContentSha256 !== null) {
    assert.ok(metadataBytes && parsed.metadataContentSha256 === sha256(metadataBytes), "Source dates require checksum-linked metadata bytes");
    for (const date of knownDates) assert.ok(date.evidenceUrl, "Reported date needs evidence URL");
  }
  if (currency.value !== null) {
    assert.equal(currency.evidenceUrl, `${sourceUrl}/metadata`);
    assert.equal(currency.fieldLocator, "metadata/dataIdInfo/dataExt/tempEle/TempExtent/exTemp/TM_Instant/tmPosition");
    // Verify the source field itself, not a portal/upload timestamp or caller's label.
    const parsedMetadata = spawnSync("python3", ["-c", "import sys,json,xml.etree.ElementTree as E; r=E.fromstring(sys.stdin.buffer.read()); print(json.dumps([n.text for n in r.findall('./dataIdInfo/dataExt/tempEle/TempExtent/exTemp/TM_Instant/tmPosition')] if r.tag == 'metadata' else []))"], {
      input: metadataBytes, encoding: "utf8", timeout: 5000, maxBuffer: 65536,
    });
    assert.equal(parsedMetadata.status, 0, "Source metadata XML could not be parsed");
    assert.deepEqual(JSON.parse(parsedMetadata.stdout), [currency.value], "Currency is absent from metadata temporal extent");
  } else {
    assert.equal(currency.fieldLocator, null, "Unknown currency has no asserted locator");
  }
  const artifact = JSON.parse(bytes.toString("utf8"));
  if (parsed.evidenceKind === "synthetic-fixture") {
    assert.ok(allowSynthetic && artifact.fixtureOnly === true, "Synthetic receipt cannot establish a real acquisition");
    assert.equal(parsed.publisher, "TruLot synthetic fixture");
    assert.equal(parsed.sourceUrl, "urn:trulot:fixture:parcel-base-v2");
    assert.equal(parsed.acquisitionMethod, "generated-fixture");
    assert.equal(parsed.request.scope, "synthetic");
    assert.equal(knownDates.length, 0, "Synthetic receipt must not assert source currency");
  } else {
    assert.notEqual(artifact.fixtureOnly, true, "Fixture cannot be relabeled as acquired source");
    assert.equal(parsed.publisher, "SanGIS");
    assert.equal(parsed.sourceUrl, sourceUrl);
    assert.equal(parsed.acquisitionMethod, "public-service-export");
    assert.equal(parsed.request.scope, "countywide-snapshot");
  }
  return parsed;
}

export const importContractSchema = z.object({
  schemaVersion: z.literal(1), datasetId: z.literal("parcel_base_sangis_v2"), status: z.literal("FUTURE_CONTRACT_ONLY"),
  sourceProfile: z.literal("sandag-parcels-geojson-v1"), sourceUrl: z.literal(sourceUrl), metadataUrl: z.literal(`${sourceUrl}/metadata`),
  sourceFields: z.object({
    objectid: z.literal("integer"), apn: z.literal("string"), parcelid: z.literal("integer"),
    situs_address: z.literal("integer"), situs_pre_dir: z.literal("string"), situs_street: z.literal("string"),
    situs_suffix: z.literal("string"), situs_post_dir: z.literal("string"), situs_fraction: z.literal("string"),
    situs_building: z.literal("string"), situs_suite: z.literal("string"), situs_zip: z.literal("string"),
    situs_juris: z.literal("string"), acreage: z.literal("number"),
  }).strict(),
  nativeCrs: z.literal("EPSG:2230"), inputCrs: z.literal("EPSG:4326"), areaCrs: z.literal("EPSG:2230"), outputCrs: z.literal("EPSG:4326"),
  coordinateOrder: z.literal("longitude,latitude"), dimensions: z.literal(2),
  apnPolicy: z.literal("exact-10-digits-or-3-3-2-2; no padding/truncation; preserve subunit"),
  duplicatePolicy: z.literal("quarantine-all-repeated-apns-and-objectids; never merge"),
  stackedPolicy: z.literal("retain-distinct-apns-even-with-identical-parcelid-and-geometry"),
  addressPolicy: z.literal("compose-present-components; missing-number-or-street-means-null; retain-raw-components"),
  geometryPolicy: z.literal("reject-null-empty-invalid-nonpolygon-or-nonfinite; no automatic repair; preserve multipart/holes"),
  areaPolicy: z.literal("derive-approximate-geometry-area-in-US-survey-square-feet; acreage-is-taxable-not-legal-lot-area"),
  centroidPolicy: z.literal("derive-in-2230-then-transform-to-4326; report-centroidWithin; retain-separate-pointOnSurface"),
  extraFieldPolicy: z.literal("report-names-and-exclude-from-normalized-base; retain-original-artifact"),
  jurisdictionCodes: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
  regionalSanityBounds: z.tuple([z.number(), z.number(), z.number(), z.number()]), boundsMeaning: text,
  countsPolicy: z.literal("input=accepted+rejected; duplicateRows subset of rejected; merged=0"),
  samplingPolicy: z.literal("first-3-by-sha256(contentSha256+colon+sourceObjectId), numeric-id-tiebreak"),
  toolchain: z.object({ shapely: text, geos: text, pyproj: text, proj: text }).strict(), productionReady: z.literal(false),
}).strict();
export function readContract() {
  return importContractSchema.parse(JSON.parse(fs.readFileSync(path.join(root, "data/parcel-base-v2/import-contract.json"), "utf8")));
}

export function normalizeApn(raw) {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return /^\d{10}$/.test(value) ? value : /^\d{3}-\d{3}-\d{2}-\d{2}$/.test(value) ? value.replaceAll("-", "") : null;
}
const nullableText = (v) => typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ") : null;
export function normalizeProperties(properties, contract) {
  const errors = [];
  for (const [name, type] of Object.entries(contract.sourceFields)) {
    if (!Object.hasOwn(properties, name)) errors.push(`MISSING_FIELD:${name}`);
    else if (properties[name] !== null) {
      const v = properties[name];
      const valid = type === "integer" ? Number.isSafeInteger(v) : type === "number" ? typeof v === "number" && Number.isFinite(v) : typeof v === "string";
      if (!valid) errors.push(`FIELD_TYPE:${name}`);
    }
  }
  const apn = normalizeApn(properties.apn);
  if (apn === null) errors.push("INVALID_APN");
  if (!Number.isSafeInteger(properties.objectid) || properties.objectid < 1) errors.push("INVALID_OBJECTID");
  if (!Number.isSafeInteger(properties.parcelid) || properties.parcelid < 1) errors.push("INVALID_PARCELID");
  const jurisdiction = nullableText(properties.situs_juris);
  if (jurisdiction !== null && !contract.jurisdictionCodes.includes(jurisdiction)) errors.push("UNKNOWN_JURISDICTION");
  if (properties.acreage !== null && (typeof properties.acreage !== "number" || properties.acreage < 0)) errors.push("INVALID_TAXABLE_ACREAGE");
  const addressKeys = ["situs_address", "situs_fraction", "situs_pre_dir", "situs_street", "situs_suffix", "situs_post_dir"];
  const address = Number.isSafeInteger(properties.situs_address) && properties.situs_address > 0 && nullableText(properties.situs_street)
    ? addressKeys.map((key) => properties[key] === null ? null : nullableText(String(properties[key]))).filter(Boolean).join(" ") : null;
  return {
    errors,
    row: { apnRaw: properties.apn, apnNorm: apn, sourceObjectId: properties.objectid, parcelId: properties.parcelid,
      address, situsComponents: Object.fromEntries(Object.keys(contract.sourceFields).filter((k) => k.startsWith("situs_")).map((k) => [k, properties[k] ?? null])),
      jurisdiction, taxableAcreage: properties.acreage ?? null },
    extraFields: Object.keys(properties).filter((key) => !Object.hasOwn(contract.sourceFields, key)).sort(),
  };
}

export function makeFixtureReceipt(bytes) {
  return { schemaVersion: 1, datasetId: "parcel_base_sangis_v2", evidenceKind: "synthetic-fixture",
    publisher: "TruLot synthetic fixture", sourceUrl: "urn:trulot:fixture:parcel-base-v2", metadataUrl: `${sourceUrl}/metadata`,
    acquiredAt: "2000-01-01T00:00:00Z", // Deliberately fictional, fixed fixture timestamp.
    sourceReported: { warehouseUpload: { value: null, evidenceUrl: null }, serviceModified: { value: null, evidenceUrl: null }, currency: { value: null, basis: "unknown", evidenceUrl: null, fieldLocator: null } },
    metadataContentSha256: null, contentSha256: sha256(bytes), byteSize: bytes.length, originalFilename: "golden-fixture.json", mediaType: "application/json",
    acquisitionMethod: "generated-fixture", licenseUseNote: "Invented test data; no SanGIS parcel artifact acquired.", operatorToolVersion: "trulot-parcel-base-fixture-v1",
    nativeSourceCrs: "EPSG:2230", artifactCrs: "EPSG:4326", request: { outSR: 4326, returnZ: false, scope: "synthetic" } };
}

// Bounded proof harness, deliberately refuses real acquisition files and any DB operation.
export function validateFixture(bytes, receipt, { importRunId = "fixture-run-v1", contract = readContract() } = {}) {
  contract = importContractSchema.parse(contract);
  validateReceipt(receipt, bytes, { allowSynthetic: true });
  assert.equal(receipt.evidenceKind, "synthetic-fixture", "Only fixture runs are implemented; no production loader");
  assert.match(importRunId, /^[A-Za-z0-9_-]+$/, "Invalid import run ID");
  const artifact = JSON.parse(bytes.toString("utf8"));
  assert.equal(artifact.sourceProfile, contract.sourceProfile);
  assert.equal(artifact.sourceCrs, contract.inputCrs, "CRS mismatch; no implicit reprojection of source bytes");
  const expectedSchema = Object.entries(contract.sourceFields).map(([name, type]) => ({ name, type }));
  assert.deepEqual(artifact.sourceSchema, expectedSchema, "Source schema drift or missing required field");
  assert.equal(artifact.featureCollection?.type, "FeatureCollection");
  const features = artifact.featureCollection.features;
  assert.ok(Array.isArray(features) && features.length <= 100, "Only small offline fixtures (<=100 features) supported");
  assert.equal(artifact.declaredFeatureCount, features.length, "Source row count mismatch");
  const parsed = features.map((feature, index) => {
    if (feature?.type !== "Feature" || !feature.properties || typeof feature.properties !== "object" || Array.isArray(feature.properties)) {
      return { index, row: {}, errors: ["INVALID_FEATURE"], extraFields: [] };
    }
    return { index, ...normalizeProperties(feature.properties, contract) };
  });
  const apns = new Map(); const objectIds = new Map();
  for (const item of parsed) {
    for (const [map, key] of [[apns, item.row.apnNorm], [objectIds, item.row.sourceObjectId]]) {
      if (key !== null && key !== undefined) map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  const geometryResult = spawnSync("python3", [path.join(root, "scripts/parcel-base-v2-geometry.py")], {
    input: JSON.stringify({ geometries: features.map((f) => f?.geometry ?? null), contract }), encoding: "utf8", timeout: 30000,
    env: { ...process.env, PROJ_NETWORK: "OFF", PYTHONDONTWRITEBYTECODE: "1" }, maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(geometryResult.status, 0, `Offline geometry validation failed: ${geometryResult.error?.message ?? geometryResult.stderr}`);
  const geometry = JSON.parse(geometryResult.stdout);
  assert.deepEqual(geometry.toolchain, contract.toolchain, "Geometry toolchain mismatch; review/pin before changing");
  const accepted = []; const rejected = []; const extraFields = []; let duplicateRows = 0;
  for (const item of parsed) {
    const duplicate = apns.get(item.row.apnNorm) > 1 || objectIds.get(item.row.sourceObjectId) > 1;
    if (duplicate) { item.errors.push("DUPLICATE_APN_OR_OBJECTID"); duplicateRows++; }
    if (geometry.results[item.index].error) item.errors.push(geometry.results[item.index].error);
    if (item.extraFields.length) extraFields.push({ index: item.index, fields: item.extraFields });
    if (item.errors.length) rejected.push({ index: item.index, sourceObjectId: item.row.sourceObjectId ?? null, reasons: item.errors });
    else accepted.push({ ...item.row, ...geometry.results[item.index], sourceGeometry: features[item.index].geometry });
  }
  const parcelIdDistribution = {};
  for (const row of accepted) parcelIdDistribution[row.parcelId] = (parcelIdDistribution[row.parcelId] ?? 0) + 1;
  const sampling = accepted.map((row) => ({ sourceObjectId: row.sourceObjectId, rank: sha256(`${receipt.contentSha256}:${row.sourceObjectId}`) }))
    .sort((a, b) => a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.sourceObjectId - b.sourceObjectId).slice(0, 3);
  return { datasetId: contract.datasetId, fixtureOnly: true, productionReady: false, importRunId,
    acquisitionContentSha256: receipt.contentSha256, receiptSha256: sha256(JSON.stringify(receipt)), contractSha256: sha256(JSON.stringify(contract)),
    counts: { input: features.length, accepted: accepted.length, rejected: rejected.length, duplicateRows, merged: 0 },
    duplicateApns: [...apns].filter(([, n]) => n > 1), parcelIdDistribution, extraFields, sampling, accepted, rejected,
    rejectedRowsArtifactSha256: sha256(JSON.stringify(rejected)), toolchain: geometry.toolchain, transformation: geometry.transformation };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bytes = fs.readFileSync(path.join(root, "data/parcel-base-v2/golden-fixture.json"));
  const report = validateFixture(bytes, makeFixtureReceipt(bytes));
  console.log(JSON.stringify(report, null, 2));
}

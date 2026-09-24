import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import { createGzip, createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { normalizeProperties, readContract, receiptSchema, root, sha256, sourceUrl } from "./parcel-base-v2.mjs";

export async function fileHash(filename) {
  const hash = createHash("sha256"); let bytes = 0;
  for await (const chunk of fs.createReadStream(filename)) { hash.update(chunk); bytes += chunk.length; }
  return { sha256: hash.digest("hex"), byteSize: bytes };
}
export function schemaReport(layer, contract) {
  const types = { integer: ["esriFieldTypeOID", "esriFieldTypeInteger", "esriFieldTypeSmallInteger"], string: ["esriFieldTypeString"], number: ["esriFieldTypeDouble", "esriFieldTypeSingle"] };
  const result = Object.entries(contract.sourceFields).map(([field, expected]) => {
    const actual = layer.fields.find((f) => f.name === field);
    assert.ok(actual && types[expected].includes(actual.type), `Source schema mismatch: ${field}`);
    return { field, expected, actual: actual.type, present: true, action: "normalize-under-Packet-5-contract" };
  });
  return { required: result, excluded: layer.fields.filter((f) => !Object.hasOwn(contract.sourceFields, f.name)).map((f) => ({ field: f.name, type: f.type })) };
}
export function reconcile(counts, expected) {
  assert.equal(counts.acquired, expected, "Acquired/source count mismatch");
  assert.equal(counts.parsed, counts.acquired, "Parsed/acquired count mismatch");
  assert.equal(counts.accepted + counts.rejected, counts.parsed, "Unexplained row loss");
  assert.equal(counts.merged, 0, "No merging authorized");
  assert.ok(counts.duplicateApnRows <= counts.rejected && counts.duplicateObjectIdRows <= counts.rejected, "Duplicate rows must be rejected");
}
export function rejectDuplicates(row, apns, objectIds) {
  return apns.get(row.apnNorm) > 1 || objectIds.get(row.sourceObjectId) > 1;
}
function inc(object, key, n = 1) { object[key] = (object[key] ?? 0) + n; }
function bump(map, key) { if (key !== null && key !== undefined) map.set(key, (map.get(key) ?? 0) + 1); }
function group(map, key, apn) {
  if (key === null || key === undefined || apn === null) return;
  let item = map.get(key);
  if (!item) { item = { rows: 0, apns: new Set() }; map.set(key, item); }
  item.rows++; item.apns.add(apn);
}
function distribution(map) {
  const frequencies = {}; let repeatedGroups = 0; let repeatedRows = 0; let distinctApnStackedGroups = 0; let distinctApnStackedRows = 0;
  for (const item of map.values()) {
    inc(frequencies, item.rows);
    if (item.rows > 1) { repeatedGroups++; repeatedRows += item.rows; }
    if (item.apns.size > 1) { distinctApnStackedGroups++; distinctApnStackedRows += item.rows; }
  }
  return { groups: map.size, frequencies, repeatedGroups, repeatedRows, distinctApnStackedGroups, distinctApnStackedRows };
}
export function chooseSample(samples, category, candidate) {
  const current = samples[category];
  if (!current || candidate.rank < current.rank || (candidate.rank === current.rank && candidate.sourceObjectId < current.sourceObjectId)) samples[category] = candidate;
}
function writer(filename) {
  const file = fs.createWriteStream(filename, { flags: "wx" });
  const zip = createGzip({ level: 1 }); zip.pipe(file);
  file.on("error", (error) => zip.destroy(error));
  return { async write(row) { if (!zip.write(`${JSON.stringify(row)}\n`)) await once(zip, "drain"); }, async close() { zip.end(); await finished(file); } };
}
async function* lines(filename) {
  const source = fs.createReadStream(filename); const unzip = createGunzip(); source.pipe(unzip);
  source.on("error", (error) => unzip.destroy(error));
  for await (const line of createInterface({ input: unzip, crlfDelay: Infinity })) yield JSON.parse(line);
}

export async function rehearse(acquisitionDir, outputDir) {
  acquisitionDir = path.resolve(acquisitionDir); outputDir = path.resolve(outputDir);
  assert.ok(!outputDir.startsWith(root + path.sep) && outputDir !== root, "Large outputs must remain outside Git");
  const acquisition = JSON.parse(fs.readFileSync(path.join(acquisitionDir, "acquisition.json"), "utf8"));
  const receipt = receiptSchema.parse(acquisition.receipt);
  assert.equal(receipt.evidenceKind, "acquired-source"); assert.equal(receipt.publisher, "SanGIS"); assert.equal(receipt.sourceUrl, sourceUrl);
  const artifact = path.join(acquisitionDir, receipt.originalFilename);
  const beforeHash = await fileHash(artifact);
  assert.deepEqual(beforeHash, { sha256: receipt.contentSha256, byteSize: receipt.byteSize }, "Acquisition artifact hash mismatch");
  const layer = JSON.parse(fs.readFileSync(path.join(acquisitionDir, "before-layer.json"), "utf8"));
  const afterLayer = JSON.parse(fs.readFileSync(path.join(acquisitionDir, "after-layer.json"), "utf8"));
  assert.deepEqual(layer.editingInfo, afterLayer.editingInfo, "Source changed during acquisition");
  const advertised = JSON.parse(fs.readFileSync(path.join(acquisitionDir, "before-count.json"), "utf8")).count;
  assert.equal(JSON.parse(fs.readFileSync(path.join(acquisitionDir, "after-count.json"), "utf8")).count, advertised);
  const expectedIds = JSON.parse(fs.readFileSync(path.join(acquisitionDir, "source-objectids.json"), "utf8")).objectIds;
  assert.equal(new Set(expectedIds).size, advertised);
  const contract = readContract(); const schema = schemaReport(layer, contract);
  fs.mkdirSync(outputDir); // Fail rather than reuse/overwrite a previous run.
  const spool = writer(path.join(outputDir, "normalized-before-duplicates.ndjson.gz"));
  const child = spawn("python3", [path.join(root, "scripts/sangis-acquisition-stream.py"), artifact], {
    env: { ...process.env, PROJ_NETWORK: "OFF", PYTHONDONTWRITEBYTECODE: "1" }, stdio: ["ignore", "pipe", "inherit"],
  });
  const exit = once(child, "close");
  const apns = new Map(); const objectIds = new Map(); const parcelIds = new Map(); const geometries = new Map();
  const geometry = { types: {}, coordinateDimensions: {}, multipartRows: 0, holeRows: 0, interiorRings: 0, topologyInvalidRows: 0, nullRows: 0, geometryRejectedRows: 0, centroidOutsideRows: 0 };
  const sourceCounts = { malformedApnRows: 0, missingSitusRows: 0, unknownJurisdictionRows: 0 };
  const jurisdiction = {}; let parsed = 0; let end = null;
  for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
    const value = JSON.parse(line);
    if (value.kind === "header") { assert.deepEqual(value.toolchain, contract.toolchain); continue; }
    if (value.kind === "end") { end = value; continue; }
    assert.equal(value.kind, "row");
    const normalized = normalizeProperties(value.properties, contract);
    const row = normalized.row; const stat = value.geometryStats;
    bump(apns, row.apnNorm); bump(objectIds, row.sourceObjectId);
    group(parcelIds, row.parcelId, row.apnNorm); group(geometries, stat.geometryHash, row.apnNorm);
    inc(geometry.types, stat.type); for (const dimension of stat.dimensions) inc(geometry.coordinateDimensions, dimension);
    if (stat.parts > 1) geometry.multipartRows++;
    if (stat.holes > 0) geometry.holeRows++;
    geometry.interiorRings += stat.holes;
    if (stat.topologyInvalid) geometry.topologyInvalidRows++;
    if (stat.type === "null") geometry.nullRows++;
    if (value.geometry.error) geometry.geometryRejectedRows++;
    if (value.geometry.centroidWithin === false) geometry.centroidOutsideRows++;
    if (row.apnNorm === null) sourceCounts.malformedApnRows++;
    if (row.address === null) sourceCounts.missingSitusRows++;
    if (normalized.errors.includes("UNKNOWN_JURISDICTION")) sourceCounts.unknownJurisdictionRows++;
    inc(jurisdiction, row.jurisdiction ?? "unknown");
    const reasons = [...normalized.errors, ...(value.geometry.error ? [value.geometry.error] : [])];
    await spool.write({ index: parsed, row, reasons, geometry: value.geometry, geometryStats: stat, extraFields: value.extraFields });
    parsed++;
    if (parsed % 50000 === 0) console.error(`Parsed and validated ${parsed}/${advertised}`);
  }
  const [code] = await exit;
  await spool.close();
  assert.equal(code, 0, "Geometry/parser process failed"); assert.ok(end); assert.equal(end.parsed, parsed);
  assert.equal(objectIds.size, advertised, "Missing/duplicate/unexpected source object IDs");
  for (const id of expectedIds) assert.equal(objectIds.get(id), 1, `Missing/duplicate advertised object ID: ${id}`);
  const counts = { source: advertised, acquired: parsed, parsed, accepted: 0, rejected: 0, duplicateApnRows: 0, duplicateObjectIdRows: 0, merged: 0, ...sourceCounts };
  const samples = {}; const reasons = {}; const acceptedParcelIds = new Map(); const acceptedGeometries = new Map();
  const rows = writer(path.join(outputDir, "rows.ndjson.gz")); const rejected = writer(path.join(outputDir, "rejected.ndjson.gz"));
  for await (const entry of lines(path.join(outputDir, "normalized-before-duplicates.ndjson.gz"))) {
    const { row, geometryStats: stat } = entry;
    if (apns.get(row.apnNorm) > 1) counts.duplicateApnRows++;
    if (objectIds.get(row.sourceObjectId) > 1) counts.duplicateObjectIdRows++;
    if (rejectDuplicates(row, apns, objectIds)) entry.reasons.push("DUPLICATE_APN_OR_OBJECTID");
    const accepted = entry.reasons.length === 0;
    if (accepted) { counts.accepted++; group(acceptedParcelIds, row.parcelId, row.apnNorm); group(acceptedGeometries, stat.geometryHash, row.apnNorm); }
    else { counts.rejected++; await rejected.write(entry); }
    for (const reason of entry.reasons) inc(reasons, reason);
    await rows.write({ accepted, ...entry });
    const categories = [];
    if (accepted) categories.push("ordinary", `jurisdiction:${row.jurisdiction ?? "unknown"}`);
    if (row.address === null) categories.push("missing-situs");
    if (stat.parts > 1) categories.push("multipart");
    if (stat.holes) categories.push("holes");
    if (parcelIds.get(row.parcelId)?.apns.size > 1) categories.push("stacked");
    if (entry.geometry.centroidWithin === false) categories.push("centroid-outside");
    if (apns.get(row.apnNorm) > 1) categories.push("duplicate-apn");
    if (!accepted) categories.push("rejected-anomaly");
    // No addresses, raw APNs or coordinates in the repository sample.
    const sample = { sourceObjectId: row.sourceObjectId, rank: sha256(`${receipt.contentSha256}:${row.sourceObjectId}`),
      apnSha256: sha256(row.apnNorm ?? "null"), apnValid: row.apnNorm !== null, addressPresent: row.address !== null,
      jurisdiction: row.jurisdiction, accepted, reasons: entry.reasons, geometryType: stat.type,
      parts: stat.parts, holes: stat.holes, centroidWithin: entry.geometry.centroidWithin ?? null,
      approximateAreaSqFt: entry.geometry.approxGeometryAreaSqFt ?? null };
    for (const category of categories) chooseSample(samples, category, sample);
  }
  await rows.close(); await rejected.close();
  reconcile(counts, advertised);
  assert.ok(counts.accepted > 0, "No rows meet the unmodified Packet 5 contract");
  assert.deepEqual(await fileHash(artifact), beforeHash, "Artifact changed during validation");
  const outputHashes = {};
  for (const name of ["rows.ndjson.gz", "rejected.ndjson.gz"]) outputHashes[name] = await fileHash(path.join(outputDir, name));
  const report = { decision: "REAL_SANGIS_ACQUISITION_REHEARSAL_PASS", datasetId: receipt.datasetId,
    acquisitionId: acquisition.acquisitionId, sourceArtifact: beforeHash, counts, schema, geometry, jurisdiction, rejectionReasons: reasons,
    stacked: { parcelIds: distribution(parcelIds), identicalGeometry: distribution(geometries), acceptedParcelIds: distribution(acceptedParcelIds), acceptedIdenticalGeometry: distribution(acceptedGeometries) },
    deterministicSamples: Object.fromEntries(Object.entries(samples).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)),
    toolchain: contract.toolchain, transformation: end.transformation, outputHashes, productionReady: false };
  fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.error(JSON.stringify({ decision: report.decision, counts, geometry, report: path.join(outputDir, "report.json") }));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 4, "Usage: node rehearse-sangis-acquisition.mjs ACQUISITION_DIR NEW_OUTPUT_DIR");
  await rehearse(process.argv[2], process.argv[3]);
}

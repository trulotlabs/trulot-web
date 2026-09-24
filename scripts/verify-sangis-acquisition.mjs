import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileHash, schemaReport } from "./rehearse-sangis-acquisition.mjs";
import { validateReceiptMetadata, readContract, sha256, sourceUrl } from "./parcel-base-v2.mjs";

export const expectedItem = "032a5dcf654c4ccbb18711ad8a0ee754";
export function verifyIdentity(layer, item) {
  assert.equal(layer.id, 0); assert.equal(layer.name, "Parcels"); assert.equal(layer.serviceItemId, expectedItem);
  assert.equal(item.id, expectedItem); assert.equal(item.owner, "SanGIS"); assert.equal(item.url, sourceUrl.replace(/\/0$/, ""));
  assert.equal(layer.geometryType, "esriGeometryPolygon"); assert.equal(layer.extent.spatialReference.latestWkid, 2230);
  assert.ok(layer.capabilities.split(",").includes("Query"));
}
export function inventoryHash(files) {
  const names = new Set();
  const canonical = [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map((file) => {
    assert.ok(/^[A-Za-z0-9._-]+$/.test(file.path) && ![".", ".."].includes(file.path), "Unsafe artifact filename");
    assert.ok(!names.has(file.path), "Duplicate artifact inventory path"); names.add(file.path);
    assert.ok(Number.isSafeInteger(file.byteSize) && file.byteSize > 0);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    return { byteSize: file.byteSize, path: file.path, sha256: file.sha256 };
  });
  return sha256(JSON.stringify(canonical));
}

export async function verifyAcquisition(directory) {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
  const acquisition = read("acquisition.json");
  assert.equal(acquisition.aggregateSha256, inventoryHash(acquisition.files), "Aggregate inventory hash mismatch");
  const actualFiles = new Map();
  for (const file of acquisition.files) {
    const actual = await fileHash(path.join(directory, file.path));
    assert.deepEqual(actual, { sha256: file.sha256, byteSize: file.byteSize }, `Artifact/metadata hash mismatch: ${file.path}`);
    actualFiles.set(file.path, actual);
  }
  const metadataBytes = fs.readFileSync(path.join(directory, "before-metadata.xml"));
  const receipt = validateReceiptMetadata(acquisition.receipt, { metadataBytes });
  assert.equal(receipt.evidenceKind, "acquired-source"); assert.equal(receipt.publisher, "SanGIS"); assert.equal(receipt.sourceUrl, sourceUrl);
  assert.equal(receipt.acquisitionMethod, "public-service-export"); assert.equal(receipt.request.scope, "countywide-snapshot");
  assert.equal(receipt.request.returnZ, null, "Export has no returnZ parameter; geometry is independently checked");
  assert.equal(receipt.mediaType, "application/geo+json");
  assert.deepEqual(actualFiles.get(receipt.originalFilename), { sha256: receipt.contentSha256, byteSize: receipt.byteSize });
  for (const name of ["before-layer.json", "before-item.json", "before-metadata.xml", "before-count.json", "after-layer.json", "after-count.json", "source-objectids.json", "export-request.json", "download.json", "warehouse-layer-updates.pdf"]) assert.ok(actualFiles.has(name), `Missing required evidence: ${name}`);
  const before = read("before-layer.json"); const after = read("after-layer.json");
  verifyIdentity(before, read("before-item.json")); verifyIdentity(after, read("before-item.json"));
  assert.match(metadataBytes.toString("utf8"), /<resTitle>PARCELS_ALL<\/resTitle>/);
  assert.deepEqual(before.fields, after.fields); assert.deepEqual(before.editingInfo, after.editingInfo);
  const count = read("before-count.json").count;
  assert.equal(read("after-count.json").count, count); assert.equal(acquisition.sourceFeatureCount, count);
  const ids = read("source-objectids.json").objectIds;
  assert.equal(ids.length, count); assert.equal(new Set(ids).size, count);
  const sourceModified = new Date(before.editingInfo.lastEditDate).toISOString();
  assert.equal(new Date(receipt.sourceReported.serviceModified.value).toISOString(), sourceModified);
  const request = read("export-request.json");
  assert.deepEqual(request, acquisition.exportRequest);
  assert.equal(request.url, sourceUrl.replace(/\/0$/, "/createReplica"));
  assert.equal(request.parameters.layers, "0"); assert.equal(request.parameters.syncModel, "none");
  assert.equal(request.parameters.replicaSR, "4326"); assert.equal(request.parameters.dataFormat, "geojson");
  assert.equal(request.parameters.returnAttachments, "false"); assert.equal(request.method, "POST");
  assert.deepEqual(JSON.parse(request.parameters.layerQueries), { "0": { queryOption: "all", useGeometry: false, includeRelated: false } });
  assert.equal(Object.hasOwn(request.parameters, "geometry"), false, "No spatial subset allowed");
  assert.equal(Object.hasOwn(request.parameters, "returnZ"), false, "Record actual API parameters");
  const schema = schemaReport(before, readContract());
  console.log(`Verified real acquisition: ${count} advertised unique IDs, all ${actualFiles.size} artifact/metadata hashes, source identity and schema.`);
  return { sourceCount: count, contentSha256: receipt.contentSha256, aggregateSha256: acquisition.aggregateSha256, schema };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, "Usage: node verify-sangis-acquisition.mjs ACQUISITION_DIR");
  await verifyAcquisition(process.argv[2]);
}

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileHash, reconcile, rejectDuplicates, chooseSample, schemaReport } from "./rehearse-sangis-acquisition.mjs";
import { inventoryHash, verifyIdentity } from "./verify-sangis-acquisition.mjs";
import { makeFixtureReceipt, validateReceipt, receiptSchema, normalizeProperties, readContract, root, sha256 } from "./parcel-base-v2.mjs";
let n = 0;
async function test(name, fn) { await fn(); console.log(`PASS ${name}`); n++; }
const contract = readContract();
const fixtureBytes = fs.readFileSync(path.join(root, "data/parcel-base-v2/golden-fixture.json"));
const fixture = JSON.parse(fixtureBytes);
const counts = { acquired: 4, parsed: 4, accepted: 2, rejected: 2, duplicateApnRows: 2, duplicateObjectIdRows: 0, merged: 0 };
await test("complete reconciliation", () => reconcile(counts, 4));
for (const key of ["acquired", "parsed", "accepted", "rejected", "merged", "duplicateApnRows"]) {
  await test(`reconciliation rejects ${key} discrepancy`, () => assert.throws(() => reconcile({ ...counts, [key]: counts[key] + 1 }, 4)));
}
await test("all duplicate APNs rejected, no winner", () => {
  const apns = new Map([["1234567801", 2]]);
  for (const id of [1, 2]) assert.equal(rejectDuplicates({ apnNorm: "1234567801", sourceObjectId: id }, apns, new Map([[1, 1], [2, 1]])), true);
});
await test("all duplicate object IDs rejected", () => assert.equal(rejectDuplicates({ apnNorm: "1234567801", sourceObjectId: 1 }, new Map(), new Map([[1, 2]])), true));
await test("stacked parcels with distinct APNs and IDs preserved", () => {
  const apns = new Map([["1234567801", 1], ["1234567802", 1]]);
  const ids = new Map([[1, 1], [2, 1]]);
  for (const [i, apn] of [...apns.keys()].entries()) assert.equal(rejectDuplicates({ apnNorm: apn, sourceObjectId: i + 1, parcelId: 999, geometryHash: "same" }, apns, ids), false);
});
await test("sampling independent of encounter order", () => {
  const candidates = [3, 1, 2].map((id) => ({ sourceObjectId: id, rank: sha256(`artifact:${id}`) }));
  const a = {}; const b = {};
  for (const c of candidates) chooseSample(a, "ordinary", c);
  for (const c of [...candidates].reverse()) chooseSample(b, "ordinary", c);
  assert.deepEqual(a, b);
});
await test("sampling numeric ID tie break", () => { const s = {}; chooseSample(s, "x", { rank: "a", sourceObjectId: 10 }); chooseSample(s, "x", { rank: "a", sourceObjectId: 2 }); assert.equal(s.x.sourceObjectId, 2); });
await test("artifact hash tracks actual bytes including tampering", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sangis-hash-")); const file = path.join(dir, "artifact");
  try { fs.writeFileSync(file, fixtureBytes); assert.deepEqual(await fileHash(file), { sha256: sha256(fixtureBytes), byteSize: fixtureBytes.length }); fs.appendFileSync(file, "x"); assert.notEqual((await fileHash(file)).sha256, sha256(fixtureBytes)); }
  finally { fs.rmSync(dir, { recursive: true }); }
});
const receipt = makeFixtureReceipt(fixtureBytes);
for (const key of ["publisher", "acquiredAt", "sourceUrl", "metadataUrl", "contentSha256", "byteSize", "originalFilename", "licenseUseNote", "operatorToolVersion", "request", "sourceReported"]) {
  await test(`receipt cannot omit ${key}`, () => { const r = structuredClone(receipt); delete r[key]; assert.equal(receiptSchema.safeParse(r).success, false); });
}
await test("export absent returnZ representable, true forbidden", () => { assert.equal(receiptSchema.safeParse({ ...receipt, request: { ...receipt.request, returnZ: null } }).success, true); assert.equal(receiptSchema.safeParse({ ...receipt, request: { ...receipt.request, returnZ: true } }).success, false); });
await test("synthetic returnZ=false safety preserved", () => assert.throws(() => validateReceipt({ ...receipt, request: { ...receipt.request, returnZ: null } }, fixtureBytes, { allowSynthetic: true }), /explicit returnZ=false/));
await test("invalid APN is rejected without padding", () => { const p = { ...fixture.featureCollection.features[0].properties, apn: "123" }; const r = normalizeProperties(p, contract); assert.equal(r.row.apnNorm, null); assert.ok(r.errors.includes("INVALID_APN")); assert.equal(p.apn, "123"); });
await test("missing acquired field rejected", () => { const p = { ...fixture.featureCollection.features[0].properties }; delete p.situs_zip; assert.ok(normalizeProperties(p, contract).errors.includes("MISSING_FIELD:situs_zip")); });
const files = [{ path: "b.json", byteSize: 3, sha256: "a".repeat(64) }, { path: "a.json", byteSize: 4, sha256: "b".repeat(64) }];
await test("inventory canonical independent of ordering", () => assert.equal(inventoryHash(files), inventoryHash([...files].reverse())));
await test("inventory forbids path traversal", () => assert.throws(() => inventoryHash([{ ...files[0], path: "../escape" }])));
await test("inventory forbids duplicate files", () => assert.throws(() => inventoryHash([files[0], files[0]])));
await test("inventory hash changes with artifact hash", () => assert.notEqual(inventoryHash(files), inventoryHash([{ ...files[0], sha256: "c".repeat(64) }, files[1]])));
await test("schema mismatch fails before normalization", () => assert.throws(() => schemaReport({ fields: [] }, contract), /Source schema mismatch/));
await test("changed source identity fails", () => assert.throws(() => verifyIdentity({ id: 1 }, {})));
console.log(`${n} acquisition regression checks passed; no network or database access.`);
const evidence = path.join(root, "data/parcel-base-v2/acquisitions/sangis-20260924T183743Z");
const recorded = JSON.parse(fs.readFileSync(path.join(evidence, "acquisition.json"), "utf8"));
const reportBytes = fs.readFileSync(path.join(evidence, "report.json"));
const report = JSON.parse(reportBytes);
const repeat = JSON.parse(fs.readFileSync(path.join(evidence, "repeatability.json"), "utf8"));
await test("recorded receipt and immutable inventory remain internally consistent", () => {
  receiptSchema.parse(recorded.receipt);
  assert.equal(inventoryHash(recorded.files), recorded.aggregateSha256);
  assert.deepEqual(recorded.files.find((f) => f.path === recorded.receipt.originalFilename), { path: recorded.receipt.originalFilename, byteSize: recorded.receipt.byteSize, sha256: recorded.receipt.contentSha256 });
});
await test("recorded reconciliation and repeated report hash agree", () => {
  reconcile(report.counts, recorded.sourceFeatureCount);
  assert.equal(sha256(reportBytes), repeat.reportHash.sha256);
  assert.equal(report.sourceArtifact.sha256, recorded.receipt.contentSha256);
  assert.deepEqual(report.outputHashes, repeat.outputHashes);
  assert.equal(report.productionReady, false);
});
await test("recorded samples cover observed categories without raw APNs or addresses", () => {
  for (const category of ["ordinary", "missing-situs", "multipart", "stacked", "duplicate-apn", "rejected-anomaly", ...contract.jurisdictionCodes.map((j) => `jurisdiction:${j}`)]) assert.ok(report.deterministicSamples[category]);
  for (const sample of Object.values(report.deterministicSamples)) {
    assert.equal(sample.rank, sha256(`${recorded.receipt.contentSha256}:${sample.sourceObjectId}`));
    for (const key of ["apn", "apnRaw", "apnNorm", "address", "coordinates"]) assert.equal(Object.hasOwn(sample, key), false);
  }
});
console.log(`${n} total acquisition regression checks passed.`);

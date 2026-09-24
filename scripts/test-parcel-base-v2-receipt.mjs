import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { root, sourceUrl, sha256, makeFixtureReceipt, validateReceipt, receiptSchema } from "./parcel-base-v2.mjs";

const bytes = fs.readFileSync(path.join(root, "data/parcel-base-v2/golden-fixture.json"));
const receipt = makeFixtureReceipt(bytes);
let count = 0;
function test(name, fn) { fn(); count++; console.log(`PASS ${name}`); }
function rejects(name, mutate, pattern) {
  test(name, () => { const r = structuredClone(receipt); mutate(r); assert.throws(() => validateReceipt(r, bytes, { allowSynthetic: true }), pattern); });
}
test("synthetic receipt matches actual bytes", () => assert.equal(validateReceipt(receipt, bytes, { allowSynthetic: true }).contentSha256, sha256(bytes)));
test("synthetic receipt refused by default", () => assert.throws(() => validateReceipt(receipt, bytes), /Synthetic receipt/));
rejects("wrong hash", (r) => { r.contentSha256 = "0".repeat(64); }, /checksum mismatch/);
rejects("wrong byte size", (r) => { r.byteSize++; }, /size mismatch/);
rejects("missing timestamp", (r) => { delete r.acquiredAt; }, /acquiredAt/);
rejects("ambiguous timestamp", (r) => { r.acquiredAt = "2026-08-31"; }, /acquiredAt/);
rejects("absent explicit currency", (r) => { delete r.sourceReported.currency; }, /currency/);
rejects("event date basis", (r) => { r.sourceReported.currency.basis = "permit-event-date"; }, /basis/);
rejects("upload date basis", (r) => { r.sourceReported.currency.basis = "warehouse-upload"; }, /basis/);
rejects("known currency without evidence", (r) => { r.sourceReported.currency.value = "2026-08-31"; r.sourceReported.currency.basis = "metadata-temporal-extent"; }, /checksum-linked metadata/);
rejects("known date called unknown", (r) => { r.sourceReported.currency.value = "2026-08-31"; }, /explicit source temporal/);
rejects("checksum for metadata not supplied", (r) => { r.metadataContentSha256 = "a".repeat(64); }, /checksum-linked metadata/);
rejects("fixture relabeled source", (r) => { r.evidenceKind = "acquired-source"; r.publisher = "SanGIS"; r.sourceUrl = sourceUrl; r.acquisitionMethod = "public-service-export"; r.request.scope = "countywide-snapshot"; }, /Fixture cannot/);
rejects("wrong publisher for fixture", (r) => { r.publisher = "SanGIS"; }, /TruLot synthetic fixture/);
rejects("path traversal filename", (r) => { r.originalFilename = "../receipt.json"; }, /originalFilename/);
rejects("unknown receipt fields", (r) => { r.verified = true; }, /verified/);
rejects("wrong source CRS", (r) => { r.nativeSourceCrs = "EPSG:4326"; }, /nativeSourceCrs/);
rejects("unexpected metadata endpoint", (r) => { r.metadataUrl = "https://example.com/metadata"; }, /Unexpected metadata/);
rejects("credential-bearing metadata URL", (r) => { r.metadataUrl = "https://user:secret@example.com/metadata"; }, /Public HTTPS/);
rejects("missing license/use note", (r) => { delete r.licenseUseNote; }, /licenseUseNote/);
test("invalid content cannot parse", () => { const invalid = Buffer.from("not-json"); const r = { ...receipt, byteSize: invalid.length, contentSha256: sha256(invalid) }; assert.throws(() => validateReceipt(r, invalid, { allowSynthetic: true })); });
test("source currency cannot use arbitrary metadata timestamp", () => {
  const r = structuredClone(receipt);
  const metadata = Buffer.from("<metadata><modified>2026-08-31</modified></metadata>");
  r.metadataContentSha256 = sha256(metadata);
  r.sourceReported.currency = { value: "2026-08-31", basis: "metadata-temporal-extent", evidenceUrl: `${sourceUrl}/metadata`, fieldLocator: "metadata/dataIdInfo/dataExt/tempEle/TempExtent/exTemp/TM_Instant/tmPosition" };
  assert.throws(() => validateReceipt(r, bytes, { allowSynthetic: true, metadataBytes: metadata }), /absent from metadata temporal extent/);
});
test("receipt schema exported for future tooling", () => assert.equal(receiptSchema.safeParse(receipt).success, true));
console.log(`Parcel Base V2 receipt tests passed (${count} cases).`);

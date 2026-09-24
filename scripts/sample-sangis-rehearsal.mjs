import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { sha256 } from "./parcel-base-v2.mjs";
import { fileHash } from "./rehearse-sangis-acquisition.mjs";

assert.equal(process.argv.length, 3, "Usage: node sample-sangis-rehearsal.mjs PASS_DIR");
const dir = process.argv[2];
const report = JSON.parse(fs.readFileSync(path.join(dir, "report.json"), "utf8"));
assert.deepEqual(await fileHash(path.join(dir, "rows.ndjson.gz")), report.outputHashes["rows.ndjson.gz"]);
const first = [];
const input = fs.createReadStream(path.join(dir, "rows.ndjson.gz"));
const unzip = createGunzip(); input.pipe(unzip); input.on("error", (error) => unzip.destroy(error));
for await (const line of createInterface({ input: unzip, crlfDelay: Infinity })) {
  const entry = JSON.parse(line);
  if (!entry.accepted) continue; // Packet 5 first-three policy applies to accepted rows.
  const { row, geometryStats: stat } = entry;
  const sample = { sourceObjectId: row.sourceObjectId, rank: sha256(`${report.sourceArtifact.sha256}:${row.sourceObjectId}`),
    apnSha256: sha256(row.apnNorm ?? "null"), apnValid: row.apnNorm !== null, addressPresent: row.address !== null,
    jurisdiction: row.jurisdiction, accepted: entry.accepted, reasons: entry.reasons, geometryType: stat.type,
    parts: stat.parts, holes: stat.holes, centroidWithin: entry.geometry.centroidWithin ?? null,
    approximateAreaSqFt: entry.geometry.approxGeometryAreaSqFt ?? null };
  first.push(sample);
  first.sort((a, b) => a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.sourceObjectId - b.sourceObjectId);
  if (first.length > 3) first.pop();
}
console.log(JSON.stringify({ acquisitionId: report.acquisitionId, sourceArtifactSha256: report.sourceArtifact.sha256,
  policy: "first-3-by-sha256(contentSha256+colon+sourceObjectId), numeric-id-tiebreak",
  firstThree: first, categoryPolicy: "minimum of same ranking within each category", categories: report.deterministicSamples }, null, 2));

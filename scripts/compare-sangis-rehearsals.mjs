import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileHash, reconcile } from "./rehearse-sangis-acquisition.mjs";

export async function compareRehearsals(first, second) {
  assert.notEqual(fs.realpathSync(first), fs.realpathSync(second), "Independent output directories required");
  const reports = [first, second].map((dir) => JSON.parse(fs.readFileSync(path.join(dir, "report.json"), "utf8")));
  assert.deepEqual(reports[0], reports[1], "Unexplained nondeterminism between full passes");
  const report = reports[0];
  assert.equal(report.decision, "REAL_SANGIS_ACQUISITION_REHEARSAL_PASS");
  reconcile(report.counts, report.counts.source);
  for (const dir of [first, second]) {
    for (const name of ["rows.ndjson.gz", "rejected.ndjson.gz"]) {
      assert.deepEqual(await fileHash(path.join(dir, name)), report.outputHashes[name], `Derived output checksum mismatch: ${dir}/${name}`);
    }
  }
  const reportHash = await fileHash(path.join(first, "report.json"));
  assert.deepEqual(reportHash, await fileHash(path.join(second, "report.json")));
  return { acquisitionId: report.acquisitionId, sourceArtifact: report.sourceArtifact, independentPassDirectories: [first, second],
    reportsByteIdentical: true, reportHash, rowOutputsByteIdentical: true, outputHashes: report.outputHashes,
    compared: ["input count", "accepted", "rejected", "duplicates", "geometry", "stacked distributions", "deterministic samples", "all normalized row bytes"],
    decision: "REAL_SANGIS_ACQUISITION_REHEARSAL_PASS" };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 4, "Usage: node compare-sangis-rehearsals.mjs PASS1_DIR PASS2_DIR");
  console.log(JSON.stringify(await compareRehearsals(process.argv[2], process.argv[3]), null, 2));
}

#!/usr/bin/env node
// Runs a production build from an isolated temporary tree so an existing local
// dev server can keep its .next lock. No network or production source is used.
import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = process.cwd();
const outputPath = path.resolve(
  process.argv[2] ??
    "data/san-diego-phase-a-indexing-activation-review-v0/build.json",
);
const reviewRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trulot-packet86-build-"));
for (const entry of fs.readdirSync(repositoryRoot)) {
  if ([".git", ".next"].includes(entry)) continue;
  if (entry === "node_modules") {
    fs.symlinkSync(path.join(repositoryRoot, entry), path.join(reviewRoot, entry));
  } else if (entry === "data") {
    const targetData = path.join(reviewRoot, "data");
    fs.mkdirSync(targetData);
    for (const dataEntry of fs.readdirSync(path.join(repositoryRoot, "data"))) {
      const source = path.join(repositoryRoot, "data", dataEntry);
      const target = path.join(targetData, dataEntry);
      if (dataEntry === "san-diego-public-zoning-snapshot-v0") {
        // Next's output-file glob intentionally does not follow a symlinked
        // parent directory, so copy the bounded 4.5 MB deployment payload.
        fs.cpSync(source, target, { recursive: true });
      } else {
        fs.symlinkSync(source, target);
      }
    }
  } else {
    fs.cpSync(path.join(repositoryRoot, entry), path.join(reviewRoot, entry), { recursive: true });
  }
}
const result = spawnSync("npm", ["run", "build", "--", "--webpack"], {
  cwd: reviewRoot,
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:4391",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-build-fixture-not-a-credential",
    TRULOT_SD_PUBLIC_ZONING_SNAPSHOT: "0",
    TRULOT_SD_INDEXING: "0",
  },
  encoding: "utf8",
});
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

const nextRoot = path.join(reviewRoot, ".next");
const routeTrace = path.join(
  nextRoot,
  "server/app/parcel/san-diego/[slug]/page.js.nft.json",
);
if (!fs.existsSync(routeTrace)) {
  throw new Error(`Parcel route trace missing: ${routeTrace}`);
}

const trace = JSON.parse(fs.readFileSync(routeTrace, "utf8"));
const tracedFiles = trace.files.map((file) => path.resolve(path.dirname(routeTrace), file));
const snapshotFiles = tracedFiles.filter((file) =>
  file.includes("/data/san-diego-public-zoning-snapshot-v0/"),
);
const shardFiles = snapshotFiles.filter((file) =>
  /\/shards\/[^/]+\.ndjson\.gz$/.test(file),
);
const manifestFiles = snapshotFiles.filter((file) => file.endsWith("/manifest.json"));
const fingerprintFiles = [
  path.join(nextRoot, "BUILD_ID"),
  path.join(nextRoot, "app-build-manifest.json"),
  path.join(nextRoot, "server/app-paths-manifest.json"),
  routeTrace,
].filter((file) => fs.existsSync(file));
const fingerprint = crypto.createHash("sha256");
for (const file of fingerprintFiles) {
  fingerprint.update(path.relative(nextRoot, file));
  fingerprint.update("\0");
  fingerprint.update(fs.readFileSync(file));
  fingerprint.update("\0");
}

const report = {
  packet: 86,
  mode: "isolated-production-candidate-build",
  command: "npm run build -- --webpack",
  build: "PASS",
  buildId: fs.readFileSync(path.join(nextRoot, "BUILD_ID"), "utf8").trim(),
  artifactSha256: fingerprint.digest("hex"),
  baselineCommit: "f0cebde0147d26205f6af55db90269ab3a209453",
  snapshotManifestSha256:
    "8ef738de1739c2670566f3ac64e659bec320d4cdcbd257b2e6c371bbbfabfc5c",
  routeTrace: {
    path: ".next/server/app/parcel/san-diego/[slug]/page.js.nft.json",
    snapshotManifestCount: manifestFiles.length,
    snapshotShardCount: shardFiles.length,
    expectedSnapshotShardCount: 208,
    complete: manifestFiles.length === 1 && shardFiles.length === 208,
  },
  gates: {
    snapshot: "OFF",
    indexing: "OFF",
    sitemap: "OFF",
  },
  productionAccess: false,
  productionMutation: false,
};
if (!report.routeTrace.complete) {
  throw new Error(
    `Incomplete snapshot route trace: manifest=${manifestFiles.length} shards=${shardFiles.length}`,
  );
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`Packet 86 build report: ${outputPath}\n`);

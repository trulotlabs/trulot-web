#!/usr/bin/env node
// Runs a production build from an isolated temporary tree so an existing local
// dev server can keep its .next lock. No network or production source is used.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = process.cwd();
const reviewRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trulot-packet85-build-"));
for (const entry of fs.readdirSync(repositoryRoot)) {
  if ([".git", ".next"].includes(entry)) continue;
  if (["data", "node_modules"].includes(entry)) fs.symlinkSync(path.join(repositoryRoot, entry), path.join(reviewRoot, entry));
  else fs.cpSync(path.join(repositoryRoot, entry), path.join(reviewRoot, entry), { recursive: true });
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
process.exit(result.status ?? 1);

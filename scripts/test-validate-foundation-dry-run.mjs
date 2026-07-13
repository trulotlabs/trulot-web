import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  AUTHORIZED_FOUNDATION_MIGRATIONS,
  extractMigrationBasenames,
  validateFoundationDryRunOutput,
} from "./validate-foundation-dry-run.mjs";

function makeDryRunBody(filenames) {
  return [
    "DRY RUN: migrations will *not* be pushed to the database.",
    "Connecting to remote database...",
    "Would push these migrations:",
    ...filenames.map((name) => ` • ${name}`),
    "Finished supabase db push.",
  ].join("\n");
}

function captureLikeWorkflow({ stdout = "", stderr = "", exitCode = 0 }) {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "trulot-dry-run-"));
  const logPath = path.join(logDir, "dry-run.log");
  const payload = JSON.stringify({ stdout, stderr, exitCode });
  const nodeSnippet = [
    "const payload = JSON.parse(process.argv[1]);",
    "if (payload.stdout) process.stdout.write(payload.stdout);",
    "if (payload.stderr) process.stderr.write(payload.stderr);",
    "process.exit(payload.exitCode);",
  ].join(" ");
  const shellScript = `
    set -uo pipefail
    dry_run_log=${JSON.stringify(logPath)}
    set +e
    ${JSON.stringify(process.execPath)} -e ${JSON.stringify(nodeSnippet)} ${JSON.stringify(payload)} 2>&1 | tee "$dry_run_log"
    dry_run_status="\${PIPESTATUS[0]}"
    set -e
    printf '__STATUS__%s\\n' "$dry_run_status"
  `;
  const result = spawnSync("bash", ["-lc", shellScript], { encoding: "utf8" });
  const statusMatch = result.stdout.match(/__STATUS__(\d+)/);

  assert.equal(result.status, 0, `capture shell should succeed: ${result.stderr}`);
  assert.ok(statusMatch, "capture shell should emit pipeline status");

  return {
    logText: fs.readFileSync(logPath, "utf8"),
    dryRunStatus: Number(statusMatch[1]),
  };
}

{
  const stderrOnly = captureLikeWorkflow({
    stderr: `${makeDryRunBody(AUTHORIZED_FOUNDATION_MIGRATIONS)}\n`,
    exitCode: 0,
  });
  assert.equal(stderrOnly.dryRunStatus, 0);
  assert.deepEqual(
    validateFoundationDryRunOutput(stderrOnly.logText).actualMigrations,
    AUTHORIZED_FOUNDATION_MIGRATIONS,
  );
}

{
  const stdoutOnly = captureLikeWorkflow({
    stdout: `${makeDryRunBody(AUTHORIZED_FOUNDATION_MIGRATIONS)}\n`,
    exitCode: 0,
  });
  assert.equal(stdoutOnly.dryRunStatus, 0);
  assert.deepEqual(
    validateFoundationDryRunOutput(stdoutOnly.logText).actualMigrations,
    AUTHORIZED_FOUNDATION_MIGRATIONS,
  );
}

{
  const combined = captureLikeWorkflow({
    stdout: "DRY RUN: migrations will *not* be pushed to the database.\n",
    stderr: [
      "Connecting to remote database...",
      "Would push these migrations:",
      ` • ${AUTHORIZED_FOUNDATION_MIGRATIONS[0]}`,
      ` • ${AUTHORIZED_FOUNDATION_MIGRATIONS[1]}`,
      "Finished supabase db push.",
      "",
    ].join("\n"),
    exitCode: 0,
  });
  assert.equal(combined.dryRunStatus, 0);
  assert.deepEqual(
    validateFoundationDryRunOutput(combined.logText).actualMigrations,
    AUTHORIZED_FOUNDATION_MIGRATIONS,
  );
}

{
  assert.throws(
    () => validateFoundationDryRunOutput(makeDryRunBody([AUTHORIZED_FOUNDATION_MIGRATIONS[0]])),
    /Unexpected dry-run migration set/,
  );
}

{
  assert.throws(
    () => validateFoundationDryRunOutput(makeDryRunBody([
      ...AUTHORIZED_FOUNDATION_MIGRATIONS,
      "20260713000000_unexpected_extra.sql",
    ])),
    /Unexpected dry-run migration set/,
  );
}

{
  assert.throws(
    () => validateFoundationDryRunOutput(makeDryRunBody([
      ...AUTHORIZED_FOUNDATION_MIGRATIONS,
      "20260707_permit_linkage_report_v2.sql",
    ])),
    /Unexpected dry-run migration set/,
  );
}

{
  const failedDryRun = captureLikeWorkflow({
    stderr: `${makeDryRunBody(AUTHORIZED_FOUNDATION_MIGRATIONS)}\n`,
    exitCode: 17,
  });
  assert.equal(failedDryRun.dryRunStatus, 17);
}

{
  const ansiDecorated = [
    "Would push these migrations:",
    ` \u001b[32m• ${AUTHORIZED_FOUNDATION_MIGRATIONS[0]}\u001b[0m`,
    ` \u001b[32m• ${AUTHORIZED_FOUNDATION_MIGRATIONS[1]}\u001b[0m`,
  ].join("\n");
  assert.deepEqual(
    extractMigrationBasenames(ansiDecorated),
    AUTHORIZED_FOUNDATION_MIGRATIONS,
  );
  assert.deepEqual(
    validateFoundationDryRunOutput(ansiDecorated).actualMigrations,
    AUTHORIZED_FOUNDATION_MIGRATIONS,
  );
}

console.log("foundation dry-run validator tests passed");

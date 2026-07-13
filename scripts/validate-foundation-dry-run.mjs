import fs from "node:fs";

export const AUTHORIZED_FOUNDATION_MIGRATIONS = [
  "20260712032203_foundation_access_least_privilege.sql",
  "20260712032216_check_parcel_overlays_hardening.sql",
];

const FORBIDDEN_MIGRATIONS = [
  "20260707_permit_linkage_report_v2.sql",
];

const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const MIGRATION_FILENAME_PATTERN = /\b[0-9]+_[A-Za-z0-9][A-Za-z0-9._-]*\.sql\b/g;

export function stripAnsi(text) {
  return String(text ?? "").replace(ANSI_PATTERN, "");
}

export function extractMigrationBasenames(output) {
  const cleaned = stripAnsi(output);
  const matches = cleaned.match(MIGRATION_FILENAME_PATTERN) ?? [];
  const seen = new Set();
  const ordered = [];

  for (const match of matches) {
    if (!seen.has(match)) {
      seen.add(match);
      ordered.push(match);
    }
  }

  return ordered;
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function parseListFlag(flagName) {
  const flagIndex = process.argv.indexOf(flagName);
  if (flagIndex === -1) {
    return null;
  }

  const rawValue = process.argv[flagIndex + 1];
  if (!rawValue) {
    throw new Error(`Expected a comma-separated value after ${flagName}.`);
  }

  return rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function validateFoundationDryRunOutput(output, expectedMigrations = AUTHORIZED_FOUNDATION_MIGRATIONS) {
  const cleaned = stripAnsi(output);
  const actualMigrations = extractMigrationBasenames(cleaned);
  const forbiddenMigrations = FORBIDDEN_MIGRATIONS.filter((name) => cleaned.includes(name));
  const ok = arraysEqual(actualMigrations, expectedMigrations) && forbiddenMigrations.length === 0;

  if (!ok) {
    const details = {
      expectedMigrations,
      actualMigrations,
      forbiddenMigrations,
    };
    throw new Error(`Unexpected dry-run migration set.\n${JSON.stringify(details, null, 2)}`);
  }

  return {
    ok: true,
    expectedMigrations,
    actualMigrations,
    forbiddenMigrations,
  };
}

function main() {
  const fileFlagIndex = process.argv.indexOf("--file");
  if (fileFlagIndex === -1 || !process.argv[fileFlagIndex + 1]) {
    throw new Error("Usage: node scripts/validate-foundation-dry-run.mjs --file <path> [--expect a.sql,b.sql] [--forbid c.sql,d.sql]");
  }

  const filePath = process.argv[fileFlagIndex + 1];
  const output = fs.readFileSync(filePath, "utf8");
  const expectedMigrations = parseListFlag("--expect") ?? AUTHORIZED_FOUNDATION_MIGRATIONS;
  const forbiddenMigrations = parseListFlag("--forbid") ?? FORBIDDEN_MIGRATIONS;
  const result = validateFoundationDryRunOutput(output, expectedMigrations);
  const encounteredForbidden = forbiddenMigrations.filter((name) => stripAnsi(output).includes(name));
  if (encounteredForbidden.length > 0) {
    throw new Error(`Forbidden migrations appeared in dry-run output.\n${JSON.stringify(encounteredForbidden, null, 2)}`);
  }
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

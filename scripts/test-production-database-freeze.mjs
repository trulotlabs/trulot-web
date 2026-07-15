import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GUARD = path.join(ROOT, "scripts", "guard-production-database-freeze.mjs");
const CONFIG = path.join(ROOT, ".github", "production-database-freeze.json");

function run(args, cwd = ROOT) {
  return spawnSync(process.execPath, [GUARD, ...args], { cwd, encoding: "utf8" });
}

function denied(result, pattern) {
  assert.notEqual(result.status, 0, `expected denial, got stdout: ${result.stdout}`);
  assert.match(result.stderr, /PRODUCTION DATABASE FREEZE: DENIED/);
  assert.match(result.stderr, pattern);
}

let fixtureNumber = 0;
function auditWorkflow(tempRoot, source) {
  fixtureNumber += 1;
  const fixtureRoot = path.join(tempRoot, `repository-audit-${fixtureNumber}`);
  fs.mkdirSync(path.join(fixtureRoot, ".github", "workflows"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "package.json"), JSON.stringify({ scripts: {} }), "utf8");
  fs.writeFileSync(path.join(fixtureRoot, ".github", "workflows", "candidate.yml"), source, "utf8");
  return run([
    "--root", fixtureRoot,
    "--config", CONFIG,
    "--workflow-ref", "trulotlabs/trulot-web/.github/workflows/audit.yml@refs/pull/1/merge",
    "--environment", "validation",
    "--operation", "validation",
    "--audit-repository",
  ]);
}

const base = [
  "--root", ROOT,
  "--workflow-ref", "trulotlabs/trulot-web/.github/workflows/validation.yml@refs/heads/test",
  "--environment", "validation",
  "--operation", "validation",
];

denied(run(["--root", ROOT, "--config", "missing-freeze.json", "--workflow-ref", "x", "--environment", "validation", "--operation", "validation"]), /required and unreadable/);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "trulot-freeze-test-"));
try {
  const malformed = path.join(temp, "malformed.json");
  fs.writeFileSync(malformed, "{not-json", "utf8");
  denied(run(["--root", ROOT, "--config", malformed, "--workflow-ref", "x", "--environment", "validation", "--operation", "validation"]), /malformed JSON/);

  denied(run(["--root", ROOT]), /mandatory/);

  for (const version of ["20260713022000", "20260713025206"]) {
    const migrationDir = path.join(temp, version);
    fs.mkdirSync(migrationDir);
    fs.writeFileSync(path.join(migrationDir, `${version}_known_failure.sql`), "-- evidence fixture\n", "utf8");
    denied(run([...base, "--migration-dir", migrationDir]), new RegExp(`Prohibited migration.*${version}`));
  }

  for (const workflow of [
    ".github/workflows/trulot-overlay-integrity-triage.yml",
    ".github/workflows/trulot-overlay-repair-production.yml",
  ]) {
    denied(run([
      "--root", ROOT,
      "--workflow-ref", `trulotlabs/trulot-web/${workflow}@refs/heads/main`,
      "--environment", "validation",
      "--operation", "validation",
    ]), /Workflow is prohibited/);
  }

  denied(run([
    "--root", ROOT,
    "--workflow-ref", "trulotlabs/trulot-web/.github/workflows/future-production.yml@refs/heads/renamed",
    "--environment", "production",
    "--operation", "database-push",
  ]), /Production database operation is blocked/);

  const cleanMigrations = path.join(temp, "clean");
  fs.mkdirSync(cleanMigrations);
  fs.writeFileSync(path.join(cleanMigrations, "20260712032216_validation.sql"), "-- safe validation fixture\n", "utf8");
  const allowed = run([...base, "--migration-dir", cleanMigrations, "--audit-repository"]);
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.match(allowed.stdout, /allowed-non-production-validation/);

  denied(auditWorkflow(temp, `
on: { workflow_dispatch: {} }
jobs:
  renamed-job:
    environment: production
    steps:
      - run: node scripts/guard-production-database-freeze.mjs --workflow-ref x --environment validation --operation validation
`), /literal production environment/);

  denied(auditWorkflow(temp, `
on: { workflow_dispatch: {} }
jobs:
  hidden-production-path:
    steps:
      - env:
          PRODUCTION_DB_URL: \${{ secrets.DB_URL }}
        run: psql "$PRODUCTION_DB_URL" -f migration.sql
`), /does not invoke the authoritative freeze guard/);

  denied(auditWorkflow(temp, `
on: { workflow_dispatch: {} }
jobs:
  alternate-command:
    steps:
      - run: npx supabase --workdir scratch db push
`), /does not invoke the authoritative freeze guard/);

  denied(auditWorkflow(temp, `
on: { workflow_dispatch: {} }
jobs:
  future-production:
    environment: production
    steps:
      - run: node scripts/guard-production-database-freeze.mjs --workflow-ref x --environment production --operation database-push
      - run: psql "$DATABASE_URL" -f migration.sql
`), /database-command-free/);

  denied(auditWorkflow(temp, `
on:
  workflow_dispatch:
    inputs:
      target:
        required: true
jobs:
  input-selected-environment:
    environment: \${{ inputs.target }}
    steps:
      - run: node scripts/guard-production-database-freeze.mjs --workflow-ref x --environment production --operation database-push
`), /must not accept workflow_dispatch inputs/);

  denied(auditWorkflow(temp, `
on: { workflow_dispatch: {} }
jobs:
  delegated-production:
    environment: production
    steps:
      - run: node scripts/guard-production-database-freeze.mjs --workflow-ref x --environment production --operation database-push
      - uses: ./.github/actions/apply-database
`), /must not delegate to local composite actions/);

  denied(auditWorkflow(temp, `
on: { workflow_dispatch: {} }
jobs:
  conditional-production:
    environment: production
    steps:
      - if: \${{ false }}
        run: node scripts/guard-production-database-freeze.mjs --workflow-ref x --environment production --operation database-push
`), /must not conditionally skip steps/);

  const renamedStub = auditWorkflow(temp, `
on: { workflow_dispatch: {} }
jobs:
  any-renamed-job:
    environment: production
    steps:
      - run: node scripts/guard-production-database-freeze.mjs --workflow-ref x --environment production --operation database-push
`);
  assert.equal(renamedStub.status, 0, renamedStub.stderr);

  const ciWorkflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "trulot-production-freeze-guard.yml"), "utf8");
  assert.match(ciWorkflow, /pull_request:/);
  assert.match(ciWorkflow, /push:/);

  console.log(JSON.stringify({
    result: "production database freeze guard tests passed",
    cases: 18,
    prohibitedMigrations: ["20260713022000", "20260713025206"],
    prohibitedWorkflows: 2,
    repositoryAudit: "passed",
    hardeningFixtures: "passed",
    nonProductionValidation: "allowed",
  }));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

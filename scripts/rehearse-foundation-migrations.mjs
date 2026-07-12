import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const reportPath = path.join(repoRoot, "data/security/migration-rehearsal-report-2026-07-11.json");

const baselineSeedSql = "supabase/rehearsal/20260711_seed_minimal_data.sql";
const baselineSubsetSql = "supabase/rehearsal/20260711_remote_public_baseline_subset.sql";
const rollbackSql = "supabase/rehearsal/20260711_rollback_access_and_overlay.sql";
const baselineVersions = ["20260522", "20260705", "20260706"];
const accessMigration = {
  version: "20260712032203",
  file: "supabase/migrations/20260712032203_foundation_access_least_privilege.sql",
};
const overlayMigration = {
  version: "20260712032216",
  file: "supabase/migrations/20260712032216_check_parcel_overlays_hardening.sql",
};
const rehearsalDbName = "trulot_gate_chain";
const clusterDbUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const rehearsalDbUrl = process.env.TRULOT_GATE_DB_URL ?? `postgresql://postgres:postgres@127.0.0.1:54322/${rehearsalDbName}`;

function runCommand(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PGPASSWORD: "postgres",
    },
    ...options,
  });
}

function psql(url, args) {
  return runCommand("psql", [url, ...args]);
}

function runSqlFile(url, file) {
  return psql(url, ["-v", "ON_ERROR_STOP=1", "-f", path.join(repoRoot, file)]);
}

function runQuery(url, sql) {
  return psql(url, ["-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", sql]).trim();
}

function tryQuery(url, sql) {
  try {
    return {
      ok: true,
      output: runQuery(url, sql),
    };
  } catch (error) {
    return {
      ok: false,
      output: String(error.stdout || error.stderr || error.message).trim(),
    };
  }
}

function supabase(args, options = {}) {
  return runCommand("npx", ["supabase", ...args], options);
}

function supabaseWithOutput(args) {
  const result = spawnSync("npx", ["supabase", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PGPASSWORD: "postgres",
    },
  });

  const combinedOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0) {
    throw new Error(combinedOutput || `supabase ${args.join(" ")} failed`);
  }

  return combinedOutput;
}

function resetDatabase() {
  psql(clusterDbUrl, ["-c", `drop database if exists ${rehearsalDbName};`]);
  psql(clusterDbUrl, ["-c", `create database ${rehearsalDbName};`]);
}

function ensureRoles() {
  const sql = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'brain_readonly') then create role brain_readonly nologin; end if;
end
$$;`;
  runQuery(clusterDbUrl, sql);
}

function roleTest(label, sql, expectOk) {
  const result = tryQuery(rehearsalDbUrl, sql);
  return {
    label,
    ok: result.ok === expectOk,
    expected: expectOk ? "success" : "failure",
    actual: result.ok ? "success" : "failure",
    output: result.output,
  };
}

function prepareWorkdir() {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "trulot-foundation-chain-"));
  const migrationsDir = path.join(workdir, "supabase", "migrations");
  fs.mkdirSync(migrationsDir, { recursive: true });

  for (const file of [
    "supabase/migrations/20260522_overlay_lookup.sql",
    "supabase/migrations/20260705_permit_linkage_v1.sql",
    "supabase/migrations/20260706_permit_linkage_perf_v1.sql",
    accessMigration.file,
    overlayMigration.file,
  ]) {
    fs.copyFileSync(path.join(repoRoot, file), path.join(workdir, file));
  }

  return workdir;
}

ensureRoles();
resetDatabase();
runSqlFile(rehearsalDbUrl, baselineSubsetSql);
runSqlFile(rehearsalDbUrl, baselineSeedSql);

const baseline = [
  roleTest(
    "baseline anon can read overlay base table",
    "set role anon; select count(*) from public.tpa_official; reset role;",
    true,
  ),
  roleTest(
    "baseline anon can read permit linkage report view",
    "set role anon; select total_permits from public.trulot_permit_linkage_report_v1; reset role;",
    true,
  ),
  roleTest(
    "baseline anon can execute update_nearby_activity_v2",
    "set role anon; select public.update_nearby_activity_v2(); reset role;",
    true,
  ),
];

const workdir = prepareWorkdir();
const dryRunOutput = supabaseWithOutput([
  "db",
  "push",
  "--db-url",
  rehearsalDbUrl,
  "--workdir",
  workdir,
  "--dry-run",
]);

supabase([
  "migration",
  "repair",
  ...baselineVersions,
  "--status",
  "applied",
  "--db-url",
  rehearsalDbUrl,
  "--workdir",
  workdir,
]);

const postRepairHistory = runQuery(
  rehearsalDbUrl,
  "select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations;",
);

supabase([
  "db",
  "push",
  "--db-url",
  rehearsalDbUrl,
  "--workdir",
  workdir,
  "--yes",
]);

const appliedHistory = runQuery(
  rehearsalDbUrl,
  "select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations;",
);

const afterMigration = [
  roleTest(
    "anon parcel read retained",
    "set role anon; select apn_norm from public.parcel_page_api_v2 order by apn_norm limit 1; reset role;",
    true,
  ),
  roleTest(
    "anon raw overlay table read removed",
    "set role anon; select count(*) from public.tpa_official; reset role;",
    false,
  ),
  roleTest(
    "anon writes still denied",
    "set role anon; insert into public.parcel_page_api_v2 (apn_norm) values ('x'); reset role;",
    false,
  ),
  roleTest(
    "anon report view removed",
    "set role anon; select total_permits from public.trulot_permit_linkage_report_v1; reset role;",
    false,
  ),
  roleTest(
    "anon overlay rpc retained",
    "set role anon; select public.check_parcel_overlays(32.75, -117.19)::text; reset role;",
    true,
  ),
  roleTest(
    "anon admin helper execute removed",
    "set role anon; select public.update_nearby_activity_v2(); reset role;",
    false,
  ),
  roleTest(
    "authenticated parcel read retained",
    "set role authenticated; select apn_norm from public.parcel_page_api_v2 order by apn_norm limit 1; reset role;",
    true,
  ),
  roleTest(
    "authenticated raw overlay table read removed",
    "set role authenticated; select count(*) from public.sda_official; reset role;",
    false,
  ),
  roleTest(
    "service role report view retained",
    "set role service_role; select total_permits from public.trulot_permit_linkage_report_v1; reset role;",
    true,
  ),
  roleTest(
    "service role admin helper retained",
    "set role service_role; select public.update_nearby_activity_v2(); reset role;",
    true,
  ),
  roleTest(
    "overlay contract unchanged",
    "select public.check_parcel_overlays(32.75, -117.19)::text;",
    true,
  ),
  roleTest(
    "overlay null inputs fail safely",
    "select public.check_parcel_overlays(null, null)::text;",
    true,
  ),
  roleTest(
    "overlay function has fixed search_path after migration",
    "select array_to_string(coalesce((select proconfig from pg_proc where proname = 'check_parcel_overlays' limit 1), array[]::text[]), ',');",
    true,
  ),
];

runSqlFile(rehearsalDbUrl, rollbackSql);

const afterRollback = [
  roleTest(
    "rollback restores anon overlay table read",
    "set role anon; select count(*) from public.tpa_official; reset role;",
    true,
  ),
  roleTest(
    "rollback restores anon report view read",
    "set role anon; select total_permits from public.trulot_permit_linkage_report_v1; reset role;",
    true,
  ),
  roleTest(
    "rollback restores anon admin helper execute",
    "set role anon; select public.update_nearby_activity_v2(); reset role;",
    true,
  ),
];

const postRollbackHistory = runQuery(
  rehearsalDbUrl,
  "select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations;",
);

const report = {
  generated_at: new Date().toISOString(),
  rehearsal_db_url: rehearsalDbUrl,
  rehearsal_workdir: workdir,
  baseline_migration_versions: baselineVersions,
  authorized_migrations: [accessMigration, overlayMigration],
  dry_run_output: dryRunOutput.trim(),
  post_repair_history: postRepairHistory,
  applied_history: appliedHistory,
  post_rollback_history: postRollbackHistory,
  baseline,
  after_migration: afterMigration,
  after_rollback: afterRollback,
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

const failed = [...baseline, ...afterMigration, ...afterRollback].filter((item) => !item.ok);
if (!dryRunOutput.includes(accessMigration.version) || !dryRunOutput.includes(overlayMigration.version)) {
  console.error(JSON.stringify(report, null, 2));
  throw new Error("Dry run did not include both authorized migration versions.");
}
if (dryRunOutput.includes("20260707_permit_linkage_report_v2")) {
  console.error(JSON.stringify(report, null, 2));
  throw new Error("Dry run included unauthorized migration 20260707_permit_linkage_report_v2.");
}
if (postRepairHistory !== baselineVersions.join(",")) {
  console.error(JSON.stringify(report, null, 2));
  throw new Error(`Baseline repair history mismatch: ${postRepairHistory}`);
}
if (appliedHistory !== [...baselineVersions, accessMigration.version, overlayMigration.version].join(",")) {
  console.error(JSON.stringify(report, null, 2));
  throw new Error(`Applied migration history mismatch: ${appliedHistory}`);
}
if (postRollbackHistory !== appliedHistory) {
  console.error(JSON.stringify(report, null, 2));
  throw new Error("Rollback should restore object behavior without mutating migration history.");
}
if (failed.length > 0) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));

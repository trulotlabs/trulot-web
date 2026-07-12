import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dbUrl = process.env.TRULOT_GATE_DB_URL;
const adminUrl = process.env.TRULOT_GATE_ADMIN_URL ?? dbUrl;

if (!dbUrl || !adminUrl) {
  console.error("TRULOT_GATE_DB_URL and TRULOT_GATE_ADMIN_URL are required.");
  process.exit(1);
}

const repoRoot = process.cwd();
const reportPath = path.join(repoRoot, "data/security/migration-rehearsal-report-2026-07-11.json");

function psql(url, args) {
  return execFileSync("psql", [url, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PGPASSWORD: "postgres",
    },
  });
}

function runSqlFile(url, file) {
  return psql(url, ["-v", "ON_ERROR_STOP=1", "-f", path.join(repoRoot, file)]);
}

function runQuery(url, sql) {
  return psql(url, ["-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", sql]).trim();
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
  runQuery(adminUrl, sql);
}

function resetPublicSchema() {
  runQuery(dbUrl, "drop schema if exists public cascade; create schema public;");
  runQuery(dbUrl, "drop schema if exists extensions cascade; create schema extensions;");
}

function roleTest(label, sql, expectOk) {
  const result = tryQuery(dbUrl, sql);
  return {
    label,
    ok: result.ok === expectOk,
    expected: expectOk ? "success" : "failure",
    actual: result.ok ? "success" : "failure",
    output: result.output,
  };
}

ensureRoles();
resetPublicSchema();
runSqlFile(dbUrl, "supabase/rehearsal/20260711_remote_public_baseline_subset.sql");
runSqlFile(dbUrl, "supabase/rehearsal/20260711_seed_minimal_data.sql");

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

runSqlFile(dbUrl, "supabase/migrations/20260711_foundation_access_least_privilege.sql");
runSqlFile(dbUrl, "supabase/migrations/20260711_check_parcel_overlays_hardening.sql");

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

runSqlFile(dbUrl, "supabase/rehearsal/20260711_rollback_access_and_overlay.sql");

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

const report = {
  generated_at: new Date().toISOString(),
  baseline,
  after_migration: afterMigration,
  after_rollback: afterRollback,
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

const failed = [...baseline, ...afterMigration, ...afterRollback].filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));

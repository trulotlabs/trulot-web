import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);

const DEFAULT_BASE_URL = "https://trulot-web.vercel.app";

export function resolveSupabaseBin() {
  if (process.env.TRULOT_SUPABASE_BIN) {
    return process.env.TRULOT_SUPABASE_BIN;
  }

  const bundledCli = path.join(process.cwd(), "node_modules", ".bin", "supabase");
  if (fs.existsSync(bundledCli)) {
    return bundledCli;
  }

  throw new Error("TRULOT_SUPABASE_BIN is required when the repository-pinned Supabase CLI is not available at node_modules/.bin/supabase.");
}

export function defaultRunCommand(cmd, args) {
  return execFileSync(cmd, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
}

export function extractRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object" && Array.isArray(payload.rows)) {
    return payload.rows;
  }

  throw new Error("Supabase db query returned valid JSON with an unsupported shape.");
}

export function describeNonJsonOutput(output, verificationMode) {
  const firstNonWhitespaceChar = output.trimStart().slice(0, 1) || "(empty)";
  return `Supabase CLI returned non-JSON output in ${verificationMode} verification mode. First non-whitespace character: ${JSON.stringify(firstNonWhitespaceChar)}. Output length: ${output.length}.`;
}

export function createSupabaseQueryRunner({
  runCommand,
  supabaseBin,
  verifyMode,
  supabaseWorkdir,
  dbUrl,
}) {
  function baseArgs() {
    const args = [];

    if (verifyMode === "linked") {
      if (!supabaseWorkdir) {
        throw new Error("TRULOT_SUPABASE_WORKDIR is required when TRULOT_PRODUCTION_VERIFY_MODE=linked.");
      }
      args.push("--workdir", supabaseWorkdir);
    } else if (verifyMode === "db-url") {
      if (!dbUrl) {
        throw new Error("TRULOT_PRODUCTION_DB_URL is required when TRULOT_PRODUCTION_VERIFY_MODE=db-url.");
      }
    } else {
      throw new Error(`Unsupported TRULOT_PRODUCTION_VERIFY_MODE: ${verifyMode}`);
    }

    args.push("--agent", "no", "-o", "json", "db", "query");

    if (verifyMode === "linked") {
      args.push("--linked");
    } else {
      args.push("--db-url", dbUrl);
    }

    return args;
  }

  function parsePayload(output) {
    try {
      return JSON.parse(output);
    } catch {
      throw new Error(describeNonJsonOutput(output, verifyMode));
    }
  }

  function query(sql) {
    const output = runCommand(supabaseBin, [...baseArgs(), sql]);
    return parsePayload(output);
  }

  function queryRow(sql, key) {
    const row = extractRows(query(sql))[0];
    if (!row) {
      throw new Error(`Expected at least one row from Supabase db query for key ${key}.`);
    }
    return row[key];
  }

  function queryJson(sql, key = "json_build_object") {
    const value = queryRow(sql, key);
    return typeof value === "string" ? JSON.parse(value) : value;
  }

  return {
    query,
    queryRow,
    queryJson,
  };
}

function psql(sql, { dbUrl, runCommand, expectFailure = false } = {}) {
  if (!dbUrl) {
    throw new Error("TRULOT_PRODUCTION_DB_URL is required for role-execution verification.");
  }

  try {
    return {
      ok: true,
      output: runCommand("psql", [dbUrl, "-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", sql]).trim(),
    };
  } catch (error) {
    const output = String(error.stdout || error.stderr || error.message).trim();
    if (expectFailure) {
      return { ok: false, output };
    }
    throw new Error(output);
  }
}

function psqlCommand(args, { dbUrl, runCommand }) {
  if (!dbUrl) {
    throw new Error("TRULOT_PRODUCTION_DB_URL is required for psql verification.");
  }

  return runCommand("psql", [dbUrl, ...args]);
}

function roleQuery(role, sql, context) {
  return psql(`begin; set local role ${role}; ${sql}; rollback;`, context);
}

function roleExpectFailure(role, sql, label, context) {
  const result = psql(`begin; set local role ${role}; ${sql}; rollback;`, { ...context, expectFailure: true });
  assert(result.ok === false, `${label} should fail for role ${role}.`);
  return result.output;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeApnDigits(raw) {
  return String(raw ?? "").replace(/[^0-9]/g, "").padStart(10, "0");
}

function formatApnForDisplay(apn) {
  const digits = normalizeApnDigits(apn);
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
  }
  if (digits.length === 8) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}`;
  }
  return digits;
}

function slugifyAddress(address) {
  return String(address ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function canonicalParcelSlug(apn, address) {
  const formattedApn = formatApnForDisplay(apn);
  const addressSlug = slugifyAddress(address);
  return addressSlug ? `${formattedApn}-${addressSlug}` : `apn-${normalizeApnDigits(apn)}`;
}

function normalizeFunctionDefinition(definition) {
  return String(definition ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function createCheck(label, expected, actual, ok) {
  return { label, expected, actual, ok };
}

function collectPreMigrationStateChecks({ queryRow, queryJson, supabaseWorkdir }) {
  const checks = [];
  const functionMetadata = queryJson(`
    select json_build_object(
      'exists',
      exists(
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'check_parcel_overlays'
          and p.oid = 'public.check_parcel_overlays(double precision, double precision)'::regprocedure
      ),
      'security_definer',
      coalesce((
        select p.prosecdef
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'check_parcel_overlays'
          and p.oid = 'public.check_parcel_overlays(double precision, double precision)'::regprocedure
      ), false),
      'search_path',
      coalesce((
        select array_to_string(p.proconfig, ',')
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'check_parcel_overlays'
          and p.oid = 'public.check_parcel_overlays(double precision, double precision)'::regprocedure
      ), ''),
      'definition',
      coalesce((
        select pg_get_functiondef(p.oid)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'check_parcel_overlays'
          and p.oid = 'public.check_parcel_overlays(double precision, double precision)'::regprocedure
      ), '')
    )::text;
  `);
  const normalizedDefinition = normalizeFunctionDefinition(functionMetadata.definition);

  checks.push(createCheck(
    "check_parcel_overlays exists",
    true,
    functionMetadata.exists,
    functionMetadata.exists === true,
  ));
  checks.push(createCheck(
    "check_parcel_overlays is security definer",
    true,
    functionMetadata.security_definer,
    functionMetadata.security_definer === true,
  ));
  checks.push(createCheck(
    "check_parcel_overlays is not yet hardened with fixed search_path",
    "search_path does not include public, pg_temp",
    functionMetadata.search_path || "(empty)",
    !String(functionMetadata.search_path || "").includes("search_path=public, pg_temp"),
  ));
  checks.push(createCheck(
    "check_parcel_overlays definition still references overlay tables",
    "definition references tpa_official and sda_official",
    normalizedDefinition,
    normalizedDefinition.includes("tpa_official") && normalizedDefinition.includes("sda_official"),
  ));
  checks.push(createCheck(
    "check_parcel_overlays definition still constructs the spatial point",
    "definition references st_setsrid(st_makepoint(p_lng, p_lat), 4326)",
    normalizedDefinition,
    normalizedDefinition.includes("st_setsrid(st_makepoint(p_lng, p_lat), 4326)"),
  ));

  const functionPrivileges = {
    anon_overlay_execute: queryRow("select has_function_privilege('anon', 'public.check_parcel_overlays(double precision, double precision)', 'EXECUTE') as allowed;", "allowed"),
    authenticated_overlay_execute: queryRow("select has_function_privilege('authenticated', 'public.check_parcel_overlays(double precision, double precision)', 'EXECUTE') as allowed;", "allowed"),
    service_overlay_execute: queryRow("select has_function_privilege('service_role', 'public.check_parcel_overlays(double precision, double precision)', 'EXECUTE') as allowed;", "allowed"),
    anon_opportunity_execute: queryRow("select has_function_privilege('anon', 'public.get_opportunity_feed(integer, integer, integer)', 'EXECUTE') as allowed;", "allowed"),
    authenticated_opportunity_execute: queryRow("select has_function_privilege('authenticated', 'public.get_opportunity_feed(integer, integer, integer)', 'EXECUTE') as allowed;", "allowed"),
    service_opportunity_execute: queryRow("select has_function_privilege('service_role', 'public.get_opportunity_feed(integer, integer, integer)', 'EXECUTE') as allowed;", "allowed"),
    anon_update_nearby_execute: queryRow("select has_function_privilege('anon', 'public.update_nearby_activity_v2()', 'EXECUTE') as allowed;", "allowed"),
    authenticated_update_nearby_execute: queryRow("select has_function_privilege('authenticated', 'public.update_nearby_activity_v2()', 'EXECUTE') as allowed;", "allowed"),
    service_update_nearby_execute: queryRow("select has_function_privilege('service_role', 'public.update_nearby_activity_v2()', 'EXECUTE') as allowed;", "allowed"),
  };

  const tablePrivileges = {
    anon_overlay_table_select: queryRow("select has_table_privilege('anon', 'public.tpa_official', 'SELECT') as allowed;", "allowed"),
    authenticated_overlay_table_select: queryRow("select has_table_privilege('authenticated', 'public.tpa_official', 'SELECT') as allowed;", "allowed"),
    anon_report_select: queryRow("select has_table_privilege('anon', 'public.trulot_permit_linkage_report_v1', 'SELECT') as allowed;", "allowed"),
    authenticated_report_select: queryRow("select has_table_privilege('authenticated', 'public.trulot_permit_linkage_report_v1', 'SELECT') as allowed;", "allowed"),
    service_report_select: queryRow("select has_table_privilege('service_role', 'public.trulot_permit_linkage_report_v1', 'SELECT') as allowed;", "allowed"),
  };

  checks.push(createCheck("anon retains pre-migration check_parcel_overlays execute", true, functionPrivileges.anon_overlay_execute, functionPrivileges.anon_overlay_execute === true));
  checks.push(createCheck("authenticated retains pre-migration check_parcel_overlays execute", true, functionPrivileges.authenticated_overlay_execute, functionPrivileges.authenticated_overlay_execute === true));
  checks.push(createCheck("service_role retains pre-migration check_parcel_overlays execute", true, functionPrivileges.service_overlay_execute, functionPrivileges.service_overlay_execute === true));
  checks.push(createCheck("anon still has pre-migration raw overlay table access", true, tablePrivileges.anon_overlay_table_select, tablePrivileges.anon_overlay_table_select === true));
  checks.push(createCheck("authenticated still has pre-migration raw overlay table access", true, tablePrivileges.authenticated_overlay_table_select, tablePrivileges.authenticated_overlay_table_select === true));
  checks.push(createCheck("anon still has pre-migration report access", true, tablePrivileges.anon_report_select, tablePrivileges.anon_report_select === true));
  checks.push(createCheck("authenticated still has pre-migration report access", true, tablePrivileges.authenticated_report_select, tablePrivileges.authenticated_report_select === true));
  checks.push(createCheck("service_role retains pre-migration report access", true, tablePrivileges.service_report_select, tablePrivileges.service_report_select === true));
  checks.push(createCheck("anon still has pre-migration update_nearby_activity_v2 execute", true, functionPrivileges.anon_update_nearby_execute, functionPrivileges.anon_update_nearby_execute === true));
  checks.push(createCheck("authenticated still has pre-migration update_nearby_activity_v2 execute", true, functionPrivileges.authenticated_update_nearby_execute, functionPrivileges.authenticated_update_nearby_execute === true));
  checks.push(createCheck("service_role retains pre-migration update_nearby_activity_v2 execute", true, functionPrivileges.service_update_nearby_execute, functionPrivileges.service_update_nearby_execute === true));
  checks.push(createCheck("anon still has pre-migration get_opportunity_feed execute", true, functionPrivileges.anon_opportunity_execute, functionPrivileges.anon_opportunity_execute === true));
  checks.push(createCheck("authenticated still has pre-migration get_opportunity_feed execute", true, functionPrivileges.authenticated_opportunity_execute, functionPrivileges.authenticated_opportunity_execute === true));
  checks.push(createCheck("service_role retains pre-migration get_opportunity_feed execute", true, functionPrivileges.service_opportunity_execute, functionPrivileges.service_opportunity_execute === true));

  const migrationState = queryJson(`
    select json_build_object(
      'authorized_versions_recorded',
      coalesce(
        (
          select json_agg(version order by version)
          from supabase_migrations.schema_migrations
          where version in ('20260712032203', '20260712032216')
        ),
        '[]'::json
      )
    )::text;
  `);
  const recordedVersions = migrationState.authorized_versions_recorded ?? [];
  checks.push(createCheck(
    "authorized 20260712 migrations are not yet remotely recorded",
    "[]",
    JSON.stringify(recordedVersions),
    Array.isArray(recordedVersions) && recordedVersions.length === 0,
  ));

  if (supabaseWorkdir) {
    const migrationDir = path.join(supabaseWorkdir, "supabase", "migrations");
    const localMigrationFiles = fs.readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort();
    checks.push(createCheck(
      "isolated deployment chain excludes 20260707",
      false,
      localMigrationFiles.some((name) => name.includes("20260707_permit_linkage_report_v2")),
      !localMigrationFiles.some((name) => name.includes("20260707_permit_linkage_report_v2")),
    ));
  }

  return {
    checks,
    functionMetadata: {
      exists: functionMetadata.exists,
      security_definer: functionMetadata.security_definer,
      search_path: functionMetadata.search_path || "",
    },
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  return { response, json: await response.json() };
}

async function fetchText(url) {
  const response = await fetch(url);
  return { response, text: await response.text() };
}

async function main() {
  const baseUrl = (process.env.TRULOT_PRODUCTION_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const verifyMode = process.env.TRULOT_PRODUCTION_VERIFY_MODE ?? "linked";
  const dbUrl = process.env.TRULOT_PRODUCTION_DB_URL ?? "";
  const supabaseWorkdir = process.env.TRULOT_SUPABASE_WORKDIR ?? "";
  const preflightOnly = process.argv.includes("--preflight");
  const verifyPreMigrationState = process.argv.includes("--verify-pre-migration-state");
  const skipHttpSmoke = process.argv.includes("--skip-http-smoke");
  const runCommand = defaultRunCommand;
  const supabaseBin = resolveSupabaseBin();
  const queryRunner = createSupabaseQueryRunner({
    runCommand,
    supabaseBin,
    verifyMode,
    supabaseWorkdir,
    dbUrl,
  });
  const { queryRow, queryJson } = queryRunner;
  const psqlContext = { dbUrl, runCommand };

  const privilegeMatrix = {
    parcel_page_api_v2: queryJson(`
      select json_build_object(
        'grants',
        coalesce(
          json_agg(
            json_build_object('grantee', grantee, 'privilege_type', privilege_type)
            order by grantee, privilege_type
          ),
          '[]'::json
        )
      )::text
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'parcel_page_api_v2'
        and grantee in ('anon', 'authenticated', 'service_role');
    `).grants,
    parcel_primary_project_v1: queryJson(`
      select json_build_object(
        'grants',
        coalesce(
          json_agg(
            json_build_object('grantee', grantee, 'privilege_type', privilege_type)
            order by grantee, privilege_type
          ),
          '[]'::json
        )
      )::text
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'parcel_primary_project_v1'
        and grantee in ('anon', 'authenticated', 'service_role');
    `).grants,
    parcel_permit_terminal_v2: queryJson(`
      select json_build_object(
        'grants',
        coalesce(
          json_agg(
            json_build_object('grantee', grantee, 'privilege_type', privilege_type)
            order by grantee, privilege_type
          ),
          '[]'::json
        )
      )::text
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'parcel_permit_terminal_v2'
        and grantee in ('anon', 'authenticated', 'service_role');
    `).grants,
    trulot_permit_parcel_link_v1: queryJson(`
      select json_build_object(
        'grants',
        coalesce(
          json_agg(
            json_build_object('grantee', grantee, 'privilege_type', privilege_type)
            order by grantee, privilege_type
          ),
          '[]'::json
        )
      )::text
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'trulot_permit_parcel_link_v1'
        and grantee in ('anon', 'authenticated', 'service_role');
    `).grants,
    trulot_permit_linkage_report_v1: queryJson(`
      select json_build_object(
        'grants',
        coalesce(
          json_agg(
            json_build_object('grantee', grantee, 'privilege_type', privilege_type)
            order by grantee, privilege_type
          ),
          '[]'::json
        )
      )::text
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'trulot_permit_linkage_report_v1'
        and grantee in ('anon', 'authenticated', 'service_role');
    `).grants,
  };

  const privilegeChecks = {
    current_database: queryRow("select current_database() as current_database;", "current_database"),
    anon_overlay_table_select: queryRow("select has_table_privilege('anon', 'public.tpa_official', 'SELECT') as allowed;", "allowed"),
    authenticated_overlay_table_select: queryRow("select has_table_privilege('authenticated', 'public.sda_official', 'SELECT') as allowed;", "allowed"),
    anon_overlay_execute: queryRow("select has_function_privilege('anon', 'public.check_parcel_overlays(double precision, double precision)', 'EXECUTE') as allowed;", "allowed"),
    authenticated_overlay_execute: queryRow("select has_function_privilege('authenticated', 'public.check_parcel_overlays(double precision, double precision)', 'EXECUTE') as allowed;", "allowed"),
    service_overlay_execute: queryRow("select has_function_privilege('service_role', 'public.check_parcel_overlays(double precision, double precision)', 'EXECUTE') as allowed;", "allowed"),
    anon_report_select: queryRow("select has_table_privilege('anon', 'public.trulot_permit_linkage_report_v1', 'SELECT') as allowed;", "allowed"),
    authenticated_report_select: queryRow("select has_table_privilege('authenticated', 'public.trulot_permit_linkage_report_v1', 'SELECT') as allowed;", "allowed"),
    service_report_select: queryRow("select has_table_privilege('service_role', 'public.trulot_permit_linkage_report_v1', 'SELECT') as allowed;", "allowed"),
    anon_opportunity_execute: queryRow("select has_function_privilege('anon', 'public.get_opportunity_feed(integer, integer, integer)', 'EXECUTE') as allowed;", "allowed"),
    authenticated_opportunity_execute: queryRow("select has_function_privilege('authenticated', 'public.get_opportunity_feed(integer, integer, integer)', 'EXECUTE') as allowed;", "allowed"),
    service_opportunity_execute: queryRow("select has_function_privilege('service_role', 'public.get_opportunity_feed(integer, integer, integer)', 'EXECUTE') as allowed;", "allowed"),
    anon_update_nearby_execute: queryRow("select has_function_privilege('anon', 'public.update_nearby_activity_v2()', 'EXECUTE') as allowed;", "allowed"),
    authenticated_update_nearby_execute: queryRow("select has_function_privilege('authenticated', 'public.update_nearby_activity_v2()', 'EXECUTE') as allowed;", "allowed"),
    service_update_nearby_execute: queryRow("select has_function_privilege('service_role', 'public.update_nearby_activity_v2()', 'EXECUTE') as allowed;", "allowed"),
  };

  const queryAdapterPreflight = {
    current_database: privilegeChecks.current_database,
    current_user: queryRow("select current_user as current_user;", "current_user"),
    tracked_catalog_rows: queryRow(
      "select count(*) as tracked_catalog_rows from pg_class where relname in ('parcel_page_api_v2', 'tpa_official', 'trulot_permit_linkage_report_v1');",
      "tracked_catalog_rows",
    ),
  };

  const psqlPreflight = {
    version: runCommand("psql", ["--version"]).trim(),
    connection_identity: (() => {
      const output = psqlCommand(["-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", "select current_database(), current_user;"], psqlContext).trim();
      const [currentDatabase, currentUser] = output.split("|");
      assert(currentDatabase, "psql preflight must return current_database().");
      assert(currentUser, "psql preflight must return current_user.");
      return {
        current_database: currentDatabase,
        current_user: currentUser,
      };
    })(),
    anon_role_switch: roleQuery("anon", "select 1", psqlContext).output,
    authenticated_role_switch: roleQuery("authenticated", "select 1", psqlContext).output,
  };

  if (preflightOnly) {
    const report = {
      checked_at: new Date().toISOString(),
      verification_mode: verifyMode,
      query_adapter_preflight: queryAdapterPreflight,
      psql_preflight: psqlPreflight,
    };
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (verifyPreMigrationState) {
    const preMigrationState = collectPreMigrationStateChecks({
      queryRow,
      queryJson,
      supabaseWorkdir,
    });
    const failures = preMigrationState.checks.filter((check) => !check.ok);
    const report = {
      checked_at: new Date().toISOString(),
      verification_mode: verifyMode,
      pre_migration_state: preMigrationState,
    };
    console.log(JSON.stringify(report, null, 2));
    if (failures.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  assert(privilegeChecks.anon_overlay_table_select === false, "anon should not retain raw overlay table SELECT.");
  assert(privilegeChecks.authenticated_overlay_table_select === false, "authenticated should not retain raw overlay table SELECT.");
  assert(privilegeChecks.anon_overlay_execute === true, "anon must retain check_parcel_overlays EXECUTE.");
  assert(privilegeChecks.authenticated_overlay_execute === true, "authenticated must retain check_parcel_overlays EXECUTE.");
  assert(privilegeChecks.service_overlay_execute === true, "service_role must retain check_parcel_overlays EXECUTE.");
  assert(privilegeChecks.anon_report_select === false, "anon should not retain permit linkage report access.");
  assert(privilegeChecks.authenticated_report_select === false, "authenticated should not retain permit linkage report access.");
  assert(privilegeChecks.service_report_select === true, "service_role must retain permit linkage report access.");
  assert(privilegeChecks.anon_opportunity_execute === false, "anon should not retain get_opportunity_feed EXECUTE.");
  assert(privilegeChecks.authenticated_opportunity_execute === false, "authenticated should not retain get_opportunity_feed EXECUTE.");
  assert(privilegeChecks.service_opportunity_execute === true, "service_role must retain get_opportunity_feed EXECUTE.");
  assert(privilegeChecks.anon_update_nearby_execute === false, "anon should not retain update_nearby_activity_v2 EXECUTE.");
  assert(privilegeChecks.authenticated_update_nearby_execute === false, "authenticated should not retain update_nearby_activity_v2 EXECUTE.");
  assert(privilegeChecks.service_update_nearby_execute === true, "service_role must retain update_nearby_activity_v2 EXECUTE.");

  const tableExpectations = {
    parcel_page_api_v2: [
      { grantee: "anon", privilege_type: "SELECT" },
      { grantee: "authenticated", privilege_type: "SELECT" },
      { grantee: "service_role", privilege_type: "DELETE" },
      { grantee: "service_role", privilege_type: "INSERT" },
      { grantee: "service_role", privilege_type: "REFERENCES" },
      { grantee: "service_role", privilege_type: "SELECT" },
      { grantee: "service_role", privilege_type: "TRIGGER" },
      { grantee: "service_role", privilege_type: "TRUNCATE" },
      { grantee: "service_role", privilege_type: "UPDATE" },
    ],
    parcel_primary_project_v1: [
      { grantee: "anon", privilege_type: "SELECT" },
      { grantee: "authenticated", privilege_type: "SELECT" },
      { grantee: "service_role", privilege_type: "DELETE" },
      { grantee: "service_role", privilege_type: "INSERT" },
      { grantee: "service_role", privilege_type: "REFERENCES" },
      { grantee: "service_role", privilege_type: "SELECT" },
      { grantee: "service_role", privilege_type: "TRIGGER" },
      { grantee: "service_role", privilege_type: "TRUNCATE" },
      { grantee: "service_role", privilege_type: "UPDATE" },
    ],
    parcel_permit_terminal_v2: [
      { grantee: "anon", privilege_type: "SELECT" },
      { grantee: "authenticated", privilege_type: "SELECT" },
      { grantee: "service_role", privilege_type: "DELETE" },
      { grantee: "service_role", privilege_type: "INSERT" },
      { grantee: "service_role", privilege_type: "REFERENCES" },
      { grantee: "service_role", privilege_type: "SELECT" },
      { grantee: "service_role", privilege_type: "TRIGGER" },
      { grantee: "service_role", privilege_type: "TRUNCATE" },
      { grantee: "service_role", privilege_type: "UPDATE" },
    ],
    trulot_permit_parcel_link_v1: [
      { grantee: "anon", privilege_type: "SELECT" },
      { grantee: "authenticated", privilege_type: "SELECT" },
      { grantee: "service_role", privilege_type: "SELECT" },
    ],
    trulot_permit_linkage_report_v1: [
      { grantee: "service_role", privilege_type: "SELECT" },
    ],
  };

  for (const [name, expected] of Object.entries(tableExpectations)) {
    assert(
      JSON.stringify(privilegeMatrix[name]) === JSON.stringify(expected),
      `${name} grants do not match the approved post-migration matrix.`,
    );
  }

  const searchPath = queryRow(
    "select coalesce(array_to_string(proconfig, ','), '') as search_path from pg_proc where oid = 'public.check_parcel_overlays(double precision, double precision)'::regprocedure;",
    "search_path",
  );
  assert(searchPath.includes("search_path=public, pg_temp"), "check_parcel_overlays must keep the fixed search_path.");

  const overlayResponseAnon = JSON.parse(roleQuery("anon", "select public.check_parcel_overlays(32.75, -117.19)::text as payload", psqlContext).output);
  const overlayResponseAuthenticated = JSON.parse(roleQuery("authenticated", "select public.check_parcel_overlays(32.75, -117.19)::text as payload", psqlContext).output);

  for (const [label, value] of Object.entries({
    anon: overlayResponseAnon,
    authenticated: overlayResponseAuthenticated,
  })) {
    assert(value && typeof value === "object", `${label} overlay RPC should return a JSON object.`);
    for (const key of ["tpa", "sda", "ctcac"]) {
      assert(typeof value[key] === "boolean", `${label} overlay RPC must preserve boolean key ${key}.`);
    }
  }

  const roleExecutionFailures = {
    anon_overlay_table_select: roleExpectFailure("anon", "select count(*) from public.tpa_official", "Raw overlay table SELECT", psqlContext),
    authenticated_overlay_table_select: roleExpectFailure("authenticated", "select count(*) from public.sda_official", "Raw overlay table SELECT", psqlContext),
    anon_report_view_select: roleExpectFailure("anon", "select total_permits from public.trulot_permit_linkage_report_v1", "Permit-linkage reporting view SELECT", psqlContext),
    authenticated_report_view_select: roleExpectFailure("authenticated", "select total_permits from public.trulot_permit_linkage_report_v1", "Permit-linkage reporting view SELECT", psqlContext),
    anon_admin_function_execute: roleExpectFailure("anon", "select public.update_nearby_activity_v2()", "Admin helper execution", psqlContext),
    authenticated_admin_function_execute: roleExpectFailure("authenticated", "select public.update_nearby_activity_v2()", "Admin helper execution", psqlContext),
    anon_opportunity_function_execute: roleExpectFailure("anon", "select public.get_opportunity_feed(10, 0, 0)", "Opportunity helper execution", psqlContext),
    authenticated_opportunity_function_execute: roleExpectFailure("authenticated", "select public.get_opportunity_feed(10, 0, 0)", "Opportunity helper execution", psqlContext),
  };

  const smokeParcel = queryJson(`
    select json_build_object(
      'apn_norm', apn_norm,
      'address', address
    )::text
    from public.parcel_page_api_v2
    where coalesce(address, '') <> ''
    order by apn_norm
    limit 1;
  `);

  assert(smokeParcel?.apn_norm, "Could not find a production parcel for smoke testing.");

  const smokeSlug = canonicalParcelSlug(smokeParcel.apn_norm, smokeParcel.address);
  const searchUrl = `${baseUrl}/api/search?q=${encodeURIComponent(smokeParcel.apn_norm)}`;
  const parcelPageUrl = `${baseUrl}/parcel/san-diego/${smokeSlug}`;
  const legacyApiUrl = `${baseUrl}/api/parcel/${smokeParcel.apn_norm}`;
  const jobsFeedUrl = `${baseUrl}/api/jobs-feed`;

  if (!skipHttpSmoke) {
    const [searchResult, parcelPageResult, legacyApiResult, jobsFeedResult] = await Promise.all([
      fetchJson(searchUrl),
      fetchText(parcelPageUrl),
      fetchJson(legacyApiUrl),
      fetchJson(jobsFeedUrl),
    ]);

    assert(searchResult.response.ok, "Production search smoke check failed.");
    assert(Array.isArray(searchResult.json.results) && searchResult.json.results.length > 0, "Production search should return at least one parcel.");
    assert(parcelPageResult.response.ok, "Canonical Parcel Page smoke check failed.");
    assert(
      parcelPageResult.text.includes("Parcel view last rebuilt") || parcelPageResult.text.includes("Source:"),
      "Canonical Parcel Page response is missing expected source-language markers.",
    );
    assert(legacyApiResult.response.ok, "Legacy parcel API smoke check failed.");
    assert(legacyApiResult.json?.api_status?.status === "noncanonical", "Legacy parcel API should retain the noncanonical status payload.");
    assert(jobsFeedResult.response.ok, "Jobs feed smoke check failed.");
    assert(Array.isArray(jobsFeedResult.json), "Jobs feed should remain a JSON array.");
  }

  const report = {
    checked_at: new Date().toISOString(),
    verification_mode: verifyMode,
    query_adapter_preflight: queryAdapterPreflight,
    base_url: baseUrl,
    smoke_parcel: {
      apn_norm: smokeParcel.apn_norm,
      slug: smokeSlug,
    },
    psql_preflight: psqlPreflight,
    privilege_checks: privilegeChecks,
    role_execution_failures: roleExecutionFailures,
    role_execution_success: {
      anon_overlay_rpc: overlayResponseAnon,
      authenticated_overlay_rpc: overlayResponseAuthenticated,
    },
    check_parcel_overlays_search_path: searchPath,
  };

  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  await main();
}

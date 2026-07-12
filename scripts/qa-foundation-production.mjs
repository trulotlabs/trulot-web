import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const baseUrl = (process.env.TRULOT_PRODUCTION_BASE_URL ?? "https://trulot-web.vercel.app").replace(/\/+$/, "");
const verifyMode = process.env.TRULOT_PRODUCTION_VERIFY_MODE ?? "linked";
const dbUrl = process.env.TRULOT_PRODUCTION_DB_URL ?? "";
const supabaseWorkdir = process.env.TRULOT_SUPABASE_WORKDIR ?? "";
const preflightOnly = process.argv.includes("--preflight");
const skipHttpSmoke = process.argv.includes("--skip-http-smoke");

function resolveSupabaseBin() {
  if (process.env.TRULOT_SUPABASE_BIN) {
    return process.env.TRULOT_SUPABASE_BIN;
  }

  const bundledCli = path.join(process.cwd(), "node_modules", ".bin", "supabase");
  if (fs.existsSync(bundledCli)) {
    return bundledCli;
  }

  throw new Error("TRULOT_SUPABASE_BIN is required when the repository-pinned Supabase CLI is not available at node_modules/.bin/supabase.");
}

const supabaseBin = resolveSupabaseBin();

function runCommand(cmd, args) {
  return execFileSync(cmd, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
}

function query(sql) {
  const args = ["--output-format", "json"];
  if (verifyMode === "linked") {
    if (!supabaseWorkdir) {
      throw new Error("TRULOT_SUPABASE_WORKDIR is required when TRULOT_PRODUCTION_VERIFY_MODE=linked.");
    }
    args.push("--workdir", supabaseWorkdir, "db", "query", "--linked");
  } else if (verifyMode === "db-url") {
    if (!dbUrl) {
      throw new Error("TRULOT_PRODUCTION_DB_URL is required when TRULOT_PRODUCTION_VERIFY_MODE=db-url.");
    }
    args.push("db", "query", "--db-url", dbUrl);
  } else {
    throw new Error(`Unsupported TRULOT_PRODUCTION_VERIFY_MODE: ${verifyMode}`);
  }

  const output = runCommand(supabaseBin, [...args, sql]);
  return JSON.parse(output);
}

function queryRow(sql, key) {
  const payload = query(sql);
  const row = payload.rows?.[0];
  if (!row) {
    throw new Error(`Expected a row for query: ${sql}`);
  }
  return row[key];
}

function queryJson(sql, key = "json_build_object") {
  const value = queryRow(sql, key);
  return typeof value === "string" ? JSON.parse(value) : value;
}

function psql(sql, { expectFailure = false } = {}) {
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

function psqlCommand(args) {
  if (!dbUrl) {
    throw new Error("TRULOT_PRODUCTION_DB_URL is required for psql verification.");
  }

  return runCommand("psql", [dbUrl, ...args]);
}

function roleQuery(role, sql) {
  return psql(`begin; set local role ${role}; ${sql}; rollback;`);
}

function roleExpectFailure(role, sql, label) {
  const result = psql(`begin; set local role ${role}; ${sql}; rollback;`, { expectFailure: true });
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

function canonicalParcelSlug(apn, address) {
  const formattedApn = formatApnForDisplay(apn);
  const addressSlug = slugifyAddress(address);
  return addressSlug ? `${formattedApn}-${addressSlug}` : `apn-${normalizeApnDigits(apn)}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  return { response, json: await response.json() };
}

async function fetchText(url) {
  const response = await fetch(url);
  return { response, text: await response.text() };
}

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
    const output = psqlCommand(["-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", "select current_database(), current_user;"]).trim();
    const [currentDatabase, currentUser] = output.split("|");
    assert(currentDatabase, "psql preflight must return current_database().");
    assert(currentUser, "psql preflight must return current_user.");
    return {
      current_database: currentDatabase,
      current_user: currentUser,
    };
  })(),
  anon_role_switch: roleQuery("anon", "select 1").output,
  authenticated_role_switch: roleQuery("authenticated", "select 1").output,
};

if (preflightOnly) {
  const report = {
    checked_at: new Date().toISOString(),
    verification_mode: verifyMode,
    query_adapter_preflight: queryAdapterPreflight,
    psql_preflight: psqlPreflight,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
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

const overlayResponseAnon = JSON.parse(roleQuery("anon", "select public.check_parcel_overlays(32.75, -117.19)::text as payload").output);
const overlayResponseAuthenticated = JSON.parse(roleQuery("authenticated", "select public.check_parcel_overlays(32.75, -117.19)::text as payload").output);

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
  anon_overlay_table_select: roleExpectFailure("anon", "select count(*) from public.tpa_official", "Raw overlay table SELECT"),
  authenticated_overlay_table_select: roleExpectFailure("authenticated", "select count(*) from public.sda_official", "Raw overlay table SELECT"),
  anon_report_view_select: roleExpectFailure("anon", "select total_permits from public.trulot_permit_linkage_report_v1", "Permit-linkage reporting view SELECT"),
  authenticated_report_view_select: roleExpectFailure("authenticated", "select total_permits from public.trulot_permit_linkage_report_v1", "Permit-linkage reporting view SELECT"),
  anon_admin_function_execute: roleExpectFailure("anon", "select public.update_nearby_activity_v2()", "Admin helper execution"),
  authenticated_admin_function_execute: roleExpectFailure("authenticated", "select public.update_nearby_activity_v2()", "Admin helper execution"),
  anon_opportunity_function_execute: roleExpectFailure("anon", "select public.get_opportunity_feed(10, 0, 0)", "Opportunity helper execution"),
  authenticated_opportunity_function_execute: roleExpectFailure("authenticated", "select public.get_opportunity_feed(10, 0, 0)", "Opportunity helper execution"),
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

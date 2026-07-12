import { execFileSync } from "node:child_process";

const dbUrl = process.env.TRULOT_PRODUCTION_DB_URL;
const baseUrl = (process.env.TRULOT_PRODUCTION_BASE_URL ?? "https://trulot-web.vercel.app").replace(/\/+$/, "");

if (!dbUrl) {
  console.error("TRULOT_PRODUCTION_DB_URL is required.");
  process.exit(1);
}

function psql(args) {
  return execFileSync("psql", [dbUrl, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
}

function queryText(sql) {
  return psql(["-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", sql]).trim();
}

function queryJson(sql) {
  const output = queryText(sql);
  const lastLine = output.split(/\n+/).map((line) => line.trim()).filter(Boolean).at(-1) ?? "";
  return JSON.parse(lastLine || "null");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });

  return {
    response,
    json: await response.json(),
  };
}

async function fetchText(url) {
  const response = await fetch(url);
  return {
    response,
    text: await response.text(),
  };
}

const privilegeMatrix = {
  parcel_page_api_v2: queryJson(`
    select coalesce(
      json_agg(
        json_build_object('grantee', grantee, 'privilege_type', privilege_type)
        order by grantee, privilege_type
      ),
      '[]'::json
    )::text
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'parcel_page_api_v2'
      and grantee in ('anon', 'authenticated', 'service_role');
  `),
  parcel_primary_project_v1: queryJson(`
    select coalesce(
      json_agg(
        json_build_object('grantee', grantee, 'privilege_type', privilege_type)
        order by grantee, privilege_type
      ),
      '[]'::json
    )::text
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'parcel_primary_project_v1'
      and grantee in ('anon', 'authenticated', 'service_role');
  `),
  parcel_permit_terminal_v2: queryJson(`
    select coalesce(
      json_agg(
        json_build_object('grantee', grantee, 'privilege_type', privilege_type)
        order by grantee, privilege_type
      ),
      '[]'::json
    )::text
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'parcel_permit_terminal_v2'
      and grantee in ('anon', 'authenticated', 'service_role');
  `),
  trulot_permit_parcel_link_v1: queryJson(`
    select coalesce(
      json_agg(
        json_build_object('grantee', grantee, 'privilege_type', privilege_type)
        order by grantee, privilege_type
      ),
      '[]'::json
    )::text
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'trulot_permit_parcel_link_v1'
      and grantee in ('anon', 'authenticated', 'service_role');
  `),
  trulot_permit_linkage_report_v1: queryJson(`
    select coalesce(
      json_agg(
        json_build_object('grantee', grantee, 'privilege_type', privilege_type)
        order by grantee, privilege_type
      ),
      '[]'::json
    )::text
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'trulot_permit_linkage_report_v1'
      and grantee in ('anon', 'authenticated', 'service_role');
  `),
};

const privilegeChecks = {
  anon_overlay_table_select: queryText("select has_table_privilege('anon', 'public.tpa_official', 'SELECT');"),
  authenticated_overlay_table_select: queryText("select has_table_privilege('authenticated', 'public.sda_official', 'SELECT');"),
  anon_overlay_execute: queryText("select has_function_privilege('anon', 'public.check_parcel_overlays(double precision, double precision)', 'EXECUTE');"),
  authenticated_overlay_execute: queryText("select has_function_privilege('authenticated', 'public.check_parcel_overlays(double precision, double precision)', 'EXECUTE');"),
  service_overlay_execute: queryText("select has_function_privilege('service_role', 'public.check_parcel_overlays(double precision, double precision)', 'EXECUTE');"),
  anon_report_select: queryText("select has_table_privilege('anon', 'public.trulot_permit_linkage_report_v1', 'SELECT');"),
  authenticated_report_select: queryText("select has_table_privilege('authenticated', 'public.trulot_permit_linkage_report_v1', 'SELECT');"),
  service_report_select: queryText("select has_table_privilege('service_role', 'public.trulot_permit_linkage_report_v1', 'SELECT');"),
  anon_opportunity_execute: queryText("select has_function_privilege('anon', 'public.get_opportunity_feed(integer, integer, integer)', 'EXECUTE');"),
  authenticated_opportunity_execute: queryText("select has_function_privilege('authenticated', 'public.get_opportunity_feed(integer, integer, integer)', 'EXECUTE');"),
  service_opportunity_execute: queryText("select has_function_privilege('service_role', 'public.get_opportunity_feed(integer, integer, integer)', 'EXECUTE');"),
  anon_update_nearby_execute: queryText("select has_function_privilege('anon', 'public.update_nearby_activity_v2()', 'EXECUTE');"),
  authenticated_update_nearby_execute: queryText("select has_function_privilege('authenticated', 'public.update_nearby_activity_v2()', 'EXECUTE');"),
  service_update_nearby_execute: queryText("select has_function_privilege('service_role', 'public.update_nearby_activity_v2()', 'EXECUTE');"),
};

assert(privilegeChecks.anon_overlay_table_select === "f", "anon should not retain raw overlay table SELECT.");
assert(privilegeChecks.authenticated_overlay_table_select === "f", "authenticated should not retain raw overlay table SELECT.");
assert(privilegeChecks.anon_overlay_execute === "t", "anon must retain check_parcel_overlays EXECUTE.");
assert(privilegeChecks.authenticated_overlay_execute === "t", "authenticated must retain check_parcel_overlays EXECUTE.");
assert(privilegeChecks.service_overlay_execute === "t", "service_role must retain check_parcel_overlays EXECUTE.");
assert(privilegeChecks.anon_report_select === "f", "anon should not retain permit linkage report access.");
assert(privilegeChecks.authenticated_report_select === "f", "authenticated should not retain permit linkage report access.");
assert(privilegeChecks.service_report_select === "t", "service_role must retain permit linkage report access.");
assert(privilegeChecks.anon_opportunity_execute === "f", "anon should not retain get_opportunity_feed EXECUTE.");
assert(privilegeChecks.authenticated_opportunity_execute === "f", "authenticated should not retain get_opportunity_feed EXECUTE.");
assert(privilegeChecks.service_opportunity_execute === "t", "service_role must retain get_opportunity_feed EXECUTE.");
assert(privilegeChecks.anon_update_nearby_execute === "f", "anon should not retain update_nearby_activity_v2 EXECUTE.");
assert(privilegeChecks.authenticated_update_nearby_execute === "f", "authenticated should not retain update_nearby_activity_v2 EXECUTE.");
assert(privilegeChecks.service_update_nearby_execute === "t", "service_role must retain update_nearby_activity_v2 EXECUTE.");

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

const searchPath = queryText(`
  select coalesce(array_to_string(proconfig, ','), '')
  from pg_proc
  where oid = 'public.check_parcel_overlays(double precision, double precision)'::regprocedure;
`);
assert(searchPath.includes("search_path=public, pg_temp"), "check_parcel_overlays must keep the fixed search_path.");

const overlayResponseAnon = queryJson(`
  set role anon;
  select public.check_parcel_overlays(32.75, -117.19)::text;
  reset role;
`);
const overlayResponseAuthenticated = queryJson(`
  set role authenticated;
  select public.check_parcel_overlays(32.75, -117.19)::text;
  reset role;
`);

for (const [label, value] of Object.entries({
  anon: overlayResponseAnon,
  authenticated: overlayResponseAuthenticated,
})) {
  assert(value && typeof value === "object", `${label} overlay RPC should return a JSON object.`);
  for (const key of ["tpa", "sda", "ctcac"]) {
    assert(typeof value[key] === "boolean", `${label} overlay RPC must preserve boolean key ${key}.`);
  }
}

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

const report = {
  checked_at: new Date().toISOString(),
  base_url: baseUrl,
  smoke_parcel: {
    apn_norm: smokeParcel.apn_norm,
    slug: smokeSlug,
  },
  privilege_checks: privilegeChecks,
  check_parcel_overlays_search_path: searchPath,
};

console.log(JSON.stringify(report, null, 2));

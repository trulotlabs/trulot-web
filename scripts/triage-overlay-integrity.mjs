import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalParcelSlug,
  createSupabaseQueryRunner,
  defaultRunCommand,
  resolveSupabaseBin,
} from "./qa-foundation-production.mjs";

const __filename = fileURLToPath(import.meta.url);

const DEFAULT_BASE_URL = "https://trulot-web.vercel.app";
const OVERLAY_TABLES = ["tpa_official", "sda_official", "ctcac_gis_v1"];
const GEOMETRY_TOP_LEVEL_TYPES = new Set([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
  "GeometryCollection",
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function psql(sql, { dbUrl, runCommand, expectFailure = false } = {}) {
  assert(dbUrl, "TRULOT_PRODUCTION_DB_URL is required for psql inspection.");

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

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { response, text, json };
}

async function fetchText(url) {
  const response = await fetch(url);
  const text = await response.text();
  return { response, text };
}

function summarizePage(text) {
  const lowered = text.toLowerCase();
  return {
    hasParcelMarker: text.includes("Parcel view last rebuilt") || text.includes("Source:"),
    hasErrorMarker: lowered.includes("error") || lowered.includes("something went wrong"),
    hasOverlayUnavailableMarker: lowered.includes("overlay unavailable"),
  };
}

function parseRowsOutput(output) {
  if (!output) return [];
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function classifyCausality({ resolverInventory, qualifiedFailure, unqualifiedFailure, tableAudits }) {
  const tpaAudit = tableAudits.find((entry) => entry.table === "tpa_official");
  const hasNonGeometryTopLevelTypes = (tpaAudit?.topLevelTypeCounts ?? []).some(
    ({ top_level_type, row_count }) => row_count > 0 && !GEOMETRY_TOP_LEVEL_TYPES.has(top_level_type),
  );
  const hasPublicWrapper = resolverInventory.some((entry) => entry.schema_name === "public");

  if (
    hasNonGeometryTopLevelTypes &&
    hasPublicWrapper === false &&
    qualifiedFailure?.ok === false &&
    unqualifiedFailure?.ok === false &&
    qualifiedFailure.output === unqualifiedFailure.output
  ) {
    return "PRE-EXISTING DATA DEFECT";
  }

  if (
    qualifiedFailure?.ok === false &&
    unqualifiedFailure?.ok === true
  ) {
    return "MIGRATION-CAUSED REGRESSION";
  }

  return "MIXED / INCONCLUSIVE";
}

async function runHttpSmoke({ baseUrl, queryJson }) {
  const parcels = queryJson(`
    with smoke as (
      select apn_norm, address
      from public.parcel_page_api_v2
      where coalesce(address, '') <> ''
      order by apn_norm
      limit 3
    )
    select coalesce(
      json_agg(
        json_build_object('apn_norm', apn_norm, 'address', address)
        order by apn_norm
      ),
      '[]'::json
    )::text as parcels
    from smoke;
  `, "parcels");

  const homepage = await fetchText(baseUrl);
  const searchUi = await fetchText(`${baseUrl}/`);
  const jobsFeed = await fetchJson(`${baseUrl}/api/jobs-feed`);

  const parcelChecks = [];
  for (const parcel of parcels) {
    const slug = canonicalParcelSlug(parcel.apn_norm, parcel.address);
    const searchApi = await fetchJson(`${baseUrl}/api/search?q=${encodeURIComponent(parcel.address)}`);
    const legacyApi = await fetchJson(`${baseUrl}/api/parcel/${encodeURIComponent(parcel.apn_norm)}`);
    const parcelPage = await fetchText(`${baseUrl}/parcel/san-diego/${slug}`);

    parcelChecks.push({
      apn_norm: parcel.apn_norm,
      address: parcel.address,
      slug,
      search_api: {
        status: searchApi.response.status,
        ok: searchApi.response.ok,
        result_count: Array.isArray(searchApi.json?.results) ? searchApi.json.results.length : null,
      },
      legacy_api: {
        status: legacyApi.response.status,
        ok: legacyApi.response.ok,
        api_status: legacyApi.json?.api_status?.status ?? null,
      },
      canonical_parcel_page: {
        status: parcelPage.response.status,
        ok: parcelPage.response.ok,
        markers: summarizePage(parcelPage.text),
      },
    });
  }

  return {
    homepage: {
      status: homepage.response.status,
      ok: homepage.response.ok,
      markers: summarizePage(homepage.text),
    },
    search_ui: {
      status: searchUi.response.status,
      ok: searchUi.response.ok,
    },
    jobs_feed: {
      status: jobsFeed.response.status,
      ok: jobsFeed.response.ok,
      total_jobs: jobsFeed.json?.total_jobs ?? null,
      is_array: Array.isArray(jobsFeed.json),
    },
    parcels: parcelChecks,
  };
}

function buildTableAudit(queryJson, tableName) {
  return queryJson(`
    with base as (
      select *
      from public.${tableName}
    ),
    typed as (
      select
        id,
        source_layer,
        geojson,
        geom,
        coalesce(geojson->>'type', '(missing)') as top_level_type,
        coalesce(geojson->'geometry'->>'type', '(missing)') as nested_geometry_type,
        case
          when jsonb_typeof(geojson->'features') = 'array' then jsonb_array_length(geojson->'features')
          else null
        end as feature_count
      from base
    ),
    top_level_counts as (
      select top_level_type, count(*)::bigint as row_count
      from typed
      group by top_level_type
      order by row_count desc, top_level_type
    ),
    feature_geometry_counts as (
      select nested_geometry_type, count(*)::bigint as row_count
      from typed
      where top_level_type = 'Feature'
      group by nested_geometry_type
      order by row_count desc, nested_geometry_type
    ),
    feature_collection_geometry_counts as (
      select
        coalesce(feature->'geometry'->>'type', '(missing)') as nested_geometry_type,
        count(*)::bigint as row_count
      from typed
      cross join lateral jsonb_array_elements(
        case
          when top_level_type = 'FeatureCollection' and jsonb_typeof(geojson->'features') = 'array'
            then geojson->'features'
          else '[]'::jsonb
        end
      ) as feature
      group by coalesce(feature->'geometry'->>'type', '(missing)')
      order by row_count desc, nested_geometry_type
    ),
    sample_unexpected_rows as (
      select json_build_object(
        'id', id,
        'source_layer', source_layer,
        'top_level_type', top_level_type,
        'nested_geometry_type', nested_geometry_type,
        'feature_count', feature_count,
        'geom_present', geom is not null
      ) as sample
      from typed
      where geojson is not null
        and top_level_type not in ('Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection')
      order by id
      limit 10
    )
    select json_build_object(
      'table', '${tableName}',
      'primary_key_columns',
      coalesce((
        select json_agg(att.attname order by att.attnum)
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        join pg_namespace nsp on nsp.oid = rel.relnamespace
        join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
        where con.contype = 'p'
          and nsp.nspname = 'public'
          and rel.relname = '${tableName}'
      ), '[]'::json),
      'columns',
      coalesce((
        select json_agg(
          json_build_object(
            'column_name', column_name,
            'data_type', data_type,
            'udt_name', udt_name,
            'is_nullable', is_nullable,
            'column_default', column_default
          )
          order by ordinal_position
        )
        from information_schema.columns
        where table_schema = 'public'
          and table_name = '${tableName}'
      ), '[]'::json),
      'indexes',
      coalesce((
        select json_agg(
          json_build_object(
            'index_name', indexname,
            'index_definition', indexdef
          )
          order by indexname
        )
        from pg_indexes
        where schemaname = 'public'
          and tablename = '${tableName}'
      ), '[]'::json),
      'row_count', (select count(*)::bigint from base),
      'geojson_null_count', (select count(*)::bigint from typed where geojson is null),
      'geom_null_count', (select count(*)::bigint from typed where geom is null),
      'invalid_geom_count', (select count(*)::bigint from typed where geom is not null and not extensions.st_isvalid(geom)),
      'top_level_type_counts', coalesce((select json_agg(top_level_counts order by row_count desc, top_level_type) from top_level_counts), '[]'::json),
      'feature_geometry_type_counts', coalesce((select json_agg(feature_geometry_counts order by row_count desc, nested_geometry_type) from feature_geometry_counts), '[]'::json),
      'feature_collection_geometry_type_counts', coalesce((select json_agg(feature_collection_geometry_counts order by row_count desc, nested_geometry_type) from feature_collection_geometry_counts), '[]'::json),
      'feature_collection_feature_count_stats',
      (
        select json_build_object(
          'row_count', count(*)::bigint,
          'min_feature_count', min(feature_count),
          'max_feature_count', max(feature_count),
          'avg_feature_count', avg(feature_count)
        )
        from typed
        where top_level_type = 'FeatureCollection'
      ),
      'sample_unexpected_rows', coalesce((select json_agg(sample order by (sample->>'id')::bigint) from sample_unexpected_rows), '[]'::json)
    )::text as audit;
  `, "audit");
}

async function main() {
  const baseUrl = (process.env.TRULOT_PRODUCTION_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const verifyMode = process.env.TRULOT_PRODUCTION_VERIFY_MODE ?? "linked";
  const dbUrl = process.env.TRULOT_PRODUCTION_DB_URL ?? "";
  const supabaseWorkdir = process.env.TRULOT_SUPABASE_WORKDIR ?? "";
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

  const currentFunctionDefinition = queryRow(`
    select pg_get_functiondef('public.check_parcel_overlays(double precision, double precision)'::regprocedure) as definition;
  `, "definition");

  const localPreMigrationDefinition = fs.readFileSync(
    path.join(path.dirname(__filename), "..", "supabase", "migrations", "20260522_overlay_lookup.sql"),
    "utf8",
  );

  const resolverInventory = queryJson(`
    select coalesce(
      json_agg(
        json_build_object(
          'schema_name', n.nspname,
          'function_name', p.proname,
          'identity_arguments', pg_get_function_identity_arguments(p.oid)
        )
        order by n.nspname, pg_get_function_identity_arguments(p.oid)
      ),
      '[]'::json
    )::text as functions
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'st_geomfromgeojson';
  `, "functions");

  const tableAudits = OVERLAY_TABLES.map((tableName) => buildTableAudit(queryJson, tableName));
  const tpaAudit = tableAudits.find((entry) => entry.table === "tpa_official");
  const offendingSample = tpaAudit?.sample_unexpected_rows?.[0] ?? null;

  let qualifiedFailure = null;
  let unqualifiedFailure = null;
  let geomPresenceCheck = null;

  if (offendingSample?.id) {
    qualifiedFailure = psql(
      `select extensions.st_geomfromgeojson((select geojson::text from public.tpa_official where id = ${Number(offendingSample.id)}));`,
      { dbUrl, runCommand, expectFailure: true },
    );
    unqualifiedFailure = psql(
      `select st_geomfromgeojson((select geojson::text from public.tpa_official where id = ${Number(offendingSample.id)}));`,
      { dbUrl, runCommand, expectFailure: true },
    );
    geomPresenceCheck = psql(
      `select id, (geom is not null)::text from public.tpa_official where id = ${Number(offendingSample.id)};`,
      { dbUrl, runCommand },
    );
  }

  const httpSmoke = skipHttpSmoke ? null : await runHttpSmoke({ baseUrl, queryJson });

  const report = {
    checked_at: new Date().toISOString(),
    verification_mode: verifyMode,
    base_url: baseUrl,
    production_project_ref: queryRow("select current_database() as current_database;", "current_database"),
    http_smoke: httpSmoke,
    function_compare: {
      local_pre_migration_definition: localPreMigrationDefinition,
      current_production_definition: currentFunctionDefinition,
    },
    resolver_inventory: resolverInventory,
    overlay_tables: tableAudits,
    offending_sample: offendingSample,
    parser_equivalence_checks: {
      qualified_failure: qualifiedFailure,
      unqualified_failure: unqualifiedFailure,
      offending_sample_geom_presence: geomPresenceCheck?.output ?? null,
    },
  };

  report.causality_classification = classifyCausality({
    resolverInventory,
    qualifiedFailure,
    unqualifiedFailure,
    tableAudits,
  });

  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  await main();
}

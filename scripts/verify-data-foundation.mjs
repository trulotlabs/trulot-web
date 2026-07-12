import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const accessMigrationPath = "supabase/migrations/20260712032203_foundation_access_least_privilege.sql";
const overlayMigrationPath = "supabase/migrations/20260712032216_check_parcel_overlays_hardening.sql";

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function requireIncludes(haystack, needle, label) {
  assert.ok(haystack.includes(needle), `${label} is missing: ${needle}`);
}

const migrationDir = path.join(repoRoot, "supabase/migrations");
const migrationFiles = fs
  .readdirSync(migrationDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

const versionsToFiles = new Map();
for (const file of migrationFiles) {
  const match = file.match(/^(\d+)_/);
  assert.ok(match, `migration filename is missing a numeric version prefix: ${file}`);
  const version = match[1];
  const conflicts = versionsToFiles.get(version) ?? [];
  conflicts.push(file);
  versionsToFiles.set(version, conflicts);
}

const duplicateVersions = [...versionsToFiles.entries()].filter(([, files]) => files.length > 1);
assert.equal(
  duplicateVersions.length,
  0,
  `duplicate migration versions found: ${duplicateVersions
    .map(([version, files]) => `${version} => ${files.join(", ")}`)
    .join("; ")}`,
);

const accessMigration = read(accessMigrationPath);
const overlayMigration = read(overlayMigrationPath);
const pageSource = read("app/parcel/san-diego/[slug]/page.tsx");
const alertsRoute = read("app/api/alerts/subscribe/route.ts");
const manifests = JSON.parse(read("data/dataset-manifests/2026-07-11-foundation.json"));
const securityBaseline = JSON.parse(read("data/security/remote-security-baseline-2026-07-11.json"));

for (const objectName of [
  "public.parcel_page_api_v2",
  "public.parcel_primary_project_v1",
  "public.parcel_permit_terminal_v2",
  "public.trulot_permit_parcel_link_v1",
]) {
  requireIncludes(accessMigration, `grant select on table ${objectName} to anon;`, "least-privilege migration");
  requireIncludes(accessMigration, `grant select on table ${objectName} to authenticated;`, "least-privilege migration");
}

requireIncludes(accessMigration, "grant select on table public.trulot_permit_linkage_report_v1 to service_role;", "least-privilege migration");
requireIncludes(accessMigration, "grant execute on function public.update_nearby_activity_v2() to service_role;", "least-privilege migration");

for (const needle of [
  "set search_path = public, pg_temp",
  "from public.tpa_official",
  "from public.sda_official",
  "from public.ctcac_gis_v1",
  "extensions.st_setsrid",
  "extensions.st_makepoint",
  "extensions.st_geomfromgeojson",
  "extensions.st_contains",
  "'tpa', in_tpa",
  "'sda', in_sda",
  "'ctcac', in_ctcac",
  "grant execute on function public.check_parcel_overlays(double precision, double precision) to anon;",
  "comment on function public.check_parcel_overlays(double precision, double precision) is",
]) {
  requireIncludes(overlayMigration, needle, "overlay hardening migration");
}

assert.equal(Array.isArray(manifests), true, "dataset manifests must be an array");
assert.equal(manifests.length >= 5, true, "expected at least five foundation dataset manifests");

for (const manifest of manifests) {
  for (const key of [
    "dataset_id",
    "human_readable_name",
    "source_agency_or_publisher",
    "source_publication_or_effective_date",
    "acquisition_timestamp",
    "import_timestamp",
    "row_count",
    "checksum",
    "dependent_database_objects",
  ]) {
    assert.ok(key in manifest, `manifest missing ${key}`);
  }
}

requireIncludes(pageSource, "Parcel view last rebuilt", "parcel page freshness wording");
requireIncludes(alertsRoute, "status: \"unavailable\"", "alerts route disposition");
requireIncludes(alertsRoute, "linked remote schema baseline", "alerts route evidence note");
assert.equal(securityBaseline.alerts_subscribers_disposition.observed_in_remote_dump, false, "alerts_subscribers should remain absent from the captured remote baseline");
assert.equal(securityBaseline.storage_dependency_in_repo, false, "repo should not claim a storage dependency");

console.log("Data-foundation verification checks passed.");

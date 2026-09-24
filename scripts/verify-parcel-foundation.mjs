import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const statuses = new Set(["REPRODUCIBLE", "PARTIAL", "NOT_REPRODUCIBLE", "UNKNOWN"]);
const provenanceStatuses = new Set(["VERIFIED", "PARTIAL", "UNKNOWN"]);
const requiredObjects = [
  "parcel_page_api_v2", "parcel_permit_terminal_v2", "trulot_permit_parcel_link_v1",
  "check_parcel_overlays", "tpa_official", "sda_official", "ctcac_gis_v1",
  "trulot_normalize_apn_digits", "trulot_extract_apn_candidates", "trulot_normalize_address_key",
  "postgis", "trulot_overlay_payload_to_geometry", "parcel_primary_project_v1", "update_nearby_activity_v2",
];
const unknownFields = [
  "source_publication_or_effective_date", "acquisition_timestamp", "import_timestamp",
  "row_count", "checksum", "schema_version", "importer_version", "steward", "refresh_cadence",
  "license_or_use_restriction",
];
const manifestFields = [
  "dataset_id", "human_readable_name", "source_agency_or_publisher",
  "source_url_or_acquisition_location", "jurisdiction", "geography", ...unknownFields,
];

export function loadFoundation() {
  const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
  const manifests = fs.readdirSync(path.join(root, "data/dataset-manifests"))
    .filter((name) => name.endsWith(".json")).sort()
    .flatMap((name) => {
      const entries = JSON.parse(read(`data/dataset-manifests/${name}`));
      assert.ok(Array.isArray(entries), `${name}: manifest must be an array`);
      return entries;
    });
  return {
    catalog: JSON.parse(read("data/foundation/parcel-v1-reproducibility.json")),
    manifests,
    sources: Object.fromEntries(["lib/parcel-page-v1.ts", "lib/source-freshness.ts"]
      .map((name) => [name, read(name)])),
    evidenceExists: (name) => !path.isAbsolute(name) && !name.split("/").includes("..")
      && fs.existsSync(path.join(root, name)) && fs.statSync(path.join(root, name)).isFile(),
  };
}

// This gate deliberately supports only the audited, unreceipted baseline. A future
// recovery must add evidence validation before any VERIFIED/known-vintage upgrade.
// Existence of a named receipt, documentation, or a SQL definition alone is not proof.
export function validateFoundation({ catalog, manifests, sources, evidenceExists }) {
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.evidencePolicy, "unreceipted-baseline-v1");
  const nonempty = (value, label) => assert.ok(typeof value === "string" && value.trim(), `${label}: explicit value required`);
  const index = (rows, key) => {
    assert.ok(Array.isArray(rows));
    const result = new Map();
    for (const row of rows) {
      nonempty(row[key], key);
      assert.ok(!result.has(row[key]), `Duplicate ${key}: ${row[key]}`);
      result.set(row[key], row);
    }
    return result;
  };
  const objects = index(catalog.objects, "name");
  const datasets = index(catalog.datasets, "id");
  const manifestMap = index(manifests, "dataset_id");
  for (const name of requiredObjects) assert.ok(objects.has(name), `Missing critical classification: ${name}`);
  for (const row of [...objects.values(), ...datasets.values()]) {
    assert.ok(statuses.has(row.definition), `Invalid definition: ${row.name ?? row.id}`);
    assert.ok(statuses.has(row.population), `Invalid population: ${row.name ?? row.id}`);
    assert.ok(provenanceStatuses.has(row.provenance), "Invalid provenance classification");
    assert.notEqual(row.provenance, "VERIFIED", "VERIFIED requires a separately reviewed source/receipt evidence contract");
    nonempty(row.gap, "gap");
  }
  for (const row of objects.values()) {
    nonempty(row.expectedType, "expectedType");
    assert.ok(["runtime", "historical-transform", "historical-population"].includes(row.scope));
    assert.equal(typeof row.creationMigrationControlled, "boolean");
    for (const dep of row.dependencies) assert.ok(objects.has(dep), `Unclassified dependency: ${dep}`);
    for (const id of row.datasets) assert.ok(datasets.has(id), `Missing dataset classification: ${id}`);
    assert.ok(row.evidence.length, `Missing definition evidence: ${row.name}`);
    for (const name of row.evidence) assert.ok(evidenceExists(name), `Missing evidence file: ${name}`);
  }
  const missingReceipts = [];
  for (const manifest of manifests) {
    const id = manifest.dataset_id;
    const entry = datasets.get(id);
    assert.ok(entry, `Missing dataset classification: ${id}`);
    // Explicit allowlist prevents unchecked provenance/vintage extensions from silently passing.
    for (const key of Object.keys(manifest)) assert.ok([...manifestFields, "known_limitations", "dependent_database_objects"].includes(key), `Unsupported manifest field: ${key}`);
    for (const field of manifestFields) nonempty(manifest[field], `${id}.${field}`);
    for (const field of unknownFields) {
      assert.ok(["unknown", "unverified"].includes(manifest[field]), `${id}.${field}: known metadata requires source/receipt evidence; event, row and commit timestamps are not vintage`);
    }
    for (const field of ["known_limitations", "dependent_database_objects"]) {
      assert.ok(Array.isArray(manifest[field]) && manifest[field].length, `${id}.${field}: nonempty array required`);
      for (const value of manifest[field]) nonempty(value, field);
    }
    assert.equal(entry.completeness, "UNKNOWN", `${id}: completeness not established`);
    assert.equal(entry.population, "NOT_REPRODUCIBLE", `${id}: imports not controlled`);
    for (const field of ["sourceArtifact", "acquisitionReceipt", "importReceipt"]) {
      assert.equal(entry[field], null, `${id}.${field}: receipt/artifact verification requires an evidence-contract upgrade`);
    }
    missingReceipts.push(`${id}: source artifact, acquisition receipt and import receipt MISSING; vintage UNKNOWN`);
  }
  for (const id of datasets.keys()) assert.ok(manifestMap.has(id), `Missing manifest: ${id}`);
  const freshness = sources["lib/source-freshness.ts"];
  assert.ok(freshness, "Source freshness adapter must be scanned");
  const freshnessAst = ts.createSourceFile("freshness.ts", freshness, ts.ScriptTarget.Latest, true);
  const timestampFields = { effectiveAt: "source_publication_or_effective_date", retrievedAt: "acquisition_timestamp", importedAt: "import_timestamp" };
  const checkedFields = new Set();
  function checkTimestamps(node) {
    if (ts.isPropertyAssignment(node) && Object.hasOwn(timestampFields, node.name.getText(freshnessAst))) {
      const name = node.name.getText(freshnessAst);
      assert.equal(node.initializer.getText(freshnessAst), `known(manifest.${timestampFields[name]})`, `${name}: only the corresponding manifest timestamp is allowed; event dates are not vintage`);
      checkedFields.add(name);
    }
    ts.forEachChild(node, checkTimestamps);
  }
  checkTimestamps(freshnessAst);
  assert.equal(checkedFields.size, 3, "All provenance timestamps must be checked");
  let reads = 0;
  let provenanceCalls = 0;
  for (const [filename, source] of Object.entries(sources)) {
    const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    assert.equal(ast.parseDiagnostics.length, 0, `Invalid source syntax: ${filename}`);
    function literal(node, label) {
      assert.ok(node && ts.isStringLiteralLike(node), `${label}: dynamic identifier requires explicit audit`);
      return node.text;
    }
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (ts.isPropertyAccessExpression(callee) && ["from", "rpc"].includes(callee.name.text)) {
          const name = literal(node.arguments[0], "Database source");
          assert.ok(objects.has(name), `Unclassified runtime source: ${name}`);
          assert.equal(objects.get(name).scope, "runtime", `Wrong runtime scope: ${name}`);
          reads++;
        }
        if (ts.isIdentifier(callee) && callee.text === "buildTruthProvenance") {
          const id = literal(node.arguments[0], "Truth dataset");
          const sourceId = literal(node.arguments[1], "Truth source");
          assert.ok(manifestMap.has(id), `Missing truth manifest: ${id}`);
          assert.ok(objects.get(sourceId)?.datasets.includes(id), `Unmapped truth source: ${sourceId}/${id}`);
          provenanceCalls++;
        }
        if (ts.isIdentifier(callee) && callee.text === "manifestById") {
          const arg = node.arguments[0];
          if (arg && ts.isStringLiteralLike(arg)) {
            assert.ok(manifestMap.has(arg.text), "Missing source registry manifest");
          } else {
            let enclosing = node.parent;
            while (enclosing && !ts.isFunctionDeclaration(enclosing)) enclosing = enclosing.parent;
            assert.ok(filename === "lib/source-freshness.ts" && enclosing?.name?.text === "buildTruthProvenance"
              && arg && ts.isIdentifier(arg) && arg.text === "datasetId",
            "Dynamic source registry identifier requires explicit audit");
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  assert.ok(reads > 0 && provenanceCalls > 0, "Canonical source scan must not be empty");
  return { objects: objects.size, datasets: datasets.size, reads, provenanceCalls, missingReceipts };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = validateFoundation(loadFoundation());
  console.log(`Foundation evidence checks passed: ${result.objects} objects, ${result.datasets} datasets, ${result.reads} reads, ${result.provenanceCalls} truth mappings.`);
  for (const gap of result.missingReceipts) console.log(`GAP: ${gap}`);
  console.log("PASS means explicit, consistent inventory; it does not mean reproducible data or verified production state.");
}

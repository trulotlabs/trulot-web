import assert from "node:assert/strict";
import { loadFoundation, validateFoundation } from "./verify-parcel-foundation.mjs";

const original = loadFoundation();
function fixture() {
  return { ...structuredClone({ catalog: original.catalog, manifests: original.manifests, sources: original.sources }), evidenceExists: original.evidenceExists };
}
let cases = 0;
function rejects(label, mutate, pattern) {
  const input = fixture();
  mutate(input);
  assert.throws(() => validateFoundation(input), pattern, label);
  cases++;
}
const result = validateFoundation(fixture());
assert.equal(result.objects, 14);
assert.equal(result.datasets, 5);
assert.equal(result.missingReceipts.length, 5);
assert.ok(result.missingReceipts.every((gap) => gap.includes("acquisition receipt and import receipt MISSING")));
cases++;
rejects("critical node absent", (x) => x.catalog.objects.shift(), /Missing critical classification/);
rejects("unclassified upstream", (x) => x.catalog.objects[0].dependencies.push("missing_upstream"), /Unclassified dependency/);
rejects("missing evidence path", (x) => { x.evidenceExists = () => false; }, /Missing evidence file/);
rejects("invalid status", (x) => { x.catalog.objects[0].definition = "ready"; }, /Invalid definition/);
rejects("false verified object", (x) => { x.catalog.objects[0].provenance = "VERIFIED"; }, /VERIFIED requires/);
rejects("false verified dataset", (x) => { x.catalog.datasets[0].provenance = "VERIFIED"; }, /VERIFIED requires/);
rejects("absent unknown", (x) => { delete x.manifests[0].import_timestamp; }, /explicit value required/);
rejects("blank unknown", (x) => { x.manifests[0].checksum = " "; }, /explicit value required/);
rejects("unsupported verified manifest", (x) => { x.manifests[0].verified = true; }, /Unsupported manifest field/);
rejects("event date masquerading as vintage", (x) => { x.manifests[0].source_publication_or_effective_date = "2026-07-11"; }, /known metadata requires source\/receipt evidence/);
rejects("fabricated acquisition", (x) => { x.manifests[0].acquisition_timestamp = "2026-07-11T00:00:00Z"; }, /known metadata requires/);
rejects("fabricated checksum", (x) => { x.manifests[0].checksum = "a".repeat(64); }, /known metadata requires/);
rejects("receipt omission", (x) => { delete x.catalog.datasets[0].importReceipt; }, /evidence-contract upgrade/);
rejects("documentation is not receipt", (x) => { x.catalog.datasets[0].importReceipt = "AGENTS.md"; }, /evidence-contract upgrade/);
rejects("missing manifest", (x) => x.manifests.shift(), /Missing manifest/);
rejects("duplicate manifest", (x) => x.manifests.push(x.manifests[0]), /Duplicate dataset_id/);
rejects("new dataset unclassified", (x) => x.manifests.push({ ...x.manifests[0], dataset_id: "new_source" }), /Missing dataset classification/);
rejects("new runtime dependency", (x) => { x.sources["lib/parcel-page-v1.ts"] += '\nsupabase.from("unreviewed_source");'; }, /Unclassified runtime source/);
rejects("dynamic dependency", (x) => { x.sources["lib/parcel-page-v1.ts"] += '\nsupabase.from(tableName);'; }, /dynamic identifier/);
rejects("source ID mismatch", (x) => { x.sources["lib/parcel-page-v1.ts"] += '\nbuildTruthProvenance("parcel_base_sangis_v1", "tpa_official", "test");'; }, /Unmapped truth source/);
rejects("event timestamp in adapter", (x) => { x.sources["lib/source-freshness.ts"] = x.sources["lib/source-freshness.ts"].replace("known(manifest.source_publication_or_effective_date)", "known(manifest.generated_at)"); }, /event dates are not vintage/);
rejects("false completeness", (x) => { x.catalog.datasets[0].completeness = "VERIFIED"; }, /completeness not established/);
rejects("false import reproducibility", (x) => { x.catalog.datasets[0].population = "REPRODUCIBLE"; }, /imports not controlled/);
rejects("dynamic registry identifier", (x) => { x.sources["lib/source-freshness.ts"] += '\nmanifestById(unreviewedDataset);'; }, /Dynamic source registry identifier/);
console.log(`Parcel foundation acceptance tests passed (${cases} cases). No database or network access.`);

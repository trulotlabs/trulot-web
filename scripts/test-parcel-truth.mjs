import assert from "node:assert/strict";
import path from "node:path";
import { fixture, root, renderToStaticMarkup } from "./parcel-v1-test-fixture.mjs";

const overlay = { tpa: true, ctcac: false, sda: true };
const cases = [
  ["core row and linked permit", {}],
  ["successful core empty", { coreData: null }, "not_found"],
  ["core query error", { coreError: { code: "42501" } }, "source_unavailable"],
  ["core rejected request", { coreReject: true }, "source_unavailable"],
  ["malformed core row", { coreData: {} }, "source_unavailable"],
  ["undefined core response", { coreData: undefined }, "source_unavailable"],
  ["successful empty permit list", { permitData: [] }],
  ["permit query error", { permitError: { code: "42501" } }],
  ["permit rejected request", { permitReject: true }],
  ["null permit list", { permitData: null }],
  ["object permit list", { permitData: {} }],
  ["null permit row", { permitData: [null] }],
  ["unidentifiable permit row", { permitData: [{}] }],
  ["overlay unavailable", { error: { code: "42501" } }],
  ["overlays and permits unavailable", { error: { code: "42501" }, permitError: { code: "42501" } }],
  ["ambiguous linked evidence", { permitData: [{ record_id: "AMBIGUOUS", apn_norm: "", linkage_confidence: "parsed_apn", apn_candidates: ["3113333800", "1234567890"] }] }],
  ["missing address remains null in identity truth", { parcelFields: { address: null } }],
];
for (const [name, options, expected = "partial"] of cases) {
  const f = fixture(overlay, options);
  const loader = f.load(path.join(root, "lib/parcel-page-v1.ts"));
  const result = await loader.getParcelPageV1Result("3113333800");
  assert.equal(result.status, expected, name);
  const Page = f.load(path.join(root, "app/parcel/san-diego/[slug]/page.tsx")).default;
  const params = Promise.resolve({ slug: result.data?.canonicalSlug ?? "apn-3113333800" });
  if (expected === "not_found") {
    assert.equal(result.truth.parcel.state, "supported", name);
    assert.equal(result.truth.parcel.value, false, name);
    assert.equal(result.truth.parcel.sourceState, "available", name);
    await assert.rejects(Page({ params }), /parcel 404/, name);
  } else if (expected === "source_unavailable") {
    assert.equal(result.truth.parcel.state, "unavailable", name);
    assert.equal(result.truth.parcel.value, null, name);
    assert.equal(result.truth.permits.sourceState, "not_evaluated", name);
    assert.match(renderToStaticMarkup(await Page({ params })), /temporarily unavailable/, name);
  } else {
    assert.equal(result.truth.parcel.state, "supported", name);
    assert.equal(result.truth.parcel.value.apn, "3113333800", name);
    if (options.parcelFields) assert.equal(result.truth.parcel.value.address, null, name);
    const unavailablePermits = options.permitError || options.permitReject || name.includes("permit list") && name !== "successful empty permit list" || name.includes("permit row");
    const partialPermits = name === "ambiguous linked evidence";
    const history = result.truth.permits;
    assert.equal(history.state, unavailablePermits ? "unavailable" : partialPermits ? "partial" : "supported", name);
    assert.equal(history.sourceState, unavailablePermits ? "source_unavailable" : partialPermits ? "partial" : "available", name);
    if (unavailablePermits) assert.equal(history.value, null, name);
    else assert.equal(history.value.length, options.permitData ? 0 : 1, name);
    assert.equal(result.truth.overlays.tpa.state, options.error ? "unavailable" : "supported", name);
    assert.equal(result.truth.overlays.tpa.value, options.error ? null : true, name);
    assert.equal(result.truth.overlays.ctcac.value, options.error ? null : false, name);
    assert.equal(result.truth.overlays.sda.state, "unknown", name);
    assert.equal(result.truth.overlays.sda.value, null, name);
    assert.equal(result.truth.overlays.sda.derivation, "conditional", name);
    const html = renderToStaticMarkup(await Page({ params }));
    assert.match(html, /311-333-38-00/, name);
    if (unavailablePermits || partialPermits) {
      assert.match(html, unavailablePermits ? /Permit history unavailable/ : /Permit history incomplete/, name);
      assert.doesNotMatch(html, /No permits on record|No linked permits in this source|City permit records show no permits/, name);
    } else if (options.permitData) assert.match(html, /No linked permits in this source/, name);
    else assert.match(html, /FIXTURE-1/, name);
    assert.doesNotMatch(html, /private source failure/, name);
  }
  console.log(`PASS ${name}`);
}
for (const known of [false, true]) {
  const fields = known ? {
    source_publication_or_effective_date: "2026-01-01", acquisition_timestamp: "2026-01-02T00:00:00Z",
    import_timestamp: "2026-01-03T00:00:00Z", source_url_or_acquisition_location: "https://example.test/source",
  } : undefined;
  const f = fixture(overlay, { manifestFields: fields, parcelFields: { generated_at: "2026-02-01T00:00:00Z" } });
  const result = await f.load(path.join(root, "lib/parcel-page-v1.ts")).getParcelPageV1Result("3113333800");
  const p = result.truth.parcel.provenance;
  assert.equal(p.datasetId, "parcel_base_sangis_v1");
  assert.equal(p.sourceId, "parcel_page_api_v2");
  assert.equal(p.publisher, "SanGIS");
  assert.equal(p.sourceUrl, known ? fields.source_url_or_acquisition_location : "https://www.sangis.org/");
  assert.equal(p.effectiveAt, known ? fields.source_publication_or_effective_date : null);
  assert.equal(p.retrievedAt, known ? fields.acquisition_timestamp : null);
  assert.equal(p.importedAt, known ? fields.import_timestamp : null);
  assert.equal(p.viewCalculatedAt, "2026-02-01T00:00:00Z");
  assert.equal(result.truth.permits.provenance.viewCalculatedAt, null);
  assert.equal(result.truth.parcel.derivation, "recorded");
  assert.equal(result.truth.permits.derivation, "deterministic_derived");
  console.log(`PASS ${known ? "known provenance retained" : "unknown provenance stays null"}`);
}
console.log("Parcel truth regressions passed: 19 cases.");

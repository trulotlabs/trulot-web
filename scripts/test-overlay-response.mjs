import assert from "node:assert/strict";
import path from "node:path";
import { fixture, root, renderToStaticMarkup } from "./parcel-v1-test-fixture.mjs";

const valid = { tpa: true, ctcac: true, sda: false };
const validCases = [
  ["both positive", valid],
  ["both negative", { tpa: false, ctcac: false, sda: false }],
  ["TPA positive only", { tpa: true, ctcac: false, sda: true }],
  ["CTCAC positive only", { tpa: false, ctcac: true, sda: false }],
  ["extra metadata", { ...valid, version: "fixture" }],
];
const invalidCases = [
  ["null payload", null], ["undefined payload", undefined], ["empty object", {}], ["array payload", []],
  ["string payload", "false"], ["boolean payload", false], ["numeric payload", 1],
  ["missing TPA", { ctcac: true, sda: true }], ["missing CTCAC", { tpa: true, sda: true }],
  ["missing SDA", { tpa: true, ctcac: true }],
  ["inherited fields", Object.create(valid)],
];
for (const field of ["tpa", "ctcac", "sda"]) {
  for (const [label, value] of [["string true", "true"], ["string false", "false"], ["one", 1], ["zero", 0], ["null", null], ["undefined", undefined], ["object", {}], ["array", []]]) {
    invalidCases.push([`${field}: ${label}`, { ...valid, [field]: value }]);
  }
}
const cases = [
  ...validCases.map(([name, payload]) => ({ name, payload, available: true })),
  ...invalidCases.map(([name, payload]) => ({ name, payload, available: false })),
  { name: "RPC error overrides valid payload", payload: valid, options: { error: { code: "42501", message: "private diagnostic" } } },
  { name: "RPC rejection", payload: valid, options: { rejects: true } },
  { name: "missing coordinates", payload: valid, options: { coordinates: false } },
];
for (const { name, payload, available = false, options = {} } of cases) {
  const f = fixture(payload, options);
  const parser = f.load(path.join(root, "lib/overlay-response.ts"));
  const parsed = parser.parseOverlayResponse(payload);
  const structurallyValid = validCases.some(([, value]) => value === payload);
  assert.equal(parsed.status, structurallyValid ? "found" : "source_unavailable", name);
  if (!structurallyValid) assert.equal(parsed.data, null, name);
  else for (const field of ["tpa", "ctcac", "sda"]) assert.equal(parsed.data[field], payload[field], name);

  const adapter = f.load(path.join(root, "lib/parcel-page-v1.ts"));
  const result = await adapter.getParcelPageV1Result("3113333800");
  assert.equal(result.status, "partial", name); // SDA is pending even with a valid RPC.
  assert.equal(result.sourceStatus.parcel.status, "found", name);
  assert.equal(result.sourceStatus.permits.status, "found", name);
  assert.equal(result.data.identity.address, "123 Fixture St", name);
  assert.equal(result.data.permits.thisParcel[0].permitNumber, "FIXTURE-1", name);
  assert.equal(result.sourceStatus.sda.authoritative, false, name);
  assert.equal(result.sourceStatus.sda.state, "source_reconciliation_pending", name);
  assert.equal(result.sourceStatus.sda.observedMembership, available ? payload.sda ? "inside" : "outside" : "unavailable", name);
  for (const field of ["tpa", "ctcac"]) {
    assert.equal(result.truth.overlays[field].state, available ? "supported" : "unavailable", name);
    assert.equal(result.truth.overlays[field].value, available ? payload[field] : null, name);
    assert.equal(result.truth.overlays[field].sourceState, available ? "available" : "source_unavailable", name);
  }
  assert.equal(result.truth.overlays.sda.state, "unknown", name);
  assert.equal(result.truth.overlays.sda.value, null, name);
  const tpa = result.data.zoning.programs.find(p => p.name === "Transit Priority Area");
  const summary = result.data.facts.find(f => f.label === "Overlays").fact.value;
  if (available) {
    assert.equal(result.sourceStatus.overlays.status, payload.tpa || payload.ctcac ? "found" : "not_found", name);
    assert.equal(tpa.value, payload.tpa ? "Applies per mapped overlay" : "Does not appear to apply — parcel is outside the current mapped TPA overlay", name);
    assert.equal(summary.includes("CTCAC mapped area"), payload.ctcac, name);
  } else {
    assert.equal(result.sourceStatus.overlays.status, "source_unavailable", name);
    assert.equal(tpa.value, null, name);
    assert.match(summary, /lookup is also temporarily unavailable/, name);
    assert.ok(!result.data.signals.some(s => /TPA overlay/.test(s.value ?? "")), name);
    assert.equal(result.sourceStatus.overlays.safeErrorCode, options.error ? "permission_denied" : options.rejects ? "query_failed" : options.coordinates === false ? "missing_input" : "schema_mismatch", name);
  }
  const Page = f.load(path.join(root, "app/parcel/san-diego/[slug]/page.tsx")).default;
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: result.data.canonicalSlug }) }));
  assert.match(html, /123 Fixture St/, name);
  assert.match(html, /FIXTURE-1/, name);
  assert.match(html, /SDA source reconciliation pending/, name);
  if (!available) {
    assert.doesNotMatch(html, /Applies per mapped overlay|outside the current mapped TPA|No TPA or CTCAC overlay|Mapped TPA overlay|Other mapped overlays:|CTCAC mapped area/, name);
    assert.doesNotMatch(html, /private diagnostic|private transport diagnostic/, name);
    assert.match(html, /Source unavailable/, name);
  }
  assert.equal(f.rpcCalls(), options.coordinates === false ? 0 : 2, name);
  console.log(`PASS ${name}`);
}
console.log(`Overlay parser, adapter and rendered-page regressions passed: ${cases.length} cases.`);

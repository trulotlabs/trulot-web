import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Execute the real TS modules and page with only the database/network boundary
// replaced. Unknown imports fail closed; no credentials or network are exposed.
function fixture(payload, { error = null, rejects = false, coordinates = true } = {}) {
  let rpcCalls = 0;
  const parcel = {
    apn_norm: "3113333800", address: "123 Fixture St", city: "San Diego", state: "CA",
    zone_name: "RS-1-7", base_zone: "RS-1-7", lot_area_sqft: 7000,
    lat: coordinates ? 32.75 : null, lng: coordinates ? -117.19 : null,
  };
  const permit = {
    apn_norm: parcel.apn_norm, matched_parcel_apn_norm: parcel.apn_norm,
    record_id: "FIXTURE-1", record_number: "FIXTURE-1", record_type: "Building permit",
    description: "Fixture roof repair", status: "Issued", opened_date: "2026-01-01",
    linkage_confidence: "exact_apn", apn_candidates: [parcel.apn_norm],
  };
  const client = {
    from(name) {
      assert.ok(["parcel_page_api_v2", "trulot_permit_parcel_link_v1"].includes(name), `Unexpected query: ${name}`);
      let single = false;
      const query = {
        then(resolve, reject) {
          const data = name === "trulot_permit_parcel_link_v1" ? [permit] : single ? parcel : [];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      for (const method of ["select", "eq", "in", "order", "gte", "lte", "neq", "limit"]) query[method] = () => query;
      query.maybeSingle = () => { single = true; return query; };
      return query;
    },
    async rpc(name, args) {
      rpcCalls++;
      assert.equal(name, "check_parcel_overlays");
      assert.equal(args.p_lat, parcel.lat);
      assert.equal(args.p_lng, parcel.lng);
      if (rejects) throw new Error("private transport diagnostic");
      return { data: payload, error };
    },
  };
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    if (filename.endsWith(".json")) return JSON.parse(fs.readFileSync(filename, "utf8"));
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule.exports);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    function localRequire(id) {
      if (id === "@supabase/supabase-js") return { createClient: () => client };
      if (id === "react/jsx-runtime") return require(id);
      if (id === "next/link") return function FixtureLink({ children, ...props }) { return React.createElement("a", props, children); };
      if (id === "next/navigation") return {
        notFound() { throw new Error("Unexpected parcel 404"); },
        redirect() { throw new Error("Unexpected redirect"); },
      };
      assert.ok(id.startsWith("./") || id.startsWith("@/"), `Unexpected import: ${id}`);
      const target = id.startsWith("@/") ? path.join(root, id.slice(2)) : path.resolve(path.dirname(filename), id);
      return load(path.extname(target) ? target : `${target}.ts`);
    }
    vm.runInNewContext(code, {
      module: loadedModule, exports: loadedModule.exports, require: localRequire, process: { env: {} },
    }, { filename });
    return loadedModule.exports;
  }
  return { load, rpcCalls: () => rpcCalls };
}
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
    assert.match(html, /Overlay lookup unavailable/, name);
  }
  assert.equal(f.rpcCalls(), options.coordinates === false ? 0 : 2, name);
  console.log(`PASS ${name}`);
}
console.log(`Overlay parser, adapter and rendered-page regressions passed: ${cases.length} cases.`);

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const React = require("react");
export const { renderToStaticMarkup } = require("react-dom/server");

// Execute the real TS modules and page with only the database/network boundary
// replaced. Unknown imports fail closed; no credentials or network are exposed.
export function fixture(payload, options = {}) {
  const { error = null, rejects = false, coordinates = true } = options;
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
          const core = name === "parcel_page_api_v2" && single;
          const history = name === "trulot_permit_parcel_link_v1";
          if ((core && options.coreReject) || (history && options.permitReject)) {
            return Promise.reject(new Error("private source failure")).then(resolve, reject);
          }
          const data = history ? ("permitData" in options ? options.permitData : [permit])
            : core ? ("coreData" in options ? options.coreData : { ...parcel, ...options.parcelFields }) : [];
          return Promise.resolve({ data, error: core ? options.coreError ?? null : history ? options.permitError ?? null : null }).then(resolve, reject);
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
    if (filename.endsWith(".json")) {
      const json = JSON.parse(fs.readFileSync(filename, "utf8"));
      return filename.includes("dataset-manifests") && options.manifestFields
        ? json.map(entry => ({ ...entry, ...options.manifestFields })) : json;
    }
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule.exports);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    function localRequire(id) {
      if (id === "@/lib/rs17-runtime-shadow" && options.shadowRenderer) return { renderRs17RuntimeShadow: options.shadowRenderer };
      if (id === "@supabase/supabase-js") return { createClient: () => client };
      if (id === "server-only") return {};
      if (id === "zod") return require(id);
      if (id === "react") return React;
      if (id.startsWith("node:")) return require(id);
      if (id === "react/jsx-runtime") return require(id);
      if (id === "next/link") return function FixtureLink({ children, ...props }) { return React.createElement("a", props, children); };
      if (id === "next/server") return { after(callback) { if (options.runAfter) return callback(); } };
      if (id === "next/navigation") return {
        notFound() { throw new Error("Unexpected parcel 404"); },
        redirect() { throw new Error("Unexpected redirect"); },
      };
      assert.ok(id.startsWith("./") || id.startsWith("../") || id.startsWith("@/"), `Unexpected import: ${id}`);
      const target = id.startsWith("@/") ? path.join(root, id.slice(2)) : path.resolve(path.dirname(filename), id);
      if (path.extname(target)) return load(target);
      if (fs.existsSync(`${target}.ts`)) return load(`${target}.ts`);
      return load(`${target}.tsx`);
    }
    vm.runInNewContext(code, {
      module: loadedModule, exports: loadedModule.exports, require: localRequire, process: { env: options.env ?? {} }, Buffer, performance,
    }, { filename });
    return loadedModule.exports;
  }
  return { load, rpcCalls: () => rpcCalls };
}

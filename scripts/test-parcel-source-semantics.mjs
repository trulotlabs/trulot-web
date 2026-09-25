import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "lib/parcel-source-semantics.ts"), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loadedModule = { exports: {} };
vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports });

const { classifyParcelSearchQuery, classifyParcelRecordQuery } = loadedModule.exports;

const searchFailure = classifyParcelSearchQuery(null, { code: "522" });
assert.equal(searchFailure.status, "source_unavailable");
assert.equal(searchFailure.httpStatus, 503);
assert.equal(searchFailure.rows.length, 0);

const searchEmpty = classifyParcelSearchQuery([], null);
assert.equal(searchEmpty.status, "not_found");
assert.equal(searchEmpty.httpStatus, 200);
assert.equal(searchEmpty.rows.length, 0);

const legacyFailure = classifyParcelRecordQuery(null, { code: "522" });
assert.equal(legacyFailure.status, "source_unavailable");
assert.equal(legacyFailure.httpStatus, 503);
assert.equal(legacyFailure.data, null);

const legacyMissing = classifyParcelRecordQuery(null, null);
assert.equal(legacyMissing.status, "not_found");
assert.equal(legacyMissing.httpStatus, 404);
assert.equal(legacyMissing.data, null);

const row = { apn_norm: "2421001000" };
assert.equal(classifyParcelRecordQuery(row, null).data, row);
assert.equal(classifyParcelSearchQuery([row], null).rows[0], row);

console.log("Parcel source semantics passed: search failure/empty and legacy failure/missing remain distinct.");

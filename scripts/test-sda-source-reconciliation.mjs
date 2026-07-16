import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulePath = path.join(ROOT, "lib", "sda-source-reconciliation.ts");
const source = fs.readFileSync(modulePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: modulePath,
});
const exports = {};
vm.runInNewContext(transpiled.outputText, { exports }, { filename: modulePath });

const {
  applySdaReconciliationPolicy,
  canUseSdaForRegulatoryConclusion,
  formatUnaffectedOverlaySummary,
  publicSdaApiStatus,
  SDA_RECONCILIATION_LABEL,
  SDA_RECONCILIATION_MESSAGE,
} = exports;

const positive = applySdaReconciliationPolicy(true);
assert.equal(positive.observedMembership, "inside");
assert.equal(positive.state, "source_reconciliation_pending");
assert.equal(positive.authoritative, false);

const negative = applySdaReconciliationPolicy(false);
assert.equal(negative.observedMembership, "outside");
assert.equal(negative.state, "source_reconciliation_pending");
assert.notEqual(negative.state, "outside");

const missing = applySdaReconciliationPolicy(null);
assert.equal(missing.observedMembership, "unavailable");
assert.equal(missing.state, "source_reconciliation_pending");

for (const status of [positive, negative, missing]) {
  assert.equal(canUseSdaForRegulatoryConclusion(status), false);
  assert.equal(status.publicLabel, "SDA source reconciliation pending");
  assert.match(status.publicMessage, /temporarily unavailable/i);
}

const unaffectedPositive = formatUnaffectedOverlaySummary({ tpa: true, ctcac: false, lookupUnavailable: false });
assert.match(unaffectedPositive, /Transit Priority Area/);
assert.match(unaffectedPositive, /SDA source reconciliation pending/);
const unaffectedNegative = formatUnaffectedOverlaySummary({ tpa: false, ctcac: false, lookupUnavailable: false });
assert.match(unaffectedNegative, /No TPA or CTCAC overlay/);
assert.doesNotMatch(unaffectedNegative, /No mapped overlays/);

const api = publicSdaApiStatus();
assert.equal(api.authoritative, false);
assert.equal(api.state, "source_reconciliation_pending");
assert.equal(api.label, SDA_RECONCILIATION_LABEL);
assert.equal(api.message, SDA_RECONCILIATION_MESSAGE);

const parcelAdapter = fs.readFileSync(path.join(ROOT, "lib", "parcel-page-v1.ts"), "utf8");
assert.doesNotMatch(parcelAdapter, /outside the current mapped SDA overlay/);
assert.match(parcelAdapter, /applySdaReconciliationPolicy/);
assert.doesNotMatch(parcelAdapter, /applySdaReconciliationPolicy\(Boolean\(data\.sda\)\)/);
assert.match(parcelAdapter, /typeof data\.sda === "boolean" \? data\.sda : null/);
const page = fs.readFileSync(path.join(ROOT, "app", "parcel", "san-diego", "[slug]", "page.tsx"), "utf8");
assert.match(page, /SDA source reconciliation pending/);
assert.match(page, /SDA status is temporarily unavailable/);
const legacyApi = fs.readFileSync(path.join(ROOT, "app", "api", "parcel", "[apn]", "route.ts"), "utf8");
assert.match(legacyApi, /source_reconciliation/);
assert.match(legacyApi, /publicSdaApiStatus/);

console.log(JSON.stringify({
  result: "SDA reconciliation behavior tests passed",
  cases: [
    "positive database observation remains non-authoritative",
    "negative database observation is not ordinary false",
    "missing observation remains pending",
    "derived regulatory conclusion is blocked",
    "TPA and CTCAC remain independently truthful",
    "public API and page wording are explicit",
  ],
}));

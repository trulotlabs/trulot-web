#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const origin = process.env.PARCEL_LOOKUP_ORIGIN ?? "http://127.0.0.1:3216";
const reportPath = path.join(root, "data/parcel-lookup-production-v0/feature-flag-off.json");
const results = [];
for (const pathname of ["/parcel-lookup", "/api/parcel-lookup?q=5442140600"]) {
  const response = await fetch(`${origin}${pathname}`, { redirect: "manual" });
  results.push({ pathname, status: response.status });
  assert.equal(response.status, 404, `${pathname} must fail closed when the flag is off`);
}
const report = {
  contractVersion: "parcel-lookup-production-v0-feature-flag-off-2026-10-01-p45",
  evidence: "LOCAL_PRODUCTION_SHAPED_EVIDENCE",
  productionAccessed: false,
  environment: { TRULOT_PARCEL_LOOKUP_V0: "0" },
  results,
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS Packet 45 feature-flag-off containment\n${JSON.stringify(report, null, 2)}`);

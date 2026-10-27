import { performance } from "node:perf_hooks";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createSanDiegoPublicZoningReader } from "../../lib/san-diego-public-zoning-snapshot";

const apns = ["6341302200", "5442140600", "5333641301", "4304211000"];
const snapshot = apns.map((apn) => {
  const reader = createSanDiegoPublicZoningReader(); const start = performance.now(); const result = reader.lookup(apn); const coldMs = performance.now() - start;
  const warm: number[] = []; for (let i = 0; i < 100; i++) { const s = performance.now(); reader.lookup(apn); warm.push(performance.now() - s); }
  warm.sort((a, b) => a - b); return { apn, state: result.state, cacheKey: result.cacheKey, coldMs: +coldMs.toFixed(3), warmMedianMs: +warm[49].toFixed(4), warmP95Ms: +warm[94].toFixed(4) };
});
const route = Object.fromEntries(["on", "off"].map((mode) => {
  const path = `data/san-diego-canonical-identity-performance-repair-v0/browser-review-${mode}.json`;
  if (!existsSync(path)) return [mode, null];
  const rows = JSON.parse(readFileSync(path, "utf8")).reviewed; const values = rows.map((row: { elapsedMs: number }) => row.elapsedMs).sort((a: number, b: number) => a - b);
  return [mode, { cases: values.length, coldMs: values[values.length - 1], medianWarmMs: values[Math.floor(values.length / 2)], p95WarmMs: values[Math.floor(values.length * 0.95) - 1] }];
}));
const evidence = {
  measuredAt: "2026-10-27", environment: "local Node.js; repository snapshot; no network", snapshot,
  route, criticalPathModel: { before: "parcel -> permits -> overlays -> snapshot -> similar lots", after: "parcel -> snapshot -> max(permits, overlays, similar lots)", fixtureStageMs: { parcel: 80, permits: 120, overlays: 100, similarLots: 90 }, serialLowerBoundMs: 390, parallelLowerBoundMs: 200 },
  diagnosis: "Snapshot reads are bounded to one prefix shard and warm-cached. Duplicate metadata/page loader execution plus serial independent reads were local code defects; production region/network and cold-start variance require a canary.",
  budget: { snapshotColdWarningMs: 25, snapshotColdFailureMs: 50, snapshotWarmP95WarningMs: 1, snapshotWarmP95FailureMs: 2, routeCanaryWarningMs: 3000, routeCanaryHardFailureMs: 5000, basis: "Snapshot measurements plus observed Packet 87 7.1s/14.1s TTFB; thresholds require a materially faster retry while allowing server/network cold-start variance." },
};
writeFileSync(process.argv[2] ?? "data/san-diego-canonical-identity-performance-repair-v0/performance.json", `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence));

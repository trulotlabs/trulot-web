import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createSanDiegoPublicZoningReader } from "../../lib/san-diego-public-zoning-snapshot";

const output = process.argv[2] ?? "/private/tmp/packet85-runtime-benchmark.json";
const cases = ["3133421100", "5442140600", "6341302200"];
const measurements = cases.map((apn) => {
  const heapBefore = process.memoryUsage().heapUsed;
  const reader = createSanDiegoPublicZoningReader();
  const coldStart = performance.now();
  const cold = reader.lookup(apn);
  const coldLoadMs = performance.now() - coldStart;
  const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
  const warm: number[] = [];
  for (let index = 0; index < 100; index += 1) {
    const start = performance.now(); reader.lookup(apn); warm.push(performance.now() - start);
  }
  warm.sort((a, b) => a - b);
  return {
    apn, state: cold.state, cacheKey: cold.cacheKey,
    coldLoadMs: Number(coldLoadMs.toFixed(3)), heapDeltaBytes,
    warmMedianMs: Number(warm[49].toFixed(4)), warmP95Ms: Number(warm[94].toFixed(4)),
  };
});
const evidence = {
  measuredAt: "2026-10-27",
  environment: "local Node.js, repository artifacts, no network",
  measurements,
  note: "Heap deltas and wall-clock timings are operational observations, not deterministic integrity inputs.",
};
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence));

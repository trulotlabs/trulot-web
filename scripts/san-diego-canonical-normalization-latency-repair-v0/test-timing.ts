import assert from "node:assert/strict";
import { createParcelServerTiming, parcelServerTimingEnabled, type ParcelServerTimingMetric } from "../../lib/parcel-server-timing";

async function main() {
assert.equal(parcelServerTimingEnabled({}), false);
assert.equal(parcelServerTimingEnabled({ TRULOT_PARCEL_SERVER_TIMING: "1" }), true);
const metrics: ParcelServerTimingMetric[] = [];
const timer = createParcelServerTiming("metadata", { enabled: true, sink: (metric) => metrics.push(metric) });
timer.mark("route_entry");
await timer.measure("core_parcel", async () => 1);
timer.measureSync("zoning_snapshot", () => 1);
const finish = timer.begin("metadata_generation"); finish(); timer.finish();
assert.deepEqual(metrics.map((metric) => metric.stage), ["route_entry", "core_parcel", "zoning_snapshot", "metadata_generation", "total_server"]);
assert.ok(metrics.every((metric) => Object.keys(metric).toSorted().join(",") === "durationMs,event,invocation,operation,stage"));
assert.ok(metrics.every((metric) => metric.durationMs >= 0));
console.log(JSON.stringify({ result: "PASS", stages: metrics.map((metric) => metric.stage), sensitiveFields: 0 }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

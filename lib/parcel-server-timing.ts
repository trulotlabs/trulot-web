import { performance } from "node:perf_hooks";

export type ParcelServerStage = "route_entry" | "core_parcel" | "identity" | "zoning_snapshot" | "permits" | "overlays" | "similar_lots" | "feasibility_rules" | "metadata_generation" | "page_render_preparation" | "total_server";
export type ParcelServerTimingMetric = { event: "trulot_parcel_server_timing"; operation: "metadata" | "page"; stage: ParcelServerStage; durationMs: number; invocation: number };
type Sink = (metric: ParcelServerTimingMetric) => void;

export function parcelServerTimingEnabled(env: Readonly<Record<string, string | undefined>> = process.env) { return env.TRULOT_PARCEL_SERVER_TIMING === "1"; }
function defaultSink(metric: ParcelServerTimingMetric) { console.info(JSON.stringify(metric)); }

export function createParcelServerTiming(operation: "metadata" | "page", options: { enabled?: boolean; sink?: Sink } = {}) {
  const enabled = options.enabled ?? parcelServerTimingEnabled(); const sink = options.sink ?? defaultSink; const totalStart = performance.now();
  let invocation = 0;
  const emit = (stage: ParcelServerStage, start: number) => { invocation += 1; if (enabled) sink({ event: "trulot_parcel_server_timing", operation, stage, durationMs: +(performance.now() - start).toFixed(3), invocation }); };
  return {
    begin(stage: ParcelServerStage) { const start = performance.now(); return () => emit(stage, start); },
    async measure<T>(stage: ParcelServerStage, work: () => Promise<T>): Promise<T> { const start = performance.now(); try { return await work(); } finally { emit(stage, start); } },
    measureSync<T>(stage: ParcelServerStage, work: () => T): T { const start = performance.now(); try { return work(); } finally { emit(stage, start); } },
    mark(stage: ParcelServerStage) { const start = performance.now(); emit(stage, start); },
    finish() { emit("total_server", totalStart); },
  };
}

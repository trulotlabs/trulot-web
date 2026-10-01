import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  PARCEL_LOOKUP_PRODUCTION_V0_DEADLINE_MS,
  executeParcelLookupProduction,
  parcelLookupLengthBucket,
  parcelLookupTokenBucket,
  type ParcelLookupProductionOutcome,
  type ParcelLookupProductionRequest,
  type ParcelLookupProductionRpc,
  type ParcelLookupProductionRpcRow,
} from "./parcel-lookup-production-v0";
import { normalizeAddress } from "./parcel-lookup-contract";

type ServerEnvironment = Record<string, string | undefined>;

function runtimeRpc(environment: ServerEnvironment): ParcelLookupProductionRpc | null {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return async ({ query, queryType, limit }, signal) => {
    const response = await client
      .rpc("parcel_lookup_v0_search", { p_query: query, p_query_type: queryType, p_limit: limit })
      .abortSignal(signal);
    if (response.error) throw new Error("parcel_lookup_rpc_failed");
    return (response.data ?? []) as ParcelLookupProductionRpcRow[];
  };
}

export async function runParcelLookupProduction(
  request: ParcelLookupProductionRequest,
  options: {
    environment?: ServerEnvironment;
    rpc?: ParcelLookupProductionRpc;
    log?: (event: Record<string, unknown>) => void;
  } = {},
): Promise<ParcelLookupProductionOutcome> {
  const environment = options.environment ?? process.env;
  const rpc = options.rpc ?? runtimeRpc(environment);
  if (!rpc) {
    return {
      ok: false,
      status: 503,
      queryType: "INVALID",
      body: {
        contractVersion: "parcel-lookup-production-v0-p45",
        state: "SOURCE_UNAVAILABLE",
        message: "Parcel lookup is temporarily unavailable.",
        candidates: [],
        selected: null,
      },
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PARCEL_LOOKUP_PRODUCTION_V0_DEADLINE_MS);
  const started = performance.now();
  try {
    const outcome = await executeParcelLookupProduction(request, rpc, { signal: controller.signal });
    const normalized = normalizeAddress(request.query ?? "");
    (options.log ?? console.info)({
      event: "parcel_lookup_v0",
      queryType: outcome.queryType,
      queryLengthBucket: parcelLookupLengthBucket((request.query ?? "").trim().length),
      tokenCountBucket: parcelLookupTokenBucket(normalized.split(" ").filter(Boolean).length),
      latencyMs: Number((performance.now() - started).toFixed(1)),
      resultCount: outcome.ok ? outcome.body.returnedCount : 0,
      state: outcome.body.state,
      ambiguous: outcome.ok ? outcome.body.ambiguous : false,
      noMatch: outcome.ok && outcome.body.state === "NO_MATCH",
      errorClass: outcome.ok ? null : outcome.body.state,
    });
    return outcome;
  } finally {
    clearTimeout(timer);
  }
}

import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { ParcelPageV1Result } from "./parcel-page-v1";
import {
  compareParcelServingV2,
  getParcelServingV2Result,
  resolveV2RouteApn,
  type ParcelServingV2Query,
  type ParcelV2ShadowComparison,
} from "./parcel-serving-v2";

type ShadowEnvironment = Record<string, string | undefined>;

export function parcelServingV2ShadowEnabled(environment: ShadowEnvironment = process.env): boolean {
  if (environment.TRULOT_PARCEL_V2_SHADOW !== "1") return false;
  if (environment.VERCEL_ENV === "production") return false;
  if (environment.VERCEL_ENV === "preview") return true;
  return environment.NODE_ENV === "development" || environment.NODE_ENV === "test";
}

function runtimeQuery(environment: ShadowEnvironment): ParcelServingV2Query {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return async () => ({ data: undefined, error: { code: "missing_server_configuration" } });
  }
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    db: { schema: "trulot_v2" },
  });
  return async (apn) => {
    const { data, error } = await client
      .from("parcel_intelligence_serving_v2")
      .select("schema_version,parcel_acquisition_id,parcel_source_object_id,apn_norm,parcel_id,address,situs_components,situs_zip,jurisdiction,geom,centroid,point_on_surface,centroid_within,approximate_geometry_area_sqft,taxable_acreage,geometry_sha256,parcel_native_crs,parcel_artifact_crs,zoning_acquisition_id,mapping_method_version,zoning_mapping_state,dominant_zone_code,dominant_coverage_percent,secondary_coverage_percent,total_covered_percent,uncovered_percent,distinct_zone_count,repaired_source_feature_count,zoning_evidence,provenance")
      .eq("apn_norm", apn)
      .maybeSingle();
    return { data, error };
  };
}

export async function runParcelServingV2Shadow(
  slug: string,
  v1Result: ParcelPageV1Result,
  options: {
    environment?: ShadowEnvironment;
    query?: ParcelServingV2Query;
    log?: (event: { event: "parcel_v2_shadow_comparison"; comparison: ParcelV2ShadowComparison }) => void;
  } = {},
): Promise<void> {
  const environment = options.environment ?? process.env;
  if (!parcelServingV2ShadowEnabled(environment)) return;
  const routeIdentity = resolveV2RouteApn(slug);
  if (routeIdentity.status !== "exact") {
    const fields = {
      presence: "UNRESOLVED",
      apn: "LEGACY_SEMANTICS_UNKNOWN",
      address: "UNRESOLVED",
      zip: "UNRESOLVED",
      jurisdiction: "UNRESOLVED",
      coordinates: "UNRESOLVED",
      area: "LEGACY_SEMANTICS_UNKNOWN",
      baseZoning: "UNRESOLVED",
    } as const;
    (options.log ?? console.info)({
      event: "parcel_v2_shadow_comparison",
      comparison: { apn: "withheld", v1Status: v1Result.status, v2Status: "invalid_request", fields },
    });
    return;
  }
  try {
    const v2Result = await getParcelServingV2Result(routeIdentity.apn, options.query ?? runtimeQuery(environment));
    (options.log ?? console.info)({
      event: "parcel_v2_shadow_comparison",
      comparison: compareParcelServingV2(v1Result, v2Result, routeIdentity.apn),
    });
  } catch {
    // Shadow evaluation must never change, reject, or delay the public Parcel V1 result.
  }
}

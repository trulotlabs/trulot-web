import type { Metadata } from "next";
import {
  canonicalJurisdictionParcelPath,
  formatApnForDisplay,
  normalizeApnDigits,
  type ParcelJurisdictionSlug,
} from "./parcel-slug";

export const TRULOT_PRODUCTION_ORIGIN = "https://trulot.com" as const;

export type ParcelJurisdiction = "SAN_DIEGO" | "LA_MESA";
export type ParcelIndexState =
  | "INDEXABLE"
  | "NOINDEX_TEMPORARY"
  | "NOINDEX_INSUFFICIENT_CONTENT"
  | "NOINDEX_PRIVATE"
  | "NOT_FOUND"
  | "OUTSIDE_SCOPE";

export const PARCEL_INDEX_CONTROL = Object.freeze({
  killSwitch: true,
  activation: Object.freeze({ SAN_DIEGO: false, LA_MESA: false }),
});

export function sanDiegoIndexingRequested(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.TRULOT_SD_INDEXING === "1";
}

export type PublicRightsClass =
  | "PUBLIC_REDISPLAY_OK"
  | "PUBLIC_BOUNDED_SUMMARY_ONLY"
  | "PRIVATE_INTERNAL_ONLY"
  | "RIGHTS_UNCLEAR";

export type PublicParcelFieldName =
  | "apn"
  | "address"
  | "jurisdiction"
  | "zoningState"
  | "baseZoning"
  | "materialZoningContext"
  | "coastalContext"
  | "overlays"
  | "specificPlans"
  | "baseRuleSummaries"
  | "sources"
  | "activity";

export type RightsClassifiedField = {
  value: unknown;
  rights: PublicRightsClass;
  boundedValue?: unknown;
};

export type PublicParcelPayload = {
  apn: string;
  address: string | null;
  jurisdiction: string;
  zoningState?: string;
  baseZoning?: string | null;
  materialZoningContext?: unknown;
  coastalContext?: string | null;
  overlays?: unknown[];
  specificPlans?: unknown[];
  baseRuleSummaries?: unknown[];
  sources?: unknown[];
  activity?: unknown[];
};

const PUBLIC_FIELD_ALLOWLIST = new Set<PublicParcelFieldName>([
  "apn",
  "address",
  "jurisdiction",
  "zoningState",
  "baseZoning",
  "materialZoningContext",
  "coastalContext",
  "overlays",
  "specificPlans",
  "baseRuleSummaries",
  "sources",
  "activity",
]);

const JURISDICTION_SLUG: Record<ParcelJurisdiction, ParcelJurisdictionSlug> = {
  SAN_DIEGO: "san-diego",
  LA_MESA: "la-mesa",
};

export function canonicalParcelPathFor(
  jurisdiction: ParcelJurisdiction,
  apn: string,
  address?: string | null,
): string {
  return canonicalJurisdictionParcelPath(JURISDICTION_SLUG[jurisdiction], apn, address);
}

export function canonicalParcelUrl(
  jurisdiction: ParcelJurisdiction,
  apn: string,
  address?: string | null,
): string {
  return new URL(canonicalParcelPathFor(jurisdiction, apn, address), TRULOT_PRODUCTION_ORIGIN).toString();
}

export function effectiveParcelIndexState(
  jurisdiction: ParcelJurisdiction,
  requested: ParcelIndexState,
  env: Readonly<Record<string, string | undefined>> = process.env,
): ParcelIndexState {
  if (requested !== "INDEXABLE") return requested;
  if (
    PARCEL_INDEX_CONTROL.killSwitch
    || !PARCEL_INDEX_CONTROL.activation[jurisdiction]
    || (jurisdiction === "SAN_DIEGO" && !sanDiegoIndexingRequested(env))
  ) {
    return "NOINDEX_TEMPORARY";
  }
  return "INDEXABLE";
}

export function parcelRobotsFor(state: ParcelIndexState): NonNullable<Metadata["robots"]> {
  if (state === "INDEXABLE") return { index: true, follow: true };
  if (state === "NOINDEX_PRIVATE") {
    return { index: false, follow: false, noarchive: true, nosnippet: true };
  }
  return { index: false, follow: true, noarchive: true };
}

export function parcelHttpBehavior(state: ParcelIndexState): "PAGE_200" | "NOT_FOUND_404" {
  return state === "NOT_FOUND" || state === "OUTSIDE_SCOPE" ? "NOT_FOUND_404" : "PAGE_200";
}

export function serializePublicParcel(
  fields: Record<string, RightsClassifiedField | undefined>,
): { payload: PublicParcelPayload; excludedFields: string[] } {
  const output: Record<string, unknown> = {};
  const excludedFields: string[] = [];
  for (const [name, field] of Object.entries(fields)) {
    if (!field || !PUBLIC_FIELD_ALLOWLIST.has(name as PublicParcelFieldName)) {
      excludedFields.push(name);
      continue;
    }
    if (field.rights === "PUBLIC_REDISPLAY_OK") {
      output[name] = field.value;
      continue;
    }
    if (field.rights === "PUBLIC_BOUNDED_SUMMARY_ONLY" && field.boundedValue !== undefined) {
      output[name] = field.boundedValue;
      continue;
    }
    excludedFields.push(name);
  }
  const apn = typeof output.apn === "string" ? normalizeApnDigits(output.apn) : "";
  const jurisdiction = typeof output.jurisdiction === "string" ? output.jurisdiction : "";
  if (!/^\d{10}$/.test(apn) || !jurisdiction) {
    throw new Error("Public parcel identity is incomplete");
  }
  output.apn = apn;
  output.address = typeof output.address === "string" && output.address.trim()
    ? output.address.trim()
    : null;
  return { payload: output as PublicParcelPayload, excludedFields };
}

export function hasMeaningfulPublicParcelContent(payload: PublicParcelPayload): boolean {
  const parcelSpecificFacts = [
    payload.address,
    payload.baseZoning,
    payload.zoningState && payload.zoningState !== "UNMAPPED" ? payload.zoningState : null,
    payload.materialZoningContext,
    payload.coastalContext,
    payload.overlays?.length ? payload.overlays : null,
    payload.specificPlans?.length ? payload.specificPlans : null,
  ].filter(Boolean);
  return parcelSpecificFacts.length >= 2;
}

export function parcelPlaceJsonLd(payload: PublicParcelPayload): Record<string, unknown> {
  const json: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: payload.address ?? `APN ${formatApnForDisplay(payload.apn)}`,
    identifier: {
      "@type": "PropertyValue",
      name: "APN",
      value: formatApnForDisplay(payload.apn),
    },
  };
  if (payload.address) {
    json.address = {
      "@type": "PostalAddress",
      streetAddress: payload.address,
      addressLocality: payload.jurisdiction === "City of La Mesa" ? "La Mesa" : "San Diego",
      addressRegion: "CA",
    };
  }
  return json;
}

export function parcelMetadata(params: {
  payload: PublicParcelPayload;
  jurisdiction: ParcelJurisdiction;
  state: ParcelIndexState;
}): Metadata {
  const { payload, jurisdiction, state } = params;
  const place = payload.address ?? `APN ${formatApnForDisplay(payload.apn)}`;
  const details = [
    payload.baseZoning ? `mapped base zone ${payload.baseZoning}` : null,
    payload.zoningState && payload.zoningState !== "UNMAPPED" ? "parcel-specific zoning context" : null,
    payload.overlays?.length ? "mapped planning context" : null,
  ].filter(Boolean);
  const description = details.length
    ? `Public parcel record for ${place} (APN ${formatApnForDisplay(payload.apn)}) with ${details.join(" and ")}.`
    : `Public parcel identity for ${place} (APN ${formatApnForDisplay(payload.apn)}).`;
  return {
    title: `${place} — public parcel record | TruLot`,
    description,
    alternates: { canonical: canonicalParcelUrl(jurisdiction, payload.apn, payload.address) },
    robots: parcelRobotsFor(state),
    other: {
      "trulot:jurisdiction": payload.jurisdiction,
      "trulot:apn": formatApnForDisplay(payload.apn),
      "trulot:index-state": state,
    },
  };
}

export type ParcelIndexMetricName =
  | "route_2xx"
  | "route_404"
  | "source_unavailable"
  | "noindex"
  | "canonical_mismatch"
  | "sitemap_count"
  | "serializer_exclusion"
  | "privacy_filter_failure";

export type ParcelIndexMetric = {
  name: ParcelIndexMetricName;
  jurisdiction: ParcelJurisdiction;
  value: number;
};

function defaultParcelIndexMetricSink(metric: ParcelIndexMetric): void {
  console.info(JSON.stringify({
    event: "trulot_parcel_index",
    metric: metric.name,
    jurisdiction: metric.jurisdiction,
    value: metric.value,
  }));
}

export function emitParcelIndexMetric(
  sink: ((metric: ParcelIndexMetric) => void) | undefined,
  metric: ParcelIndexMetric,
): void {
  (sink ?? defaultParcelIndexMetricSink)(metric);
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  effectiveParcelIndexState,
  hasMeaningfulPublicParcelContent,
  serializePublicParcel,
  type ParcelIndexState,
  type PublicParcelPayload,
} from "./parcel-indexing";
import { normalizeApnDigits } from "./parcel-slug";

type IdentityRow = {
  apnNormalized: string;
  situsAddressRaw: string | null;
  unit: string | null;
  jurisdictionId: "CITY_OF_LA_MESA" | "JURISDICTION_UNRESOLVED";
  canonicalScopeState: "IN_SCOPE_CONFIRMED" | "JURISDICTION_UNRESOLVED";
  sourceVersion: string;
};

type ZoningRow = {
  apn: string;
  base_zoning_state: string;
  classification_confidence: string;
  jurisdiction_scope_state: string;
  selected_zone: string | null;
  material_zones: Array<{ code: string; parcel_coverage_pct: number }>;
  mapped_overlays: Array<{ code: string; mapped_state: string }>;
  specific_plans: Array<{ code: string; mapped_state: string }>;
  source_versions: Record<string, string>;
};

type RuleRow = {
  apn: string;
  readiness: string;
  selected_base_profile: string | null;
  unresolved_rule_families: string[];
};

export type LaMesaPublicParcelResult =
  | { state: "FOUND"; payload: PublicParcelPayload; canonicalAddress: string | null; indexState: ParcelIndexState }
  | { state: "NOT_FOUND" | "OUTSIDE_SCOPE"; payload: null; canonicalAddress: null; indexState: ParcelIndexState };

type PublicDataset = {
  identity: Map<string, IdentityRow>;
  zoning: Map<string, ZoningRow>;
  rules: Map<string, RuleRow>;
};

let cached: PublicDataset | null = null;

function loadRows<T>(relativePath: string): T[] {
  return gunzipSync(readFileSync(join(process.cwd(), relativePath)))
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function publicDataset(): PublicDataset {
  if (cached) return cached;
  const identities = loadRows<IdentityRow>("data/la-mesa-parcel-lookup-serving-v0/serving-rows.ndjson.gz");
  const zoning = loadRows<ZoningRow>("data/la-mesa-geometry-classification-v0/artifacts/parcel-classification.ndjson.gz");
  const rules = loadRows<RuleRow>("data/la-mesa-residential-rule-profile-v0/profile-selection.ndjson.gz");
  if (identities.length !== 17_391 || zoning.length !== identities.length || rules.length !== identities.length) {
    throw new Error("La Mesa public parcel artifacts do not reconcile");
  }
  cached = {
    identity: new Map(identities.map((row) => [row.apnNormalized, row])),
    zoning: new Map(zoning.map((row) => [row.apn, row])),
    rules: new Map(rules.map((row) => [row.apn, row])),
  };
  return cached;
}

function publicAddress(row: IdentityRow): string | null {
  if (!row.situsAddressRaw) return null;
  return row.unit && !row.situsAddressRaw.toUpperCase().includes(row.unit.toUpperCase())
    ? `${row.situsAddressRaw} Unit ${row.unit}`
    : row.situsAddressRaw;
}

export function getLaMesaPublicParcel(rawApn: string): LaMesaPublicParcelResult {
  const apn = normalizeApnDigits(rawApn);
  const dataset = publicDataset();
  const identity = dataset.identity.get(apn);
  if (!identity) return { state: "NOT_FOUND", payload: null, canonicalAddress: null, indexState: "NOT_FOUND" };
  if (identity.jurisdictionId !== "CITY_OF_LA_MESA" || identity.canonicalScopeState !== "IN_SCOPE_CONFIRMED") {
    return { state: "OUTSIDE_SCOPE", payload: null, canonicalAddress: null, indexState: "OUTSIDE_SCOPE" };
  }
  const zoning = dataset.zoning.get(apn);
  const rules = dataset.rules.get(apn);
  const address = publicAddress(identity);
  const { payload } = serializePublicParcel({
    apn: { value: apn, rights: "PUBLIC_REDISPLAY_OK" },
    address: { value: address, rights: "PUBLIC_REDISPLAY_OK" },
    jurisdiction: { value: "City of La Mesa", rights: "PUBLIC_REDISPLAY_OK" },
    zoningState: { value: zoning?.base_zoning_state ?? "UNMAPPED", rights: "PUBLIC_REDISPLAY_OK" },
    baseZoning: { value: zoning?.selected_zone ?? null, rights: "PUBLIC_REDISPLAY_OK" },
    materialZoningContext: {
      value: zoning?.material_zones ?? [],
      rights: "PUBLIC_BOUNDED_SUMMARY_ONLY",
      boundedValue: (zoning?.material_zones ?? []).map(({ code, parcel_coverage_pct }) => ({ code, parcelCoveragePercent: parcel_coverage_pct })),
    },
    overlays: {
      value: zoning?.mapped_overlays ?? [],
      rights: "PUBLIC_BOUNDED_SUMMARY_ONLY",
      boundedValue: (zoning?.mapped_overlays ?? []).map(({ code, mapped_state }) => ({ code, state: mapped_state })),
    },
    specificPlans: {
      value: zoning?.specific_plans ?? [],
      rights: "PUBLIC_BOUNDED_SUMMARY_ONLY",
      boundedValue: (zoning?.specific_plans ?? []).map(({ code, mapped_state }) => ({ code, state: mapped_state })),
    },
    baseRuleSummaries: {
      value: rules,
      rights: "PUBLIC_BOUNDED_SUMMARY_ONLY",
      boundedValue: rules ? [{ state: rules.readiness, profileAvailable: Boolean(rules.selected_base_profile), unresolvedFamilies: rules.unresolved_rule_families }] : [],
    },
    sources: {
      value: null,
      rights: "PUBLIC_BOUNDED_SUMMARY_ONLY",
      boundedValue: [
        { label: "SanGIS parcel identity", version: identity.sourceVersion },
        { label: "City of La Mesa mapped zoning and planning context", versions: zoning?.source_versions ?? {} },
        { label: "City of La Mesa published development rules", state: rules?.readiness ?? "RULE_PROFILE_UNAVAILABLE" },
      ],
    },
  });
  const requested: ParcelIndexState = hasMeaningfulPublicParcelContent(payload)
    ? "INDEXABLE"
    : "NOINDEX_INSUFFICIENT_CONTENT";
  return {
    state: "FOUND",
    payload,
    canonicalAddress: address,
    indexState: effectiveParcelIndexState("LA_MESA", requested),
  };
}

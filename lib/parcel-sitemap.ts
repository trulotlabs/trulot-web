import { canonicalParcelUrl, emitParcelIndexMetric, PARCEL_INDEX_CONTROL, type ParcelJurisdiction } from "./parcel-indexing";
import { sanDiegoPhaseALaunchEntries } from "./san-diego-phase-a-launch";

export const PARCEL_SITEMAP_SHARD_SIZE = 25_000;
export const FUTURE_COHORT_MAXIMUM = Object.freeze({
  SAN_DIEGO: 318_701,
  LA_MESA: 17_160,
});

export type ParcelSitemapCandidate = {
  apn: string;
  address: string | null;
  jurisdictionConfirmed: boolean;
  zoningState: string;
  publicOutputSatisfied: boolean;
  identitySafe: boolean;
  sourceUsable: boolean;
  thin: boolean;
  sourceLastModified: string;
};

export type ParcelSitemapActivation = {
  killSwitch: boolean;
  activation: Record<ParcelJurisdiction, boolean>;
};

export function isFuturePhaseACandidate(
  jurisdiction: ParcelJurisdiction,
  candidate: ParcelSitemapCandidate,
): boolean {
  if (!candidate.jurisdictionConfirmed || !candidate.publicOutputSatisfied || !candidate.identitySafe || !candidate.sourceUsable || candidate.thin) return false;
  if (!new Set(["SINGLE_ZONE", "BOUNDARY_SLIVER"]).has(candidate.zoningState)) return false;
  return jurisdiction === "SAN_DIEGO" || jurisdiction === "LA_MESA";
}

export function buildParcelSitemapShards(
  jurisdiction: ParcelJurisdiction,
  candidates: ParcelSitemapCandidate[],
  control: ParcelSitemapActivation = PARCEL_INDEX_CONTROL,
): Array<Array<{ url: string; lastModified: string }>> {
  if (control.killSwitch || !control.activation[jurisdiction]) return [];
  const entries = candidates
    .filter((candidate) => isFuturePhaseACandidate(jurisdiction, candidate))
    .toSorted((left, right) => left.apn.localeCompare(right.apn))
    .map((candidate) => ({
      url: canonicalParcelUrl(jurisdiction, candidate.apn, candidate.address),
      lastModified: candidate.sourceLastModified,
    }));
  const shards: Array<Array<{ url: string; lastModified: string }>> = [];
  for (let index = 0; index < entries.length; index += PARCEL_SITEMAP_SHARD_SIZE) {
    shards.push(entries.slice(index, index + PARCEL_SITEMAP_SHARD_SIZE));
  }
  return shards;
}

export function buildParcelSitemapIndex(
  jurisdiction: ParcelJurisdiction,
  candidates: ParcelSitemapCandidate[],
  control: ParcelSitemapActivation = PARCEL_INDEX_CONTROL,
): Array<{ url: string; lastModified: string }> {
  return buildParcelSitemapShards(jurisdiction, candidates, control).map((shard, index) => ({
    url: `https://trulot.com/sitemaps/parcels/${jurisdiction.toLowerCase().replaceAll("_", "-")}/${index}.xml`,
    lastModified: shard.reduce((latest, item) => item.lastModified > latest ? item.lastModified : latest, ""),
  }));
}

export function activeParcelSitemapEntries(): Array<{ url: string; lastModified: string }> {
  const sanDiegoActive = !PARCEL_INDEX_CONTROL.killSwitch
    && PARCEL_INDEX_CONTROL.activation.SAN_DIEGO
    && process.env.TRULOT_SD_INDEXING === "1"
    && process.env.TRULOT_SD_PUBLIC_ZONING_SNAPSHOT === "1";
  const entries = sanDiegoActive
    ? sanDiegoPhaseALaunchEntries().map((entry) => ({
        url: entry.canonicalUrl,
        lastModified: entry.lastmod,
      }))
    : [];
  emitParcelIndexMetric(undefined, { name: "sitemap_count", jurisdiction: "SAN_DIEGO", value: entries.length });
  emitParcelIndexMetric(undefined, { name: "sitemap_count", jurisdiction: "LA_MESA", value: 0 });
  return entries;
}

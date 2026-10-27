export { normalizeApnDigits, formatApnForDisplay } from "./parcel-slug-core";
import { normalizeApnDigits } from "./parcel-slug-core";
import { canonicalParcelIdentity, slugifyParcelAddress } from "./parcel-identity";

export const slugifyAddress = slugifyParcelAddress;

export function canonicalParcelSlug(apn: string, address?: string | null): string {
  return canonicalParcelIdentity({ apn, jurisdiction: "san-diego", address, provenance: "legacy-address-adapter" }).canonicalSlug;
}

export function canonicalParcelPath(apn: string, address?: string | null): string {
  return canonicalJurisdictionParcelPath("san-diego", apn, address);
}

export type ParcelJurisdictionSlug = "san-diego" | "la-mesa";

export function canonicalJurisdictionParcelPath(
  jurisdiction: ParcelJurisdictionSlug,
  apn: string,
  address?: string | null,
): string {
  return canonicalParcelIdentity({ apn, jurisdiction, address, provenance: "legacy-address-adapter" }).canonicalPath;
}

export function extractApnFromSlug(slug: string): string | null {
  const prefixed = slug.match(/^apn-(\d{8,10})$/i);
  if (prefixed) return normalizeApnDigits(prefixed[1]);

  const formatted = slug.match(/^(\d{3}-\d{3}-\d{2}(?:-\d{2})?)(?:-|$)/);
  if (formatted) return normalizeApnDigits(formatted[1]);

  const bare = slug.match(/^(\d{8,10})(?:-|$)/);
  if (bare) return normalizeApnDigits(bare[1]);

  return null;
}

import { normalizeApnDigits, formatApnForDisplay } from "./parcel-slug-core";

export const PARCEL_IDENTITY_VERSION = "parcel-identity-v1" as const;

export type ParcelIdentityJurisdiction = "san-diego" | "la-mesa";

export type CanonicalParcelIdentityInput = {
  apn: string;
  jurisdiction: ParcelIdentityJurisdiction;
  address?: string | null;
  unit?: string | null;
  provenance: string;
};

export type CanonicalParcelIdentity = {
  apn: string;
  jurisdiction: ParcelIdentityJurisdiction;
  canonicalDisplayAddress: string | null;
  unit: string | null;
  canonicalSlug: string;
  canonicalPath: string;
  canonicalUrl: string;
  identityProvenance: string;
  identityVersion: typeof PARCEL_IDENTITY_VERSION;
};

function normalizeText(value?: string | null): string | null {
  const normalized = (value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  return normalized || null;
}

export function slugifyParcelAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function canonicalParcelIdentity(input: CanonicalParcelIdentityInput): CanonicalParcelIdentity {
  const apn = normalizeApnDigits(input.apn);
  const address = normalizeText(input.address);
  const explicitUnit = normalizeText(input.unit);
  const embeddedUnit = address?.match(/(?:^|\s)(?:UNIT|APT|STE|SUITE|#)\s*([A-Z0-9][A-Z0-9 &\/-]*)$/)?.[1] ?? null;
  const unit = explicitUnit ?? embeddedUnit;
  const hasUnit = Boolean(address && unit && new RegExp(`(?:^|\\s)(?:UNIT|APT|STE|SUITE|#)\\s*${unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i").test(address));
  const canonicalDisplayAddress = address && explicitUnit && !hasUnit
    ? `${address} UNIT ${explicitUnit}`
    : address;
  const addressSlug = slugifyParcelAddress(canonicalDisplayAddress ?? "");
  const canonicalSlug = addressSlug
    ? `${formatApnForDisplay(apn)}-${addressSlug}`
    : `apn-${apn}`;
  const canonicalPath = `/parcel/${input.jurisdiction}/${canonicalSlug}`;
  return {
    apn,
    jurisdiction: input.jurisdiction,
    canonicalDisplayAddress,
    unit,
    canonicalSlug,
    canonicalPath,
    canonicalUrl: new URL(canonicalPath, "https://trulot.com").toString(),
    identityProvenance: input.provenance,
    identityVersion: PARCEL_IDENTITY_VERSION,
  };
}

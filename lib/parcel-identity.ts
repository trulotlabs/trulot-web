import { normalizeApnDigits, formatApnForDisplay } from "./parcel-slug-core";

export const PARCEL_IDENTITY_VERSION_V1 = "parcel-identity-v1" as const;
export const PARCEL_IDENTITY_VERSION = "parcel-identity-v2" as const;
export const PUBLIC_ADDRESS_VERSION = "public-address-v1" as const;

export type ParcelIdentityJurisdiction = "san-diego" | "la-mesa";
export type PublicAddressDirection = "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW";
export type StructuredPublicAddress = {
  houseNumber: string | null;
  preDirection: PublicAddressDirection | null;
  streetName: string | null;
  streetSuffix: string | null;
  postDirection: PublicAddressDirection | null;
  unitDesignator: string | null;
  unitIdentifier: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  displayAddress: string | null;
  canonicalAddressTokens: string[];
  provenance: string;
  version: typeof PUBLIC_ADDRESS_VERSION;
};
export type StructuredPublicAddressInput = Omit<StructuredPublicAddress, "displayAddress" | "canonicalAddressTokens" | "version"> & { displayAddress?: string | null };
export type CanonicalParcelIdentityInput = {
  apn: string;
  jurisdiction: ParcelIdentityJurisdiction;
  structuredAddress?: StructuredPublicAddress | StructuredPublicAddressInput | null;
  address?: string | null;
  unit?: string | null;
  provenance: string;
};
export type CanonicalParcelIdentity = {
  apn: string;
  jurisdiction: ParcelIdentityJurisdiction;
  publicAddress: StructuredPublicAddress | null;
  canonicalDisplayAddress: string | null;
  unit: string | null;
  canonicalSlug: string;
  canonicalPath: string;
  canonicalUrl: string;
  identityProvenance: string;
  identityVersion: typeof PARCEL_IDENTITY_VERSION;
};

function normalizeText(value?: string | number | null): string | null {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  return normalized || null;
}
function normalizeDirection(value?: string | null): PublicAddressDirection | null {
  const normalized = normalizeText(value);
  return normalized && ["N", "S", "E", "W", "NE", "NW", "SE", "SW"].includes(normalized) ? normalized as PublicAddressDirection : null;
}
function canonicalToken(value?: string | null): string[] {
  return normalizeText(value)?.replace(/&/g, " AND ").match(/[A-Z0-9]+/g) ?? [];
}

/** Directionals are semantic tokens. Unit identifiers are opaque source values, so leading zeroes remain. */
export function buildStructuredPublicAddress(input: StructuredPublicAddressInput): StructuredPublicAddress {
  const houseNumber = normalizeText(input.houseNumber);
  const preDirection = normalizeDirection(input.preDirection);
  const streetName = normalizeText(input.streetName);
  const streetSuffix = normalizeText(input.streetSuffix);
  const postDirection = normalizeDirection(input.postDirection);
  const unitIdentifier = normalizeText(input.unitIdentifier);
  const unitDesignator = unitIdentifier ? (normalizeText(input.unitDesignator) ?? "UNIT") : null;
  const canonicalAddressTokens = [
    ...canonicalToken(houseNumber), ...(preDirection ? [preDirection] : []), ...canonicalToken(streetName),
    ...canonicalToken(streetSuffix), ...(postDirection ? [postDirection] : []),
    ...canonicalToken(unitDesignator), ...canonicalToken(unitIdentifier),
  ];
  const computedDisplay = [houseNumber, preDirection, streetName, streetSuffix, postDirection, unitDesignator, unitIdentifier].filter(Boolean).join(" ") || null;
  return {
    houseNumber, preDirection, streetName, streetSuffix, postDirection, unitDesignator, unitIdentifier,
    city: normalizeText(input.city), state: normalizeText(input.state), zip: normalizeText(input.zip),
    displayAddress: normalizeText(input.displayAddress) ?? computedDisplay,
    canonicalAddressTokens, provenance: input.provenance, version: PUBLIC_ADDRESS_VERSION,
  };
}

export function slugifyParcelAddress(address: string): string {
  return address.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
}

function v1DisplayAddress(input: CanonicalParcelIdentityInput): string | null {
  const address = normalizeText(input.address);
  const explicitUnit = normalizeText(input.unit);
  const embeddedUnit = address?.match(/(?:^|\s)(?:UNIT|APT|STE|SUITE|#)\s*([A-Z0-9][A-Z0-9 &\/-]*)$/)?.[1] ?? null;
  const unit = explicitUnit ?? embeddedUnit;
  const escapedUnit = unit?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") ?? "";
  const hasUnit = Boolean(address && unit && new RegExp(`(?:^|\\s)(?:UNIT|APT|STE|SUITE|#)\\s*${escapedUnit}$`, "i").test(address));
  return address && explicitUnit && !hasUnit ? `${address} UNIT ${explicitUnit}` : address;
}

/** Frozen compatibility implementation for receipts that explicitly require v1 semantics. */
export function canonicalParcelIdentityV1(input: CanonicalParcelIdentityInput) {
  const apn = normalizeApnDigits(input.apn);
  const display = v1DisplayAddress(input);
  const addressSlug = slugifyParcelAddress(display ?? "");
  const canonicalSlug = addressSlug ? `${formatApnForDisplay(apn)}-${addressSlug}` : `apn-${apn}`;
  const canonicalPath = `/parcel/${input.jurisdiction}/${canonicalSlug}`;
  return { apn, canonicalSlug, canonicalPath, canonicalUrl: new URL(canonicalPath, "https://trulot.com").toString(), identityVersion: PARCEL_IDENTITY_VERSION_V1 };
}

export function canonicalParcelIdentity(input: CanonicalParcelIdentityInput): CanonicalParcelIdentity {
  const apn = normalizeApnDigits(input.apn);
  const publicAddress = input.structuredAddress ? buildStructuredPublicAddress(input.structuredAddress) : null;
  const canonicalDisplayAddress = publicAddress?.displayAddress ?? v1DisplayAddress(input);
  const addressSlug = publicAddress
    ? publicAddress.canonicalAddressTokens.map(slugifyParcelAddress).filter(Boolean).join("-")
    : slugifyParcelAddress(canonicalDisplayAddress ?? "");
  const canonicalSlug = addressSlug ? `${formatApnForDisplay(apn)}-${addressSlug}` : `apn-${apn}`;
  const canonicalPath = `/parcel/${input.jurisdiction}/${canonicalSlug}`;
  return {
    apn, jurisdiction: input.jurisdiction, publicAddress, canonicalDisplayAddress,
    unit: publicAddress?.unitIdentifier ?? normalizeText(input.unit), canonicalSlug, canonicalPath,
    canonicalUrl: new URL(canonicalPath, "https://trulot.com").toString(),
    identityProvenance: publicAddress?.provenance ?? input.provenance, identityVersion: PARCEL_IDENTITY_VERSION,
  };
}

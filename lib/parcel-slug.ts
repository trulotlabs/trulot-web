export function normalizeApnDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, "").padStart(10, "0");
}

export function formatApnForDisplay(apn: string): string {
  const digits = normalizeApnDigits(apn);
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
  }
  if (digits.length === 8) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}`;
  }
  return digits;
}

export function slugifyAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function canonicalParcelSlug(apn: string, address?: string | null): string {
  const formattedApn = formatApnForDisplay(apn);
  const addressSlug = slugifyAddress(address ?? "");
  return addressSlug ? `${formattedApn}-${addressSlug}` : `apn-${normalizeApnDigits(apn)}`;
}

export function canonicalParcelPath(apn: string, address?: string | null): string {
  return `/parcel/san-diego/${canonicalParcelSlug(apn, address)}`;
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

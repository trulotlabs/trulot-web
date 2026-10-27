export function normalizeApnDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, "").padStart(10, "0");
}

export function formatApnForDisplay(apn: string): string {
  const digits = normalizeApnDigits(apn);
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
  if (digits.length === 8) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}`;
  return digits;
}

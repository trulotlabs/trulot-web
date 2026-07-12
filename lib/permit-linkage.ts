export type PermitLinkageConfidence =
  | "exact_apn"
  | "parsed_apn"
  | "address_match"
  | "unmatched";

type RawRow = Record<string, unknown>;

const STREET_SUFFIX_EXPANSIONS: Array<[RegExp, string]> = [
  [/\bav\b/gi, "Ave"],
  [/\bave\b/gi, "Ave"],
  [/\bavenue\b/gi, "Ave"],
  [/\bst\b/gi, "St"],
  [/\bstreet\b/gi, "St"],
  [/\bdr\b/gi, "Dr"],
  [/\bdrive\b/gi, "Dr"],
  [/\brd\b/gi, "Rd"],
  [/\broad\b/gi, "Rd"],
  [/\bblvd\b/gi, "Blvd"],
  [/\bboulevard\b/gi, "Blvd"],
  [/\bln\b/gi, "Ln"],
  [/\blane\b/gi, "Ln"],
  [/\bct\b/gi, "Ct"],
  [/\bcourt\b/gi, "Ct"],
  [/\bpl\b/gi, "Pl"],
  [/\bplace\b/gi, "Pl"],
  [/\bcir\b/gi, "Cir"],
  [/\bcircle\b/gi, "Cir"],
  [/\btr\b/gi, "Ter"],
  [/\bterr\b/gi, "Ter"],
  [/\bterrace\b/gi, "Ter"],
  [/\bter\b/gi, "Ter"],
  [/\bwy\b/gi, "Way"],
];

const STREET_SUFFIX_VARIANTS: Record<string, string[]> = {
  Ave: ["Ave", "Av"],
  St: ["St"],
  Dr: ["Dr"],
  Rd: ["Rd"],
  Blvd: ["Blvd"],
  Ln: ["Ln"],
  Ct: ["Ct"],
  Pl: ["Pl"],
  Cir: ["Cir"],
  Ter: ["Ter", "Tr"],
  Way: ["Way", "Wy"],
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeApnDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function parseApnCandidates(raw: string): string[] {
  const input = str(raw);
  if (!input) return [];

  const found = new Set<string>();
  const matches = input.match(/\d{3}-\d{3}-\d{2}-\d{2}|\d{10,11}/g) ?? [];

  for (const match of matches) {
    const digits = normalizeApnDigits(match);
    if (digits.length === 10) {
      found.add(digits);
      continue;
    }

    if (digits.length === 11) {
      found.add(digits);
      found.add(digits.slice(0, 10));
    }
  }

  const rawDigits = normalizeApnDigits(input);
  if (rawDigits.length === 10) found.add(rawDigits);
  if (rawDigits.length === 11) {
    found.add(rawDigits);
    found.add(rawDigits.slice(0, 10));
  }

  return [...found];
}

export function normalizeStreetAddress(raw: string): string | null {
  let value = str(raw);
  if (!value) return null;

  value = value.split(",")[0] ?? value;
  value = value.replace(/\b0+(\d)(st|nd|rd|th)\b/gi, "$1$2");
  value = value.replace(/\s+/g, " ").trim();

  for (const [pattern, replacement] of STREET_SUFFIX_EXPANSIONS) {
    value = value.replace(pattern, replacement);
  }

  value = value
    .replace(/\bunit\b/gi, "Unit")
    .replace(/\bapt\b/gi, "Apt")
    .replace(/\bspc\b/gi, "Spc")
    .replace(/\s+/g, " ")
    .trim();

  return value || null;
}

export function streetAddressVariants(raw: string): string[] {
  const normalized = normalizeStreetAddress(raw);
  if (!normalized) return [];

  const variants = new Set<string>([normalized]);
  const parts = normalized.split(" ");
  const suffix = parts.at(-1);
  if (!suffix) return [...variants];

  const stem = parts.slice(0, -1).join(" ");
  const suffixVariants = STREET_SUFFIX_VARIANTS[suffix];
  if (!suffixVariants) return [...variants];

  for (const variant of suffixVariants) {
    variants.add(`${stem} ${variant}`.trim());
  }

  if (/^\d+(st|nd|rd|th)\b/i.test(parts[1] ?? "")) {
    const ordinal = parts[1] ?? "";
    variants.add(normalized.replace(ordinal, ordinal.replace(/^0+/, "")));
    variants.add(normalized.replace(ordinal, ordinal.padStart(4, "0")));
  }

  return [...variants];
}

export function buildPermitAddressFullVariants(row: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string[] {
  const baseVariants = streetAddressVariants(row.address ?? "");
  const city = str(row.city) || "San Diego";
  const state = str(row.state) || "CA";
  const zip = str(row.zip);
  const zip5 = zip.slice(0, 5);
  const zipFull = zip || "";

  const variants: string[] = [];
  for (const base of baseVariants) {
    variants.push(`${base}, ${city}, ${state}`);
    if (zip5) variants.push(`${base}, ${city}, ${state} ${zip5}`);
    if (zipFull && zipFull !== zip5) variants.push(`${base}, ${city}, ${state} ${zipFull}`);
  }

  return unique(variants);
}

export function getPermitLinkage(
  parcelApnNorm: string,
  parcelAddress: string,
  permitRow: RawRow,
): PermitLinkageConfidence {
  const rawPermitApn = str(permitRow.apn_norm);
  const permitDigits = normalizeApnDigits(rawPermitApn);
  if (permitDigits === parcelApnNorm) return "exact_apn";

  const parsedCandidates = parseApnCandidates(
    [
      rawPermitApn,
      str(permitRow.description),
      str(permitRow.project_scope),
      str(permitRow.approval_scope),
      str(permitRow.project_title),
    ].join(" "),
  );

  if (parsedCandidates.includes(parcelApnNorm)) return "parsed_apn";

  const permitAddress = normalizeStreetAddress(str(permitRow.address_full));
  const parcelAddressKey = normalizeStreetAddress(parcelAddress);
  if (permitAddress && parcelAddressKey && permitAddress === parcelAddressKey) {
    return "address_match";
  }

  return "unmatched";
}

export function permitSourceLabelForConfidence(
  confidence: PermitLinkageConfidence,
): string {
  if (confidence === "exact_apn") return "City permit record via exact APN match";
  if (confidence === "parsed_apn") return "City permit record via parsed APN match";
  if (confidence === "address_match") return "City permit record via address match";
  return "City permit record linkage unavailable";
}

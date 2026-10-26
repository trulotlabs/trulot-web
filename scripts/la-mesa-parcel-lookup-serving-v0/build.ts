#!/usr/bin/env tsx
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip, gzipSync } from "node:zlib";
import { formatApn, normalizeAddress } from "../../lib/parcel-lookup-contract";
import { buildPublicParcelFeasibility, type PublicParcelFeasibilityInput } from "../../lib/public-parcel-feasibility";

const ROOT = resolve(import.meta.dirname, "../..");
const OUTPUT = resolve(ROOT, "data/la-mesa-parcel-lookup-serving-v0");
const COUNTY_ROWS = process.argv[2] ?? "/Users/ops/trulot-data/parcel-base-v2/sangis-20260924T183743Z-pass2/rows.ndjson.gz";
const CLASSIFICATION = join(ROOT, "data/la-mesa-geometry-classification-v0/artifacts/parcel-classification.ndjson.gz");
const PROFILE_SELECTION = join(ROOT, "data/la-mesa-residential-rule-profile-v0/profile-selection.ndjson.gz");
const REGISTRY = join(ROOT, "data/la-mesa-v4-benchmark-integration-v0/jurisdiction-registry.json");
const EXPECTED_COUNTY_SHA = "95c92f14bf4489946c6632f8032c2e08735b8fec11940cdace69db19c0625868";
const EXPECTED_APN_FINGERPRINT = "11440df9a1fb2a72592000dc656f75dcec9bf7ed9d90e9efcb9ebba8e700a467";
const EVALUATION_DATE = "2026-10-26";

type CountyEnvelope = {
  accepted: boolean;
  row: {
    apnRaw: string;
    apnNorm: string;
    sourceObjectId: number;
    parcelId: number | null;
    address: string | null;
    situsComponents: Record<string, string | number | null>;
    jurisdiction: string;
  };
  geometry: { centroid: [number, number] };
};

type Classification = {
  apn: string;
  jurisdiction_scope_state: string;
  selected_zone: string | null;
  mapped_overlays: Array<{ code: string }>;
  specific_plan_state: string;
  rule_profile_readiness: string;
};

type ProfileSelection = {
  apn: string;
  readiness: string;
  selected_base_profile: string | null;
  modifier_ids: string[];
  unresolved_rule_families: string[];
};

type ServingRow = {
  schemaVersion: "la-mesa-parcel-lookup-serving-v0";
  apnRaw: string;
  apnNormalized: string;
  apnFormatted: string;
  situsAddressRaw: string | null;
  normalizedAddress: string | null;
  normalizedUnitAddress: string | null;
  streetNumber: string | null;
  preDirection: string | null;
  streetName: string | null;
  streetSuffix: string | null;
  postDirection: string | null;
  unit: string | null;
  zip: string | null;
  jurisdictionId: "CITY_OF_LA_MESA" | "JURISDICTION_UNRESOLVED" | "CITY_OF_SAN_DIEGO" | "OTHER_JURISDICTION";
  jurisdictionDisplayName: string;
  lookupReadiness: "ADDRESS_AND_APN" | "APN_ONLY";
  canonicalScopeState: "IN_SCOPE_CONFIRMED" | "JURISDICTION_UNRESOLVED" | "OUTSIDE_CANONICAL_SCOPE";
  centroid: [number, number];
  sourceVersion: "sangis-20260924T183743Z-pass2";
};

function canonical(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function shaBytes(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function shaFile(path: string): string {
  return shaBytes(readFileSync(path));
}

function writeJson(name: string, value: unknown): void {
  writeFileSync(join(OUTPUT, name), `${JSON.stringify(value, null, 2)}\n`);
}

function writeGzipRows(name: string, rows: unknown[]): { bytes: number; sha256: string; contentSha256: string } {
  const content = Buffer.from(rows.map(canonical).join(""));
  const compressed = gzipSync(content, { level: 9 });
  writeFileSync(join(OUTPUT, name), compressed);
  return { bytes: compressed.length, sha256: shaBytes(compressed), contentSha256: shaBytes(content) };
}

async function readGzipRows<T>(path: string, consume: (row: T) => void): Promise<void> {
  const input = createReadStream(path).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) consume(JSON.parse(line) as T);
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

function makeServingRow(
  envelope: CountyEnvelope,
  scope: ServingRow["canonicalScopeState"],
): ServingRow {
  const row = envelope.row;
  const components = row.situsComponents;
  const address = text(row.address);
  const unit = text(components.situs_suite) ?? text(components.situs_building);
  const normalized = address ? normalizeAddress(address) : null;
  const normalizedUnitAddress = normalized && unit
    ? normalizeAddress(`${address} Unit ${unit}`)
    : normalized;
  const jurisdictionId = scope === "JURISDICTION_UNRESOLVED"
    ? "JURISDICTION_UNRESOLVED"
    : row.jurisdiction === "LM"
      ? "CITY_OF_LA_MESA"
      : row.jurisdiction === "SD"
        ? "CITY_OF_SAN_DIEGO"
        : "OTHER_JURISDICTION";
  const jurisdictionDisplayName = jurisdictionId === "CITY_OF_LA_MESA"
    ? "City of La Mesa"
    : jurisdictionId === "JURISDICTION_UNRESOLVED"
      ? "Jurisdiction needs review"
      : jurisdictionId === "CITY_OF_SAN_DIEGO"
        ? "City of San Diego"
        : "Outside City of La Mesa";
  const streetNumberValue = text(components.situs_address);
  const fraction = text(components.situs_fraction);
  return {
    schemaVersion: "la-mesa-parcel-lookup-serving-v0",
    apnRaw: row.apnRaw,
    apnNormalized: row.apnNorm,
    apnFormatted: formatApn(row.apnNorm),
    situsAddressRaw: address,
    normalizedAddress: normalized,
    normalizedUnitAddress,
    streetNumber: streetNumberValue ? `${streetNumberValue}${fraction ? ` ${fraction}` : ""}` : null,
    preDirection: text(components.situs_pre_dir),
    streetName: text(components.situs_street),
    streetSuffix: text(components.situs_suffix),
    postDirection: text(components.situs_post_dir),
    unit,
    zip: text(components.situs_zip),
    jurisdictionId,
    jurisdictionDisplayName,
    lookupReadiness: address ? "ADDRESS_AND_APN" : "APN_ONLY",
    canonicalScopeState: scope,
    centroid: envelope.geometry.centroid,
    sourceVersion: "sangis-20260924T183743Z-pass2",
  };
}

function missingFacts(classification: Classification): string[] {
  const missing = [
    "primary_dwelling_type",
    "primary_dwelling_existing_or_proposed",
    "legal_structure_status",
    "qualifying_conversion_space",
    "project_form",
    "proposed_adu_size",
    "fire_sprinkler_primary_requirement",
  ];
  const modifiers = new Set(classification.mapped_overlays.map((entry) => entry.code));
  if (modifiers.has("H") || modifiers.has("P")) {
    missing.push("grading_scope", "slope", "objective_overlay_standard_applicability");
  }
  if (modifiers.has("H")) missing.push("fire_access_route", "rear_to_curb_distance");
  if (modifiers.has("F")) missing.push("flood_zone", "base_flood_elevation", "watercourse_review");
  if (classification.specific_plan_state !== "NONE") {
    missing.push("operative_specific_plan_rule", "specific_plan_boundary_resolution");
  }
  return [...new Set(missing)].sort();
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT, { recursive: true });
  const countySha = shaFile(COUNTY_ROWS);
  if (countySha !== EXPECTED_COUNTY_SHA) throw new Error(`county-row seal mismatch: ${countySha}`);

  const classifications = new Map<string, Classification>();
  await readGzipRows<Classification>(CLASSIFICATION, (row) => classifications.set(row.apn, row));
  const selections = new Map<string, ProfileSelection>();
  await readGzipRows<ProfileSelection>(PROFILE_SELECTION, (row) => selections.set(row.apn, row));

  const canonicalEnvelopes: CountyEnvelope[] = [];
  await readGzipRows<CountyEnvelope>(COUNTY_ROWS, (entry) => {
    if (entry.accepted && entry.row.jurisdiction === "LM") canonicalEnvelopes.push(entry);
  });
  canonicalEnvelopes.sort((a, b) => a.row.apnNorm.localeCompare(b.row.apnNorm));
  if (canonicalEnvelopes.length !== 17_391) throw new Error(`expected 17391 canonical rows; got ${canonicalEnvelopes.length}`);
  const apnFingerprint = shaBytes(`${canonicalEnvelopes.map((entry) => entry.row.apnNorm).join("\n")}\n`);
  if (apnFingerprint !== EXPECTED_APN_FINGERPRINT) throw new Error(`APN fingerprint mismatch: ${apnFingerprint}`);

  const servingRows = canonicalEnvelopes.map((entry) => {
    const state = classifications.get(entry.row.apnNorm)?.jurisdiction_scope_state;
    return makeServingRow(entry, state === "INDETERMINATE_JURISDICTION" ? "JURISDICTION_UNRESOLVED" : "IN_SCOPE_CONFIRMED");
  });
  const canonicalAddresses = new Set(servingRows.flatMap((row) => row.normalizedAddress ? [row.normalizedAddress] : []));
  const comparisonRows: ServingRow[] = [];
  await readGzipRows<CountyEnvelope>(COUNTY_ROWS, (entry) => {
    if (!entry.accepted || entry.row.jurisdiction === "LM" || !entry.row.address) return;
    if (canonicalAddresses.has(normalizeAddress(entry.row.address))) {
      comparisonRows.push(makeServingRow(entry, "OUTSIDE_CANONICAL_SCOPE"));
    }
  });
  comparisonRows.sort((a, b) => a.normalizedAddress!.localeCompare(b.normalizedAddress!) || a.apnNormalized.localeCompare(b.apnNormalized));

  const addressGroups = new Map<string, ServingRow[]>();
  for (const row of servingRows) {
    if (!row.situsAddressRaw) continue;
    const group = addressGroups.get(row.situsAddressRaw) ?? [];
    group.push(row);
    addressGroups.set(row.situsAddressRaw, group);
  }
  const duplicateGroups = [...addressGroups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([address, rows]) => ({
      address,
      normalizedAddress: rows[0].normalizedAddress,
      candidateCount: rows.length,
      candidates: rows.map((row) => ({ apn: row.apnNormalized, apnFormatted: row.apnFormatted, unit: row.unit })),
    }));

  const registry = JSON.parse(readFileSync(REGISTRY, "utf8")) as {
    pathways: Record<string, Array<{ id: string; label: string }>>;
    sources: Array<{ label: string; publisher: string; date: string; url: string }>;
  };
  const pathwayCatalog = Object.values(registry.pathways).flat().map(({ id, label }) => ({ id, label }));
  const evaluations = servingRows.map((row) => {
    const classification = classifications.get(row.apnNormalized);
    const selection = selections.get(row.apnNormalized);
    if (!classification || !selection) throw new Error(`missing sealed evaluation input for ${row.apnNormalized}`);
    const selectionState = row.canonicalScopeState === "JURISDICTION_UNRESOLVED"
      ? "JURISDICTION_UNRESOLVED" as const
      : selection.readiness === "RULE_PROFILE_UNAVAILABLE"
        ? "PROFILE_UNAVAILABLE" as const
        : "READY" as const;
    const input: PublicParcelFeasibilityInput = {
      jurisdictionId: "CITY_OF_LA_MESA",
      parcelId: row.apnNormalized,
      address: row.situsAddressRaw,
      ruleProfileVersion: "LA_MESA_TITLE24_2026_10_04",
      baseZoneCode: classification.selected_zone,
      measurements: {},
      coastalContext: "NOT_APPLICABLE",
      contexts: {},
      sourceFreshness: EVALUATION_DATE,
      laMesa: {
        evaluationDate: EVALUATION_DATE,
        aduProfile: "LA_MESA_ADU_2026",
        selectionState,
        baseProfile: selection.selected_base_profile,
        modifierIds: selection.modifier_ids,
        missingPropertyFacts: [...missingFacts(classification), ...selection.unresolved_rule_families].filter((value, index, all) => all.indexOf(value) === index).sort(),
        publicEvidenceOnly: true,
      },
    };
    const result = buildPublicParcelFeasibility(input);
    const details = result.jurisdictionDetails;
    return {
      apn: row.apnNormalized,
      baseZone: classification.selected_zone,
      baseProfile: details?.developmentRules.baseProfile ?? selection.selected_base_profile,
      answerCategory: details?.aduPathwaySummary.answerCategory ?? (selectionState === "JURISDICTION_UNRESOLVED" ? "Source unavailable" : "Outside current scope"),
      mappedModifierIds: details?.mappedModifiers ?? selection.modifier_ids,
      missingFacts: details?.unresolvedPredicates ?? missingFacts(classification),
      pathwayCatalog: details?.aduPathwaySummary.pathwayCatalog ?? pathwayCatalog,
      evidenceSources: details?.publicEvidenceSources ?? registry.sources,
      evaluationDate: details?.evaluationEffectiveDate ?? EVALUATION_DATE,
      specificPlanBoundaryUnresolved: classification.specific_plan_state === "SPECIFIC_PLAN_BOUNDARY_REVIEW",
      available: result.readiness === "READY" && details !== null && selectionState === "READY",
    };
  });

  const sampleCandidates = servingRows.map((row) => {
    const classification = classifications.get(row.apnNormalized)!;
    const stratum = [
      classification.selected_zone ?? "NO_ZONE",
      row.lookupReadiness,
      classification.mapped_overlays.length ? "OVERLAY" : "NO_OVERLAY",
      classification.specific_plan_state,
      classification.rule_profile_readiness,
    ].join("|");
    return { apn: row.apnNormalized, stratum, score: shaBytes(`${row.apnNormalized}|packet69`) };
  });
  const strata = new Map<string, typeof sampleCandidates>();
  for (const item of sampleCandidates) {
    const list = strata.get(item.stratum) ?? [];
    list.push(item);
    strata.set(item.stratum, list);
  }
  for (const list of strata.values()) list.sort((a, b) => a.score.localeCompare(b.score));
  const sample: typeof sampleCandidates = [];
  const orderedStrata = [...strata].sort(([a], [b]) => a.localeCompare(b));
  for (let offset = 0; sample.length < 100; offset += 1) {
    let added = false;
    for (const [, list] of orderedStrata) {
      if (list[offset] && sample.length < 100) { sample.push(list[offset]); added = true; }
    }
    if (!added) break;
  }

  const servingArtifact = writeGzipRows("serving-rows.ndjson.gz", servingRows);
  const comparisonArtifact = writeGzipRows("cross-jurisdiction-comparison.ndjson.gz", comparisonRows);
  const evaluationArtifact = writeGzipRows("evaluation-index.ndjson.gz", evaluations);
  writeJson("schema.json", {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "La Mesa parcel lookup serving row V0",
    type: "object",
    additionalProperties: false,
    required: ["apnRaw", "apnNormalized", "apnFormatted", "situsAddressRaw", "normalizedAddress", "jurisdictionId", "lookupReadiness", "canonicalScopeState", "sourceVersion"],
    privacy: "PUBLIC_IDENTITY_ONLY",
  });
  writeJson("row-count-report.json", {
    canonicalRows: servingRows.length,
    uniqueCanonicalApns: new Set(servingRows.map((row) => row.apnNormalized)).size,
    addressedRows: servingRows.filter((row) => row.situsAddressRaw).length,
    missingAddressRows: servingRows.filter((row) => !row.situsAddressRaw).length,
    distinctAddressStrings: addressGroups.size,
    duplicateAddressGroups: duplicateGroups.length,
    extraDuplicateAddressRows: duplicateGroups.reduce((sum, group) => sum + group.candidateCount - 1, 0),
    rowsInDuplicateGroups: duplicateGroups.reduce((sum, group) => sum + group.candidateCount, 0),
    jurisdictionUnresolvedRows: servingRows.filter((row) => row.canonicalScopeState === "JURISDICTION_UNRESOLVED").length,
    crossJurisdictionAddressStrings: new Set(comparisonRows.map((row) => row.normalizedAddress)).size,
    crossJurisdictionComparisonRows: comparisonRows.length,
    excludedBoundaryOverlapApn: "4953350500",
    excludedBoundaryOverlapPresent: servingRows.some((row) => row.apnNormalized === "4953350500"),
  });
  writeJson("duplicate-address-report.json", {
    doctrine: "Never collapse APNs that share an address. Present APN and available unit identity for explicit selection.",
    groups: duplicateGroups,
    crossJurisdiction: [...new Set(comparisonRows.map((row) => row.normalizedAddress))].sort().map((address) => ({
      normalizedAddress: address,
      canonicalLaMesaApns: servingRows.filter((row) => row.normalizedAddress === address).map((row) => row.apnNormalized),
      comparisonCandidates: comparisonRows.filter((row) => row.normalizedAddress === address).map((row) => ({ apn: row.apnNormalized, jurisdiction: row.jurisdictionDisplayName, unit: row.unit })),
    })),
  });
  writeJson("random-sample.json", { method: "SHA-256(APN|packet69), round-robin across zone/address/overlay/specific-plan/readiness strata", count: sample.length, samples: sample });
  writeJson("production-serving-design.json", {
    recommendation: "Extend the existing private lookup materialization/RPC into one jurisdiction-keyed serving architecture.",
    key: ["jurisdiction_id", "apn_normalized"],
    requirements: ["explicit jurisdiction filter", "candidate jurisdiction in every response", "no address-only selection", "independent regulatory lookup by APN after selection"],
    implemented: false,
  });
  writeJson("future-route-design.json", {
    shape: "/parcel/la-mesa/[slug]",
    slugRule: "formatted APN plus normalized address words when an address exists; APN-only fallback otherwise",
    examples: ["464-030-11-00-5836-pawnee-dr", "apn-4641310100"],
    canonicalIdentity: "APN resolved within CITY_OF_LA_MESA; jurisdiction-unresolved rows do not receive public routes",
    implemented: false,
  });
  writeJson("receipt.json", {
    schemaVersion: "la-mesa-parcel-lookup-serving-v0",
    canonicalPopulation: "SanGIS situs_juris = LM",
    sourceRows: { filename: basename(COUNTY_ROWS), sha256: countySha },
    inputSeals: {
      packet63: shaFile(join(ROOT, "data/la-mesa-jurisdiction-recon-v0/integrity.json")),
      packet64: shaFile(join(ROOT, "data/la-mesa-geometry-classification-v0/artifacts/artifact-integrity.json")),
      packet65: shaFile(join(ROOT, "data/la-mesa-residential-rule-profile-v0/artifact-integrity.json")),
      packet66: shaFile(join(ROOT, "data/la-mesa-adu-rule-profile-2026/artifact-integrity.json")),
      packet67: shaFile(join(ROOT, "data/la-mesa-v4-benchmark-integration-v0/artifact-integrity.json")),
    },
    canonicalApnFingerprint: apnFingerprint,
    artifacts: { servingArtifact, comparisonArtifact, evaluationArtifact },
    evaluationEngine: "buildPublicParcelFeasibility / LA_MESA_ADU_2026",
    productionAccess: false,
  });
  writeFileSync(join(OUTPUT, "README.md"), `# La Mesa parcel lookup serving V0

Deterministic private/local serving artifacts for the 17,391 canonical SanGIS \`situs_juris = LM\` APNs. Search reuses \`formatApn\`, \`normalizeAddress\`, \`normalizeApnInput\`, and \`searchParcelLookup\` from the jurisdiction-neutral Parcel Lookup contract. No La Mesa-specific parser or ranker is present.

Search rows contain public identity only. Regulatory evaluation is independently keyed by APN in \`evaluation-index.ndjson.gz\`, so selecting a result causes the downstream engine to re-resolve the sealed evaluation rather than trust regulatory facts copied into a search row.

The four jurisdiction-conflict rows remain searchable and fail closed. Unsupported/TBD rows resolve identity without a rule conclusion. Production Parcel Lookup, public routing, and deployment are unchanged.

## Artifacts

- \`serving-rows.ndjson.gz\`: one public search row for each canonical La Mesa APN.
- \`cross-jurisdiction-comparison.ndjson.gz\`: bounded same-address comparison rows that retain their actual jurisdiction.
- \`evaluation-index.ndjson.gz\`: separately keyed public evaluation results used after candidate selection.
- \`schema.json\`, \`receipt.json\`, \`row-count-report.json\`, \`duplicate-address-report.json\`, and \`artifact-integrity.json\`: reproducibility and population evidence.
- \`performance.json\`: local load/search measurements for the private-pilot implementation.
- \`production-serving-design.json\` and \`future-route-design.json\`: design only; no production schema, RPC, or route was implemented.
- \`review-evidence/\`: static desktop/mobile browser evidence and its own integrity manifest.

## Reproduction and validation

Run the builder from the repository root:

\`\`\`text
npx tsx scripts/la-mesa-parcel-lookup-serving-v0/build.ts
\`\`\`

The builder consumes the locally sealed county source and Packet 63–67 artifacts. It performs no network or production access. Packet 69 tests validate all 17,391 APNs, the 663 APN-only rows, address collisions, jurisdiction conflicts, unsupported rows, bounded result behavior, and the deterministic 100-parcel sample.
`);

  const integrity: Record<string, { bytes: number; sha256: string }> = {};
  for (const name of ["README.md", "cross-jurisdiction-comparison.ndjson.gz", "duplicate-address-report.json", "evaluation-index.ndjson.gz", "future-route-design.json", "production-serving-design.json", "random-sample.json", "receipt.json", "row-count-report.json", "schema.json", "serving-rows.ndjson.gz"]) {
    const path = join(OUTPUT, name);
    integrity[name] = { bytes: readFileSync(path).length, sha256: shaFile(path) };
  }
  writeJson("artifact-integrity.json", { algorithm: "sha256", files: integrity });
  console.log(JSON.stringify({ canonicalRows: servingRows.length, comparisonRows: comparisonRows.length, duplicateGroups: duplicateGroups.length, artifacts: { servingArtifact, evaluationArtifact } }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

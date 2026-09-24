// Offline dependency-injected rehearsal adapter. Never imported by the application runtime.
import { z } from "zod";
import type { ParcelTruth } from "../../lib/parcel-page-v1";
import type { CanonicalResultState, FactProvenance, TruthFact } from "../../lib/parcel-truth";
import { canonicalParcelPath, canonicalParcelSlug } from "../../lib/parcel-slug";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const point = z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]) });
const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const ring = z.array(position).min(4).refine((r) => r[0][0] === r[r.length-1][0] && r[0][1] === r[r.length-1][1]);
const geometry = z.discriminatedUnion("type", [z.object({ type: z.literal("Polygon"), coordinates: z.array(ring).min(1) }), z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(ring).min(1)).min(1) })]);
export const receiptSchema = z.object({
  acquisition_id: z.string().min(1), dataset_id: z.literal("parcel_base_sangis_v2"), acquired_at: z.string().datetime({ offset: true }),
  publisher: z.literal("SanGIS"), source_url: z.literal("https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer/0"),
  metadata_url: z.literal("https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer/0/metadata"),
  source_temporal_extent: z.string().min(1).nullable(), artifact_sha256: hash, metadata_sha256: hash,
  receipt_reference: z.string().min(1), import_identity: z.string().min(1), serving_definition_sha256: hash,
});
export const rowSchema = z.object({
  acquisition_id: z.string().min(1), source_object_id: z.number().int().positive(), apn_norm: z.string().regex(/^\d{10}$/),
  parcel_id: z.number().int().positive(), address: z.string().trim().min(1).nullable(), situs_zip: z.string().nullable(), situs_juris: z.literal("SD"),
  situs_components: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  geom: geometry, centroid: point, point_on_surface: point, centroid_within: z.boolean(),
  approximate_geometry_area_sqft: z.number().positive(), taxable_acreage: z.number().nonnegative().nullable(),
  geometry_sha256: hash, native_crs: z.literal("EPSG:2230"), artifact_crs: z.literal("EPSG:4326"),
});
export type ServingRow = z.infer<typeof rowSchema>;
export type ServingReceipt = z.infer<typeof receiptSchema>;
export interface ServingResult {
  status: CanonicalResultState;
  reason: "found" | "scoped_absence" | "quarantined_apn" | "ambiguous_apn" | "invalid_request" | "source_failure";
  truth: ParcelTruth;
  data: null | { row: ServingRow; canonicalPath: string; canonicalSlug: string; redirectTo: string | null;
    address: TruthFact<string>; geometryAreaSqFt: TruthFact<number>; taxableAcreage: TruthFact<number> };
}
// Strict route APNs only: do not inherit the legacy helper's padding of 8/9-digit inputs.
export function routeApn(input: string): string | null {
  const direct = input.match(/^(?:apn-)?(\d{10})(?:-|$)/i);
  if (direct) return direct[1];
  const formatted = input.match(/^(\d{3})-(\d{3})-(\d{2})-(\d{2})(?:-|$)/);
  return formatted ? formatted.slice(1).join("") : null;
}
function provenance(receipt: ServingReceipt | null, basis: string): FactProvenance {
  return { sourceId: "parcel_serving_v2", datasetId: receipt?.dataset_id ?? null, sourceLabel: "SanGIS parcel base",
    publisher: receipt?.publisher ?? null, sourceUrl: receipt?.source_url ?? null, effectiveAt: receipt?.source_temporal_extent ?? null,
    retrievedAt: receipt?.acquired_at ?? null, importedAt: null, viewCalculatedAt: null,
    methodology: receipt ? `receipt=${receipt.receipt_reference}; sha256=${receipt.artifact_sha256}; import=${receipt.import_identity}; serving=${receipt.serving_definition_sha256}` : null, basis };
}
function emptyTruth(p: FactProvenance, parcel: ParcelTruth["parcel"]): ParcelTruth {
  const deferred: TruthFact<boolean> = { state: "unavailable", value: null, sourceState: "not_evaluated", derivation: "deterministic_derived",
    provenance: { ...p, sourceId: "deferred_enrichment", datasetId: null, sourceLabel: null, publisher: null, sourceUrl: null, effectiveAt: null, retrievedAt: null, methodology: null, basis: "Independent enrichment not evaluated by this parcel-only adapter." } };
  return { parcel, overlays: { tpa: deferred, ctcac: deferred, sda: deferred }, permits: { ...deferred, value: null } };
}
function unavailable(): ServingResult {
  const p = provenance(null, "Source lookup failed or returned an invalid contract; no absence conclusion.");
  return { status: "source_unavailable", reason: "source_failure", data: null,
    truth: emptyTruth(p, { state: "unavailable", value: null, sourceState: "source_unavailable", derivation: "recorded", provenance: p }) };
}
export async function lookupParcelServingV2(input: string, query: (apn: string) => Promise<unknown>): Promise<ServingResult> {
  const apn = routeApn(input);
  if (!apn) {
    const p = provenance(null, "Input does not identify an exact ten-digit APN.");
    return { status: "invalid_request", reason: "invalid_request", data: null,
      truth: emptyTruth(p, { state: "unavailable", value: null, sourceState: "not_evaluated", derivation: "recorded", provenance: p }) };
  }
  try {
    const envelope = z.object({ rows: z.array(rowSchema), quarantinedCount: z.number().int().nonnegative(), receipt: receiptSchema, error: z.null().optional() }).strict().parse(await query(apn));
    const p = provenance(envelope.receipt, "Selected acquisition; accepted City of San Diego situs-jurisdiction scope only.");
    if (envelope.rows.some(row => row.apn_norm !== apn || row.acquisition_id !== envelope.receipt.acquisition_id)) return unavailable();
    if (envelope.quarantinedCount > 0 || envelope.rows.length > 1) {
      return { status: "partial", reason: envelope.quarantinedCount > 0 ? "quarantined_apn" : "ambiguous_apn", data: null,
        truth: emptyTruth(p, { state: "unknown", value: null, sourceState: "partial", derivation: "recorded", provenance: p }) };
    }
    if (!envelope.rows.length) return { status: "not_found", reason: "scoped_absence", data: null,
      truth: emptyTruth(p, { state: "supported", value: false, sourceState: "available", derivation: "recorded", provenance: p }) };
    const row = envelope.rows[0];
    const slug = canonicalParcelSlug(apn, row.address); const path = canonicalParcelPath(apn, row.address);
    const fact = <T>(value: T | null, derivation: "recorded" | "deterministic_derived", basis: string): TruthFact<T> => value === null
      ? { state: "unknown", value: null, sourceState: "available", derivation, provenance: { ...p, basis } }
      : { state: "supported", value, sourceState: "available", derivation, provenance: { ...p, basis } };
    return { status: "found", reason: "found", truth: emptyTruth(p, { state: "supported", value: { apn, address: row.address },
      sourceState: "available", derivation: "deterministic_derived", provenance: p }),
      data: { row, canonicalSlug: slug, canonicalPath: path, redirectTo: input === slug ? null : path,
        address: fact(row.address, "deterministic_derived", "Packet 5 composition of recorded situs components; null when number/street unsupported. Building/suite remain separate components."),
        geometryAreaSqFt: fact(row.approximate_geometry_area_sqft, "deterministic_derived", "Approximate geometry area in US survey square feet; not legal lot area or assessor lot area."),
        taxableAcreage: fact(row.taxable_acreage, "recorded", "Source acreage is taxable acreage; null is unknown, not zero.") } };
  } catch { return unavailable(); }
}

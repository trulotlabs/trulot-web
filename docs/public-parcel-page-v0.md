# Public Parcel Page V0 presentation

The final three-level presentation contract is documented in [Parcel Page presentation hierarchy](parcel-page-presentation-hierarchy.md). The public preview is now Level 1, `/parcel-v2-preview/[apn]` is the homeowner zoning-detail Level 2, and `/parcel-v2-evidence/[apn]` is the technical Level 3. The notes below describe the original Packet 21.5 experiment and are retained as implementation history.

Packet 21.5 adds a simplified, public-facing presentation at `/parcel-public-preview/[apn]`. It is a separate development/test preview. The Packet 20/21 expert page at `/parcel-v2-preview/[apn]` remains unchanged and supplies the detailed inspection surface.

## Presentation contract

The public adapter accepts only an existing Packet 20 `ParcelPageV2UiModel`. It does not read the raw parcel sources, select rules, infer zoning or Coastal applicability, evaluate compliance, or calculate capacity. It reduces the existing model to:

- parcel address, APN, and jurisdiction;
- exactly four core facts: zoning, Coastal status, approximate parcel area, and existing dwelling units;
- one deterministic “What this means” state;
- at most one material interpretation notice;
- the exact statement `Development capacity has not yet been evaluated.`;
- one presentational feasibility disclosure;
- one link to the unchanged expert preview.

Individual lot-line unknowns, legal dimensions, floor area, slope, the full investigation queue, source-layer names, versions, and fingerprints stay out of the default public view.

## Deterministic summary states

| State | Public meaning |
|---|---|
| Verified residential | Residential zoning is verified. TruLot has source-backed base standards for this parcel. |
| Split zone | This parcel has split zoning. Different rules apply to different portions of the property. |
| Coastal review | Coastal applicability requires review before TruLot can select a definitive standards version. |
| Ambiguous zoning | The parcel’s zoning mapping requires review before TruLot can present definitive standards. |
| Unmapped zoning | Base zoning has not yet been mapped for this parcel, so definitive standards are not available. |
| Non-RS | Base zoning is recorded. Detailed standards for this zone are not yet available in this TruLot version. |
| Zoning source unavailable | Parcel identity is available, but the zoning source is currently unavailable. |
| Limited evidence | TruLot has recorded parcel evidence, but detailed standards are not yet definitive. |

The adapter uses existing structured states only. It contains no free-form generation or LLM call.

## Actions

`See what's needed to evaluate this property` is the native disclosure control. It explains the evidence needed for a future parcel-specific evaluation and shows at most three already-recorded investigation titles. It performs no request, calculation, or mutation.

`View zoning details and sources` links to the existing expert preview for the same APN. That page retains all standards, conditions, unknown inputs, investigations, provenance, and developer evidence without duplicating the expert renderer.

## Public and expert surfaces

| Surface | Purpose | Default information |
|---|---|---|
| Public Parcel Page V0 | Orientation / conversion | Identity, four core facts, concise meaning, capacity disclaimer, primary CTA |
| Expert Parcel Page V2 | Inspection / trust | Full standards, conditional rules, property evidence, unknowns, investigations, provenance |

Both surfaces should exist because a homeowner needs a fast, plain-language orientation while an expert or skeptical user needs to inspect the evidence and limitations. The public page links directly to that deeper surface instead of copying or weakening it.

## Preview boundary

The public route shares the Packet 21 gate:

- `TRULOT_PARCEL_V2_PREVIEW=1`; and
- `NODE_ENV` equals `development` or `test`.

It returns 404 by default and under production, even if the variable is set. It uses only the sealed Packet 18 fixture corpus. Packet 21.5 does not add a navigation link, canonical route, sitemap entry, production environment value, database read, snapshot selection, deployment, or Parcel V1 change.

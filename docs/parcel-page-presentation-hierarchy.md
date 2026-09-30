# Parcel Page presentation hierarchy

The bounded parcel preview now separates one sealed `ParcelIntelligenceV2` result into three presentation levels. This is a presentation boundary only. The sealed adapter, source values, truth states, zoning and Coastal results, standards versions, conditions, property facts, and fingerprints are unchanged.

## Level 1 — Parcel overview

Route: `/parcel-public-preview/[apn]`

The public surface provides parcel identity, conventional and normalized APNs, zoning, Coastal context, approximate geometry area, assessor-reported units, a concise interpretation, selected RS base standards, and readable source attribution. It uses the public vocabulary `Recorded`, `Estimated`, `Conditional`, and `Not yet verified` through descriptive labels such as `County assessor reports` and `Estimated from parcel geometry`.

The primary disclosure is `See what's needed to evaluate this property`. It opens existing missing-input information and performs no request or calculation. `Evaluate development potential` remains reserved for a future working feasibility product.

Single-zone parcels omit a meaningless `100%` label. Split-zone APN `4304211000` shows RS-1-7 at 64.3 percent and OR-1-1 at 35.7 percent of mapped parcel area. Its schematic explicitly states that it is not a surveyed boundary, legal lot-line determination, buildable envelope, or development allocation. Detailed standards remain limited to the RS-1-7 portion.

## Level 2 — Zoning details

Route: `/parcel-v2-preview/[apn]`

The zoning-detail surface shows every standard in the existing presentation contract, with density and FAR among the primary visible cards. Consequential conditions appear directly below conditional values; complete conditions remain available in native disclosures. A controlling source is shown once per zone group and individual cards retain compact section/table references.

Existing property facts preserve source semantics. Living area is not relabeled as gross floor area, parcel geometry area is not called legal lot area, and historical building outlines remain identified as 2017 plan-view evidence.

The former unknown and investigation sections are consolidated as `What still needs to be confirmed`. Lot-line gaps appear as one homeowner-facing item while the detailed front, side, street-side, and rear records remain on Level 3. Wording states what evidence is needed to assess a question and does not imply that collecting one item establishes compliance.

Readable official links cover SanGIS parcels, City Base Zoning, City Coastal Overlay, the San Diego Municipal Code, County Assessor resources, and building outlines when present.

## Level 3 — Technical evidence

Route: `/parcel-v2-evidence/[apn]`

The technical surface retains compilation and contract identity, acquisition IDs, mapping methods, source feature IDs, coverage evidence, full standards conditions, individual unresolved records, action contracts, internal artifact paths, versions, SHA-256 fingerprints, and containment safeguards. It provides return links to both homeowner-facing levels.

## Date meanings

- Intelligence compilation: September 30, 2026.
- Parcel and assessor snapshot acquisition: September 24, 2026.
- Zoning and Coastal snapshot acquisition: September 30, 2026.
- Residential standards source edition: September 2026.

These dates are displayed according to their distinct meanings. Compilation does not assert that every source fact was re-observed or legally revalidated on the compilation date.

## Production SEO contract

The Level 1 adapter defines, but does not publish, a parcel-specific production metadata contract:

- a title containing address, conventional dashed APN, and mapped zoning;
- a unique parcel summary;
- a stable canonical `/parcel/san-diego/[slug]` path;
- normalized and dashed APN display;
- accurate `WebPage` and `Place` structured data limited to parcel identity.

All three preview routes remain `noindex`, `nofollow`, `noarchive`, and `nosnippet`. No preview metadata is used on the canonical Parcel V1 route.

For a future production release, Level 1 is the indexable parcel landing page and uses its parcel-specific title, description, and self-canonical path. Level 2 initially uses `noindex, follow` on its own stable zoning-detail URL; it is not canonicalized to Level 1 because the two levels contain materially different content. Level 3 remains non-indexed technical evidence. These future policies are an indexing contract only and are not wired to a production route in this packet.

## Containment

All preview routes require `TRULOT_PARCEL_V2_PREVIEW=1` and a `development` or `test` runtime. Production always disables the loader. The routes read only the sealed fixture corpus. They do not access Supabase, select a snapshot, change production configuration, evaluate compliance, calculate capacity, blend standards, modify Parcel V1, deploy, or push.

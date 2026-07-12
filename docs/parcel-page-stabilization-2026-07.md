# Parcel Page Stabilization Sprint — July 2026

## Scope

This sprint preserves the current Parcel Page V1 work, establishes one canonical public Parcel Page path, quarantines unsupported legacy capacity outputs, and makes source failure states explicit so TruLot does not confuse source failure with authoritative absence.

No production data, migrations, or deployment state were changed in this sprint.

## Canonical decision

- Route: `/parcel/san-diego/[slug]`
- Adapter: `getParcelPageV1Result()`
- Public contract: `ParcelPageV1Data` plus explicit `pageStatus` and `sourceStatus`

`getParcelPageV1Data()` remains as a compatibility wrapper for local callers, but the canonical page now reads the typed result directly.

## Working-tree inventory

### Parcel Page V1 product work

- `app/parcel/san-diego/[slug]/page.tsx`
- `app/parcel/san-diego/[slug]/error.tsx`
- `app/parcel/san-diego/[slug]/not-found.tsx`
- `app/parcel/[apn]/page.tsx`
- `app/api/search/route.ts`
- `app/components/SearchBox.tsx`
- `app/page.tsx`
- `app/jobs/page.tsx`
- `app/sitemap.ts`
- `lib/parcel-page-v1.ts`
- `lib/parcel-slug.ts`
- `lib/forbidden-copy.ts`
- `docs/parcel-page-v1-field-mapping.md`

### Permit-linkage work

- `lib/permit-linkage.ts`
- `scripts/qa-permit-linkage.mjs`
- `scripts/report-permit-linkage.mjs`
- `docs/permit-linkage-reporting-v2.md`
- `docs/sql/permit-linkage-v2-backfill.sql`

### Migration or database work

- `supabase/migrations/20260522_overlay_lookup.sql`
- `supabase/migrations/20260705_permit_linkage_v1.sql`
- `supabase/migrations/20260706_permit_linkage_perf_v1.sql`
- `supabase/migrations/20260707_permit_linkage_report_v2.sql`
- `supabase/functions/nearby-parcels/index.ts`

### Documentation or QA

- `docs/audits/TRULOT_TECHNICAL_AUDIT_2026-07.md`
- `docs/parcel-page-stabilization-2026-07.md`
- `scripts/check-copy.mjs`
- `AGENTS.md`

### Temporary or generated

- `supabase/.temp/`

### Unrelated or not changed in this sprint

- Existing package and search/jobs polish changes outside the canonical Parcel Page flow were preserved in place and not reset.

## Consumer map

### `/api/parcel/[apn]`

- Declared consumer found in repo: none.
- Public route still exists and remains externally callable.
- This sprint leaves it readable but noncanonical and quarantines unsupported capacity fields.

### `getParcelPageData()`

- `app/api/parcel/[apn]/route.ts`

### `getParcelPageV1Data()`

- Compatibility wrapper only after this sprint.
- Previously consumed by:
  - `app/parcel/[apn]/page.tsx`
  - `app/parcel/san-diego/[slug]/page.tsx`
- Those page consumers now use `getParcelPageV1Result()` directly.

### `getParcelPageV1Result()`

- `app/parcel/[apn]/page.tsx`
- `app/parcel/san-diego/[slug]/page.tsx`

### `getPublicParcelPage()`

- No in-repo consumers found at stabilization time.
- The duplicate `lib/public/*` adapter family was later removed in the reconciliation sprint after the consumer map confirmed it was unused.

### Legacy and current contracts

- Legacy: `lib/parcel-page-contract.ts`
- Canonical current: `lib/parcel-page-v1.ts`
- Deprecated unused alternative at stabilization time: `lib/public/contract.ts`

## Failure-state contract

Canonical result states:

- `found`
- `not_found`
- `source_unavailable`
- `partial`
- `invalid_request`

Canonical source-level metadata:

- `sourceStatus.parcel`
- `sourceStatus.permits`
- `sourceStatus.overlays`
- `sourceStatus.similarLots`

Each source now carries:

- `status`
- `freshness`
- `safeErrorCode`
- `publicMessage`

### Behavior rules

- Parcel query failure returns `source_unavailable`, not `not_found`.
- Permit query failure returns `source_unavailable` and suppresses no-permit copy.
- Overlay query failure returns `source_unavailable` and suppresses “no overlay applies” conclusions.
- Similar-lot query failure returns `source_unavailable` and suppresses “no nearby precedents” conclusions.
- Parsed permits mentioning multiple distinct APNs are excluded from direct parcel history and surfaced as `partial`, not silently assigned to one parcel.

## Legacy API quarantine

Endpoint: `/api/parcel/[apn]`

Decision:

- Keep the endpoint readable for compatibility.
- Mark it noncanonical.
- Quarantine unsupported capacity outputs.

Affected fields:

- `capacity.baseline_units`
- `capacity.adu_upside_units`

Compatibility impact:

- Response shape is preserved.
- Capacity units now return `null` with `confidence: "unknown"` and quarantine metadata instead of unsupported calculations.
- New `api_status` metadata points callers at the canonical Parcel Page path and adapter.

Why the prior calculations were unsupported:

- They relied on legacy hardcoded zoning and ADU heuristics.
- They were not backed by a reviewed, versioned truth engine.
- They could present deterministic-looking unit counts without cited rule receipts.

Future migration path:

- Replace these quarantined fields with outputs from a versioned truth engine and a single canonical public contract.

## Multi-APN behavior

Intended direct-history rule:

- `exact_apn` is allowed in direct parcel history.
- `parsed_apn` is allowed only when the parsed APN candidates collapse to one parcel.
- Parsed permits naming multiple distinct parcels are excluded from direct history until ambiguity metadata is available.
- `address_match` is never allowed in direct parcel history.

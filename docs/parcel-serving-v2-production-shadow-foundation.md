# Parcel Serving V2 production shadow foundation

Status: repository foundation only. Public Parcel V1 remains authoritative. No production load or public cutover is authorized by this document.

## Sealed inputs

The importer accepts a manifest of operator-materialized files. Paths are supplied at execution time and are never embedded in the importer. Legacy integrated mode must match `scripts/parcel-serving-v2-production/expected.json`; parcel-only mode must match `parcel-only-expected.json`; the Packet 10 unselected zoning candidate must match `integrated-candidate-expected.json`. On the production path, every supplied artifact is hashed before the first database query.

| Identity | Sealed value |
| --- | --- |
| Parcel acquisition | `sangis-20260924T183743Z` |
| Parcel source / accepted / quarantine | `1,089,758 / 1,088,430 / 1,328` |
| City rows / distinct APNs | `393,733 / 393,733` |
| Parcel APN fingerprint | `93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25` |
| Parcel full-row fingerprint | `a30e506477248e46a66416821b8d12f58cec07e60a065860af5c0d595062006f` |
| Zoning acquisition | `zoning-city-sd-20260924T201131Z` |
| Zoning source / accepted / quarantine | `3,706 / 3,680 / 26` |
| Parcel-zone rows | `393,733` |
| Parcel-zone fingerprint | `313aa7ad46747bb97499a113842ac848de8f7357134e0558210692a1913a8ccf` |
| Integrated fingerprint | `27b1a362bdae28369cdf7274d1b9842bef07b5970e33c1f9522d68d042e616d8` |

## Production namespace

Migration `20260925090000_parcel_serving_v2_shadow_foundation.sql` creates only `trulot_v2` objects:

- `import_run`: immutable import identity, artifact hashes, counts, fingerprints and terminal status.
- `parcel_acquisition`: SanGIS source and normalization receipt.
- `parcel_base_sangis_v2`: accepted countywide parcel identity and geometry facts.
- `parcel_quarantine`: all rejected parcel rows, reasons, geometry metadata and source-row fingerprints.
- `zoning_acquisition`: Base Zoning V2 source and normalization receipt.
- `base_zoning_source_v2`: unrepaired valid source polygons.
- `base_zoning_quarantine`: invalid source-feature evidence. It is never serving data.
- `base_zoning_mapping_geometry`: valid source geometry plus separately labeled `EXPLICIT_MAKE_VALID` derivatives for the 26 rejected source features.
- `parcel_zone_mapping_v2`: one complete mapping evidence row per City parcel. Split and sliver evidence remains an array.
- `selected_snapshot`: the only promotion pointer inside the private V2 namespace.
- `parcel_serving_v2`: selected City parcel identity view.
- `parcel_intelligence_serving_v2`: selected Parcel V2 plus Base Zoning V2 view.

The migration never reads or changes `public.parcel_page_api_v2` or another legacy object. It declares PostGIS explicitly and is additive. Import refuses a nonempty V2 namespace.

## Import and reconciliation

The default `integrated` mode retains the original combined load. It requires every parcel, zoning, mapping and integrated-reference artifact, validates the integrated evidence, then selects the candidate. Packet 6A adds the explicit `--mode parcel-only` stage for parcel acquisition and validation only. Its manifest inventory contains exactly the five parcel artifacts, so zoning or mapping input is rejected rather than ignored.

Parcel-only mode writes only `import_run`, `parcel_acquisition`, `parcel_base_sangis_v2` and `parcel_quarantine`. It validates the loaded acquisition directly, never inserts `selected_snapshot`, and requires all zoning and mapping tables to remain empty. The existing serving views still join `selected_snapshot`, so an unselected parcel acquisition returns zero rows through both views.

Migration `20260925223612_parcel_only_import_run_stage.sql` adds an explicit `run_kind`. Existing rows default to `INTEGRATED`. A `PARCEL_ONLY` run requires a null zoning acquisition; an `INTEGRATED` run requires a non-null zoning acquisition. A composite foreign key makes `selected_snapshot` reference only the matching integrated run and acquisition pair.

Packet 10 adds `--mode integrated-candidate`. It requires the existing validated parcel acquisition `sangis-20260924T183743Z` and parcel-only run `724ff836-eedc-594e-93c5-c80a63de65f7`. The mode accepts no parcel artifacts and never calls the parcel writer. Its write allowlist is exactly `import_run`, `zoning_acquisition`, `base_zoning_source_v2`, `base_zoning_quarantine`, `base_zoning_mapping_geometry`, and `parcel_zone_mapping_v2`.

The candidate remains `run_kind = INTEGRATED` and reaches `status = VALIDATED` without a `selected_snapshot` row. `--validate-only` resolves that exact candidate and recomputes counts and fingerprints without writes. A replay with the same sealed zoning acquisition fails the parcel-reuse preflight before COPY. The schema already expresses an unselected validated integrated run, so Packet 10 adds no migration and does not alter grants, RLS, or serving views.

The importer verifies all artifact SHA-256 values before the first production database query. It then independently verifies acquisition receipts, normalized counts, raw-to-normalized source identity, parcel geometry hashes, zoning geometry hashes, the bounded explicit make-valid policy, mapping cardinality and mapping fingerprint.

Legacy integrated data is copied in one transaction and selected only after its database observations pass. Integrated-candidate data is also copied transactionally, but validation only marks its run `VALIDATED`; it never performs selection.

The bulk transaction and post-commit validation have separate bounded timeout contracts. Bulk COPY uses transaction-local `SET LOCAL statement_timeout = '30min'`. Count reconciliation and streamed fingerprints prepend session-only `SET statement_timeout = '30min'` in each validation `psql` subprocess, including `--validate-only` and `--resume-validation`. Neither contract changes database- or role-level settings, and neither disables timeouts.

- accepted parcel rows `1,088,430`;
- parcel quarantine rows `1,328`;
- City parcel rows and distinct APNs `393,733`;
- zoning source rows `3,680` and quarantine rows `26`;
- zoning mapping geometry rows `3,706`;
- parcel-zone mapping rows `393,733`;
- no duplicate served APNs;
- no mapping row without a parcel;
- no City parcel without a mapping row;
- exact five-state mapping counts;
- exact parcel APN, parcel full-row, parcel-zone and integrated fingerprints.

Only legacy `integrated` mode inserts `selected_snapshot`. `integrated-candidate` has a separate finalization branch that contains no selection statement and asserts that `selected_snapshot`, `parcel_serving_v2`, and `parcel_intelligence_serving_v2` all remain empty.

Integrated production execution requires a separately authorized database URL held in an environment variable plus both `--authorize-production-load` and `TRULOT_V2_PRODUCTION_LOAD_AUTHORIZED=1`. Parcel-only production execution instead requires `--authorize-production-load` and `TRULOT_V2_PARCEL_LOAD_AUTHORIZED=1`. The unselected zoning candidate requires `--authorize-production-load` and its distinct `TRULOT_V2_ZONING_CANDIDATE_LOAD_AUTHORIZED=1` gate. Every mode validates the sealed project ref and database name before connecting. Credentials alone never authorize a load.

The current candidate contract pins zoning acquisition `zoning-city-sd-20260930T024032Z`, 3,706 source features, 3,680 accepted features, 26 quarantine rows, 3,706 mapping geometries, 393,733 parcel mappings, and all Packet 9 portable fingerprints. The full fresh rehearsal passed 27 checks with no selection or serving rows; compact evidence is recorded in `data/parcel-serving-v2-production/integrated-candidate-rehearsal.json`.

On a production target, the importer verifies that the complete foundation object set already exists and refuses a partial or absent foundation. It does not rerun the foundation migration. The staging migration is applied only when its `run_kind` column is absent, then its four constraints are verified. Disposable local rehearsals may bootstrap the foundation before applying the staging migration.

## Security

All base tables have RLS enabled and no permissive policies. `PUBLIC`, `anon` and `authenticated` receive no schema or table access. `service_role` receives schema usage and read access only to the selected serving dependency closure and the two serving views. It receives no read access to either quarantine table and no migration/import privileges from this migration.

Migration/import authority remains the database owner used by the separately approved operator procedure. The runtime adapter uses `SUPABASE_SERVICE_ROLE_KEY` only on the server. The custom schema must be added to the project Data API exposed-schema list before a separately authorized shadow run; exposing the schema does not grant `anon` or `authenticated` access.

## Parcel Truth V2 contract

`lib/parcel-serving-v2.ts` separates:

- `found`: parcel and resolved Base Zoning V2 evidence;
- `partial`: parcel found while zoning is `UNMAPPED` or `INDETERMINATE`;
- `not_found`: successful absence from the validated selected City snapshot;
- `source_unavailable`: query failure or rejection;
- `malformed_result`: serving schema or acquisition identity mismatch;
- `invalid_request`: input is not an exact 10-digit APN or complete `3-3-2-2` display APN.

Null address remains null. Geometry-derived area is labeled `Approximate geometry-derived parcel area (not legal lot area)`. Taxable acreage remains separate. Complete zoning evidence and mapping state are retained.

## Compatibility map

| Parcel V1 expectation | V2 disposition |
| --- | --- |
| APN | Available, exact 10-digit identity |
| Address | Available or explicit null |
| ZIP | Available from situs source |
| Jurisdiction | Available as source code `SD` |
| Centroid and point-on-surface | Available and separately labeled |
| Lot area | Geometry-derived approximate area only; never legal lot area |
| Base zoning | Available with complete mapping state and evidence |
| Assessor/use and structure facts | Deferred; not synthesized |
| Year built and living area | Deferred; not synthesized |
| Community/neighborhood | Deferred; not synthesized |
| Nearby development | Deferred; not synthesized |
| Ownership, sales and sewer | Deferred; not synthesized |
| Permits | Independent |
| Overlays | Independent |
| Verified Standards | Independent and still gated |

## Shadow read

The canonical page continues to await only `getParcelPageV1Result()`. When `TRULOT_PARCEL_V2_SHADOW=1` and the environment is local, test, or Vercel preview, Next.js `after()` performs the V2 read after the response. `VERCEL_ENV=production` always disables the hook.

The comparison logs only APN plus field classifications. It does not send diagnostics to a Client Component or include them in page HTML. V2 errors are caught and cannot replace, reject or delay Parcel V1 output. Compared fields are limited to presence, APN, address, ZIP, jurisdiction, coordinates, area semantics and base zoning. Classifications are `MATCH`, `NORMALIZED_EQUIVALENT`, `SOURCE_VINTAGE_DIFFERENCE`, `LEGACY_SEMANTICS_UNKNOWN`, `V2_CORRECTION_CANDIDATE` and `UNRESOLVED`.

## Route and slug behavior

- Exact 10-digit and complete `3-3-2-2` APNs can be shadow-read.
- Existing public 8/9-digit padding remains unchanged in Parcel V1 during this packet.
- V2 classifies a route that requires padding as `legacy_padding_required` and performs no V2 lookup. Padding is not silently incorporated into clean V2 identity.
- Null-address V2 records use `apn-<10-digit-apn>`.
- An address change changes the canonical V2 slug but not the APN identity. Public redirect behavior remains controlled by Parcel V1 until cutover.
- Stacked parcels retain separate APNs and separate canonical routes even when parcel ID and geometry match.

## Future search path

Search remains on Parcel V1. A future V2 search adapter should query only `parcel_serving_v2`, use exact APN then deterministic APN-prefix behavior, and search normalized V2 address fields. Query failure must remain `source_unavailable`; a successful zero-row response remains an empty result. Search must not infer identity through 8/9-digit padding.

## Rollback

Before cutover, rollback is to leave `TRULOT_PARCEL_V2_SHADOW` unset. Public Parcel V1 has no V2 dependency. The isolated schema may be dropped only under separate authorization after preserving its import receipt; no legacy reconstruction is involved.

# Packet 9 — Parcel identity shadow comparison

**Result: PARCEL_IDENTITY_DUAL_READ_FAIL; IDENTITY_REQUIRES_FURTHER_RECONCILIATION.**

The local V2 rebuild and offline comparison implementation pass their checks. The live legacy source returned HTTP 522 on three consecutive bounded GETs. No legacy rows were obtained. This packet therefore cannot complete a paired identity comparison or approve cutover design. This is an evidence-availability failure, not evidence that V2 identity is invalid.

## Boundary and baseline

Worktree `/Users/ops/trulot-web-parcel`, branch `codex/trulot-parcel-v1-hardening`, started clean at `a483f084c565af114858dd2b2dfe21ba98acc09d`, tree `d4c5f71fe7c23457e600ee8bf9ca0495597fb573`.

V2 was rebuilt with unchanged Packet 7/8 tooling, solely in a fresh private Unix-socket PostgreSQL cluster with TCP disabled. Immutable acquisition verification passed all 37 artifact/metadata hashes, including raw SHA-256 `07913d1007d0e2f5b80c681c19c76bb1338f4b06d99c401c1784744bbd1a4544`. Base count is 1,088,430; City serving count is 393,733. Full base fingerprint is `8bdf89447fd77bd616a882db15875e8674b999051a1954caf1d4cec8a6c6df45`; full serving fingerprint is `a30e506477248e46a66416821b8d12f58cec07e60a065860af5c0d595062006f`. Both serving rebuild reports exactly equal Packet 8, including provenance.

Legacy boundary: `public.parcel_page_api_v2`; columns `apn_norm,address,situs_zip,lat,lng,lot_area_sqft,slug`. Repository security evidence describes a table with a public SELECT policy; its historical DDL is in `supabase/rehearsal/20260711_remote_public_baseline_subset.sql`. Existing public anonymous credentials were read locally without printing/copying them. No database URL, service credential, auth client, RPC or write-capable helper was used.

[PostgREST transaction documentation](https://docs.postgrest.org/en/stable/references/transactions.html) specifies READ ONLY for table/view GETs. The collector fixes the relation, seven columns, HTTPS Supabase host and GET method; disallows redirects; validates ten-digit APNs; caps the manifest at 1,000 and each batch at 40; and requests only explicit APNs. `count=exact` is restricted by that same APN filter. `limit=batch+1` and Content-Range checks detect truncation/duplicates. It has no DDL, DML, view refresh, cache mutation or telemetry operation. The Supabase changelog was inspected; no relevant change to hosted table GET semantics was identified. The broad existing production QA runner was deliberately not invoked because it calls write-capable helpers.

The initial collector was manually terminated after repeated 522 failures. Three completed 522 responses are confirmed (120 selected APNs); the next batch of at most 40 may have been in flight. Remaining APNs were not requested. The receipt explicitly records that it was reconstructed from execution observations, an execution timestamp interval rather than invented per-request times, the executed script hash, and unavailable/interrupted/unattempted distinctions. The final collector adds an automatically tested two-failure circuit breaker and was **not rerun live**. No successful legacy response or local trustworthy population snapshot was available. The synthetic rehearsal seed is not comparison evidence. Parcel ID/jurisdiction exposure cannot be established from the historical subset or the failed requests.

## Deterministic sample

576 distinct accepted SD APNs. The query selects the first 500 ordered by `md5('trulot-packet9-v1:' || apn_norm), apn_norm`, then unions 20 per ordinary/stacked/missing-address/null-acreage/populated-acreage/Polygon/MultiPolygon/centroid-outside category; up to 60 representatives ordered by trimmed five-digit ZIP prefix then hash/APN; ten smallest and ten largest geometry areas; historical APN `5470501600`; and numeric predecessors/successors of each of five quarantined duplicate APNs. APN ordering breaks all ties. Tags overlap and are retained. Numeric neighbors imply neither geographic adjacency nor cadastral lineage. Quarantined APNs themselves are excluded and verified absent from the sample.

Actual coverage: 399 ordinary, 177 stacked, 48 null address, 525 null acreage, 51 populated acreage, 537 Polygon, 39 MultiPolygon, 23 centroid-outside, and 65 nonempty five-digit ZIP prefixes (531 distinct raw ZIP values). Raw ZIP+4/padding values are preserved. Sample selections across two serving rebuilds are byte-identical: SHA-256 `f49aebf96daddce72efdfb4d498f956ddc667d801deac082031f29708d881796`.

This V2-seeded sample cannot measure legacy-only population or establish City-wide parity. It is stratified coverage, not an unbiased estimate of discrepancy prevalence. The zero observed LEGACY_ONLY count is not proof of absence.

## Comparison semantics

- Raw source strings/numbers remain in evidence. Address comparison uppercases, collapses whitespace, removes periods after letters at token ends and commas before whitespace/end. It retains fractions, decimal house numbers, hyphens, apostrophes, street and unit text. No abbreviation expansion or unit omission is used to force equality. EXACT requires raw equality; blank-only text is treated as null. ZIP comparison trims padding only; ZIP5 and ZIP+4 are not silently equated.
- Coordinate differences include signed latitude/longitude deltas and spherical haversine meters (mean Earth radius 6,371,008.8m). Compare both V2 centroid and point-on-surface independently. Effectively equal is <=0.01m, a numerical/rounding tolerance far below source spatial precision; other buckets are (0.01,1), [1,5), [5,25], and >25m. This tolerance is diagnostic, not an accuracy claim. No proximity-based lineage inference is permitted.
- Geometry area and taxable acreage remain different facts. Acreage is converted to square feet using 43,560 only for diagnostics. Absolute and signed deltas and absolute percentage relative to the legacy value are recorded. Percent buckets: <1%, [1,5)%, [5,10]%, >10%; null sides and zero legacy denominators are separate. Legacy `lot_area_sqft` lineage is unresolved; numeric agreement alone is not semantic equivalence or legal lot area.
- Current canonical slug is reconstructed with the actual repository slug helper and V1's address-or-formatted-APN fallback. V2 uses its nullable situs address. Stored legacy `slug` is retained separately and never assumed to equal current runtime canonical slug. Same APN extraction is checked before route compatibility classification. Current output is returned by object identity even if either shadow source throws. No runtime imports this adapter.
- Every observed difference gets a field-level classification. Without explicit lineage, address/ZIP/routes/presence are UNRESOLVED and coordinate/area/stored-slug differences are LEGACY_SEMANTICS_UNKNOWN. No code infers SOURCE_VINTAGE_CHANGE, V2_CORRECTION, LEGACY_ENRICHMENT or a V2 defect merely from disagreement. Future positive lineage claims require additional evidence/review. Both sources' states are retained; simultaneous failures do not become absence. Neither-present inputs have no comparison subject and remain non-parity evidence.

## Results and unavailable comparisons

| Existence | Count |
|---|---:|
| BOTH_PRESENT | 0 |
| V2_ONLY | 0 |
| LEGACY_ONLY | 0 |
| LEGACY_UNAVAILABLE | 576 |
| V2_UNAVAILABLE | 0 |

Paired denominator is **zero**. All six address buckets, all coordinate distance buckets, area percentage/null buckets and observed route buckets contain zero evaluated pairs. Those zeroes must not be read as equality, zero discrepancies or proven missing values. Substantive address differences, coordinate outliers, area outliers and source-vintage changes could not be inspected without legacy values.

The one trustworthy committed display example (`23cbcc4351c4734a980e3303635758537701b51e:app/page.tsx:39-42`) has `740 47th St` for APN `5470501600`; current V2 has `740 47TH ST`. They are normalized-equivalent. Applying today's canonical helper to those addresses yields the same slug. The old committed link uses a historical route shape and is not proof of today's runtime URL or a full legacy database row. This reference is excluded from population-pair statistics.

Static route analysis shows a compatibility issue: for a null address, current V1 uses e.g. `547-050-16-00-apn-547-050-16-00`, whereas V2 uses `apn-5470501600`. The sample contains 48 V2-null addresses that need this review; these are not 48 observed legacy route changes. Future substantive address changes also require a canonical redirect strategy. No URL was changed.

| Classification | Count | Meaning |
|---|---:|---|
| V2_CORRECTION | 0 | No correction established |
| SOURCE_VINTAGE_CHANGE | 0 | No vintage difference established |
| LEGACY_ENRICHMENT | 0 | No enrichment lineage established |
| LEGACY_SEMANTICS_UNKNOWN | 0 | No numeric/stored-slug pairs obtained |
| V2_DEFECT_CANDIDATE | 0 | None identified by local source/rebuild checks |
| UNRESOLVED | 576 | Source availability blocks presence comparison |

No V2 defect candidates identified. That finding is limited to acquisition, normalization, relational integrity, serving repeatability and offline logic; it does not certify unobserved legacy compatibility.

## Candidate authority decision

| Field | Readiness | Reason |
|---|---|---|
| APN | NEEDS_MORE_EVIDENCE | Clean source identity verified; paired legacy population/compatibility unavailable |
| Parcel ID | NEEDS_MORE_EVIDENCE | V2 source ID semantics known; legacy field exposure/lineage unverified |
| Jurisdiction | NEEDS_MORE_EVIDENCE | Source SD code and scope verified; legacy overlap unavailable |
| ZIP | NEEDS_MORE_EVIDENCE | Raw ZIP/ZIP+4 retained; legacy formatting/value comparison unavailable |
| Address | NEEDS_MORE_EVIDENCE | Source composition verified; null/unit and canonical-route compatibility unresolved |
| Centroid / point-on-surface | NEEDS_MORE_EVIDENCE | Valid derived points; legacy point methodology/outliers unknown |
| Geometry-derived area | NEEDS_MORE_EVIDENCE | Reproducible derived value; legacy area comparability unresolved |
| Taxable acreage as legacy lot area replacement | NOT_READY | Distinct source meaning; no semantic-equivalence proof |
| Canonical slug | NEEDS_MORE_EVIDENCE | Static null fallback difference; actual route-change set unavailable |

These are readiness states for eventual replacement of legacy identity behavior, not a downgrade of the proven clean-source V2 facts. There is no evidence-supported cutover field set in this packet.

## Verification and evidence

`data/parcel-identity-shadow/sample.json` retains all sample raw local identity values/strata. `legacy-receipt.json` records the failed boundary, explicit APNs and timestamps. `comparisons.json` classifies each APN; `report.json` is generated offline and includes the independent historical example. `local-rebuild.json` records exact fingerprints, import receipt and local boundary. `decision.json`, `validation.json` and `preservation.json` record the decision, test results and preservation evidence.

New offline tests cover normalization (including units/fractions/decimals), exact tolerance boundaries, area/null/zero denominators, all existence states, malformed/duplicate/unavailable sources, conservative classification, canonical routes, immutable current output, HTTP request bounds, circuit breaking, batch completeness and committed strata. Local tests verify byte-identical selection after a serving rebuild, exact Packet 8 report/fingerprints, valid unique sample APNs and exclusion of quarantine. The report is regenerated byte-identically from committed inputs.

Safe commands include:

```sh
node scripts/parcel-identity-shadow/test.mjs
node scripts/parcel-identity-shadow/report.mjs data/parcel-identity-shadow/sample.json data/parcel-identity-shadow/legacy-receipt.json /private/tmp/new-shadow-report
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-identity-shadow/sample.py BOUNDARY NEW_SAMPLE_JSON
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-identity-shadow/test-local.py BOUNDARY SAMPLE1 SAMPLE2 OUTPUT_JSON
```

The live fetch command is deliberately separate and is not part of regression tests. Tests mock it. Do not invoke the broad production QA script as a fallback. Future successful source acquisition must retain raw responses and rerun the paired analysis before revisiting this decision.

All requested safe existing suites passed except global lint's unchanged `supabase/functions/nearby-parcels/index.ts:125:67` no-explicit-any error and six pre-existing warnings. Changed-file ESLint, typegen, TypeScript and whitespace checks passed. Exact commands/outcomes are recorded in `validation.json`.

Only packet-specific scripts, evidence and this document changed. No app/lib, tests outside this packet, SQL, package/dependency or deployment changes. Production received only the bounded GET attempts; no production writes, refresh or cache mutation command occurred. There was no push or deployment. Original checkout branch, HEAD, short status, diffs and tracked/nonignored file hashes were compared before/after. The disposable cluster was stopped with files retained.

# Parcel Lookup Production V0 design

## Decision and boundary

Packet 44 selects a **dedicated private search materialization** derived only
from validated Parcel Base V2 identity. The production contract is
`ParcelLookupProductionV0`. It resolves an address or APN to City of San Diego
parcel identity and returns only bounded display fields. It does not expose
Parcel Intelligence V2, zoning, Coastal context, structure facts, standards,
compliance, legal-lot status, capacity, ADU, SB9, SB79, or feasibility.

The derivation is pinned to parcel acquisition `SANGIS-20260924T183743Z` and
validated parcel-only run `724ff836-eedc-594e-93c5-c80a63de65f7`. It reads
`trulot_v2.parcel_base_sangis_v2` directly during an explicitly authorized
backfill. It never reads `selected_snapshot`, `parcel_serving_v2`,
`parcel_intelligence_serving_v2`, zoning tables, or Packet 11 artifacts.

## Field inventory

| Field | Classification | Use |
| --- | --- | --- |
| `apn_norm`, formatted APN | Required for search and result | Exact/prefix lookup, identity, copy action |
| source address | Required for result | Human-readable situs; nullable |
| normalized address and unit alias | Required derived search fields | Exact and indexed token-prefix candidates |
| situs components | Backfill input only | Deterministically derives address aliases; not returned wholesale |
| ZIP, `SD` jurisdiction | Required for result | Orientation and scope confirmation |
| parcel ID, source object ID | Required internal identity | Reproducibility and stack preservation; neither is public output |
| point on surface | Optional orientation, selected for V0 | Small point-only map/orientation payload |
| approximate geometry area | Selected-identity result only | Clearly labeled approximate geometry area |
| geometry hash | Internal verification only | Reconciliation; not returned |
| full polygon | Deferred | Source remains intact; excluded from V0 payload |
| taxable acreage | Excluded | Not needed for identity lookup |
| zoning, Coastal, structure, standards, feasibility | Excluded | Outside the safe identity boundary |

## Architecture choice

| Option | Safety and permissions | Performance | Reproducibility and operations | Decision |
| --- | --- | --- | --- | --- |
| A. Query the base table directly | Private source stays authoritative, but the runtime touches a large geometry-bearing truth table | Existing APN index helps; address normalization and indexing would couple search to source | Least duplication, highest runtime coupling and migration risk | Rejected |
| B. Derived view plus source indexes | Can project safe columns, but still requires search indexes or derived source columns | View cannot isolate search write/read load; token search remains awkward | Reproducible SQL, but source schema becomes search infrastructure | Rejected |
| C. Dedicated private materialization | Narrow fields, isolated grants, no source-table runtime grant | Purpose-built APN, exact-address, and FTS indexes | Versioned derivation can be reconciled, staged, and rolled back independently | **Selected** |

The table is additive in the existing private `trulot_v2` schema. A future
implementation backfills it from the exact acquisition inside one transaction,
requires 393,733 rows and APNs, records the derivation contract, and compares
identity fingerprints before enabling any read path. Refreshes build a new
version alongside the current one and switch only an explicit lookup dataset
identifier after validation. That identifier is lookup-specific and is not the
Parcel V2 selected snapshot.

## Normalization and ranking

The server imports Packet 43's `normalizeApnInput`, `formatApn`,
`normalizeAddress`, input types, states, and final deterministic ranker. No SQL
function redefines those semantics. Ten digits are required for an exact APN;
six through nine digits are an explicit prefix; values are never padded.

Derived address aliases retain the source base situs and unit-aware situs. The
database retrieves a bounded candidate set; the existing TypeScript rank order
then determines exact APN, exact address, APN prefix, address prefix, token
prefix, and bounded substring tiers. Database order never chooses a parcel.

Multiple APNs at the same normalized address, condo units, repeated parcel IDs,
and shared geometry remain separate rows. An exact base address with more than
one identity returns `MULTIPLE_MATCHES`. The UI must ask the user to select and
must never pick an arbitrary winner. Missing-address parcels remain resolvable
by APN and display the formatted APN as their label.

## Query and index model

The inert design SQL is
[`docs/sql/parcel-lookup-production-v0-design.sql`](sql/parcel-lookup-production-v0-design.sql).
It proposes:

- a unique `(acquisition_id, apn_norm)` identity;
- a `text_pattern_ops` APN prefix index;
- exact normalized base-address and unit-address B-tree indexes;
- a stored `simple` `tsvector` plus GIN index for deterministic token-prefix
  candidate retrieval;
- no new derived columns or grants on Parcel Base V2.

Exact APN uses indexed equality and `LIMIT 11`. APN prefix uses validated
digits with indexed prefix `LIKE` and `LIMIT 11`. Exact address checks both aliases and returns at
most 11. Autocomplete converts validated alphanumeric tokens to a prefix
`to_tsquery`, retrieves at most 50 candidates, applies the Packet 43 ranker,
and returns at most 10. The implementation must run PostgreSQL `EXPLAIN
(ANALYZE, BUFFERS)` and confirm the intended indexes before any rollout.

No `%substring%` scan is part of the production candidate query. Packet 43's
lowest substring rank may only be evaluated inside the already bounded candidate
set. If the bounded implementation cannot preserve a Packet 43 case through the
FTS candidate stage, it must stop for a contract decision rather than broaden to
an unindexed scan.

## Geometry decision

The first production release returns point-on-surface orientation only. Full
polygons are several orders of magnitude larger, are unnecessary to resolve
identity, and would complicate response-size and cache controls. The source
polygon remains unchanged in Parcel Base V2. A later bounded packet may add a
display-only simplified outline with its own provenance, size ceiling, and
performance proof. The point is labeled “Display orientation only” and cannot
be represented as a survey or legal boundary.

## Security model

`trulot_v2.parcel_lookup_v0` remains in a private, non-exposed schema. The design
revokes table access from `public`, `anon`, `authenticated`, and `service_role`.
RLS is enabled with no permissive client policy as defense in depth. The app
does not receive a raw table grant. A future implementation may add one
fixed-shape `SECURITY DEFINER` RPC wrapper in an exposed schema, with a fixed
`search_path`, a non-user-selectable acquisition ID, bounded fields, and execute
permission only for `service_role`. The Supabase service key remains server-only.
An equally narrow server database adapter is acceptable if it uses a dedicated
least-privilege credential. Either choice requires a security review before
mutation.

The public Next.js endpoint validates and normalizes all input, supplies only
parameters, caps work and output, converts database errors to stable public
states, and never returns SQL text, relation names, source IDs, geometry hashes,
or stack traces. No anonymous client can query the table or RPC directly.

## API contract and failure behavior

The proposed server endpoint is `GET /api/parcel-lookup?q=<query>&limit=<n>`.
`limit` defaults to 10 and is clamped to 1–10. Successful responses conform to
`ParcelLookupProductionV0`:

```json
{
  "contractVersion": "parcel-lookup-production-v0-p44",
  "inputType": "FULL_ADDRESS",
  "state": "MULTIPLE_MATCHES",
  "normalizedQuery": "1501 FRONT ST",
  "candidates": [],
  "selected": null,
  "returnedCount": 2,
  "hasMore": false,
  "ambiguous": true
}
```

Candidate fields are address, display address, canonical and formatted APN,
`SD` jurisdiction, ZIP, and point-only orientation. A selected
identity may additionally return clearly labeled approximate geometry area.

Empty, too-short, malformed, and invalid APN input returns a stable 400-class
state with no query. No match returns 200 with `NO_MATCH`. Multiple identities
return 200 with `MULTIPLE_MATCHES`; no redirect occurs. Source unavailable and
database unavailable return `SOURCE_UNAVAILABLE` with 503. The query timeout
returns `TIMEOUT` with 504. There is no implicit fallback to legacy V1 search.

## Performance and abuse controls

- minimum normalized query length: 2; APN rules remain stricter;
- client result limit: 1–10; database candidate limit: 50;
- statement timeout target: 500 ms; request deadline target: 1 second;
- response target: at most 10 candidates and 64 KiB serialized;
- per-IP/user rate limit proposal: 30 requests/minute with a short burst of 10;
- reject unknown parameters, oversized input above 160 characters, control
  characters, excessive token counts above 12, and malformed APNs before SQL;
- cache only sanitized public identity responses for a short bounded period;
- do not expose offset pagination, bulk lists, bounding-box dumps, or arbitrary
  sort/filter parameters.

These are implementation acceptance criteria, not public service guarantees.

## UX, routes, and SEO

Stage 1 uses a private dedicated lookup page. Stage 2 may place the same search
box on a dedicated public lookup page behind an explicit production feature
flag. Stage 3 may adopt it as default site search. Selecting an identity resolves
to the existing canonical `/parcel/san-diego/[slug]` Parcel V1 destination using
the existing canonical slug helper. Parcel V1 rendering and data loading remain
unchanged.

Every candidate and selected identity displays `###-###-##-##` prominently and
provides one-click **Copy APN** with visible feedback. APN cannot be hidden in a
details disclosure. Point orientation can appear beside the selected identity;
the first release does not promise an outline.

The API sends `X-Robots-Tag: noindex, nofollow` and `Cache-Control` appropriate
to bounded public identity data. Autocomplete state does not create crawlable
query URLs, canonical tags, sitemap entries, or structured-data pages. The
existing resolved parcel page remains the indexable canonical destination.

## Observability

Record query type, input-length bucket, token-count bucket, latency, bounded
result-count bucket, outcome state, ambiguity, no-match, timeout, and error rate.
Do not log raw address/APN queries, response bodies, exact normalized queries,
IP addresses beyond the rate limiter's short-lived keyed representation, or
database errors. Dashboard alerts cover error rate, timeout rate, p95 by query
type, abnormal no-match/ambiguity changes, and rate-limit volume.

## Rollout and rollback

1. **Stage 0 — local/rehearsal:** full City corpus, contract/static tests, and
   PostgreSQL query-plan proof. Completed here for SQLite; PostgreSQL proof is
   retained for implementation.
2. **Stage 1 — private/internal production:** explicit authorization to apply the
   reviewed migration, reconcile the exact acquisition, enable a private flag,
   and run read-only production probes.
3. **Stage 2 — public flagged lookup:** separate authorization, bounded traffic,
   alerts, and no canonical route change.
4. **Stage 3 — default site search:** separate authorization after observed
   latency, quality, abuse, and failure evidence.

Rollback is independent: turn off the lookup flag, hide the UI, and have the API
return 404/disabled. Parcel V1 and canonical URLs continue unchanged. The
derived table can remain dark for forensic comparison or be removed in a later
authorized migration; source data is never changed or lost.

## Full-corpus rehearsal

The rehearsal reads the sealed local Parcel V2 artifact, confirms 1,088,430
accepted countywide rows, loads exactly 393,733 unique `SD` APNs into a
disposable SQLite 3.51.3 FTS5 index, exercises exact APN, APN prefix, exact
address, partial token-prefix autocomplete, ambiguous/shared addresses,
stacked parcel IDs, missing addresses, and point-only map payload, then deletes
the database. It does not access production.

Observed local query p95 values across 200 deterministic, evenly spaced
full-corpus probes were 0.015 ms exact APN, 0.064 ms exact address, and 0.603 ms
autocomplete. SQLite
plans used the primary key, exact-address B-tree, and FTS virtual index. These
meet the engineering targets in this local process, but are not PostgreSQL,
network, or public SLA claims. See
[`data/parcel-lookup-production-v0/rehearsal.json`](../data/parcel-lookup-production-v0/rehearsal.json).

## ScoutRed bridge

The independent comparison can later fill: steps to APN, time to APN,
autocomplete quality, partial-address tolerance, APN prominence, copy behavior,
map utility, and first-screen basic facts. State remains
`AWAITING_INDEPENDENT_EVIDENCE`; Packet 44 makes no competitive superiority
claim and does not tune behavior to unavailable results.

## Readiness

The identity boundary, search materialization, exact query patterns, security,
API, abuse controls, UX integration, full-corpus evidence, staged rollout, and
independent rollback are specified. The smallest next packet is a bounded
implementation that creates and backfills the private materialization,
reconciles the exact Parcel V2 acquisition, proves PostgreSQL plans and latency,
and keeps every production surface behind an explicit disabled flag.

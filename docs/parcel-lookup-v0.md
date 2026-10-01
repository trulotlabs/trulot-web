# Parcel Lookup V0

Parcel Lookup V0 implements the first product step as **lookup → parcel orientation → intelligence**. It is a development/test preview over a sealed 49-record City of San Diego corpus and is not connected to production search, routing, or databases.

## Existing-search inventory

| Surface | Classification | Parcel Lookup V0 decision |
| --- | --- | --- |
| `/` prelaunch page | Reusable product shell; no parcel search exists | Unchanged |
| `/api/search` | Legacy but salvageable; tied to Parcel V1 and live Supabase assumptions | Not imported or modified |
| `/parcel/san-diego/[slug]` | Canonical Parcel V1 route | Unchanged |
| `/parcel/[apn]` | Legacy Parcel V1-compatible route | Unchanged |
| `lib/parcel-slug.ts` | Canonical route helper; APN padding is unsafe for lookup validation | Not reused for lookup normalization |
| Parcel V2 preview gate and sealed loader pattern | Reusable | Gate and fail-closed design reused |
| Public Parcel Page V0 / Parcel Page V2 preview | Reusable bounded destinations where a fixture exists | Linked only from the gated preview |
| Parcel V2 geometry acquisition | Reusable authoritative identity source | Sanitized 49-record subset sealed locally |

No existing autocomplete component, production home-page parcel search, or reusable parcel-outline component existed.

## Contract and ranking

The contract accepts `FULL_ADDRESS`, `PARTIAL_ADDRESS`, `FORMATTED_APN`, `UNFORMATTED_APN`, and explicit six-to-nine-digit `APN_PREFIX` input. It returns `EXACT_MATCH`, `MULTIPLE_MATCHES`, `PARTIAL_MATCHES`, `NO_MATCH`, `INVALID_APN`, `MALFORMED_QUERY`, `EMPTY_QUERY`, or `SOURCE_UNAVAILABLE`.

APNs must contain exactly 10 digits for selection. Ordinary whitespace and punctuation separators are removed, and the result is displayed as `###-###-##-##`. Short values are never padded and never resolve to a parcel.

Address normalization is deterministic: Unicode compatibility normalization, uppercase, punctuation and whitespace normalization, cardinal-direction abbreviation, and common street-suffix abbreviation. Unit tokens are preserved. The lookup never invents a house number or unit.

Candidates sort by these explicit tiers, then display address and APN:

1. exact APN;
2. exact normalized address;
3. exact normalized unit address when the query explicitly supplies a unit;
4. APN prefix;
5. normalized address prefix;
6. all normalized query tokens matched as candidate-token prefixes;
7. bounded normalized substring;
8. incidental unit-number match.

Autocomplete begins at two characters, returns at most 10 records, promotes exact matches, and exposes listbox semantics, arrow navigation, Enter selection, Escape dismissal, and visible focus. An exact address shared by multiple tax identities returns every bounded match up to the documented maximum and never silently selects one.

## Result and map

The resolved URL is `/parcel-lookup-preview?apn=<10 digits>`. Search-result URLs are not created as separate indexable pages, and the route declares `noindex` metadata. The compact result includes the supported situs, prominent formatted APN with copy feedback, jurisdiction, approximate geometry area, existing units where recorded, already-approved base-zoning and Coastal orientation, and the real sealed Parcel V2 polygon fitted into an offline SVG base context. The map states that it is for orientation and is not a legal survey.

`View parcel details` opens bounded parcel identity and source detail in place. Where the existing Parcel Intelligence fixture is present, `View zoning details` links to the gated Parcel V2 preview. The lookup performs no compliance, legal-lot, feasibility, or development-capacity analysis.

## Corpus and private input

The corpus has 49 public-authority parcel records and 60 sanitized benchmark queries. It covers 639 N 67th St, 1456 27th St, 7553 Cabrillo Ave, the Whitehaven split-zone fixture, missing situs, formatted and raw APNs, directionals, numbered streets, repeated parcel IDs, shared geometry, unitized records, and multiple APNs at one situs.

The optional `prop list apns.xlsx` workbook was not available in the working environment. It was not used. If later supplied, it remains `PRIVATE_BENCHMARK_INPUT`, may seed only sanitized queries, and cannot override Parcel V2.

## Production integration doctrine

The eventual production funnel is **Search → Level 1 public parcel page → Level 2 zoning detail → feasibility**. Production integration requires a separate decision covering full-corpus indexing, service reliability, observability, URL and SEO policy, ambiguity telemetry, security, and production performance. This packet changes none of those surfaces.

## ScoutRed comparison

`scoutred-comparison-contract.json` reserves like-for-like dimensions for steps and time to APN, autocomplete, partial-address tolerance, APN prominence, copy behavior, parcel map, and first-screen facts. Its state is `AWAITING_INDEPENDENT_EVIDENCE`; no superiority claim is made.

## Packet 43B acceptance closure

The mobile result orders the identity card before the parcel map so address,
formatted APN, and Copy APN remain visible together at 390×844. Empty and
one-character validation appears only after submission and leaves the input
focused. Preview-gated `failure=source-unavailable` and
`failure=selected-open` injections provide deterministic browser recovery
coverage and are disabled in production regardless of query parameters.

Test-only `fixture=ranking` and `fixture=normalization` modes are likewise
preview-gated, visibly labeled synthetic, and loaded from a file isolated from
the sealed 49-record corpus. They prove civic-address priority over incidental
unit-number matches and preservation of a ten-digit leading-zero APN without
making public-authority claims.

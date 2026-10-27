# TruLot indexing readiness review v0

Packet 83 is a read-only go/no-go review at commit `9fc875046850181ed7b0beba5abd2c1a9cbbfecf` (tree `654fa8586d2c60e071f0522cfd6202e4257b6373`). It does not activate a route, sitemap, robots rule, production snapshot, or deployment.

## Doctrine and independent gates

An indexable parcel page must be public, source-backed, jurisdiction-confirmed, canonical, current enough for every displayed claim, rights-cleared, free of private data, independent of unresolved production-only state, useful beyond a thin identifier, and deterministically reproducible. `PUBLIC_PAGE_READY`, `INDEX_READY`, `FEASIBILITY_READY`, and `PROGRAM_ELIGIBILITY_READY` are separate gates. A truthful `Conditional`, `Needs evidence`, `Not evaluated`, or `Source unavailable` state may be indexed when the rest of the page passes; mapped geography never becomes program eligibility by implication.

## San Diego findings

The current `/parcel/san-diego/[slug]` route extracts the APN from any compatible slug and redirects to a deterministic APN-bearing canonical slug. Missing addresses fall back to a formatted APN, and stacked/common-address tax parcels stay distinct because the APN is part of every slug. The sealed V2 corpus has 393,733 unique APNs, 14,846 missing situs addresses, and 126,239 stacked APNs in 5,446 groups. No APN-route collision exists by construction.

The page has useful parcel facts, zoning, mapped context, bounded rule presentation, nearby activity, source disclosures, minimal `Place` JSON-LD, and FAQ JSON-LD. It is not index-ready: its canonical helper uses `https://trulot-web.vercel.app` while site metadata/robots use `https://trulot.com`; it has no explicit parcel robots state; parcel URLs are absent from the sitemap; source-unavailable responses render a normal page without a deterministic noindex/status contract; and metadata promises zoning and permits without conditioning the text on source availability. The APN fallback is currently written into `PostalAddress.streetAddress`, which must be suppressed when no public address exists.

Packet 79 classifies all 393,733 APNs: 317,604 single-zone, 1,097 boundary-sliver, 73,064 multi-zone, 1,641 indeterminate, and 327 unmapped. Phase SD-A conservatively admits the 318,701 single-zone/boundary-sliver APNs once the production and SEO gates are fixed. Multi-zone/indeterminate pages may later be indexable with review-qualified labels; unmapped pages may later be indexable with “zoning unavailable” if their remaining content is useful. Coastal states are 345,748 outside, 46,455 inside, and 1,530 boundary-ambiguous. Ambiguity is a disclosed context state, never an eligibility inference.

Packet 82 supports all 326,532 residential APNs through 31 RS/RM/RX/RT profiles. Exactly 260,318 have a selected profile with modifier review required; 66,214 remain review-required or fail-closed. Base zoning and sourced base-rule summaries may be public independently of current property intelligence, provided modifiers and Coastal versions remain explicit. No rule profile resolves site-specific compliance or capacity.

Packet 11 is decisive. The current route reads `parcel_page_api_v2` plus runtime overlay RPCs, not the sealed Packet 79 selection. With production access prohibited, this review cannot prove that current runtime rows reproduce the sealed population or zoning fingerprints. No sitemap cohort should publish until Packet 11’s selection is resolved or an equivalently approved immutable public snapshot is selected. Current SD index-ready count is therefore 0; evidence-qualified Phase SD-A size after those fixes is 318,701. Phase SD-B adds the 260,318 profile-selected residential APNs. Phase SD-C requires separately verified program predicates and currentness sources.

Packet 77 allows bounded recorded assessor characteristics and historical building-outline summaries under their stated rights/caveats. It does not support current dwelling configuration, legal unit count, current structure count, recent ADU completion, absence of later work, or existing-building compliance. The building observation is Spring 2017; current citywide permit coverage is 0 because no sealed citywide corpus exists. Those claims remain hidden or explicitly unavailable. This does not block identity/zoning indexing.

ADU and SB 9 are not evaluated in the current route. TPA is mapped context only. SDA remains reconciliation-pending. Complete Communities and other bonus programs are not evaluated. SB 79 and any other program remain not evaluated unless a separately verified contract supplies every eligibility predicate. Community/specific-plan, fire, slope, multi-zone, Coastal, and other modifier states may appear as bounded context/review flags; they cannot yield eligibility or capacity.

Decision: `SAN_DIEGO_INDEXING_NOT_READY: Packet 11 production zoning selection is frozen and canonical-host, parcel robots, sitemap, error-state, and public-output controls are incomplete`.

## La Mesa findings

`/la-mesa-adu` is a private, noindex homeowner flow and is not a parcel canonical. `/parcel/la-mesa/[slug]` is designed but not implemented. A public route needs an APN-specific slug, APN-only fallback, confirmed jurisdiction, redirects from noncanonical variants, an enforced rights-filtered serializer, production-domain metadata, minimal structured data, deterministic error states, and explicit robots/sitemap gates.

The sealed lookup has 17,391 unique APNs: 17,387 confirmed in scope and 4 jurisdiction-unresolved; 16,728 have addresses and 663 use APN-only lookup; 3,702 rows belong to 186 duplicate/common-address groups and must never be collapsed. Packet 64 reports 15,373 single-zone, 1,951 boundary-sliver, 58 multi-zone, 5 indeterminate, and 4 unmapped. Joining identity and geometry gives 17,160 confirmed, deterministic, selected-zone single/sliver APNs (16,583 addressed and 577 APN-only). That is the evidence-qualified LM-A cohort after route/rights/SEO gates. Current index-ready count is 0.

Packet 65 provides 12,171 clean base residential profiles, 3,960 review-required profiles, and 1,260 unavailable/nonresidential rows. Packet 66’s 2026 ADU profile and Packet 67’s V4 integration are bounded rule/evaluation contracts, not public parcel eligibility. Packet 76 does not enlarge public rights.

Rights govern the output. Assessor-derived facts may become bounded public summaries only after the existing countywide acquisition/reuse receipt is explicitly linked; raw characteristics, ownership, and mailing fields stay excluded. MaintStar is rights-unclear and remains private/internal for indexed output. Building outlines may support only bounded summaries allowed by the source receipt; raw/full derived geometry is excluded. Currentness derived from any rights-limited input remains private. Homeowner answers always remain private. The unresolved MaintStar issue blocks public permit/currentness and permit-backed ADU claims, but it does not block independently rights-cleared identity, zoning, overlay, specific-plan, or base-rule fields.

LaMesaADU.com and ADUFeasibility.com should remain acquisition/front-door surfaces. TruLot owns the one canonical parcel-intelligence URL. Front doors may link to it but must not publish duplicate parcel-specific canonical bodies. This doctrine is ready; enforcement waits for route implementation.

Decision: `LA_MESA_INDEXING_NOT_READY: the canonical parcel route, public-output contract, rights filter, metadata, robots policy, and sitemap do not exist`.

## SEO, robots, sitemap, and errors

Use a sitemap index with jurisdiction shards capped below the protocol limit (recommended operational shard size: 25,000 URLs). URLs are APN-based and stable; address text is decorative. `lastmod` changes only when the public payload or its controlling source snapshot changes, never at request/build time. Exclude private, identity-uncertain, source-unreproducible, canonical-conflicted, and insufficient-content pages.

Canonical public parcel pages are `index,follow`. A known parcel that is temporarily source-unavailable is `noindex,follow` (prefer HTTP 503 with retry semantics when implemented). Private previews and user/project pages are `noindex,nofollow`. Search-result and candidate-selection pages are `noindex,follow`. Unknown APNs, confirmed outside-scope records, and jurisdiction conflicts have no canonical parcel page and return 404. Supported parcels with unavailable zoning may return 200 and become indexable only when the remaining public payload passes the useful-content gate; otherwise they are `noindex,follow`.

Minimum metadata is a truthful title, description, production-domain canonical, jurisdiction, APN, public address when present, and explicit robots state. It excludes private facts and unsupported program eligibility. JSON-LD is minimal `Place` plus APN `PropertyValue`; include `PostalAddress` only with a real public situs address. Do not assert `Residence` or a residence subtype. Remove generic FAQ structured data unless each answer is accurate and useful for that parcel.

Thin-content risks include missing-address pages with only APN, unmapped/unsupported zoning with no other facts, repetitive rule copy without parcel-specific state, and stacked/common-address pages that omit unit/APN identity. These stay noindex until the public payload includes enough unique source-backed facts. Repeated rule text is supporting content, not the unique core.

## Source rights and privacy

Every indexed field needs recorded rights to process, store, and redisplay, any attribution, and a currentness caveat. An unclear redisplay right is an exclusion, not a disclaimer. Indexed payloads exclude homeowner answers, lead data, authenticated work context, private project/plan/survey evidence, owner/mailing data, private hashes/paths, and restricted raw source records. The exact allowlists are in `public-output-contracts.json`.

## Production dependencies and smallest next move

Required before any indexing: resolve or replace the frozen San Diego production zoning selection; correct the canonical host; define explicit robots/error/metadata/JSON-LD behavior; implement rights-filtered serializers; implement and accept the La Mesa canonical route; build deterministic gated sitemap cohorts; add monitoring and rollback. Later enrichment may obtain citywide permit/currentness sources, MaintStar rights, current structure evidence, and program eligibility sources.

The smallest next packet is an **index-safety foundation** that publishes no sitemap entries: one production-domain canonical helper, per-state robots/error metadata, rights-filtered public-output serializers, APN-only fallback handling, a La Mesa parcel route held noindex, and deterministic sitemap cohort generators held behind separate approval gates. San Diego sitemap publication still waits for Packet 11 resolution; La Mesa publication waits for route and rights-filter acceptance.

Overall decision: `TRULOT_INDEXING_READY_AFTER_BOUNDED_FIXES`.

## Evidence checked

- Packet 79 selection receipt, 393,733-row artifact, state/coastal cross-tabs, APN uniqueness, and source fingerprints.
- Packet 80–82 rule registries, source receipts, final 326,532-row support artifact, 31-profile registry, and integrity manifests.
- Packet 64–76 La Mesa geometry, lookup, rule, ADU, V4, assessor, permit, building/currentness, composition, and private-preview artifacts.
- San Diego route, loader, canonical slug helper, metadata, JSON-LD, source disclosures, error behavior, sitemap, and robots source.
- La Mesa private route metadata and proposed route/serving designs.
- Privacy/source-rights boundaries and APN route collision properties.

No production access, production mutation, route activation, sitemap/robots change, deployment, or push was performed.

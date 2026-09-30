# Parcel Intelligence V2

Decision: **PARCEL_INTELLIGENCE_V2_READY_FOR_UI_ADAPTER**.

Packet 18 composes the sealed Parcel V2, Base Zoning V2, Coastal Context V0, RS standards runtime, parcel-condition, Structure Facts V0, and Parcel Truth semantics into one offline contract. It is suitable for a future non-production Parcel Page adapter. It is not imported by the application, performs no database or network access, and does not calculate compliance or capacity.

## Composition model

`ParcelIntelligenceV2` has eight material sections: `identity`, `zoning`, `coastal_context`, `base_standards`, `property_facts`, `unresolved`, `next_investigation`, and structured `answers`/`presentation`. `source_layers` preserves every upstream contract identity and fingerprint. The complete interface is in `data/parcel-intelligence-v2/contract.json`; the upstream field/conflict inventory is in `contract-inventory.json`.

The top state is `SUPPORTED`, `PARTIAL`, `SOURCE_UNAVAILABLE`, or `IDENTITY_UNRESOLVED`. Nested facts retain their original supported, partial, unknown, unavailable, not-applicable, or not-evaluated state. An optional structure failure does not erase identity or zoning. Unresolved zoning blocks definitive standards. Coastal boundary ambiguity preserves identity and zoning but refuses an inside/outside version. No composition step promotes diagnostic geometry to a legal dimension.

## Identity and property facts

Parcel V2 remains canonical for APN, parcel/source IDs, situs, jurisdiction, geometry availability, approximate geometry area, taxable acreage, and acquisition identity. Condition facts expose approximate geometry and tax records while legal lot area, width, depth, frontage, lot-line roles, corner status, slope, and gross floor area remain unknown.

Structure Facts V0 is the only source for promoted structure facts. Positive `UNITQTY` and valid positive living area remain recorded assessor facts. Zero and sentinel values remain unknown. Historical building outlines retain their 2017 imagery vintage, spatial-linkage method, limitations, and source record IDs. They are never described as a current footprint or vacancy conclusion.

## Zoning, Coastal context, and standards

Every material Base Zoning V2 zone remains visible with coverage and source-feature evidence. `MULTI_ZONE` becomes `SPLIT_ZONE` only at the canonical display level; the detailed state is also retained. Each split-zone component receives its own standards result. RS rules are never blended, and non-RS components remain explicit unsupported components.

`OUTSIDE_COASTAL` selects the sealed outside-Coastal version. `INSIDE_COASTAL` selects the Packet 16 version. `BOUNDARY_AMBIGUOUS`, unavailable Coastal evidence, and unsupported dates fail closed. Every supported RS rule retains its rule ID, zone, version, SDMC section/table/cell, source document hash, and rule provenance hash.

## Deterministic next investigations

The engine emits only enumerated evidence requests. It requests legal width when a width rule exists, lot-line designations when setback rules exist, gross floor area for an FAR rule, Coastal applicability at an ambiguous boundary, geometry review for a split zone, authoritative unit evidence when a positive assessor value is absent, zoning review for unresolved mapping, situs evidence for a missing address, and a sealed standards contract for unsupported zones. Each item states the reason, blocked conclusion, and required evidence. It does not generate project advice.

## Real parcel corpus

The 30 outputs include 17 `SUPPORTED`, 12 `PARTIAL`, and one `SOURCE_UNAVAILABLE` result. They cover 13 single-zone, 10 split-zone, one boundary-sliver, four ambiguous, one unmapped, and one unavailable zoning case; five inside-Coastal, 20 outside-Coastal, four boundary-ambiguous, and one Coastal-source-unavailable case; positive and zero assessor facts; historical footprints; stacked parcels; missing situs; and the Packet 8 identity exception.

### APN 6341302200

The result identifies `1456 27TH ST`, maps 100% to RS-1-7, and proves `OUTSIDE_COASTAL`. The outside-Coastal RS version resolves separately. Supported structure facts record one assessor dwelling unit, 988 square feet of assessor living area, and dated multiple historical footprints. The standards remain conditional on legal facts. Legal width/depth/area, lot-line roles, corner status, slope, gross floor area, and related compliance inputs remain unknown. Next actions are `OBTAIN_GROSS_FLOOR_AREA`, `VERIFY_LEGAL_LOT_WIDTH`, and `VERIFY_LOT_LINE_DESIGNATIONS`.

### APN 3506320400

The result identifies `7553 CABRILLO AVE`, maps 100% to RS-1-7, and proves `INSIDE_COASTAL`. The inside-Coastal Packet 16 version resolves separately. Supported structure facts record one assessor dwelling unit, 1,610 square feet of assessor living area, and dated multiple historical footprints. The same legal measurement classes remain unknown. Next actions are `OBTAIN_GROSS_FLOOR_AREA`, `VERIFY_LEGAL_LOT_WIDTH`, and `VERIFY_LOT_LINE_DESIGNATIONS`.

### APN 4304211000

The result identifies `4927 WHITEHAVEN WAY` and preserves the material split: RS-1-7 at 64.31678896738894% and OR-1-1 at 35.683211033033054%. It proves `OUTSIDE_COASTAL`. RS-1-7 receives its own sourced rule set; OR-1-1 remains visible and unsupported by RS V0. No primary or blended parcel-wide standard is produced. Supported structure facts record one assessor dwelling unit, 2,893 square feet of assessor living area, and one dated historical footprint. Next actions add `OBTAIN_SUPPORTED_ZONE_STANDARDS` and `REVIEW_SPLIT_ZONE_GEOMETRY` to the legal-width, lot-line, and GFA evidence requests.

## Truth wording

The contract supplies concise structured strings such as “Base zoning: RS-1-7,” “Minimum lot width standard: 50 ft,” “Parcel legal lot width: not yet verified,” “Existing dwelling units: 1, County assessor record,” “Gross floor area: unavailable,” “Coastal context: inside Coastal Overlay Zone,” and “Development capacity: not evaluated.” These strings are adapter inputs, not production UI wiring.

## Parcel V1 comparison

`data/parcel-intelligence-v2/v1-comparison.json` compares the contracts by user question. V2 improves evidence lineage, split-zone visibility, Coastal version selection, structure-state semantics, explicit uncertainty, and deterministic investigation requests. Parcel V1 remains the unchanged production path. V2 still lacks non-RS standards, legal measurements, current building geometry, compliance logic, capacity logic, and later program rules.

## Canonicalization and exclusions

The builder uses sorted-key UTF-8 JSON, stable list order, compact canonical separators, and rejects NaN. Each result and the corpus receive SHA-256 fingerprints. Recomposition from the same inputs must be byte-identical.

Explicit exclusions are development capacity, parcel compliance, legal nonconformity, setback calculation, FAR utilization, lot coverage, ADU/JADU, SB9, SB79, Density Bonus, and Complete Communities. Packet 11 remains frozen; no production snapshot, runtime, database, page, deployment, or push is part of Packet 18.

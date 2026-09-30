# Packet 12: City of San Diego RS base zoning standards V0

Decision: **RS_BASE_STANDARDS_V0_SOURCE_COMPLETE** for the current, outside-Coastal RS base-zone profile verified on September 30, 2026. Inside-Coastal and unknown-Coastal requests fail closed as `APPLICABILITY_UNRESOLVED`. This contract records source standards; it does not decide parcel compliance or development capacity.

Baseline: branch `codex/trulot-parcel-v1-hardening`, commit `47e22408a12f729c9915c65bb159c393d422c243`, tree `67275355523f39537bf30a61531d6a038da5f44e`, clean before Packet 12.

## Authoritative sources and method

The primary source is the City Clerk's [SDMC Chapter 13, Article 1, Division 4](https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division04.pdf), edition 9-2026, 98 pages, SHA-256 `9a15478c65d5498e79e85e3399d7c18ec198436cc008cf87c34e7408bf2aa538`, retrieved September 30, 2026. The [Chapter 13 index](https://www.sandiego.gov/city-clerk/officialdocs/municipal-code/chapter-13) establishes the official publication path. The City's [adopted-update ledger](https://www.sandiego.gov/planning/work/land-development-code/updates) supplies effective-date and Coastal status.

The RS domain comes from §131.0403(b). The direct table cells come from §131.0431(a), Table 131-04D, PDF pages 33–36. Conditions retain §§131.0442–131.0449, 131.0450, 131.0460–131.0461, and 131.0464(a), plus their cross-references. Current page text, table rows, cell geometry, footnotes, source hashes, and exact section excerpts are sealed under `data/rs-base-standards-v0`.

The prior repository layer pinned the 7-2026 edition. A semantic comparison against 9-2026 found Table 131-04D and the RS-specific development sections unchanged. The new edition removes stale O-21836 Coastal editor notes and repaginates Table D from pages 34–37 to pages 33–36. V0 therefore records the current document identity and current page coordinates without changing or re-sealing the later runtime artifacts that depend on the older research bundle.

## Version and effective-date model

| Authority | Outside Coastal | Inside Coastal | V0 treatment |
|---|---|---|---|
| O-21836 (2024 update) | Effective 2024-10-05 | Effective 2026-09-10 | Included where applicable |
| O-21934 | Effective 2025-04-24 | Certification date not verified | RS-1-2 footnote-7 repeal included outside; blocks a complete inside-Coastal composite |
| O-22109 (2026 update) | Effective 2026-07-15, subject to the published airport exception | Pending; City anticipates a later approval | Outside dependent sections included; inside profile unresolved |

The selectable profile is `outside-coastal-2026-09-30`. It is a composite, not a claim that every rule was enacted on July 15, 2026. `inside-coastal-2026-09-30` and `unknown-coastal-2026-09-30` return no standards. The resolver also refuses later as-of dates until the official sources are reacquired and reviewed.

## RS zone domain

All authoritative RS codes are present in Base Zoning V2 and supported by the outside-Coastal V0 contract.

| Zone | Present in V2 | Authoritative recognition | Support |
|---|---|---|---|
| RS-1-1 | Yes | §131.0403(b), Table 131-04D | SUPPORTED |
| RS-1-2 | Yes | §131.0403(b), Table 131-04D | SUPPORTED |
| RS-1-3 | Yes | §131.0403(b), Table 131-04D | SUPPORTED |
| RS-1-4 | Yes | §131.0403(b), Table 131-04D | SUPPORTED |
| RS-1-5 | Yes | §131.0403(b), Table 131-04D | SUPPORTED |
| RS-1-6 | Yes | §131.0403(b), Table 131-04D | SUPPORTED |
| RS-1-7 | Yes | §131.0403(b), Table 131-04D | SUPPORTED |
| RS-1-8 | Yes | §131.0403(b), Table 131-04D | SUPPORTED |
| RS-1-9 | Yes | §131.0403(b), Table 131-04D | SUPPORTED |
| RS-1-10 | Yes | §131.0403(b), Table 131-04D | SUPPORTED |
| RS-1-11 | Yes | §131.0403(b), Table 131-04D | SUPPORTED |
| RS-1-12 | Yes | §131.0403(b), Table 131-04D | SUPPORTED |
| RS-1-13 | Yes | §131.0403(b), Table 131-04D | SUPPORTED |
| RS-1-14 | Yes | §131.0403(b), Table 131-04D | SUPPORTED |

No aliases are inferred.

## Standards schema

Each of the 343 Table 131-04D cell records contains:

- identity: `rule_id`, `rule_set_version`, `zone_code`, `standard_key`;
- meaning: tagged `value`, `unit`, `operator`, `fact_state`, `derivation_class`;
- qualifications: `condition`, `exceptions`, `unresolved_dependencies`, `notes`;
- provenance: document, section, table, PDF page, raw row and cell, row/column coordinate, bounding box, page hash, source URL, source hash, and record hash;
- applicability: `effective_from`, `effective_to`, effective-date basis, and `jurisdiction_variant`.

`RECORDED` means a direct source value. `CONDITIONAL` retains a printed value or reference that requires another fact. `UNKNOWN` preserves a dash, missing footnote, or source omission without inventing a rule. `NOT_APPLICABLE` is reserved for an explicit source statement and is not inferred from a dash. Source expressions such as `24/30` remain unevaluated.

## Complete RS matrix

`C:` marks a conditional base value. `U:` marks a source cell that does not establish a value. All dimensions are feet, lot area is square feet, density is dwelling units per lot, and FAR is a ratio.

| Zone | Lot area | Width | Corner width | Depth | Front | Side | Street side | Rear | Height | Density | FAR | Other |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|
| RS-1-1 | 40,000 | 100 | C:110 | 100 | C:25 | C:10 | C:10 | C:25 | C:24/30 | 1/lot | 0.45 | C:50% coverage only for qualifying steep-hillside premises; frontage C:100 |
| RS-1-2 | 20,000 | 80 | C:85 | 100 | C:25 | C:8 | C:8 | C:25 | C:24/30 | 1/lot | C:varies | C:50% steep-hillside coverage; frontage C:80 |
| RS-1-3 | 15,000 | 75 | C:80 | 100 | C:20 | C:7 | C:7 | C:20 | C:24/30 | 1/lot | C:varies | C:50% steep-hillside coverage; frontage C:75 |
| RS-1-4 | 10,000 | 65 | C:70 | 100 | C:20 | C:6 | C:6 | C:20 | C:24/30 | 1/lot | C:varies | C:50% steep-hillside coverage; frontage C:65 |
| RS-1-5 | 8,000 | 60 | C:65 | 100 | C:20 | C:5 | C:6 | C:20 | C:24/30 | 1/lot | C:varies | C:50% steep-hillside coverage; frontage C:60 |
| RS-1-6 | 6,000 | 60 | C:65 | 95 | C:15 | C:5 | C:6 | C:15 | C:24/30 | 1/lot | C:varies | C:50% steep-hillside coverage; frontage C:60 |
| RS-1-7 | 5,000 | 50 | C:55 | 95 | C:15 | C:4 | C:5 | C:13 | C:24/30 | 1/lot | C:varies | C:50% steep-hillside coverage; frontage C:50 |
| RS-1-8 | 40,000 | 100 | C:110 | 100 | C:25 | C:10 | C:20 | C:10 | C:35 | 1/lot | 0.45 | U:coverage dash; frontage C:100; orphan bedroom footnote 8 |
| RS-1-9 | 20,000 | 80 | C:85 | 100 | C:25 | C:8 | C:15 | C:10 | C:35 | 1/lot | 0.60 | U:coverage dash; frontage C:80; orphan bedroom footnote 8 |
| RS-1-10 | 15,000 | 75 | C:80 | 100 | C:25 | C:7 | C:15 | C:10 | C:35 | 1/lot | 0.60 | U:coverage dash; frontage C:75; orphan bedroom footnote 8 |
| RS-1-11 | 10,000 | 65 | C:70 | 100 | C:20 | C:6 | C:10 | C:10 | C:35 | 1/lot | 0.60 | U:coverage dash; frontage C:65; orphan bedroom footnote 8 |
| RS-1-12 | 8,000 | 60 | C:65 | 100 | C:15 | C:5 | C:10 | C:10 | C:35 | 1/lot | 0.60 | U:coverage dash; frontage C:60; orphan bedroom footnote 8 |
| RS-1-13 | 6,000 | 60 | C:65 | 95 | C:15 | C:5 | C:10 | C:10 | C:35 | 1/lot | 0.60 | U:coverage dash; frontage C:60; orphan bedroom footnote 8 |
| RS-1-14 | 5,000 | 50 | C:55 | 95 | C:15 | C:4 | C:10 | C:10 | C:35 | 1/lot | 0.60 | U:coverage dash; frontage C:50; orphan bedroom footnote 8 |

The machine matrix also retains resubdivided-corner-lot setbacks, paving/hardscape, accessories, garages, building spacing, third-story dimensions, projections/encroachments, supplemental requirements, refuse/recycling storage, visibility area, and dwelling-unit-protection references. Those rows are references, not resolved parcel answers.

## RS-1-7 regression anchor

The current official source confirms the historical assertions:

| Assertion | Current finding | Source |
|---|---|---|
| Minimum lot width 50 ft | Confirmed, recorded value | Table 131-04D, page 33 |
| Corner-lot width 55 ft | Confirmed, conditional on corner-lot fact | Table 131-04D, page 33 |
| Minimum lot depth 95 ft | Confirmed, recorded value | Table 131-04D, page 33 |

RS-1-7 also records 5,000 square feet minimum lot area and one dwelling unit per lot. It retains a conditional 15-foot front setback, 4-foot interior side setback, 5-foot street side setback, 13-foot rear setback, the unevaluated `24/30` height expression, conditional steep-hillside coverage, and variable FAR. None is a parcel compliance or unit-count answer.

## Conditional and unresolved rules

- Table 131-04D footnote 1 permits a six-foot front setback only when at least half of the front 50 feet has at least a 25 percent slope gradient.
- Footnotes 2, 3, and 6 retain the full side and rear setback provisions in §§131.0443(a)(2)–(4). Lot dimensions, alley access, lot depth, reallocation, and configuration can affect the printed base number.
- Outside Coastal, §131.0443(i) permits a greater Fire Code defensible-space buffer.
- Height retains §131.0444 and Table 131-04H; `24/30` is not flattened to 30.
- `varies` FAR retains §131.0446(a) and Table 131-04J. No lot-area or steep-hillside calculation occurs here.
- Table 131-04D prints `Bedroom regulation(8)` for RS-1-8 through RS-1-14 but supplies no footnote 8. Those seven cells are `UNKNOWN`.
- A table dash is `UNKNOWN`, not zero and not automatically `NOT_APPLICABLE`.
- Inside-Coastal and unknown-Coastal profiles are applicability-unresolved and expose no standards.

## Provenance and fixtures

The core matrix has 182 expected cells: 64 recorded, 111 conditional, 7 unknown, and 0 explicitly not applicable. All 343 retained source-table cells have source records and provenance hashes. Supported values without provenance: **0**.

Fourteen golden zone fixtures cover every RS code. Targeted fixtures cover RS-1-7, corner-lot width, setback footnote 1, the `24/30` height expression, Coastal profile refusal, the seven orphan-footnote cells, and an unsupported zone. Source mutation, missing provenance, condition flattening, zone loss, and current-source hash drift fail tests.

## Base Zoning V2 integration contract

The offline resolver documents the future boundary:

- `SINGLE_ZONE`: attach the one exact supported RS set.
- `BOUNDARY_SLIVER`: attach the primary-zone set and retain every secondary code as zoning evidence.
- `SPLIT_ZONE`: return one result per material zone; never blend standards. Non-RS zones are explicitly outside RS V0.
- `UNMAPPED`: return no standards.
- `AMBIGUOUS` or `INDETERMINATE`: return no definitive standard set.

The resolver accepts mapping state, exact zone codes, Coastal context, and as-of date. It accepts no parcel area or geometry and contains no compliance or capacity operation.

## Offline examples

`examples.json` covers ordinary RS-1-7, RS-1-1, boundary sliver, RS/non-RS split, ambiguous, unmapped, and unknown-Coastal inputs. Each output distinguishes supported source records from unresolved conditions. Split output is separate and unblended; ambiguous, unmapped, and unavailable-version outputs contain no definitive rules.

## Source completeness and remaining gaps

`RS_BASE_STANDARDS_V0_SOURCE_COMPLETE`

This means the current outside-Coastal RS base-table domain is complete for the defined V0 and unavailable legal contexts fail closed. It does not mean all laws affecting an RS parcel are implemented.

Base-standards gaps: a selectable inside-Coastal composite awaits authoritative O-21934 Coastal status and O-22109 certification; the source's orphan footnote 8 remains unresolved; parcel facts and cross-referenced diagrams/measurement rules remain unevaluated.

Downstream gaps: overlays, Coastal modifications, ADU/JADU, SB 9, SB 79, Complete Communities, density bonus, airport transition applicability, environmental/historic constraints, permit processing, program interactions, parcel compliance, envelope geometry, and development capacity.

## Validation and preservation

The build and test commands are documented in `scripts/rs-base-standards-v0/README.md`. They operate only on repository data or an explicitly supplied local PDF. No database, network, production runtime, migration, browser, deployment, or credentials are required.

This packet adds a separate offline contract. It does not change Parcel V1, existing runtime standards, migrations, deployment configuration, or the frozen Packet 11 state.

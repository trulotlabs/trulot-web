# Packet 12: Residential Zoning Standards V2

Decision: **RESIDENTIAL_ZONING_STANDARDS_V2_PASS** for a versioned, sourced,
unevaluated research representation. Readiness:
**ZONING_STANDARDS_REQUIRE_FURTHER_REVIEW**. This is not permission to calculate
capacity or integrate these rules into Parcel V1.

Baseline: branch `codex/trulot-parcel-v1-hardening`, commit
`5ad64b8d5410137156d9d95d450c776f6afb157e`, tree
`5a3aba9e815787f17fa16ef23702e7da276fc175`; clean before this packet.

## 1. Source hierarchy

The 33 acquired sources are inventoried in `data/zoning-standards-v2/sources.json`
with publisher, document identity, canonical URL, SHA-256, acquisition timestamp,
date state, and applicability. Exact original PDFs/HTML were acquired to
`/private/tmp/trulot-packet12-sources`; legislative page text and table geometry
are retained in the repository. Original files can be reacquired at the recorded
URLs and checked against their hashes. Temporary files are not permanent storage.

Authority order:

1. City Clerk's official Municipal Code.
2. Adopted ordinances and official effective-date/Coastal certification materials.
3. Official explanatory guides and convenience copies.
4. Staff reports and update lists.
5. TruLot deterministic transcription.
6. Derived calculations; none implemented here.

The searchable code portal is a convenience copy, not the authoritative City
Clerk record. Legislative amendments and certification evidence explain changes
to codified text; this is explicit reconciliation, never a silent summary override.
The historical zoning guide is used only for exact designation/name crosswalks,
never current numeric standards.

Primary sources:

- [City Clerk Chapter 13 index](https://www.sandiego.gov/city-clerk/officialdocs/municipal-code/chapter-13).
- [Official Residential Division 4](https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division04.pdf), July 2026 edition, 99 pages; SHA-256 `513f34d5245e24ec90b6d2cb2c621cab16b29847dcbfd0ef67c9b697ce464cc9`.
- [Signed O-22109](https://www.sandiego.gov/sites/default/files/2026-07/o-22109-1.pdf) and [its strikeout](https://docs.sandiego.gov/municode_strikeout_ord/O-22109-SO.pdf).
- [Signed O-21934](https://docs.sandiego.gov/council_reso_ordinance/rao2025/O-21934.pdf).
- [Official effective-date materials](https://www.sandiego.gov/planning/work/land-development-code/updates).
- [CCC September 2026 certification report](https://documents.coastal.ca.gov/reports/2026/9/Th11/Th11-9-2026-report.pdf), pages 8-14.

General base-zone rules, definitions, measurement rules, other base-zone families,
and relevant planned-district divisions are also captured. Reading a cross-reference
does not mean its requirements have been evaluated for a parcel.

## 2. Current code-version/effective-date model

`versions.json` separates the acquisition snapshot from legal enactment. This
research set is `sd-residential-2026-09-24-research-v1`. It is verified only for the
explicit as-of date **2026-09-24** and the outside-Coastal context, subject to the
project gates below. It is not a historical-law database or a future-law assertion.

| Amendment | Final passage | Outside Coastal | Coastal | Scope relevant here |
|---|---|---|---|---|
| O-21836 | 2024-07-22 | 2024-10-05 | 2026-09-10 | Multiple residential sections, including tables |
| O-21934 | 2025-03-25 | 2025-04-24 | Not verified | Repeals Table 131-04D footnote 7 and RS-1-2 marker |
| O-22109 | 2026-06-15 | 2026-07-15, published airport exception retained | Pending certification | §§131.0422, 131.0443(i), 131.0448; not §131.0431 |

2024 certification is corroborated by CCC LCP-6-SAN-24-0038-3: conditional action
February 5, City acceptance July 14, certification reported September 10. The
acceptance ordinance O-22117 changes density-bonus sections outside this packet.
The consolidated July PDF's 2024 pending-certification editor note is consequently
stale. It does not establish the status of the separate 2025 or 2026 amendments.

Versions compose section histories; a table value is not labeled as enacted by
O-22109 simply because it appears in the current PDF. Per-cell `effective_date`
is null with an explicit section-history basis when a unique original enactment
date has not been established. Null is not “effective everywhere.” Geographic
applicability, amendment dates, supersession, sources, and unavailable profiles
are separate fields in the ledger.

Signed O-22109 §§60-61 retain ALUC/Coastal conditions and pre-effective
deemed-complete application treatment. The resolver requires explicit
`new_application` and `outside_miramar_transition` assertions. It computes neither
membership nor grandfathering. Older applications and unknown airport context
are unresolved.

## 3. Residential zone inventory

Every one of Packet 10's 183 raw codes has an organizational classification:

| Family | Codes |
|---|---:|
| Residential Division 4 | 31 |
| Commercial | 43 |
| Industrial | 10 |
| Agricultural | 3 |
| Open space | 6 |
| Mixed-use | 6 |
| Planned district | 83 |
| Unknown (`UNZONED`) | 1 |

The code contains 33 residential base zones: 14 RS, 2 RX, 5 RT, and 12 RM.
Packet 10 contains all except RT-1-1 and RT-1-3; all 33 are transcribed. RMX and
EMX belong to Division 7. Old Town residential designations belong to Chapter 15,
not Division 4. No standards are inferred from these organizational mappings.

`zone-inventory.json` preserves every raw designation, source-feature count,
classification method, evidence pages, and standards-support state. Direct source
codes and explicitly inspected table headers establish base-zone families. Named
district crosswalks establish planned-district organization; historical guide
crosswalks do not establish current development entitlements.

## 4. Machine-readable rule schema

`rule-schema.json` defines the machine-readable contract; `rules.json` contains
814 cell records, with:

- Identity: `rule_id`, `rule_set_version`, `zone_code`, `standard_type`.
- Meaning: tagged `value`, `unit`, `operator`, `conditions`, `exceptions`.
- Applicability: profile reference, project-evaluation flag, effective-date basis.
- Citation: section, table, stable PDF page, raw row label, zone column, raw cell,
  PDF point bounding box, page artifact hash, and cell evidence hash.
- Epistemic state: derivation class, review state, legal-review flag, unresolved
  dependencies.

Value types are `number`, `reference`, `source_expression`, and
`not_specified_in_table`. Compound cells retain ordered text and full row labels;
they are not automatically selected or evaluated. RM density is a square-feet-per-
dwelling-unit **basis**, not an upper bound on square feet. RS/RX/RT density is
dwelling units per lot, separate from minimum lot area. The resolver accepts no
lot-area input and performs no unit-count calculation.

The 814 records include 363 numeric cells, 349 references, 45 source expressions,
and 57 absent/table-dash cells. A dash is neither zero nor a statement of no other
restriction.

## 5. Extracted standards coverage

Tables 131-04D/E/F/G are fully represented, including every non-heading cell:
density basis, lot area, width, frontage, corner width, depth, front/interior/street
side/rear setbacks, structure height, FAR, coverage, open-space references,
accessories, garages, architectural projections, and other dimensional controls.
Tables 131-04H/I/J/K retain source rows as unevaluated lookups.

Parking ratios are not supplied by these base tables. Garage/access/alley and
parking cross-references are retained; no parking default is invented. Open-space
provisions are linked to complete §§131.0455-131.0456 text. Their formulas and
alternatives remain conditional source expressions, not flattened parcel results.

## 6. Exceptions/cross-references

Forty-four source footnotes are retained, plus one explicit missing-footnote
record. All footnote and Chapter/Article/Division targets survive. Thirty-two
complete residential sections, including histories, are indexed in
`dependencies.json`. The universal §131.0430 overlay/general-regulation dependency
is present on every cell. Dimensional standards additionally link their governing
sections even where the table cell has no printed marker.

The source's orphan Table 131-04D bedroom marker `(8)` appears on seven dash cells.
Those seven remain `INTERPRETATION_REQUIRED`; no missing text is invented. The
angle-table footnote explicitly states that angles are measured inward from the
vertical axis. Cross-references and their diagrams can constrain the apparent
base number; the resolver never labels the number a final property standard.

## 7. Coastal applicability findings

Relevant residential dependencies do differ: the 2026 §131.0443(i) defensible-space
override is present in the outside-Coastal composite but cannot be applied inside
Coastal from an uncertified 2026 version. The 2025 RS-1-2 repeal has a separately
unverified Coastal effective date. Accordingly there is no blanket citywide
version selection. Inside and unknown inputs return `APPLICABILITY_UNRESOLVED`
with no applicable rules, including for split-zone requests.

The ledger records the verified 2024 Coastal date without claiming that all
current dependent provisions thereby became certified. Building a complete
Coastal composite is a remaining prerequisite for broader integration.

## 8. RS-1-7 evidence packet

See `docs/rs-1-7-zoning-standards-v2-evidence.md` and the machine evidence in
`data/zoning-standards-v2/rs-1-7-evidence.json`. It retains the 1-DU-per-lot table
basis, 5,000-square-foot minimum lot area, conditional dimensions and setbacks,
24/30 height expression, variable FAR table, footnotes, provenance, and unresolved
dependencies. It contains no buildable-unit answer.

## 9. Legacy heuristic comparison

Inspection target: `lib/get-parcel-page-data.ts`, lines 628-667. No legacy code was
changed or imported into the new tools.

| Legacy assumption | Source comparison | Assessment |
|---|---|---|
| RS suffix ×1,000 gives square feet per unit | RS-1-7 is 1 DU/lot; lot minimum is 5,000, not 7,000 | Direct contradiction; conflates lot minimum and density |
| RM final suffix ×1,000 gives square feet per unit | RM-1-1 is 3,000; RM-4-11 is 200 | Direct contradiction |
| RX is nonstandard and can use RM-style digit parsing | §131.0404 and Table 131-04E establish RX; 1 DU/lot, distinct lot area | Direct contradiction |
| Floor(lot area / guessed basis) answers capacity | Tables depend on dimensions, overlays, conditions, and other regulations | Unsupported capacity inference |
| Undersized lot automatically means zero units | A minimum-lot-area rule alone does not decide existing-lot/project eligibility | Unsupported inference |
| These heuristic results are source-backed | No cited row supports the algorithm | Unsupported confidence label |

ADU/program behavior downstream is outside this packet and remains retired from
the canonical truth claim. No compatibility behavior is preserved in this resolver.

## 10. Rule resolver behavior

The standard-library-only resolver is under `scripts/zoning-standards-v2` and is
not imported by application code. Inputs are exact raw codes, explicit ruleset,
as-of date, Coastal context, observed source/version metadata, and the two project
gates. Unknown codes are unresolved; no prefix, case, or digit fallback exists.

Example, from the isolated worktree:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/zoning-standards-v2/resolver.py RS-1-7 RM-1-1 \
  --as-of 2026-09-24 --coastal-context outside \
  --rule-set sd-residential-2026-09-24-research-v1 \
  --observation data/zoning-standards-v2/source-version-observation.json \
  --application-context new_application --airport-context outside_miramar_transition
```

Each zone receives separate conditional base-table evidence, footnotes,
supplemental source tables, section text, and unresolved dependencies. Split-zone
results are never blended. No project feasibility or regulatory interaction is
resolved. Historical/future dates, unknown profiles, and missing context fail closed.

## 11. Source-drift detection

`check-source-version.py` checks actual acquired artifact hashes and a reviewed
observation containing URLs, acquisition times, ordinances, effective dates,
Coastal states, and applicability profiles. It is deliberately offline; the
pinned observation proves the recorded acquisition, not continuous current law.
Later dates are refused until reacquisition and a new explicit review.

Both CLI and exported resolver verify the sealed contract. The latter checks
canonical hashes against the repository's integrity record, covering supplemental
tables, dependent text, and review evidence as well as numeric rules. The semantic
validator separately checks source/row/column/unit/value, conditions, footnotes,
coverage, missing evidence, and conflicting versions. Successful parsing never
promotes review state. `lock.py` is an explicit review operation and must not be
used to make unexplained drift disappear.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/zoning-standards-v2/check-source-version.py \
  /private/tmp/trulot-packet12-sources \
  --observation data/zoning-standards-v2/source-version-observation.json
```

## 12. Adversarial review findings

A separate Astra reviewer checked the version chain, rendered RS-1-7 evidence,
RM density samples, and hostile in-memory mutations. Corrections included missing
governing-section dependencies, chapter references, source/applicability validation,
review promotion guards, the Coastal-profile bypass, full-bundle integrity, and
the angle-axis footnote. The reviewer independently reran five mutations after
the fixes; all returned `INVALID_OR_DRIFTED`.

The strikeout hazard was resolved using rendered deletion formatting and the
signed O-21934 recital: the footnote was repealed. The initially mistaken reading
was withdrawn and never emitted as a current rule. The completed record is in
`review.json`. Exactly 19 explicitly inspected coordinates are `SOURCE_VERIFIED`,
788 remain `EXTRACTED`, and 7 are `INTERPRETATION_REQUIRED`. No rule is marked as
human/legal `REVIEWED`.

## 13. Remaining interpretive issues

- Complete inside-Coastal section composite and O-21934 certification status.
- Table 131-04J prints `4.001 - 5,000`; the decimal/thousands typography is not
  silently repaired. Fractional lot-area boundaries also require interpretation.
- Tables 131-04I/K print “More than 10 stories or 120 feet” after the nine-story
  row. Exact-ten-story and inconsistent story/height conditions are not inferred.
- Orphan bedroom footnote 8; unevaluated diagrams, program interactions, overlays,
  environmental constraints, lot configuration, and project grandfathering.

Future architecture, documented only:

```text
Parcel -> Base Zone -> Base-Zone Standards -> applicable overlays
       -> property-specific constraints -> program eligibility
       -> regulatory interactions -> development pathway -> calculated capacity
       -> uncertainty / interpretation
```

The packet establishes the third stage's research representation. It does not
collapse later stages into density or FAR arithmetic.

## 14. Tests

35 new offline tests pass, including golden values/units/pages, conditions,
footnotes, source ambiguities, unknown codes, split zones, Coastal/date gates,
source drift, conflicting versions, malformed values, altered evidence, review
promotion, and absence of capacity inputs. Twenty existing safe regression suites
pass. TypeScript `tsc --noEmit --incremental false` passes. Source artifact/version
verification passes. Command-level results are in `test-results.json`.

Repository lint retains one unchanged `no-explicit-any` error at
`supabase/functions/nearby-parcels/index.ts:125:67` and six existing warnings.
No modified JS/TS application code is part of this packet. No migration, database,
production browser, deployment, or credential-requiring suite was executed.

## 15. Diff

Only new files under `data/zoning-standards-v2`, `scripts/zoning-standards-v2`, and
the two zoning-standards documents. No existing application source, tests, SQL,
dependency state, or prior packet evidence is changed.

## 16. Commit identity

One local commit is authorized after the scoped PASS: `Establish residential
zoning standards V2`. Its exact identity is reported in the task's final response.
The commit cannot contain its own hash. No push is authorized.

## 17. Preservation

The original checkout's branch, HEAD, Git status, staged/unstaged patches,
untracked list, and 57 tracked/nonignored file hashes are compared before/after.
See `preservation.json`. No production mutation, Parcel V1 runtime change,
capacity logic, deployment, or push is part of this packet. Packet 13 is not begun.

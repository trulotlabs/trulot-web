# Residential standards review closure

The authorized baseline was clean at commit
`9638397c263d63841351f05c21aa6e561ad874db`, tree
`4728e2207ef412493e18e63c778318bab9a5e487`, branch
`codex/trulot-parcel-v1-hardening`, root `/Users/ops/trulot-web-parcel`.

This review approves **97 base-table parameters for a bounded offline integration
rehearsal**. It does not approve parcel-specific legal applicability. The distinction
is enforced by the artifact type and selector, not left as a warning on unsafe rules.
Unsafe records are absent from the subset. Original Packet 12 evidence is unchanged.

## 1. Operative-version timeline

Authority hierarchy: official City Clerk code; adopted/corrected operative ordinances
that amend it; CCC certification and City implementation; Planning effective-date
materials; explanatory guidance; normalized transcription. No explanatory-only rule
enters the subset. Corrected text and later certification events control stale editor
notes. Whole-chapter versions are not inferred from one ordinance.

| Instrument | Outside Coastal | Coastal | Evidence and limitation |
|---|---|---|---|
| 2022 update O-21618 | May 6, 2023 | February 6, 2025 | Final passage March 7, 2023; signed §§39–43 impose timing/airport/Coastal conditions. O-21905 implements accepted modifications. |
| 2024 update O-21836 | October 5, 2024 | September 10, 2026 | Corrected ordinance; conditional certification February 5, 2026, City acceptance July 14, reported completion September 10. July code pending note is stale. |
| O-21934 | April 24, 2025 | Unverified | Repeals RS-1-2 footnote 7; signed final passage March 25. No Coastal date inferred. |
| 2026 update O-22109 | July 15, 2026, subject to conditions | Pending | New application and airport restrictions; anticipated future dates are not operative law. |

Primary sources: [signed O-21618](https://docs.sandiego.gov/council_reso_ordinance/rao2023/O-21618.pdf),
[2022 certification, pp99–100](https://documents.coastal.ca.gov/reports/2025/2/Th19/Th19-2-2025-report.pdf),
[corrected O-21836](https://www.sandiego.gov/sites/default/files/2024-11/o-21836.pdf),
[2024 certification, pp8–14](https://documents.coastal.ca.gov/reports/2026/9/Th11/Th11-9-2026-report.pdf),
[signed O-21934](https://docs.sandiego.gov/council_reso_ordinance/rao2025/O-21934.pdf),
[signed O-22109](https://www.sandiego.gov/sites/default/files/2026-07/o-22109-1.pdf).
The [City update page](https://www.sandiego.gov/planning/work/land-development-code/updates)
corroborates dates; it is not the sole authority for selected constants.

`timeline.json` gives half-open, non-overlapping intervals within each provision
family. Outside base tables transition at May 6, 2023; October 5, 2024; April 24,
2025, with the last change limited to RS-1-2. Section 131.0442 retains the corrected
2024 text. The 2026 update changes dependent setback/accessory provisions, not the
selected table/dimension sections. Inside Coastal uses a different sequence, with
2025 RS-1-2 repeal unresolved. Open-ended documentary intervals never authorize
future use: the gate accepts only September 24, 2026. Historical rule composites are
not reconstructed, and the documentary lookup returns no standards.

## 2. Corrected/conflicting ordinance findings

The October 7, 2024 City Attorney memo in corrected O-21836 (physical pp159–161)
repairs a parking Table 142-05C bicycle reference, 9 to 5. The clean ordinance's
printed pp44–46 preserves dimensional table rows; its dimension-section amendment
concerns frontage, which this subset excludes.

The February 25, 2025 memo in
[corrected O-21905, physical pp14–15](https://docs.sandiego.gov/council_reso_ordinance/rao2024/O-21905.pdf)
repairs commercial Table 131-05B footnote 20 to 22 and §143.1310 numbering/geographic
language. It expressly distinguishes Coastal and outside operative versions. These
corrections do not amend the selected dimensional constants; their geographic
resolution is not generalized to other provisions.

O-21934's deleted RS-1-2 exception matters: its prior geographic substitution of
RS-1-7 dimensions cannot be imported from flattened strikeout text. Signed repeal
supports the outside RS-1-2 values 80/85/100 feet. Coastal remains blocked.

O-22109's signed title was rendered and inspected: its residential amendments are
§§131.0422, 131.0443, and 131.0448; measurement amendments are §§113.0222 and
113.0234. It does not amend §§131.0431, 131.0442, 113.0237, or 113.0243. Sections
60–62 preserve effectiveness/grandfathering and coordinate overlapping ordinances.
No blanket equivalence between the scanned signed ordinance and flattened strikeout
text is claimed. All other affected families remain excluded.

## 3. Orphan-footnote outcome

**ORPHAN_FOOTNOTE_UNRESOLVED**

Historical text was located. [O-21164 strikeout p27](https://docs.sandiego.gov/municode_strikeout_ord/O-21164-SO.pdf)
added footnote 8 and changed RS-1-8 through RS-1-14 bedroom cells to dashes.
[O-21836 strikeout p43](https://docs.sandiego.gov/municode_strikeout_ord/O-21836-SO.pdf)
visibly deletes that footnote. The current table retains the `(8)` row marker without
its text. This establishes history, not permission to repair the current provision
or resurrect its deleted bedroom limit. All seven affected records are excluded.

## 4. Ambiguous interval resolutions

| Rule/section | Prior ambiguity | Resolution | Evidence | Integration-safe? |
|---|---|---|---|---|
| 2022 Coastal boundary | Incomplete certification chain | February 6, 2025 established | O-21905 memo; CCC pp99–100 | Historical boundary only |
| 2024 Coastal boundary | July editor note says pending | September 10, 2026 established by later evidence | CCC pp8–14; City dates | Boundary only; no inside subset |
| RS-1-2 exception | Strikeout addition/repeal confusion | Signed repeal outside; Coastal unknown | O-21934 pp3–6 | Selected outside dimensions |
| Table 131-04J | `4.001 – 5,000`; fractional gaps | Unresolved; no silent correction | Current code p66 | No |
| Tables 131-04I/K | 9 stories/108 feet followed by more than 10 stories/120 feet | Exact 10-story and inconsistent height/story cases unresolved | Current code pp65,68 | No |
| §131.0443(a)(2)(A) | Apparent Table 141-04D reference error | No authoritative correction established | Current code p49 | No |
| 2026 dependent sections | Coastal/airport/application timing | Conditional outside boundary recorded; remaining applicability excluded | Signed §§60–62 | No |

## 5. Seven interpretation-required records

Each record is Table 131-04D, page 36, row 27, `bedroom_regulation_8`:

| Zone | Classification | Safe? |
|---|---|---|
| RS-1-8 | REMAINS_INTERPRETIVE | No |
| RS-1-9 | REMAINS_INTERPRETIVE | No |
| RS-1-10 | REMAINS_INTERPRETIVE | No |
| RS-1-11 | REMAINS_INTERPRETIVE | No |
| RS-1-12 | REMAINS_INTERPRETIVE | No |
| RS-1-13 | REMAINS_INTERPRETIVE | No |
| RS-1-14 | REMAINS_INTERPRETIVE | No |

The dash and missing marker are mechanically representable. They are not a numeric
limit or evaluated boolean. Interpreting them as permission, prohibition, or a
restored numeric limit would change a standard. Authoritative clarification or human
land-use/legal resolution is still required. Individual IDs and answers appear in
`interpretation-review.json`.

## 6. Extracted-record verification

The independent PyMuPDF reader checks the pinned source hash, exact table/section,
row label, column zone, ordered value, units, footnote text and attached references.
It uses glyph centers to prevent adjacent superscripts bleeding into a cell. Thirty-four
superscript-order differences between PDF engines resolve by separately comparing
markers and ordered substantive content, never by comparing an unordered bag of digits.
All 814 cells pass transcription checks. All 44 present footnotes also match independent
PDF text; the orphan remains expressly missing. No value/unit correction was needed.

| Final closure state | Previously EXTRACTED (788) | All records (814) |
|---|---:|---:|
| SOURCE_VERIFIED for bounded scope | 94 | 97 |
| APPLICABILITY_UNRESOLVED | 650 | 665 |
| INTERPRETATION_REQUIRED | 44 | 52 |
| SOURCE_INCOMPLETE | 0 | 0 |
| CONFLICTING_AUTHORITY | 0 | 0 |

The original 19 source-reviewed records are not automatically integration-safe:
only three enter this subset. The 52 interpretive records comprise 45 compound
expressions and seven orphan records. Source verification and version/applicability
closure are separate columns in `cell-review.json`. Unreviewed governing dependencies
are not falsely marked conflict-free; only the explicit 97-rule authority decision
clears that bounded scope.

## 7. Integration-safe subset

`residential_standards_v2_integration_safe.json` contains 97 entries: lot width,
corner-lot width, and lot depth, excluding RX-1-2 width/corner width because of the
§131.0442(c) alley exception. Coverage: RS 42, RX 4, RT 15, RM 36; all 33 codified
RS/RX/RT/RM zone codes have at least one parameter. No unsafe records are copied into it.

Every value is traceable to a glyph-verified coordinate, code hash, explicit reviewed
authority chain, and captured dependencies. Required scope is
`BASE_TABLE_PARAMETERS_ONLY`, outside Coastal, new application, outside the Miramar
transition exception, exact reviewed date. Corner width additionally requires a corner
lot. Unknown lot context fails closed. §113.0237(b) permits use of legal lots despite
minimum dimension noncompliance; §113.0243 specifies depth/width measurement, including
irregular and consolidated lots. These provisions are retained in full. The subset
therefore makes no parcel compliance or entitlement determination.

## 8. Coastal applicability matrix

| Family | Outside current snapshot | Inside Coastal | Unknown |
|---|---|---|---|
| RS dimensions | 42 selected constants; 2024 composite plus 2025 repeal | 2024 certified; RS-1-2 repeal unresolved; all excluded | Fail closed |
| RX dimensions | 4 constants; alley-sensitive widths excluded | No complete per-cell equality review; excluded | Fail closed |
| RT dimensions | 15 constants | No complete per-cell equality review; excluded | Fail closed |
| RM dimensions | 36 constants | No complete per-cell equality review; excluded | Fail closed |
| Setbacks/accessory | 2026 dependent changes; not cleared | 2026 pending; different composite required | Fail closed |
| Other families | Not cleared | Not cleared | Fail closed |

Exclusion inside does not assert that every number differs; it means this packet has
not established the full per-rule equality and applicability proof required to allow it.

## 9. RS-1-7 adversarial review

All 24 source transcriptions were challenged independently: 24 confirmed, zero
numeric corrections. Three parameters survive: width 50 feet, corner width 55 feet,
depth 95 feet. Twenty-one records remain excluded.

Density is one DU per lot in the base table, not a capacity conclusion. Lot area 5,000
square feet is not a legal-lot test. Frontage needs the curving-street predicate.
Setback values 15/4/5/13 retain their footnotes and unresolved application predicates.
Height remains `24/30`, never an inferred scalar 30. FAR remains `varies`, with the
ambiguous supplemental ranges excluded. Every pointer row remains unevaluated.
The independent report enumerates a falsification attempt for each of the 24 IDs.

## 10. Cross-zone audit

All 814 physical coordinates are unique; all 33 header-derived codes resolve. Units,
row labels, notes, and raw values match independent PDF evidence. The 97 dimensional
values also match a separately constructed reviewer matrix. Repeated values are
confirmed from source cells, not generated from zone digits. RS/RX/RT density units
are DU/lot, while RM uses square feet/DU; they are not conflated. `cross-zone-audit.json`
records repeated numeric groups for error detection and exact zone coverage.

An independent reviewer briefly raised a current RE-zone omission, then withdrew it
after separating historical ordinance text from current code. That correction is
recorded; it caused no rule change or inferred zone mapping.

## 11. Drift gate

Selection verifies the sealed review artifacts, unchanged Packet 12 evidence, and
actual bytes of every pinned public source file. Missing files and changed hashes
invalidate selection. The full authority observation must match: dates, certification
states, section/table inventory, authority review date, missing sources, and new or
unreviewed conflicts. Hash-only observations are rejected. Later dates are rejected.

This is an offline dated review gate, not live monitoring. A static hash cannot discover
an ordinance published elsewhere. New use requires acquisition and substantive review
of the authority inventory, not replaying an old observation or auto-refreshing a seal.
There is no product integration or automatic source refresh in this packet.

## 12. Independent review findings

Two separate reviewers examined the legislative chain and candidate constants, and
the second challenged all RS-1-7 records and the actual gate. Required corrections:
explicit legal-lot/measurement dependencies; retained corner condition; mandatory
source-file rehashing at selection; early invalidation for malformed evidence; strict
97-family approval bounds. All were incorporated. The second reviewer ran 23 actual
gate cases and approved only the bounded base-table-parameter rehearsal contract.
No independent approval of parcel-specific legal applicability is claimed.

## 13. Remaining exclusions

717 of 814 original records are absent from the subset: the orphan seven, compound
expressions, pointer/dash records, all other numeric families, RX-1-2 exceptional
widths, unresolved supplemental ranges, and unclosed project/version dependencies.
All inside/unknown Coastal contexts, grandfathered/unknown applications, unknown
airport/lot contexts, and dates other than the reviewed snapshot are excluded.
No development capacity, ADU, SB9, or SB79 rules are implemented.

## 14. Tests

Recorded in `validation-results.json`: 29 closure tests; 35 Packet 12 tests;
20 prior safe Python/Node suites; TypeScript `--noEmit --incremental false`.
All pass. `npm run lint` still reports the baseline one error/six warnings, including
the existing explicit-any at `supabase/functions/nearby-parcels/index.ts:125`.
No lint fix is part of this review packet. Actual public source hash checks pass;
offline source replay reproduces the ledger/subset. No credentials or production
systems were used by validation.

## 15. Diff

Changes are confined to new `data/residential-standards-review/`,
`scripts/residential-standards-review/`, and this document. Existing application,
tests, SQL, package state, and Packet 12 artifacts are unchanged. New tests exercise
the review tooling only. No runtime import or serving route was added.

## 16. Commit identity

One local commit, `Close residential zoning standards review`, is created after
acceptance and final preservation checks. Its exact identity is reported in the
completion response and available through Git history; no self-referential commit
hash is embedded in this document. No push.

## 17. Preservation

Original checkout `/Users/ops/trulot-web` stays on `codex/elevate-row-interview`, HEAD
`8d82378e5b6a3cb2aba1153b96f025bc71a78d16`. Before and after status:

```text
 M supabase/functions/nearby-parcels/index.ts
?? docs/sda-source-of-record-recovery-discovery-architecture-2026-07-15.md
?? supabase/.temp/
```

Branch, HEAD, full short status, tracked/staged diffs, untracked listing, and all 57
tracked/nonignored untracked file hashes match. The checkout is byte-for-byte
logically unchanged from Git's perspective within this recorded scope. No production
mutation, Parcel V1 runtime change, capacity calculation, deployment, or push occurred.

RESIDENTIAL_STANDARDS_REVIEW_CLOSURE_PASS

READY_FOR_STANDARDS_INTEGRATION_REHEARSAL

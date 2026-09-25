# Packet 17: height, FAR and lot-coverage source review

Observation: 2026-09-24. Baseline: `ea25454ffafafe40d3ab564e5b12c03ddd884ad2`. This report supplies a conservative **22-record proposed DISPLAY_SAFE_PARAMETER subset**: seven RS height expressions, seven conditional RS lot-coverage standards and eight direct RS FAR parameters. These are offline proposals. Every parcel predicate remains unresolved; no proposed record is PARCEL_APPLICATION_SAFE.

The applicable profile is `outside Coastal / new application / outside MCAS Miramar transition / as of 2026-09-24`. Inside-Coastal and unknown-Coastal requests do not select this profile. The base parameter is not a project entitlement, compliance result, buildable envelope, maximum permitted floor area or capacity calculation.

## Evidence and operative version

The [City Clerk residential division](https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division04.pdf), July 2026 edition, supplies the exact table cells, footnotes and dependent sections. The [measurement division](https://docs.sandiego.gov/municode/MuniCodeChapter11/Ch11Art03Division02.pdf) and [definitions division](https://docs.sandiego.gov/municode/MuniCodeChapter11/Ch11Art03Division01.pdf) supply measurement semantics. Pinned source hashes are copied from the existing approved observation into the proposal file; the eventual gate must rehash the PDF bytes.

The [Chapter 13 history table](https://docs.sandiego.gov/municode_history/Chpt%2013%20History%20Tables.pdf), pages 25-30, was checked for §§131.0431 and 131.0444-131.0446. Section 131.0444 was last amended by O-19801, outside effective December 13, 2008. Its history reports Coastal certification June 11, 2009; that fact alone does not clear all table/measurement dependencies for Coastal use.

The [corrected adopted O-21836](https://www.sandiego.gov/sites/default/files/2024-11/o-21836.pdf), printed pages 44-45 and 50-51, preserves the selected table height/FAR rows and §131.0446(a)-(d), and supplies current §131.0445(a). It became operative outside Coastal October 5, 2024. Corrected text was checked rather than treating flattened strikeout text as operative law. Its later correction memo addresses unrelated parking references; no correction to Table J was established.

[O-21934](https://docs.sandiego.gov/council_reso_ordinance/rao2025/O-21934.pdf) repeals Table D footnote 7 outside Coastal, effective April 24, 2025. No RS-1-2-to-RS-1-7 historical substitution is selected here. [O-22109](https://www.sandiego.gov/sites/default/files/2026-07/o-22109-1.pdf), title and effective/grandfathering/overlap provisions, supplies the current outside profile from July 15, 2026. It does not amend the selected height/coverage/FAR table cells; its changes to §113.0234 remain part of the current outside gross-floor-area measurement reference.

O-21836's July consolidated pending-Coastal note is stale against the [September 2026 certification report](https://documents.coastal.ca.gov/reports/2026/9/Th11/Th11-9-2026-report.pdf) and [City adopted-updates record](https://www.sandiego.gov/planning/work/land-development-code/updates). Certification is reported September 10, 2026. O-21934/O-22109 and measurement dependencies still require provision-specific Coastal reconciliation. All proposed records therefore encode inside-Coastal NOT_ADMITTED and unknown-Coastal FAIL_CLOSED. No inference that outside Coastal means outside other height or airport overlays is allowed.

The proposal JSON preserves full pinned text pages for selected measurement/exception references, including §131.0461(a). Full-page inclusion is evidence context, not approval of every clause on the page. Exact clause locators and expressly bounded contexts control each reference. Reference nodes preserve those provisions without evaluating them. Current-authority conflicts are separately recorded and never silently corrected.

## Height: seven proposed records

Table 131-04D page 34 prints `24/30` with footnote 4 for every zone RS-1-1 through RS-1-7. Footnote 4, page 37, refers to §131.0444(b). Sections 131.0444(a)-(c), Table H and Diagram L, pages 62-63, mechanically establish an envelope expression:

- `base_zone_maximum_structure_height_ft = 30`;
- `angled_envelope_origin_at_applicable_setback_ft = 24`;
- lot width below 75 feet: plane 45 degrees inward from vertical;
- lot width 75 through 150 feet, inclusive: 30 degrees inward from vertical;
- lot width greater than 150 feet: Table H says the angled plane is not applicable;
- planes are required adjacent to required side yards, subject to Table H;
- front and street-side planes also apply under the express condition that maximum structure height exceeds 27 feet.

The JSON keeps the last condition as an unresolved named predicate and does not invent a lot width, choose a yard/setback line or flatten the pair into a scalar. Its ordinary setback-line context concerns above-grade portions of primary buildings. It explicitly excludes alley-property-line remapping, required street/alley dedication, completely underground structures, resubdivided corner lots, document-modified setbacks, additions governed by established side setbacks, accessory-structure standards, projections/encroachments and separate program/overlay modifications. Every exclusion has a controlled predicate left UNRESOLVED, never defaulted false. The expression remains a source envelope form; it does not determine whether a parcel matches that scope or locate its setback. Fire Official authority to require a greater defensible-space buffer also remains an unresolved dependency. Diagram L was visually inspected. Footnote 4 is an accurate reference to the angle table, not a lost alternative height permission.

Section 113.0270(a), measurement pages 38-45, requires both plumb-line and overall measurements. The first follows the lower of existing or proposed grade, subject to stated special circumstances. The overall bound includes the lesser of the footprint grade differential or 10 feet, while no individual point may exceed the applicable zone maximum above grade. Thus `30` must not be mislabeled as a universal highest-point-to-lowest-grade measurement, and this report does not announce a computed 40-foot entitlement. Structure separation, topographic variation, subterranean spaces, nearby pools and appurtenances remain survey/project predicates. Section 113.0270(a)(4)(D)'s Coastal Height Limit method is kept distinct from the Coastal version gate.

Section 131.0461(a), residential pages 80-88, remains an explicit reference to the separate architectural-projection and encroachment exception family. Those permissions are outside this ordinary-height application context. Its full source-page text is included in the proposal. The proposed parameter describes the ordinary base envelope with that reference; it does not decide an encroachment claim or suppress an exception. Chapter 13 Article 2 and Chapter 14 applicability also remain unresolved under §131.0430.

Other height mechanics were identified but are **not admitted in this conservative proposal**: RS-1-8 through RS-1-14 show 35 feet; RX shows 30 feet with the §131.0444(c) envelope; RT provides slab/raised-floor alternatives, story distinctions, a five-foot qualifying roof-pitch increment and a front envelope; RM-1/RM-2 have additional envelopes; RM-2/RM-3 retain Table G footnote 37's combined Coastal Height Limit/Peninsula condition. Their full group-specific dependency closure and independent contract review are deferred. Three later RM height cells use a dash; that is neither zero nor an unrestricted-height finding.

## FAR: eight proposed direct parameters; Table J excluded

The following direct Table D parameters were independently read and visually verified:

| Zone | FAR | Source | Additional condition |
|---|---:|---|---|
| RS-1-1 | 0.45 | page 35 | §113.0103 definition and §113.0234 GFA measurement |
| RS-1-8 | 0.45 | page 36 | §131.0446(b), up to 400 square feet of garage area shall be excluded from GFA |
| RS-1-9 through RS-1-14 | 0.60 | page 36 | Same up-to-400-square-foot garage exclusion |

FAR is a dimensionless ratio of gross floor area of all buildings on a premises to total premises area, not floor area itself. GFA elements remain a structured reference to §113.0234. The §113.0246 FAR reference is narrowly confined to its verified opening density/GFA pre-dedication sentence on measurement page 26: where street/alley dedication is required under §142.0610, the property lines used to calculate lot area for maximum permitted density and maximum permitted gross floor area are those before dedication. A new `required_street_or_alley_dedication` predicate remains UNRESOLVED, and this conditional sentence selects no actual lines. It does not bind the whole §113.0246 section or certify its separate setback sentence or mapping chain. No garage area or GFA is assumed or calculated. The mandatory `shall` wording in the RS garage provision is retained; it must not be substituted with RT's `may` exclusion or RT's 525-square-foot figure.

Section 131.0446(a) expressly applies to RS-1-2 through RS-1-7, not RS-1-1 or RS-1-8 through RS-1-14. Their direct parameters do not depend on Table J. They can therefore be admitted without treating that table's defects as resolved.

**Table J remains excluded for all six dependent zone records.** The current PDF page 66 visibly prints `4.001 - 5,000`, not merely a text-extraction error. Taken literally it overlaps earlier intervals. Replacing the decimal point by a comma without controlling correction evidence is not permissible. Even the intuitive comma reading leaves fractional area gaps, such as 5,000.5 square feet, between `4,001-5,000` and `5,001-6,000`; no authoritative floor/ceil/round rule for these lot-area intervals was established. The separate density rounding provisions do not authorize area rounding.

An [older official November 2005 residential supplement](https://docs.sandiego.gov/municode_supp/768/ch13art01div04tdd.pdf) uses `4,001`, as does the [current La Jolla Planned District §1510.0304 table](https://docs.sandiego.gov/municode/MuniCodeChapter15/Ch15Art10Division03.pdf) and its [O-21416 corrected ordinance](https://docs.sandiego.gov/council_reso_ordinance/rao2022/O-21416.pdf), printed pages 82-83. These establish meaningful correction leads, not authority to import planned-district or historical text into the current residential base-zone table. No current adopted correction closing the base-table punctuation and fractional intervals was found. O-21836 says (a)-(d) have no change; it does not supply a replacement Table J.

The additional §131.0446(a)(2) steep-hillside adjusted-area expression was identified: for qualifying oversized lots, the basis combines the greater of non-steep area or zone minimum lot area with 25% of remaining lot area. It does not cure the defective lookup intervals and is not evaluated here. Coastal versions are not a workaround for those defects.

RX's special denominator and RT's story-specific FAR/garage conditions appear mechanically expressible but remain outside this conservative admission pass. RM base values must preserve community-plan alternatives, any historic-resource footnote 39 and the separate child-care bonus reference. Four footnote-39 records remain excluded because `shall not increase` requires a verified baseline that this pass has not established. Child-care bonus records are excluded until their complete expression and §141.0606 dependencies are closed.

RM-5-12's Table K remains excluded. Its story/height alternatives lack a proven deterministic priority when the two measures point to different rows, and the final row says `More than 10 stories or 120 feet`, following 9 stories/108 feet. A missing explicit 10-story alternative cannot be repaired by intuition.

## Lot coverage: seven conditional proposals

Table D page 35 points all seven RS-1-1 through RS-1-7 records to §131.0445(a). The operative rule, page 65 and corrected O-21836 printed page 50, sets maximum coverage of 50 percent **when more than 50 percent of the premises contains steep hillsides**. Exactly 50 percent does not satisfy the `more than` condition. The fallback is only `this provision does not specify a limit`, never `unlimited` or `0`.

The definition of steep hillsides, definitions page 27, requires either (natural gradient at least 25% AND minimum elevation differential 50 feet) OR (natural gradient at least 200% AND minimum elevation differential 10 feet). A slope raster threshold alone does not resolve it. The proposal preserves both conjunctions and the disjunction without classifying a parcel.

Section 113.0240, measurement page 24, measures coverage from the footprint at outer exterior walls/supports divided by lot area. All five exclusions are preserved: qualified open projections; certain roofed areas with at most three exterior walls; architectural projections; qualifying portions of underground parking/first stories/basements at most three feet above grade; and exterior solar-system portions. Their physical characteristics remain unresolved.

The other actual base-zone coverage family is RT: Table F page 40 specifies 60%, 65%, 70%, 75%, 75% with §131.0445(b)'s 525-square-foot garage, bay-window/turret and open-porch/balcony treatment. It is understood but not admitted in this pass. RM-5-12 has an interior/corner distinction (50%/60%) and Table I height/story reductions; the same 10-story and competing-measure issues as Table K keep that compound record excluded. RS-1-8 through RS-1-14 and RM-1 through RM-4 table dashes do not support invented numeric coverage limits. RX has no base-table coverage row. Section 131.0445(a) also reaches qualifying small-lot subdivisions; that pathway is preserved as source context but not added to unrelated base-zone records here.

## Predicate discipline and adversarial checks

The proposal catalogue separates legal/regulatory lot geometry, measured lot width, required-yard/setback geometry, the 27-foot source condition, grade, structural/appurtenance details, overlays, qualifying steep-hillside fraction, natural gradient/elevation differential, coverage footprint/exclusions, GFA elements, premises area and garage area. All are explicitly UNRESOLVED with no default value. Rules reference controlled predicate IDs.

The local research pass checked that no proposal depends on Table J; no `24/30` pair is flattened; 75 and 150 feet remain inclusive in the middle angle interval; the angle is measured from vertical; the coverage threshold is strict; slope and elevation conditions are both retained; the garage exclusion is specific to the correct zone family; source-dependency clauses remain available; and no unknown-Coastal input selects outside law. The parent must complete the independent adversarial pass and final sealed-contract tests before admitting these proposals.

RS-1-7 result for this assignment: **height DISPLAY_SAFE_PARAMETER; conditional lot coverage DISPLAY_SAFE_PARAMETER; FAR REMAINS_EXCLUDED**. The reasons propagate to RS-1-1 through RS-1-7 only where their common source structure is proved; FAR remains independently admitted for RS-1-1 and RS-1-8 through RS-1-14.


### Setback-line authority boundaries retained after independent review

The ordinary height reference is limited to §§113.0246(a)-(d), 113.0249(a) and 113.0252(a),(c), subject to all named context exclusions. Three disputed items remain unresolved: corrected O-21836 page 14 omits codified §113.0246(e) child clauses/diagram without an express no-change clause; the separate §113.0246 setback-dedication sentence says `front of street side`; and §113.0252(b) cites §113.0461 for its underground exception. This pass makes no retention/deletion interpretation and supplies no corrected reference. Resubdivision, documentary modifications and established-addition lines also require unevaluated historical/property facts. None of those gaps is disguised as a closed source chain.

The FAR dependency binds only the independently verified preceding density/GFA dedication sentence. The literal full sentence is retained in each FAR conditional reference. The presence of adjoining disputed text in the evidence archive does not broaden that claim. Proposal counts remain seven height, seven coverage and eight FAR records; all changes refine scope and predicates.

## Exact proposed rule IDs

- `sd-residential-2026-09-24-research-v1:RS-1-1:34:17`
- `sd-residential-2026-09-24-research-v1:RS-1-2:34:17`
- `sd-residential-2026-09-24-research-v1:RS-1-3:34:17`
- `sd-residential-2026-09-24-research-v1:RS-1-4:34:17`
- `sd-residential-2026-09-24-research-v1:RS-1-5:34:17`
- `sd-residential-2026-09-24-research-v1:RS-1-6:34:17`
- `sd-residential-2026-09-24-research-v1:RS-1-7:34:17`
- `sd-residential-2026-09-24-research-v1:RS-1-1:35:4`
- `sd-residential-2026-09-24-research-v1:RS-1-2:35:4`
- `sd-residential-2026-09-24-research-v1:RS-1-3:35:4`
- `sd-residential-2026-09-24-research-v1:RS-1-4:35:4`
- `sd-residential-2026-09-24-research-v1:RS-1-5:35:4`
- `sd-residential-2026-09-24-research-v1:RS-1-6:35:4`
- `sd-residential-2026-09-24-research-v1:RS-1-7:35:4`
- `sd-residential-2026-09-24-research-v1:RS-1-1:35:5`
- `sd-residential-2026-09-24-research-v1:RS-1-8:36:19`
- `sd-residential-2026-09-24-research-v1:RS-1-9:36:19`
- `sd-residential-2026-09-24-research-v1:RS-1-10:36:19`
- `sd-residential-2026-09-24-research-v1:RS-1-11:36:19`
- `sd-residential-2026-09-24-research-v1:RS-1-12:36:19`
- `sd-residential-2026-09-24-research-v1:RS-1-13:36:19`
- `sd-residential-2026-09-24-research-v1:RS-1-14:36:19`

No prior approval, runtime module, database, deployment or original-checkout file was modified by this research pass. Only the two new Packet 17 research artifacts are proposed for the active review checkout.

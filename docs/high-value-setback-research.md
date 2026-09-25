# Packet 17 setback authority research

Observation date: 2026-09-24. Scope: 132 canonical front, interior-side, street-side and rear records across 33 RS/RX/RT/RM zones. This bounded research recommends 28 conditional **DISPLAY_SAFE_PARAMETER** records: the front and interior-side parameters for the 14 RS zones. The proposals are not approvals; a separate adversarial pass and the parent integration gate must accept them. No record is PARCEL_APPLICATION_SAFE. The remaining 104 records stay excluded from this proposed subset.

The proposed statements concern an expressly bounded base-zone rule. None asserts that an actual parcel satisfies the scope, that an exception was elected, or that a displayed distance is that parcel's required distance. The data preserve all scope predicates as unresolved. The ordinary profile excludes alley-property-line remapping, required street/alley dedication, underground structures, resubdivided corner lots, documentary setback modifications, additions governed by established side setbacks, accessory structures, architectural encroachments and separate program/overlay modifications. Interior-side proposals additionally exclude corner-lot application because the choice between the table's ordinary and corner minimum-width rows has not been adjudicated. These boundaries must remain visible and machine-readable. A consumer that cannot preserve them must reject these proposals.

## Authority and version

The live official [residential division](https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division04.pdf), [measurement division](https://docs.sandiego.gov/municode/MuniCodeChapter11/Ch11Art03Division02.pdf), [Chapter 13 history](https://docs.sandiego.gov/municode_history/Chpt%2013%20History%20Tables.pdf), [O-22109 strikeout](https://docs.sandiego.gov/municode_strikeout_ord/O-22109-SO.pdf), and [City update chronology](https://www.sandiego.gov/planning/work/land-development-code/updates) were re-opened through web browsing. Large clean ordinances could not be rendered by the web extraction service, so the pinned primary PDFs were inspected directly with Poppler-rendered images, including signed/clean adopted pages rather than trusting flattened strikeout extraction.

Relevant source identities remain those pinned in `data/residential-standards-review/source-observation.json` and `/private/tmp/trulot-closure-parent/source-paths.json`; each proposal also carries source hashes. Independent visual checks covered current table pages 34, 36, 37, 40, 41 and 43; measurement pages 26-31; corrected O-21836 pages 14-15, 44 and 46-48; and clean O-22109 pages 29 and 193-195. Current table cells were entered independently and checked against ledger values; they were not accepted because the extraction script succeeded.

| Authority | Location | Relevance |
|---|---|---|
| Current residential division, July 2026 codification | pp.33-37; §§131.0430-.0431, Table131-04D | Governing base-zone scope, 14 RS front/side rows and footnotes |
| Corrected adopted [O-21836](https://www.sandiego.gov/sites/default/files/2024-11/o-21836.pdf), COR. COPY 2 | printed/physical p.44 | RS1-1 through RS1-7 side/street-side constants and footnote2; front and other relevant cells explicitly unchanged |
| O-21836 | pp.46-48 | RS cul-de-sac permission and all-RS side/side-reallocation clauses; p.47 retains the erroneous rear-table reference |
| O-21836 | pp.14-15 | Amendments to §113.0246; the issues below are confined outside the claimed expression scope |
| [O-21934](https://docs.sandiego.gov/council_reso_ordinance/rao2025/O-21934.pdf) | pp.4-5, Table131-04D footnote7 | Deletes former RS1-2 geographic substitution outside Coastal; do not restore that deleted exception |
| Clean adopted [O-22109](https://www.sandiego.gov/sites/default/files/2026-07/o-22109-1.pdf) | printed/physical p.29 of196 | §131.0443(a)-(h) unchanged; new (i) allows Fire Code Official to require a greater defensible-space buffer |
| O-22109 | pp.193-195, §§60-62 | Conditional effectiveness, Coastal certification gate, prior complete applications, and overlapping-ordinance reconciliation |
| Current measurement division | pp.25-31, §§113.0243/.0246/.0249/.0252 | Width, legal line classification, documentary exceptions, and direction/edge of setback measurement |
| Current definitions | pp.23-24, §113.0103 definitions of setback/setback line | Regulatory distance, not a parcel footprint determination |

Outside Coastal, the claimed profile is the current new-application profile as of 2026-09-24, outside the MCAS Miramar transition area. O-21836 became effective outside Coastal on 2024-10-05; the current §131.0443 history identifies O-22109's effective date as 2026-07-15, corroborated by the City chronology. O-22109 §61 preserves the relevance of applications deemed complete before the applicable provisions' effective date. Therefore an unknown or protected earlier application is not assigned this profile. The root authority gate must still bind this research to its approved dated observation and source manifest.

Inside Coastal is separately **not approved by this review**. Although O-21836 certification is reported effective 2026-09-10, O-22109 certification remains pending and O-21934's Coastal selection remains unverified in the pinned review. Unknown Coastal context fails closed. The anticipated 2028 Coastal date is not an operative date.

## RS front: 14 proposed conditional expressions

All numbers are feet. `T` is the table minimum, not a measured property fact.

| Zones | Table page/row | T |
|---|---|---|
| RS-1-1, RS-1-2 | 34 /12 |25,25|
| RS-1-3, RS-1-4, RS-1-5 |34 /12|20,20,20|
| RS-1-6, RS-1-7 |34 /12|15,15|
| RS-1-8, RS-1-9, RS-1-10 |36 /12|25,25,25|
| RS-1-11 |36 /12|20|
| RS-1-12, RS-1-13, RS-1-14 |36 /12|15,15,15|

The expression preserves three separate clauses:

1. Base minimum `T`.
2. §131.0443(a)(1), current p.48 / O-21836 p.46: for the portion of a lot fronting a cul-de-sac, a reduction of 5 feet below the table requirement is permitted, never below 5 feet. Represent the permission as `max(5,T-5)`, conditional on the relevant portion fronting a cul-de-sac. It is optional, not an automatic replacement.
3. Table131-04D footnote1, p.37: where at least half the front 50 feet of lot depth has minimum 25 percent slope gradient, the setback nearest street frontage may be reduced to minimum 6 feet. Preserve both the topographic threshold and the identification of the affected setback. Do not substitute the separate defined concept “steep hillsides,” which has additional conditions, for this literal table-footnote test.

No branch is selected. The two permissions are not cumulatively computed: the cul-de-sac reduction expressly references the table requirement; subtracting five from the six-foot slope permission would invent a rule. This proposal reports both permissions rather than deciding an actual design.

**RS-1-7** rule `sd-residential-2026-09-24-research-v1:RS-1-7:34:12`: proposed DISPLAY_SAFE_PARAMETER, with base15, conditional cul-de-sac permission10, and conditional slope permission6. Those are regulatory alternatives, not a claimed setback for a parcel.

## RS interior-side: 14 proposed conditional expressions

§131.0443(a)(4) expressly applies to RS zones. It therefore applies to RS-1-8 through RS-1-14 even though those page36 cells do not repeat footnote2. For RS-1-1 through RS-1-7, page34 cells additionally carry footnote2, which points to that section. Current p.51 and corrected O-21836 pp.47-48 establish the relevant clauses.

| Zone | Page/row | Base interior side | Ordinary minimum lot width |
|---|---|---:|---:|
|RS-1-1|34 /13|10|100|
|RS-1-2|34 /13|8|80|
|RS-1-3|34 /13|7|75|
|RS-1-4|34 /13|6|65|
|RS-1-5|34 /13|5|60|
|RS-1-6|34 /13|5|60|
|RS-1-7|34 /13|4|50|
|RS-1-8|36 /13|10|100|
|RS-1-9|36 /13|8|80|
|RS-1-10|36 /13|7|75|
|RS-1-11|36 /13|6|65|
|RS-1-12|36 /13|5|60|
|RS-1-13|36 /13|5|60|
|RS-1-14|36 /13|4|50|

Preserve:

- The table base minimum.
- §131.0443(a)(4)(A): if actual measured lot width is less than the applicable minimum required width, each side setback is 8 percent of actual lot width. The proposed non-corner profile uses the ordinary minimum-width row. The 8 percent branch has no stated four-foot floor; do not borrow one from the next clause.
- §131.0443(a)(4)(B): for lots wider than50ft, required side setbacks may be reallocated if their combined dimensions meet or exceed the combined required table dimensions. Reallocated interior sides cannot be below4ft; reallocated street sides cannot be below10ft. The source distinguishes those floors. The proposal retains the sum as a symbolic table-role sum, not a guessed parcel line configuration.
- Once a side setback is reallocated and established as described in (B)(i), additions must maintain that established setback. §113.0249(d) also carries an established-side-setback rule. Existing additions are expressly outside the proposed application profile, and the continuation dependency is retained.

The mandatory narrow-lot clause and optional reallocation are represented independently. The software must not select a branch or infer a reallocation election. Lot width is measured under §113.0243: the ordinary midpoint method, average width over the first50ft for irregular residential lots, and consolidated premises width rules must be available as source references; no width is calculated here.

**RS-1-7** rule `sd-residential-2026-09-24-research-v1:RS-1-7:34:13`: proposed DISPLAY_SAFE_PARAMETER within the explicit non-corner profile. Base4ft; if measured width is below50ft, 8% of width; if wider than50ft, optional reallocation subject to table sum and stated floors. Exactly50ft does not satisfy either strict inequality. This is not a parcel-specific selection.

## Preserved defects and measurement boundaries

**Rear-table defect, unresolved and excluded.** Current §131.0443(a)(2)(A), p.48, says `Table 141-04D`. Corrected clean O-21836 p.47 visibly says the same thing. The earlier O-21618 strikeout p.20 has Tables131-04C and131-04D, but that older text cannot override the later enacted wording. O-22109 p.29 leaves (a)-(h) unchanged. No authoritative correction was found in the reviewed inventory or targeted official-source search. Do not replace141 with131 or promote the seven affected rear records.

**Alley-mapping chain, unresolved outside the claim.** Corrected clean O-21836 p.14 reprints §113.0246(e)'s introduction and then moves directly to(f). It does not reproduce codified(e)(1)-(3) or Diagram113-02CC, nor expressly mark those children unchanged. Current measurement p.28 includes them. This is an unresolved drafting/codification comparison, not a finding that the children were legally repealed. Proposed expressions do not apply an alley-to-yard remapping. Alley access and an alley-abutting legal line must not be silently conflated.

**Dedication wording, unresolved outside the claim.** §113.0246's opening paragraph in both corrected O-21836 p.14 and current measurement p.26 contains `front of street side setbacks`. The phrase must not silently become “front or street side.” The proposals exclude required street/alley dedication contexts; no pre/post-dedication line is chosen.

**Underground reference, unresolved outside the claim.** Current §113.0252(b), p.31, references113.0461 in its completely-underground exemption. No replacement reference is established here. The proposal covers above-grade portions; it does not promote an underground exemption or treat underground construction as unrestricted.

**Street-side scope, not adjudicated.** §131.0443(a)(4)(A) uses “each side setback,” while the heading includes side and street side and(B)(iii) expressly distinguishes the street side. This review does not decide that the8% clause replaces the street-side table row. The14 street-side records remain excluded. The interior-side case is unambiguous; no street-side formula is generated from that phrase.

**Other measurement rules are retained, not assumed satisfied.** §§113.0246(a)-(d) classify front, double-fronted, rear/triangular, side and street-side lines. §113.0246(f) retains original front/street-side setbacks on resubdivided corner lots and applies interior-side requirements to the remaining lines; its clean/current texts agree, but the historical line facts are unexamined. §113.0249(b)-(c) distinguishes documentary modifications from merely informational old plotted lines. §113.0252(a),(c) gives inward perpendicular measurement and the building-frame edge; no geometry or compliance is computed.

**Fire Official discretion is mandatory context.** O-22109 clean p.29 adds §131.0443(i), permitting a defensible-space buffer larger than the base setback. Every proposal has an unresolved `fire_official_defensible_space_buffer` predicate and records that effect. Unknown is not “no additional buffer.”

Architectural encroachments under §131.0461(a), accessory structures under §§131.0448/141.0307, and project/overlay modifications under §131.0430(a) remain separate rule families. The base parameter neither grants nor denies those permissions. For RS supplemental requirements, §131.0464(a), pp.92-93, concerns manufactured-home materials/eaves/foundation and does not replace the proposed numeric front/interior base clauses. It still applies where the project qualifies; this proposal makes no manufactured-home compliance finding.

## Other setback groups: exact retained exclusions

All rule IDs have prefix `sd-residential-2026-09-24-research-v1:`. A notation such as `RS-1-{1..7}:34:15` denotes those explicit seven zone suffixes, not a rule derived from zone digits.

| Group and canonical coordinates | Count | Reason retained outside the proposed subset |
|---|---:|---|
|RS-1-1 through7 rear, `:34:15`|7|SOURCE_DEFECT: §131.0443(a)(2)(A) Table141-04D; later adopted source retains defect. Additional depth/alley/parking clauses are not a correction.|
|RS-1-8 through14 rear, `:36:15`|7|Bounded review does not promote the separate alley-access alternative. Table base10ft; §131.0443(a)(3), p.51, permits4ft for lots served by alley access. This is a promising mechanical future candidate, but alley access/line treatment and all scope conditions require separate accepted expression review. Not labeled inherently interpretive.|
|All14 RS street side, page34/36 row14|14|Applicability of “each side” narrow-width wording to street side not adjudicated; reallocations also have a10ft street-side floor. Bare table scalars are incomplete.|
|RX-1-1/2 front, `:37:12`|2|§131.0443(b)(1), pp.51-52, introduces project-wide mix of10/15/20ft setbacks when more than4units, at least25% each and no more than40% in any category; easement/permit establishment also required. Dedicated structured project-allocation expression is not reviewed for promotion here.|
|RX-1-1/2 interior, `:37:13`|2|Table's stacked3/0 and0 requires attached/detached branches, lot-width clamps, adjacent RX zoning, one-side-only permission, building separation and offset/wall construction requirements under(b)(2), pp.52-53. No flattened scalar admitted.|
|RX-1-1/2 street side, `:37:14`|2|Detached/attached side/street-side conditions in(b)(2) require separate complete expression and legal line selection; the3ft cell is not a blanket unconditional value.|
|RX-1-1/2 rear, `:37:15`|2|§131.0443(b)(3), p.53, gives10ft or4ft if alley access exists; not promoted by this bounded front/interior RS review. Applicability/measurement dependencies remain.|
|RT-1-1 through4 front, `:39:12`|4|§131.0443(c)(1), p.53, has10%depth,5-15ft bounds, facade-within1ft requirement, and optional50%facade encroachment requiring §§131.0461(b)/131.0464(c). Dedicated range/facade/supplemental expression not promoted here.|
|RT-1-5 front, `:39:12`|1|Additional apparent table/text conflict: table maximum front setback10ft versus(c)(1) formula bounded at15ft; no authoritative resolution established. Preserve both, fail closed.|
|All5 RT interior, `:39:13`|5|§131.0443(c)(2), p.54: zero-side rule,6x10ft lightwells/courts, independent wall construction,3ft adjacent non-RT exception and5ft opening separation. No flat0 admitted.|
|All5 RT street side, `:40:4`; all5 RT rear, `:40:5`|10|Base5ft/3ft cells are promising mechanical candidates, but RT encroachment/supplemental/garage and complete measurement profiles were not independently assembled here. No unsupported claim they are intrinsically ambiguous.|
|RM-1-1 through3 andRM-2-4 through6 front, `:41:12`|6|§131.0443(d)(1)/(e)(1), pp.55/57: minimum15 vs standard20 distributed over building-envelope width, floor-by-floor option, and curved-street10/5 alternatives. Conditional layout expression not admitted by this bounded review.|
|RM-1-1 through3 interior, `:41:13`|3|§131.0443(d)(2), p.56:5/8-or10%width asymmetric length allocation, narrow-premises exceptions and retained-existing-building allowance. Cannot flatten5/8.|
|RM-2-4 through6 interior, `:41:13`|3|§131.0443(e)(2), p.57: greater of5ft/10%width,4ft at40-50ft width, below40ft reduction with3ft floor. Exact branch/operator review not completed for promotion here.|
|RM-1-1 through3 andRM-2-4 through6 street side, `:41:14`|6|§131.0443(d)(3)/(e)(3), p.57: greater of10ft/10%premises width, plus RM2-series50%facade encroachment. No universal10ft scalar.|
|RM-1-1 through3 andRM-2-4 through6 rear, `:41:15`|6|§131.0443(d)(4)/(e)(4), pp.57-58: table15ft, possible half-alley credit capped10ft and on-site5ft floor; no permission or alley width inferred. Separate expression review needed.|
|RM-3-7/8/9 front, `:43:12`|3|§131.0443(f)(1), p.58:10/20 facade-width allocation and curved-street alternatives; unassembled conditional expression.|
|RM-3-7/8/9 interior, `:43:13`|3|§131.0443(f)(2), pp.58-59: greater of5ft/10%premises width, optional zero-side encroachment with50%length,30ft segment,6ft separation and unit-access constraints; no flat5.|
|RM-3-7/8/9 street side, `:43:14`|3|§131.0443(f)(3), p.59: greater of10ft/10%premises width, optional5ft encroachment for up to50%facade; no flat10.|
|RM-3-7/8/9 rear, `:43:15`|3|Table5ft cells are promising mechanical candidates; RM projection/encroachment and full application profile were not independently closed by this bounded review.|
|RM-4-10/11, all4families, page43 rows12-15|8|§131.0443(g), p.60: two contiguous northerly/easterly yards15ft; side/rear must match more-restrictive adjacent residential zone. Directional/neighbor-zone dependencies and recursive source completeness not established.|
|RM-5-12 front, `:43:12`|1|§131.0443(h)(1), p.60: table15ft with10ft turnaround/curved-street alternative; full profile not assembled for promotion here.|
|RM-5-12 interior/rear, `:43:13`/`:43:15`|2|§131.0443(h)(2)/(4), pp.60-61: base4ft/15ft plus3ft for each12ft of height over24ft. Fractional-height-step treatment not mechanically established; no floor/ceiling/continuous calculation invented.|
|RM-5-12 street side, `:43:14`|1|§131.0443(h)(3), pp.60-61: table10ft and width-conditioned9/8/7/6/5 alternatives. Full structured range/profile review not admitted here.|

These groups total104 excluded records. The next highest-value mechanically tractable groups are the RS8-14/RX rear alternatives and simpler RT/RM rear constants, after their source/application profiles receive independent review. This document does not authorize promoting them.

## Predicate taxonomy and safety boundary

The companion JSON includes controlled predicate IDs rather than relying on prose dependencies. Shared inputs: Coastal context, application completion date, Miramar transition status, legal property-line roles, Fire Official buffer, alley remapping, dedication, underground status, resubdivision, documentary modification, existing addition, accessory status, projection/encroachment, and special program/overlay modification. Front adds cul-de-sac frontage portion, the exact front50ft slope fraction and closest-to-frontage line identity. Interior adds measured width, corner-lot status, reallocation election and proposed side dimensions/roles.

Every predicate value is null/UNRESOLVED. Context exclusions describe where a rule is not claimed; they are not facts about any parcel. Actual parcel application would require establishing the scope, selecting relevant clauses, and resolving any governing additional rule. Packet17 does none of those operations.

## RS-1-7 outcome and artifact

| Family | Result | Exact basis |
|---|---|---|
|Front|Proposed DISPLAY_SAFE_PARAMETER|`:RS-1-7:34:12`,15ft base with separately preserved cul-de-sac and slope permissions; explicit limited profile|
|Interior side|Proposed DISPLAY_SAFE_PARAMETER|`:RS-1-7:34:13`,4ft base,8% narrow-width requirement, optional reallocation; non-corner application profile and no selected property facts|
|Street side|REMAINS_EXCLUDED|Scope of narrow-width “each side” phrase not adjudicated; retain table5ft as evidence only|
|Rear|REMAINS_EXCLUDED|Table141-04D source defect persists in corrected adopted O-21836|

Machine proposals: `data/high-value-residential-review/setback-proposals.json`. All28 exact IDs, structured formulas/clauses, explicit exclusions, unresolved predicate IDs, source locations and hashes are supplied. No existing authority, canonical ledger, runtime, database, original checkout, or prior approval was edited by this research task. No commit was created by this subtask.

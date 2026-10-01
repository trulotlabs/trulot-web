# Legal Lot Evidence V0 — Packet 25 bounded proof

Legal Lot Evidence V0 tests whether a current Parcel V2 APN can be traced through an assessor tax parcel, an authoritative recorded map or survey, and legally operative current-lot evidence. It never equates an APN with a legal development lot, calculates compliance, or calculates capacity.

Packet 25 investigates exactly two RS-1-7 parcels: APN `3506320400` at 7553 Cabrillo Avenue and APN `6341302200` at 1456 27th Street. Packet 25A reopens only the 27th Street evidence after acquisition of recorded Grant Deed `DOC # 2001-0706032`. The Cabrillo findings remain unchanged.

## Acquired authoritative artifacts

The human operator purchased and downloaded the source TIFFs. The packet did not automate payment, alter the files, or commit their bytes. The receipt metadata below excludes all private payment data.

| File | Record | Filing/recording | Sheet count | Bytes | SHA-256 |
| --- | --- | --- | ---: | ---: | --- |
| `MAP 00915-1.TIF` | Subdivision Map 00915 | 1904-08-04 4:30 PM | 1 | 191,043 | `b17fa5436951059f76381dfa7f04a5215cdd9e5c79f51249b9b0fb11c12121bc` |
| `PM 17383-1.TIF` | Parcel Map 17383, sheet 1 | 1994-06-30 11:51 AM | 2 | 135,273 | `4f3c57bf6dce29044532109abb1bb4bcc0c1740a506fb1ec36787f1b1ff821da` |
| `PM 17383-2.TIF` | Parcel Map 17383, sheet 2 | 1994-06-30 11:51 AM | 2 | 100,497 | `6912324c0a4d54dce4f02a019ebae38485ac7a7fffde5e05d8166e3257afbb00` |
| `B52044301.pdf` | Grant Deed DOC # 2001-0706032 | 2001-10-01 8:00 AM | 1 | 46,254 | `1b778cb6a06dc60e75dd1184d22681f672e453f16002e5fb0214cfc9406131fd` |

The three TIFFs were acquired from the official SRS at `2026-09-30T18:32:37-07:00`. Receipt metadata: order `db8edaa3-8df8-4bf7-9293-2db8407fa2cf`, placed `2026-09-30T17:21:58.228-07:00`; delivery email from `SRSCoordinator@ptfs.com`, subject “Purchase Confirmation for SDSRS,” received at approximately `2026-09-30T18:24:00-07:00`. The human operator supplied the local recorded-deed scan at `2026-09-30T21:24:37-07:00`; no derived title-company summary was substituted, and the original file was not altered.

## Cabrillo: Map 00915

Map 00915 is the “Map of Center Addition to La Jolla Park,” a subdivision of a portion of Pueblo Lot 1283. The survey is dated June 17, 1904; the City Board of Public Works adoption is dated July 7, 1904; the filing statement is August 4, 1904 at 4:30 PM. A later copy certification on the retained sheet is dated November 17, 1915.

The assessor description `TR 915 BLK 4*LOTS 7 THRU 9*` corresponds to three separately drawn lots in Block 4. The source does not depict or describe those three lots as one merged lot. The map scale is one inch to 200 feet. No numeric boundary dimension or area can be attributed to Lots 7, 8, or 9 with sufficient confidence from the retained sheet, so none is recorded as target-lot dimension or area evidence.

Lots 7, 8, and 9 are depicted adjoining Miramar Street. The City acceptance text includes Miramar Street and unnamed alleys among the public ways accepted from the subdivision. That supports street adjacency and dedication context only. It does not designate a Code front lot line or establish a supported frontage length.

The APN-to-recorded-lot state is `MULTIPLE_RECORDED_LOTS_ONE_APN`. The current Parcel Intelligence fixture does not retain a parcel geometry area; its 100-percent single-zone intersection area is approximately 9,138 square feet and remains a diagnostic overlay fact, not legal-lot geometry or area. No remote evidence establishes a merger, lot tie agreement, lot-line adjustment, Certificate of Compliance, or other instrument converting the three recorded lots into one current legal lot.

## 27th Street: corrected Parcel 1 identity

Parcel Map 17383 is a two-sheet lot-line-adjustment map involving a portion of Lot 13 of Tibbetts Tract, amended Licensed Survey Map 24; Parcel 1 of Parcel Map 4547; and a portion of 27th Street dedicated to public use. The field survey was requested by Juan Andrade on December 1, 1993. The City Engineer approval is dated June 28, 1994. The Recorder certificate states File No. `1994-414843`, filed June 30, 1994 at 11:51 AM.

Recorded Grant Deed `DOC # 2001-0706032`, dated September 26, 2001 and recorded October 1, 2001 at 8:00 AM, shows APN `634-130-22-00`. Its legal description begins `PARCEL 1 PARCEL MAP NO. 17383`. The deed text says the map was filed June 30, 1944, while PM 17383's Recorder certificate says June 30, 1994. Both values are preserved in the audit record; the internal year discrepancy does not change the exact Parcel 1 and PM 17383 identifiers.

Sheet 2 expressly labels Parcel 1 as `0.572 ACRES`, or 24,916.32 square feet. Its recorded boundary includes:

- west segment: 94.00 feet;
- north: N 89°55′05″ E, 265.04 feet total, including 235.04 feet west of 27th Street and a 30-foot street portion;
- east segment: 94.00 feet;
- south: S 89°54′59″ W, 265.00 feet total, including 235.00 feet west of 27th Street and a 30-foot street portion.

These remain `RECORDED_BOUNDARY_LENGTH` evidence. They are not labeled Code lot width, depth, or frontage. Parcel 1 adjoins 27th Street along the 94-foot boundary. A 4-foot water easement to Juanita A. Valverde is shown in Parcel 1 under a deed recorded April 23, 1953, Book 4832, Page 310 O.R. The map also notes the 27th Street portion dedicated by Old Road Survey 172 on January 20, 1890.

The derived assessor text `PM17383 PAR 2` remains in the evidence as a conflicting secondary description. The actual recorded deed governs legal-description reconciliation and establishes Parcel 1. The current assessor figure of 22,215 square feet and Parcel V2 geometry of approximately 21,841 square feet closely correspond to Parcel 1's approximately 22,096-square-foot portion west of the 30-by-94-foot dedicated street strip. The comparison is `CONSISTENT_WITHIN_SOURCE_AND_MEASUREMENT_SEMANTICS`; neither approximate current figure becomes legal area.

Current Parcel V2 geometry is a recognizable near rectangle approximately 235 feet east-west by 94 feet north-south, west of and adjoining 27th Street. It broadly corresponds to PM 17383 Parcel 1, with no obvious added or removed land. This is a reconciliation check, not a survey.

The retained chronology is: the 1994 predecessor deed `DOC # 1994-0198203`, describing a metes-and-bounds portion of Lot 13 of Tibbetts Tract, Map 24 under former APN `634-130-16-00`; PM 17383 filed June 30, 1994; the 2001 deed for current APN `634-130-22-00`, Parcel 1 of PM 17383; then current assessment and geometry evidence for the same APN and situs.

## Bounded modification searches

On September 30, 2026, the City OpenDSD approval search was queried by exact address for `7553 CABRILLO AV` and `1456 27TH ST`/`1456 S 27TH ST`. No approval at either target address was returned. Official City-domain searches for each APN, address, and legal/map reference also returned no directly related record. OpenDSD describes this address search as indexed permit information from 2003-current. Records are distributed across City systems, and absence here does not prove that no Certificate of Compliance, lot-line adjustment, lot tie, merger, correction, later map, or right-of-way instrument exists.

SRS was searched by unformatted and formatted APN, exact address, and map number. APN and address searches returned zero results. Map-number searches returned the originating Map 00915 and PM 17383 only after unrelated same-number collisions were excluded: Corner Record 00915 cross-references Map 8737, and PM 12057 cross-references Tentative Map 17383. Neither is a modifying record for a target parcel.

The County’s Certificate of Correction list was searched for `Map 915`/`Map 00915` and `PM 17383`; no entry was found. The County expressly labels that list partial from 1982. Packet 25A re-ran a bounded official-domain search for the 27th Street APN, address, deed, and Parcel 1 description after 2001 and found no configuration-changing instrument. For 27th Street, this negative evidence is used only with the recorded deed/map and corresponding current APN, situs, area, and geometry.

## Recorder limitation and legal-lot doctrine

Cabrillo remains `RECORDER_CHECK_REQUIRED`. For the bounded 27th Street parcel-identity purpose, the state is `REMOTE_CHAIN_SUFFICIENT`: the recorded deed and map identify the same parcel, current APN/address and geometry corroborate Parcel 1, and bounded later searches found no configuration change. This is not an ownership, encumbrance, title-insurance, or unbounded title-chain conclusion.

An assessor parcel is a tax unit and may span, split, or differ from a legal development lot. A recorded subdivision lot or parcel-map parcel supplies historic creation and geometry evidence, but its historic map does not alone prove the current configuration after adjustments, mergers, corrections, amended maps, vacations, dedications, later maps, or title instruments.

For Cabrillo, Map 00915 establishes three historic subdivision lots. It does not establish that one current legal lot matches APN `3506320400`. For 27th Street, recorded deed `DOC # 2001-0706032` and PM 17383 now establish an exact current-APN match to recorded Parcel 1 for this bounded purpose.

When a derived title or assessor summary conflicts with an actual recorded deed or recorded map, the authoritative recorded instrument governs legal-description reconciliation. The derived summary is retained as conflicting secondary evidence.

## Legal area, dimensions, and lot-line roles

Recorded area may be promoted to `LEGAL_LOT_AREA_SUPPORTED` only when all four gates pass: an authoritative artifact hash, `EXACT_RECORDED_LOT_MATCH`, `LEGAL_LOT_ESTABLISHED`, and a complete-to-current modification chain.

Cabrillo has no recorded area attributable to the three target lots and has unresolved multi-lot aggregation. PM 17383's `PARCEL 1 0.572 ACRES` label is promoted to `LEGAL_LOT_AREA_SUPPORTED` for APN `6341302200` because the deed supplies the exact recorded entity match, the legal-lot state is established, and the bounded modification chain is complete to current evidence. The value remains the recorded gross area, with its mapped dedicated-street context preserved.

No map explicitly designates front, rear, interior-side, or street-side lot lines under current Code measurement semantics. Recorded street adjacency and boundary lengths remain separate from Code frontage. Both frontage and lot-line-role resolution are refused.

## First-rule readiness and scale lesson

APN `6341302200` is `READY_FOR_DETERMINISTIC_EVALUATION` for minimum lot area. Cabrillo remains `BLOCKED_BY_LEGAL_LOT_AREA_EVIDENCE`. The packet emits no compliance result.

The reusable cohorts are:

- one APN to one recorded parcel-map parcel, automatable only after current identity and chain validation;
- one APN to one subdivision lot, potentially automatable with the same chain gate;
- one APN to multiple recorded subdivision lots, a hard case requiring explicit merger/tie/configuration evidence;
- a modified parcel requiring a later instrument because current evidence conflicts;
- condominium or stacked APNs requiring underlying-land evidence;
- unresolved or source-unavailable parcels.

The 27th Street correction demonstrates the authority rule: a derived summary may remain useful secondary evidence, but an actual recorded deed controls the legal-description reconciliation when they conflict.

## Decision

For APN `3506320400`: `LEGAL_LOT_EVIDENCE_PARTIAL`.

For APN `6341302200`: `LEGAL_LOT_ESTABLISHED`, `EXACT_RECORDED_LOT_MATCH`, `LEGAL_LOT_AREA_SUPPORTED`, and `READY_FOR_DETERMINISTIC_EVALUATION`.

The Packet 25 conclusion `IDENTITY_MISMATCH` for 27th Street is explicitly superseded. It relied on the secondary `PM17383 PAR 2` summary and comparison to Parcel 2's 0.315-acre area. Recorded Grant Deed `DOC # 2001-0706032` identifies the same APN as Parcel 1 and changes the corrected state to `EXACT_RECORDED_LOT_MATCH`.

`27TH_STREET_LEGAL_LOT_RECONCILIATION_READY`

`NEXT_FEASIBILITY_STEP: minimum lot area rule evaluator`

## Containment

The builder is repository-local and deterministic. It performs no production access, database operation, zoning load, snapshot selection, route wiring, compliance calculation, capacity calculation, citywide import, deployment, or push. Parcel V1 and the frozen Packet 11 production state are unchanged. Only the two bounded parcels received new recorded-map and modification-search analysis.

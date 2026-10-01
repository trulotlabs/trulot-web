# Legal Lot Evidence V0 — Packet 25 bounded proof

Legal Lot Evidence V0 tests whether a current Parcel V2 APN can be traced through an assessor tax parcel, an authoritative recorded map or survey, and legally operative current-lot evidence. It never equates an APN with a legal development lot, calculates compliance, or calculates capacity.

Packet 25 investigates exactly two RS-1-7 parcels: APN `3506320400` at 7553 Cabrillo Avenue and APN `6341302200` at 1456 27th Street. It seals the operator-acquired County Survey Records System (SRS) map sheets, parses only what those sheets show, searches bounded remote City and County indexes for modifying records, and refuses conclusions that require the unavailable Recorder/title chain.

## Acquired authoritative artifacts

The human operator purchased and downloaded the source TIFFs. The packet did not automate payment, alter the files, or commit their bytes. The receipt metadata below excludes all private payment data.

| File | Record | Filing/recording | Sheet count | Bytes | SHA-256 |
| --- | --- | --- | ---: | ---: | --- |
| `MAP 00915-1.TIF` | Subdivision Map 00915 | 1904-08-04 4:30 PM | 1 | 191,043 | `b17fa5436951059f76381dfa7f04a5215cdd9e5c79f51249b9b0fb11c12121bc` |
| `PM 17383-1.TIF` | Parcel Map 17383, sheet 1 | 1994-06-30 11:51 AM | 2 | 135,273 | `4f3c57bf6dce29044532109abb1bb4bcc0c1740a506fb1ec36787f1b1ff821da` |
| `PM 17383-2.TIF` | Parcel Map 17383, sheet 2 | 1994-06-30 11:51 AM | 2 | 100,497 | `6912324c0a4d54dce4f02a019ebae38485ac7a7fffde5e05d8166e3257afbb00` |

All three were acquired from the official SRS at `2026-09-30T18:32:37-07:00`. Receipt metadata: order `db8edaa3-8df8-4bf7-9293-2db8407fa2cf`, placed `2026-09-30T17:21:58.228-07:00`; delivery email from `SRSCoordinator@ptfs.com`, subject “Purchase Confirmation for SDSRS,” received at approximately `2026-09-30T18:24:00-07:00`.

## Cabrillo: Map 00915

Map 00915 is the “Map of Center Addition to La Jolla Park,” a subdivision of a portion of Pueblo Lot 1283. The survey is dated June 17, 1904; the City Board of Public Works adoption is dated July 7, 1904; the filing statement is August 4, 1904 at 4:30 PM. A later copy certification on the retained sheet is dated November 17, 1915.

The assessor description `TR 915 BLK 4*LOTS 7 THRU 9*` corresponds to three separately drawn lots in Block 4. The source does not depict or describe those three lots as one merged lot. The map scale is one inch to 200 feet. No numeric boundary dimension or area can be attributed to Lots 7, 8, or 9 with sufficient confidence from the retained sheet, so none is recorded as target-lot dimension or area evidence.

Lots 7, 8, and 9 are depicted adjoining Miramar Street. The City acceptance text includes Miramar Street and unnamed alleys among the public ways accepted from the subdivision. That supports street adjacency and dedication context only. It does not designate a Code front lot line or establish a supported frontage length.

The APN-to-recorded-lot state is `MULTIPLE_RECORDED_LOTS_ONE_APN`. The current Parcel Intelligence fixture does not retain a parcel geometry area; its 100-percent single-zone intersection area is approximately 9,138 square feet and remains a diagnostic overlay fact, not legal-lot geometry or area. No remote evidence establishes a merger, lot tie agreement, lot-line adjustment, Certificate of Compliance, or other instrument converting the three recorded lots into one current legal lot.

## 27th Street: Parcel Map 17383

Parcel Map 17383 is a two-sheet lot-line-adjustment map involving a portion of Lot 13 of Tibbetts Tract, amended Licensed Survey Map 24; Parcel 1 of Parcel Map 4547; and a portion of 27th Street dedicated to public use. The field survey was requested by Juan Andrade on December 1, 1993. The City Engineer approval is dated June 28, 1994. The Recorder certificate states File No. `1994-414843`, filed June 30, 1994 at 11:51 AM.

Sheet 2 expressly labels Parcel 2 as `0.315 ACRES`. Its recorded boundary includes:

- west segment: 50.00 feet;
- northwest segment: N 89°55′03″ E, 119.99 feet, record 120.00 feet;
- north jog: N 00°03′42″ W, 17.02 feet, record 17.00 feet;
- northeast segment: N 89°57′37″ E, 115.08 feet, record 115.00 feet;
- east segment along 27th Street: 67.00 feet;
- south segment: N 89°55′05″ E, 235.04 feet.

These remain `RECORDED_BOUNDARY_LENGTH` evidence. They are not labeled Code lot width, depth, or frontage. Parcel 2 directly adjoins 27th Street along the 67-foot boundary. The 4-foot water easement shown on Sheet 2 lies in Parcel 1, not Parcel 2. The map also notes the portion of 27th Street dedicated by Old Road Survey 172 on January 20, 1890.

The assessor text `PM17383 PAR 2` directly names the recorded entity. However, the current assessor/Parcel V2 evidence is approximately 0.51 acre: the assessor displays 0.510 acre and 22,215 square feet, while Parcel V2 geometry is approximately 21,841 square feet. That materially conflicts with the recorded 0.315-acre Parcel 2. Without a later instrument or title evidence explaining the difference, the reconciliation state is `IDENTITY_MISMATCH`, not `EXACT_RECORDED_LOT_MATCH`.

## Bounded modification searches

On September 30, 2026, the City OpenDSD approval search was queried by exact address for `7553 CABRILLO AV` and `1456 27TH ST`/`1456 S 27TH ST`. No approval at either target address was returned. Official City-domain searches for each APN, address, and legal/map reference also returned no directly related record. OpenDSD describes this address search as indexed permit information from 2003-current. Records are distributed across City systems, and absence here does not prove that no Certificate of Compliance, lot-line adjustment, lot tie, merger, correction, later map, or right-of-way instrument exists.

SRS was searched by unformatted and formatted APN, exact address, and map number. APN and address searches returned zero results. Map-number searches returned the originating Map 00915 and PM 17383 only after unrelated same-number collisions were excluded: Corner Record 00915 cross-references Map 8737, and PM 12057 cross-references Tentative Map 17383. Neither is a modifying record for a target parcel.

The County’s Certificate of Correction list was searched for `Map 915`/`Map 00915` and `PM 17383`; no entry was found. The County expressly labels that list partial from 1982. SRS itself states that it supplements the Survey Records Counter. These negative results therefore narrow the remote search but do not close the later-in-time instrument chain.

## Recorder limitation and legal-lot doctrine

Both parcels are `RECORDER_CHECK_REQUIRED`. Effective December 9, 2024, County Recorder APN lookup is available only at in-person kiosks. A Recorder/title search is still needed to identify or rule out legally operative later instruments.

An assessor parcel is a tax unit and may span, split, or differ from a legal development lot. A recorded subdivision lot or parcel-map parcel supplies historic creation and geometry evidence, but its historic map does not alone prove the current configuration after adjustments, mergers, corrections, amended maps, vacations, dedications, later maps, or title instruments.

For Cabrillo, Map 00915 establishes three historic subdivision lots. It does not establish that one current legal lot matches APN `3506320400`. For 27th Street, PM 17383 establishes the adjusted Parcel 2 as of 1994. It does not reconcile the material current-entity area conflict or prove that no later operative instrument exists.

## Legal area, dimensions, and lot-line roles

Recorded area may be promoted to `LEGAL_LOT_AREA_SUPPORTED` only when all four gates pass: an authoritative artifact hash, `EXACT_RECORDED_LOT_MATCH`, `LEGAL_LOT_ESTABLISHED`, and a complete-to-current modification chain.

Cabrillo has no recorded area attributable to the three target lots and has unresolved multi-lot aggregation. The 27th Street map’s 0.315-acre label is authoritative recorded-area evidence for historic Parcel 2, but it is not promoted because the current entity is an identity mismatch and the modification chain is unresolved.

No map explicitly designates front, rear, interior-side, or street-side lot lines under current Code measurement semantics. Recorded street adjacency and boundary lengths remain separate from Code frontage. Both frontage and lot-line-role resolution are refused.

## First-rule readiness and scale lesson

Both target parcels remain `BLOCKED_BY_LEGAL_LOT_AREA_EVIDENCE` for minimum-lot-area readiness. The packet emits no compliance result.

The reusable cohorts are:

- one APN to one recorded parcel-map parcel, automatable only after current identity and chain validation;
- one APN to one subdivision lot, potentially automatable with the same chain gate;
- one APN to multiple recorded subdivision lots, a hard case requiring explicit merger/tie/configuration evidence;
- a modified parcel requiring a later instrument because current evidence conflicts;
- condominium or stacked APNs requiring underlying-land evidence;
- unresolved or source-unavailable parcels.

The simple one-to-one cohort can eventually be automated separately, but PM 17383 demonstrates that textual one-to-one correspondence is insufficient when current geometry/area conflicts with the recorded entity.

## Decision

For APN `3506320400`: `LEGAL_LOT_EVIDENCE_PARTIAL`.

For APN `6341302200`: `LEGAL_LOT_EVIDENCE_PARTIAL`.

`BOUNDED_LEGAL_LOT_PROOF_NOT_READY: current legal configuration and the complete later-in-time instrument chain remain unresolved for both parcels`

`NEXT_FEASIBILITY_SOURCE_TARGET: County Recorder APN/title chain for APNs 3506320400 and 6341302200`

## Containment

The builder is repository-local and deterministic. It performs no production access, database operation, zoning load, snapshot selection, route wiring, compliance calculation, capacity calculation, citywide import, deployment, or push. Parcel V1 and the frozen Packet 11 production state are unchanged. Only the two bounded parcels received new recorded-map and modification-search analysis.

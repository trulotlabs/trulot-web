# Legal Lot Evidence V0

Legal Lot Evidence V0 tests whether a current Parcel V2 APN can be traced through three distinct evidence classes: an assessor tax parcel, an authoritative recorded map or survey, and legally operative current-lot evidence. It never equates an APN with a legal development lot, calculates compliance, or calculates capacity.

## Official source systems and access paths

The County Assessor's Mapping Services page routes online parcel-map lookup to ParcelQuest. The bounded method selects San Diego County, selects APN, and submits the formatted ten-digit APN. The result exposes the tax parcel identity, a book/page lookup key, a property detail record, assessor-displayed acreage where present, and raw legal-description text that may contain a tract, parcel-map, block, parcel, or lot reference. The Assessor states that parcel boundaries and map details are for assessment purposes and do not have survey accuracy or establish legal property rights. The ParcelQuest map action is session-bound. In this review it displayed “Preparing your download” but produced no retained file in the browser's download directory, so no assessor map image or hash is claimed.

The County Survey Records System (SRS) accepts record text/number, APN, address, intersection, public-land-survey, and geographic queries. It indexes subdivision/final maps, parcel maps, records of survey, corner records, and related records. Search results expose title, page count, document type, cross-reference, and some subdivision names. SRS also exposes preview thumbnails, but full authoritative pages are sold through the cart. This packet verified metadata for `MAP 00915`, `PM 17383`, and `MAP 03225`; it did not initiate the $4/$8/$24 purchases because spending was not authorized. SRS warns that parcel/aerial overlays are not fully registered, that the application supplements the Survey Records Counter, and that its Certificate of Correction list is only partial from 1982.

City Development Services distributes mapping and land-title records among Mapping and Land Title Review, OpenDSD, Accela, Permit Finder, open data, subdivision index cards, and formal records requests. Accepted lookup keys vary among address, plan/approval/permit number, legal description, and APN. Relevant record families include parcel/final maps, Certificates of Compliance, lot-line adjustments, mergers, amended maps, certificates of correction, easements, and reversions. Absence from one City endpoint is never treated as proof that no record exists.

The County Recorder is essential for the later-in-time instrument chain. Effective December 9, 2024, the Recorder removed online APN search; APN lookup is available only at five in-person kiosks. That makes a complete remote APN-to-current-modification proof unavailable in this bounded packet.

Machine-readable system details are in `data/legal-lot-evidence-v0/source-systems.json`.

## Legal-lot doctrine

An **assessor parcel** or **tax parcel** is an assessment unit identified by APN. It may span, split, or otherwise differ from a legally established development lot. An APN is therefore identity evidence, not a legal-lot conclusion.

A **parcel-map parcel** is a parcel shown on a recorded parcel map. A **subdivision lot** is a lot shown on a recorded subdivision/final map. Both may supply recorded geometry and identifiers, but neither historic map alone proves that its configuration remains current after later adjustments, mergers, corrections, amended maps, vacations, dedications, or later parcel maps.

A City **lot** is land established by plat, subdivision, or another lawful means to own, use, or develop. A **premises** is the site to which development regulations apply and can require additional legal reasoning. A **legal lot** requires legally operative establishment evidence and an adequate current modification chain.

The contract returns only four states:

- `LEGAL_LOT_ESTABLISHED`: authoritative legal-status evidence and a complete-to-current modification chain support the conclusion.
- `LEGAL_LOT_EVIDENCE_PARTIAL`: relevant assessor or recorded-map evidence exists, but current legal-lot status is not conclusive.
- `LEGAL_LOT_STATUS_UNRESOLVED`: no adequate legal-status evidence has been identified.
- `LEGAL_LOT_SOURCE_UNAVAILABLE`: a required authoritative source or artifact is unavailable.

## Bounded corpus and acquisition findings

The deterministic corpus contains 25 real Parcel Intelligence V2 fixtures and includes APNs `3506320400`, `6341302200`, and `4304211000`. It covers RS-1-7 and other RS contexts, inside/outside/ambiguous Coastal states, irregular and MultiPolygon geometry, four stacked APNs, split and ambiguous zoning examples used only for source research, the Packet 8 identity exception, small and large parcels, and records with and without taxable acreage.

Three assessor searches were completed through the official online route:

| APN | Assessor legal description (raw) | Assessor key | SRS result |
| --- | --- | --- | --- |
| `3506320400` | `TR 915 BLK 4*LOTS 7 THRU 9*` | `350~35063` | `MAP 00915`, 1 page, Subdivision Map, “MAP OF CENTER ADDITION” |
| `6341302200` | `PM17383 PAR 2` | `634~63413` | `PM 17383`, 2 pages, Parcel Map, `FILE NO 1994-414843` |
| `4304211000` | `TR 3225 LOT 85*` | `430~43042` | `MAP 03225`, 6 pages, Subdivision Map, `FILE NO 57695`, “WESTERN HILLS UNIT NO.1” |

Raw reference text is retained independently from normalized identifiers. The parser recognizes only explicit `TR`, `PM`, block, lot, and parcel forms and returns `AMBIGUOUS_REFERENCE` rather than guessing malformed or conflicting map references.

For all 25 APNs the contract retains the APN-derived Assessor book/page lookup key. Only the three observed keys are marked confirmed in an official search. The remaining 22 are explicitly marked derived lookup keys and `LEGAL_LOT_SOURCE_UNAVAILABLE`; they are not represented as acquired maps.

## Evidence schema

Each fixture retains APN, Parcel V2 contract/fingerprint identity, assessor map identifier and observation, raw and normalized map references, recorded-map metadata/artifacts, map lot/parcel identifier, dimensions, areas, frontage, lot-line evidence, later modifying records, legal-status evidence/state, provenance, and limitations. A source artifact requires a SHA-256 before it can support a legal dimension or area. The SRS metadata observations have no artifact SHA because no authoritative page was purchased or downloaded.

## Dimension and area semantics

Every extracted dimension must be classified as recorded boundary length, arc length, radial dimension, street width, easement width, explicitly defined lot width, explicitly defined lot depth, or unknown. Boundary lengths do not become Code-defined width or depth automatically.

Area remains separated into assessor-displayed acreage or lot square feet, recorded-map area, calculated recorded-boundary area, Parcel V2 geometry area, and legal lot area. Promotion to `LEGAL_LOT_AREA_SUPPORTED` requires an authoritative recorded-map/legal-status/survey artifact hash and a complete-to-current modification chain. Parcel geometry area, taxable acreage, and the assessor's displayed lot area remain distinct diagnostics.

For `6341302200`, the assessor displayed 0.510 acre and 22,215 square feet, while Parcel V2 geometry is about 21,841 square feet. The values are close enough to classify as consistent with differing semantics, not as interchangeable legal area. Whitehaven's assessor showed 0.385 acre and 16,800 square feet, but the bounded Parcel V2 fixture does not retain a geometry area for comparison. No discrepancy is automatically labeled an error.

## Lot lines and frontage

No retained authoritative artifact explicitly designates front, rear, interior-side, or street-side lot lines. The resolver refuses to assign those roles from situs address, nearest street, cardinal direction, or parcel orientation.

Street adjacency, dedicated right-of-way, frontage length, and Code-defined frontage are separate facts. None is inferred from a situs address. Supporting frontage requires an authoritative artifact plus the right-of-way and Code measurement semantics.

## Modification chain and stacked APNs

The original map is never presumed current. A complete chain must search lot-line adjustments, mergers, Certificates of Compliance, corrections, amended maps, vacations/dedications, and later parcel maps. Remote proof is blocked by the partial SRS correction list, distributed City indexes, and Recorder APN search being limited to in-person kiosks.

The four stacked APNs are refused individual land-lot dimensions. Equal Parcel V2 geometry suggests shared underlying land geometry, but that diagnostic pattern does not establish condominium-plan semantics or authorize assigning land dimensions to an individual unit APN.

## Reconciliation and first-rule unlock

The final 25-fixture counts are:

| State | Count |
| --- | ---: |
| Assessor map/page record found | 3 |
| Recorded map reference found | 3 |
| Full recorded map acquired | 0 |
| Dimensions present | 0 |
| Assessor-displayed area present | 2 |
| Frontage evidence present | 0 |
| Subsequent modifying record found | 0 |
| `LEGAL_LOT_ESTABLISHED` | 0 |
| `LEGAL_LOT_EVIDENCE_PARTIAL` | 3 |
| `LEGAL_LOT_STATUS_UNRESOLVED` | 0 |
| `LEGAL_LOT_SOURCE_UNAVAILABLE` | 22 |

No fixture has `LEGAL_LOT_AREA_SUPPORTED`. Minimum lot area therefore remains `BLOCKED_BY_LEGAL_LOT_AREA_EVIDENCE`; this packet issues no PASS/FAIL compliance result.

## Scale assessment and decision

APN-to-Assessor book/page keys and common tract/parcel-map references are stable enough to normalize. The limiting steps are authoritative file acquisition, paid page volume, browser/session controls, distributed City indexes, in-person Recorder APN lookup, manual interpretation of ambiguous references, condo-to-underlying-land reconciliation, and the later-in-time modification chain. A citywide import is not warranted from this path.

`LEGAL_LOT_EVIDENCE_V0_NOT_READY: full authoritative recorded-map artifacts and current modification-chain evidence remain unavailable without paid and in-person retrieval`

`NEXT_FEASIBILITY_SOURCE_TARGET: recorded map artifacts and current legal-lot modification-chain records`

## Containment

The builder is repository-local and deterministic. It performs no production access, database operation, zoning load, snapshot selection, route wiring, compliance calculation, capacity calculation, citywide import, deployment, or push. Parcel V1 and the frozen Packet 11 production state are unchanged.

# Parcel Coastal Context V0

## Decision

`COASTAL_CONTEXT_V0_READY`

The parcel-level geography is ready to feed Packet 13’s applicability gate. This decision supports outside/inside/boundary source context only. Inside-Coastal RS standards remain unresolved.

## Governing Coastal concept

San Diego Municipal Code §132.0402 defines the Coastal Overlay Zone through Maps C-730.1, C-908, and C-1028. The City’s Land Development Code Updates page separately publishes code versions for property inside and outside the Coastal Overlay Zone. This packet therefore uses the union of the official City **Coastal Overlay Zone (Permit Jurisdictions)** polygons for RS version selection.

The following remain separate facts and are not reduced into that boolean: permit jurisdiction subtype, Coastal Commission appeal area, certified/deferred Local Coastal Program status, the statewide Coastal Zone, and the Coastal Height Limitation Overlay Zone.

## Source and acquisition

The source is City of San Diego Development Services `DSD/Zoning_Overlay/MapServer/2`, service item `16524cd4e8394b338cfc5a028b2584f4`. Its native CRS is EPSG:2230 (WKID 102646), and the complete public query returned 9 features. The service says it was published in July 2016; its metadata XML was created January 11, 2024. No update cadence is published.

The immutable acquisition is `coastal-city-sd-20260930T143055Z`. Large raw artifacts stay under `/Users/ops/trulot-data/coastal-context-v0/`; the repository keeps hashes, counts, metadata, schema, and normalized feature fingerprints.

One source geometry required `make_valid`; eight were already valid. All nine normalized to usable polygonal geometry and the quarantine is empty. Raw labels and conflicting raw ordinance fields are preserved without correction.

## Legal/source interpretation

The live layer contains permit-jurisdiction labels such as `CST-PMT`, `CST-APP`, `N-APP-1`, `N-APP-2`, `DEF-CER`, and `CSTZB`. Their union answers the inside/outside RS applicability question; the labels themselves are not used to infer current permit jurisdiction.

The current code cites C-1028/O-21719, while the live feature attributes name only O-17067 and O-18872. O-21719 describes C-1028 as a revision to C-730.1 Sheet 11 changing certification status. The Bella Mar control parcel remains wholly within the live union. This supports union membership but leaves current permit-jurisdiction subtype outside this packet.

## Mapping method

The process streams the immutable Parcel V2 source and selects the exact accepted City source-object IDs. Both parcel and overlay geometry are evaluated in EPSG:2230. Polygon intersections determine area on each side:

- `OUTSIDE_COASTAL`: no positive overlay area above the numeric epsilon;
- `INSIDE_COASTAL`: no outside area above the numeric epsilon;
- `BOUNDARY_AMBIGUOUS`: positive area on both sides;
- `APPLICABILITY_UNRESOLVED`: source exists but cannot support a legal reduction;
- `SOURCE_UNAVAILABLE`: a required source or accepted geometry is unavailable.

The point on surface is retained only as a diagnostic. It never classifies a parcel. Unknown and unavailable never become false.

## City distribution

| State | Count |
| --- | ---: |
| OUTSIDE_COASTAL | 345,748 |
| INSIDE_COASTAL | 46,455 |
| BOUNDARY_AMBIGUOUS | 1,530 |
| APPLICABILITY_UNRESOLVED | 0 |
| SOURCE_UNAVAILABLE | 0 |
| **Total** | **393,733** |

There are 393,733 unique APNs, zero duplicate mapping rows, and zero orphan parcel references.

## Boundary findings

All 1,530 parcels with positive area on both sides remain unresolved for Packet 13. Coastal shares range from `0.000000002%` to `99.999999972%`; the median is `22.024469727%`. APN `3527702600` demonstrates a tiny positive-area contact, `3082980200` is near half, and `3515710700` is almost entirely inside. None is coerced by centroid or majority area.

## Parcel V1 comparison

The sealed 576-APN identity sample has no V1 Coastal applicability signal. V2 resolves 507 outside, 66 inside, and 3 boundary cases. Existing V1 TPA, CTCAC, and SDA fields are separate concepts and are not treated as Coastal authority.

## Packet 13 bridge

`OUTSIDE_COASTAL` projects to `outside_coastal` and may select the sealed outside-Coastal RS V0. `INSIDE_COASTAL`, `BOUNDARY_AMBIGUOUS`, and `APPLICABILITY_UNRESOLVED` fail closed as applicability unresolved. `SOURCE_UNAVAILABLE` retains its unavailable source state.

APN `3506320400` is an RS-1-7 parcel wholly inside Coastal, so Packet 13 now fails closed with correct geographic evidence. APN `6341302200` has a 100% SINGLE_ZONE RS-1-7 mapping (source feature 1324) and is an outside-Coastal example for which Packet 13 may select outside-Coastal rules. Neither example evaluates compliance.

## Provenance and fingerprints

Every mapped row carries parcel acquisition/source-object identity, parcel geometry hash, Coastal acquisition identity through the sealed receipt, intersecting Coastal feature IDs, mapping method version, and explicit state.

- normalized source: `b0ef9fd459e2acffe4aa1f7ae34df4c5ad40ce232a5002bc283a4f2fd6af1e88`
- quarantine: `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`
- parcel mapping: `f27abb9fe4b64990f9fe422102ce319144218be3770df471fa328cbbfbd403d6`
- state distribution: `85ac12ae5c1f8cd5a6b27dd2d41e12cfcbe7b9828d0fc1746a1265b064af3e80`

## Limitations and next work

This packet does not establish the current inside-Coastal RS composite. O-21934 remains unverified for Coastal applicability and O-22109 remains pending in the sealed Packet 12 evidence. The exact legal effect of certified, deferred, appeal, and permit-jurisdiction subtypes remains separate. No Coastal permit conclusion, parcel compliance, legal-lot status, or development capacity is produced.

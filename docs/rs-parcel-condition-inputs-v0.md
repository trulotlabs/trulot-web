# Packet 14: RS parcel condition inputs V0

Decision: **RS_PARCEL_INPUTS_NOT_READY_FOR_COMPLIANCE**. The current repository evidence can supply a useful, deterministic parcel-condition input layer, but it cannot yet support even a limited legal compliance evaluator without promoting GIS measurements into legal lot characteristics. This is an offline evidence result, not production wiring.

## Contract and doctrine

Each fact records `fact_key`, Parcel Truth-compatible `state` and `source_state`, typed `value`, `unit`, derivation class, method, source, acquisition, confidence, limitations, provenance, and optional geometry evidence. Derivation classes are `RECORDED`, `DETERMINISTIC_DERIVED`, `INFERRED`, and `NOT_AVAILABLE`.

`INFERRED` geometry diagnostics are confined to `geometry_*` keys. They cannot populate `legal_lot_width_ft`, `legal_lot_depth_ft`, `legal_street_frontage_length_ft`, or `corner_lot_status`. Unknown values are `null`; they never become zero or false.

## RS input dependencies and readiness

The matrix covers all 25 Packet 12 standard families and all 343 source-rule records. Twenty-one families are `INPUT_MISSING`; four are `LEGAL_SEMANTICS_UNRESOLVED`. None is currently `READY_FOR_DETERMINISTIC_EVALUATION`.

| Standard family | Required parcel facts | Readiness |
|---|---|---|
| Lot area | Legal lot area | `LEGAL_SEMANTICS_UNRESOLVED` |
| Lot width | Code-defined width and front lot line | `LEGAL_SEMANTICS_UNRESOLVED` |
| Corner width | Corner-lot status and legal width | `INPUT_MISSING` |
| Lot depth | Code-defined depth and front/rear lines | `LEGAL_SEMANTICS_UNRESOLVED` |
| Street frontage | Legal frontage, front line, street curve/turnaround status | `INPUT_MISSING` |
| Front setback | Front line, structure geometry, slope/hillside, defensible-space requirement | `INPUT_MISSING` |
| Interior/street side setbacks | Designated side lines, structure geometry, legal width, defensible-space requirement | `INPUT_MISSING` |
| Rear setback | Rear line, structures, legal depth, alley access, defensible-space requirement | `INPUT_MISSING` |
| Height | Structure height/geometry, reference datum, angled-envelope context | `INPUT_MISSING` |
| Density basis | Legal-lot status, proposed units and use | `INPUT_MISSING` |
| FAR | Legal lot area, gross floor area, steep-hillside fraction | `INPUT_MISSING` |
| Lot coverage | Legal area, structure footprint, steep-hillside fraction | `INPUT_MISSING` |
| Paving/hardscape | Hardscape area, legal area, project scope | `INPUT_MISSING` |
| Resubdivided corner lot | Subdivision history, corner status, designated lot lines | `INPUT_MISSING` |
| Accessory/garage/building-spacing/projections | Project facts and structure geometry | `INPUT_MISSING` |
| Dwelling protection | Existing units and proposed project scope | `INPUT_MISSING` |
| Refuse/supplemental/third story/visibility | Their source-defined project, structure, and lot-line facts | `INPUT_MISSING` |
| Bedroom regulation | Authoritative Table 131-04D footnote 8 | `LEGAL_SEMANTICS_UNRESOLVED` |

The complete family-by-family matrix is in `data/rs-parcel-condition-inputs-v0/dependency-matrix.json`.

## Available Parcel V2 facts

| Fact | Classification | Finding and provenance |
|---|---|---|
| APN | `DETERMINISTIC_DERIVED` | Available for all 24 fixtures from committed Parcel/Base Zoning evidence. |
| Parcel ID and source object ID | `RECORDED` | Available for 20 fixtures with retained Parcel Serving rows. |
| Jurisdiction and situs components | `RECORDED` | Available for 20; situs addresses deterministically compose for 11. |
| Parcel geometry | `RECORDED` | Full geometry retained for 13; seven compact sample rows retain type/hash and derived facts without coordinates. |
| Geometry type and SHA | `DETERMINISTIC_DERIVED` | Available for 20. |
| Approximate geometry area | `DETERMINISTIC_DERIVED` | Available for 20; calculated in EPSG:2230 and explicitly not legal lot area. |
| Centroid, point on surface, centroid-within | `DETERMINISTIC_DERIVED` | Available for 20; location/QA facts only. |
| Taxable acreage | `RECORDED` | Present for 8; the other values remain unknown. It is not geometry or legal lot area. |
| Stack/repeated identity evidence | `DETERMINISTIC_DERIVED` | Available where the bounded evidence records shared geometry or a stack count. |
| Legal lot lines, width, depth, frontage, corner status | `NOT_AVAILABLE` | No qualifying authoritative fields or relationships. |
| Assessor/building facts | `NOT_AVAILABLE` | No structure footprint, gross floor area, height, story, or authoritative unit-count source in Parcel V2. |
| Terrain/fire context | `NOT_AVAILABLE` | No slope, steep-hillside fraction, or Fire Code Official determination. |
| Coastal context | `NOT_AVAILABLE` | Parcel V2 contains no authoritative Coastal classification. |

Every fact pins the committed evidence artifact and hash plus the Parcel V2 acquisition identity.

## Lot area

`approximate_geometry_area_sqft` and `taxable_acreage` are separate facts. There is no fallback in either direction. When an RS standards context and geometry area both exist, a numeric comparison is mechanically possible, but `legal_lot_area_equivalence` remains unresolved and `compliance_conclusion` remains null. Taxable acreage is never converted and substituted as the legal denominator.

## Width and depth diagnostics

Thirteen full-geometry fixtures were tested with minimum rotated rectangles, convex-hull maximum span, and vertex-covariance principal axes in EPSG:2230. The candidate methods disagree materially. For example, APN `2748323700` has diagnostic minimum spans of 757.18 and 679.58 feet under two methods, while two maximum-span methods differ by 186.80 feet. No survey or trustworthy legal width/depth truth set exists in the repository for validation.

The result is therefore:

- `LEGAL_WIDTH_NOT_DERIVABLE_FROM_CURRENT_DATA`
- `LEGAL_DEPTH_NOT_DERIVABLE_FROM_CURRENT_DATA`

The numeric shape descriptors remain under `geometry_*` keys and have `INFERRED` / `diagnostic_only` classification.

## Corner lot and frontage

No Parcel V2 field establishes corner-lot status. A polygon shape, two street-like situs components, centroid, or spatial adjacency cannot do so. No contracted authoritative street/right-of-way layer or legal parcel-frontage relationship exists in the repository. Corner status, front lot line, street-side lot line, street configuration, and legal frontage length therefore remain unknown.

An official street/right-of-way layer would help diagnose adjacency, but legal frontage still requires a Code-supported lot-line relationship or survey/recorded-map evidence.

## Setbacks, height, FAR, and hillside conditions

All four setback families lack legally designated lot lines and structure geometry. Front setbacks additionally need the source-defined front-50-foot slope condition; side/rear variants retain lot-dimension, alley, and defensible-space dependencies. No distance is calculated.

The `24/30` height expression and 35-foot rules remain source rules. Choosing a branch or evaluating an existing/proposed structure requires structure height, reference datum, structure geometry, and Table 131-04H angled-envelope context.

Variable FAR lacks a legally appropriate lot-area denominator, gross-floor-area numerator, and steep-hillside context. Assessed living area and building footprint are distinct concepts and neither is available as a proven substitute.

Slope, steep-hillside fraction, and defensible-space applicability are all unknown. Parcel polygon geometry contains no elevation information and cannot produce slope.

## Real parcel fixtures

Twenty-four unique real APNs come from the sealed Parcel Serving V2, zoning-serving, identity sample, and Base Zoning lineage evidence. Coverage includes ordinary RS-1-7, smallest and largest sampled geometry, irregular polygons, MultiPolygons, two independent stacked groups, missing situs, RS+RS split, RS+non-RS split, boundary sliver, ambiguous and unmapped zoning, centroid-outside cases, and both present and missing taxable acreage.

For RS-resolved fixtures, each result lists the complete blocked family matrix and any mechanically possible but legally unresolved comparison. For non-RS, unresolved-mapping, or not-yet-evaluated zoning contexts, the standards-context state remains explicit rather than assuming RS applicability.

## RS-1-7 example

APN `3506320400` retains the Packet 13 RS-1-7 context and sourced core rules: 5,000-square-foot minimum area, 50-foot width, conditional 55-foot corner width, 95-foot depth, conditional setbacks, unevaluated `24/30` height, one-unit-per-lot basis, and variable FAR.

The bounded repository does not retain this APN's Parcel Serving row. The only currently supported parcel fact in the example is its exact APN and Parcel V2 mapping lineage. Geometry area, taxable acreage, lot lines, width, depth, frontage, structures, slope, and legal-lot status remain unknown. No numeric parcel comparison is therefore made for this APN.

## Future source priorities

Ranked by the upper-bound number of Packet 12 rule records in affected families:

1. Coastal boundary plus completed Coastal RS profile: 343 records; context-limited to applicability.
2. Project-specific use and plans: 252 records across 18 families.
3. Survey, recorded-map, and legal lot/subdivision records: 224 records across 16 families.
4. Structure footprints, heights, stories, and gross floor area: 196 records across 14 families.
5. Topography/slope and Fire Code determinations: 84 records across 6 families.
6. Street/right-of-way and legal frontage relationships: 84 records across 6 families.
7. Authoritative footnote 8 correction: 7 records in one family.

These are reach counts, not claims that one source alone completes every affected rule; many families require several independent inputs.

## Decision and boundaries

`RS_PARCEL_INPUTS_NOT_READY_FOR_COMPLIANCE`

The input contract itself is deterministic and ready for later enrichment. The decision means current inputs cannot safely support a compliance evaluator. It does not authorize production wiring, compliance, development capacity, overlays, programs, or Coastal rules.

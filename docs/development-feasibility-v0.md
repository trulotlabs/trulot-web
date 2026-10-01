# Development Feasibility V0 contract

Development Feasibility V0 is an evidence-readiness contract. It answers whether TruLot has the authoritative parcel facts and applicable base-zone rules required to perform a named mechanical rule evaluation. It does not calculate development capacity, determine compliance, design a project, predict approvals, or make economic conclusions.

## Scope

V0 is limited to City of San Diego parcels with supported Parcel V2 identity, `SINGLE_ZONE` zoning in RS-1-1 through RS-1-14, a resolved `INSIDE_COASTAL` or `OUTSIDE_COASTAL` context, and a supported RS rule-set version for the requested date. It covers base-zone readiness only.

Split, ambiguous, indeterminate, and unmapped zoning; Coastal boundary ambiguity; non-RS zones; ADU/JADU; SB 9; SB 79; Density Bonus; Complete Communities; parking programs; discretionary findings; variances; environmentally sensitive lands; historical-resource review; permit-processing conclusions; and project economics are outside V0.

## Questions and state model

The contract asks, in order: whether the parcel is in scope, whether an applicable rule source exists, whether required evidence is complete, which rule families are ready, and whether any bounded rule evaluation can be performed.

- `FEASIBILITY_READY_FOR_RULE_EVALUATION`: every required fact for at least one supported base-rule comparison is present. This state does not say that the parcel or a project complies.
- `FEASIBILITY_BLOCKED_BY_MISSING_EVIDENCE`: the parcel is in scope, but authoritative parcel or project facts are missing or legally unresolved.
- `FEASIBILITY_OUTSIDE_V0_SCOPE`: the parcel, zone configuration, or requested analysis is excluded.
- `FEASIBILITY_SOURCE_UNAVAILABLE`: a foundational identity, zoning, Coastal, or standards source failed or is unavailable.
- `FEASIBILITY_MAPPING_UNRESOLVED`: zoning or Coastal applicability cannot be selected safely.

No numeric confidence or readiness score is permitted. The readiness checklist returns named states for parcel identity, zoning/applicability, legal-lot evidence, lot-line geometry, structure evidence, topography/fire predicates, project facts, and rule coverage.

## Evidence inventory

Parcel V2 identity, single-zone Base Zoning V2, resolved Coastal Context V0, applicable inside/outside-Coastal standards, and their Parcel Intelligence V2 provenance can establish scope and rule availability. They cannot establish parcel compliance.

Approximate geometry area, taxable acreage, diagnostic spans, and geometry orientation remain diagnostic. Assessor living area is not Code-defined gross floor area. Building outlines derived from Spring 2017 imagery are historical and cannot establish current structures or lot coverage. Positive assessor `UNITQTY` is a recorded parcel-level fact; source zero remains unknown. The detailed classification is sealed in `data/development-feasibility-v0/evidence-inventory.json`.

## Legal lot doctrine

`legal_lot_area`, legal width, legal depth, frontage, and lot-line roles require provenance-bearing evidence from a recorded legal-lot record, authoritative subdivision or parcel map, licensed survey, or another authoritative source that explicitly establishes the relevant legal measurement. Frontage may also use an authoritative right-of-way/frontage record.

Approximate parcel geometry, taxable acreage, rotated-rectangle spans, inferred cardinal sides, a situs address, nearest-street adjacency, and diagnostic boundary lengths are prohibited substitutes. Every accepted legal fact must retain source identity, record or map identity, acquisition/observation date, method, and the exact derived or recorded value.

Current state: `LEGAL_LOT_AREA_NOT_YET_ESTABLISHED`.

## Rule-family evaluation contracts

The machine-readable matrix is `data/development-feasibility-v0/evidence-matrix.json`.

| Rule family | Evidence required before evaluation |
| --- | --- |
| Minimum lot area | Applicable rule and authoritative legal lot area |
| Minimum lot width/depth | Applicable rule and Code-meaningful legal dimensions |
| Frontage | Applicable rule, legal frontage, front lot line, and right-of-way relationship |
| Setbacks | Applicable version and branch, designated lot lines, required legal dimensions, current/proposed structure geometry, and all slope/fire/source predicates |
| Height | Applicable height branch, measured/proposed height, Code datum, structure geometry, and angled-envelope context |
| FAR | Applicable FAR rule, legal lot-area denominator, Code-defined GFA numerator, and hillside predicates |
| Lot coverage | Applicable coverage rule, legal lot/premises denominator, current or proposed footprint, and hillside predicates |
| Density basis | The bounded base-table statement only; it is not a maximum-unit or capacity result |
| Existing-unit conditions | Positive assessor count with source semantics; no legality, occupancy, or development-right conclusion |

Setback output must distinguish that the rule is known, that the parcel-specific requirement may remain unresolved, and that actual structure compliance is unevaluated. Height may not be inferred from stories or footprint. FAR preserves `FAR_NUMERATOR_NOT_YET_AVAILABLE`; assessor living area is prohibited as its numerator. Historical 2017 footprints are prohibited as current coverage evidence.

The exact density statement allowed by V0 is: “The applicable RS base table states a basis of 1 dwelling unit per lot.” It does not mean maximum legal units, final capacity, ADU-inclusive capacity, SB 9 capacity, or density-bonus capacity.

## Parcel and project facts

Parcel facts describe the legally established lot, lot-line roles, frontage, applicable topography/fire predicates, and current structures. Future project facts describe proposed use, unit count, floor area, footprint, height, demolition or retention, and accessory structures. Project facts do not block basic parcel rule-readiness unless the named comparison inherently depends on a proposal.

## Allowed and forbidden conclusions

V0 may report scope, rule/version availability, missing evidence, a named rule blocker, an unresolved legal-semantic issue, or source unavailability. It may record the bounded density-basis statement and positive assessor unit fact with their limitations.

V0 may not emit a maximum-unit result, buildable area, legal compliance declaration, buildability conclusion, variance requirement, entitlement certainty, permit prediction, property-value/economic conclusion, or an unimplemented program-eligibility result.

## Source priority and next target

The ranked source plan is in `data/development-feasibility-v0/source-priorities.json`. Recorded parcel maps and legal-lot records rank first because they can establish legal area, width, depth, frontage, and lot-line roles and thereby unlock the first defensible base-rule comparisons plus foundations for setbacks, FAR, and coverage. Street/right-of-way evidence, current footprints, Code-defined GFA, topography, and fire applicability follow.

`NEXT_FEASIBILITY_SOURCE_TARGET: recorded parcel maps and legal lot records`

## Product bridge

The Level 1 CTA, “See what's needed to evaluate this property,” may eventually read this contract to show what TruLot knows, the evidence still missing, and the next rule that could become evaluable. When the contract is blocked, the UI must state that feasibility remains blocked and must not imply a completed analysis.

## Containment

The resolver consumes the sealed Parcel Intelligence V2 contract and rejects inputs claiming compliance or capacity. Fixture output retains provenance and explicit false containment flags. It performs no production access, database operation, source acquisition, compliance calculation, capacity calculation, production wiring, deployment, or push.

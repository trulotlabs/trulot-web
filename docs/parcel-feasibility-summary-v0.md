# Parcel Feasibility Summary V0

Packet 38 composes the sealed APN `6341302200` rule results into the first bounded parcel-level feasibility summary. It performs no new rule evaluation, numeric recomputation, capacity calculation, structure comparison, or overall compliance aggregation.

## Contract and result classes

`ParcelFeasibilitySummaryV0` contains parcel identity, legal-lot state, zoning, Coastal context, standards version, evaluated rule results, unresolved evidence, product bridges, forbidden conclusions, next investigation, provenance references, and a deterministic fingerprint. Every input is pinned by contract version, state, value, unit, and evaluation fingerprint. A semantic mismatch produces `SUMMARY_COMPOSITION_SOURCE_MISMATCH`.

The summary preserves five result classes:

- `SATISFIED`: a sealed deterministic comparison passed.
- `NOT_SATISFIED`: used only for an explicit sealed failure; none exists here.
- `CONDITIONAL`: the applicable requirement remains branch- or evidence-dependent.
- `NOT_APPLICABLE`: supported parcel facts affirmatively exclude the rule family.
- `NOT_EVALUATED`: the rule or required evidence has not been evaluated.

## Composed parcel result

The legal lot is established as PM 17383 Parcel 1. Zoning is single-zone RS-1-7 under the outside-Coastal standards version. Four base dimensional rules are satisfied: lot area `22,096.320 >= 5,000 sq ft`, lot depth `235.02 >= 95 ft`, lot width `94.00 >= 50 ft`, and frontage `94.00 >= 50 ft`.

Front, rear, and interior-side setback requirements remain conditional. Their ordinary branches—15 feet front, 23.502 feet depth-adjusted rear, and 4 feet at each interior side—remain visible without being promoted to final project-specific requirements. Fire, slope, documentary/program, addition/reallocation, projection, and project facts remain grouped as unresolved. Structure compliance is not evaluated. Street-side setback is `NOT_APPLICABLE` because the parcel has no street-side property line.

Height, FAR, lot coverage, and structure compliance remain `NOT_EVALUATED`. Capacity is separately and explicitly `NOT_EVALUATED`.

The top-level state is `PARTIAL_BASE_RULE_FEASIBILITY_ESTABLISHED`. It means that bounded base-rule work exists while material rule families and evidence remain unresolved. It does not mean feasible, buildable, compliant, development-ready, conforming, or permit-ready.

## Product bridges

Level 1 may eventually use the CTA `See what’s needed to evaluate this property` and show:

- Evaluated so far: 4 base dimensional rules satisfied.
- Still needed: setbacks, height, FAR, structure geometry, and project-specific Fire review.
- Capacity: Not evaluated.

Level 2 may later show each rule, required value, supported parcel value, bounded result, and originating provenance. Conditional rules must retain their state, grouped unresolved evidence, and unevaluated structure-compliance status. No UI is wired.

## Provenance and next source

The summary provenance graph references each sealed originating evaluator by contract version and evaluation fingerprint instead of duplicating its source chain. The summary itself is canonically rendered and SHA-256 fingerprinted.

Current authoritative structure geometry is the highest-value next source because it materially improves the existing-structure picture and is a prerequisite for future setback and lot-coverage comparisons. Height and FAR inputs, Fire review, slope methodology if needed, and project proposal facts follow as a product-priority order rather than a claimed legal sequence.

`NEXT_FEASIBILITY_SOURCE_TARGET: current structure geometry`

`PARCEL_FEASIBILITY_SUMMARY_V0_READY`

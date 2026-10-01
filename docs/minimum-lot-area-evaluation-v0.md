# Minimum Lot Area Evaluation V0 — first bounded rule result

Packet 27 evaluates exactly one rule for APN `6341302200`: the RS-1-7 minimum lot area standard. It does not evaluate any other development regulation and does not calculate capacity.

## Evidence gates

Parcel Intelligence V2 identifies APN `6341302200` at 1456 27th Street. Its zoning evidence is `SINGLE_ZONE`, 100 percent RS-1-7. Coastal Context V0 reports `OUTSIDE_COASTAL`. The applicable standards profile is `sd-rs-base-standards-2026-09-30-v0`.

Packet 25A establishes `EXACT_RECORDED_LOT_MATCH`, `LEGAL_LOT_ESTABLISHED`, and `LEGAL_LOT_AREA_SUPPORTED`. Recorded Grant Deed `DOC # 2001-0706032` identifies the APN as Parcel 1 of PM 17383. PM 17383 states a gross area of `0.572 acres`; the deed, map, source hashes, dedicated-street context, and superseded `PM17383 PAR 2` secondary description remain attached.

## Applicable rule

SDMC §131.0431(a), Table 131-04D, September 2026 edition, states a minimum lot area of `5,000 square feet` for RS-1-7. The sealed rule is `RECORDED`, uses operator `MIN`, has no rule condition, and comes from rule set `sd-rs-base-standards-2026-09-30-v0`.

## Area denominator

PM 17383's `0.572 acres` converts exactly to `24,916.320 square feet` using `1 acre = 43,560 square feet`. The map includes a 30-foot by 94-foot portion of 27th Street, or `2,820 square feet`.

SDMC §113.0246 defines development-regulation property lines as the lines separating a lot or premises from public right-of-way, regardless of ownership extending into that right-of-way. Its pre-dedication exception applies expressly to maximum permitted density and maximum permitted gross floor area. It does not extend to the minimum-lot-area standard. The appropriate denominator is therefore the recorded parcel-map area excluding the mapped public right-of-way:

`24,916.320 - 2,820 = 22,096.320 square feet`

This deterministic value comes from the recorded map. The assessor's `22,215 square feet` remains comparison-only evidence, and the Parcel V2 geometry area of approximately `21,841.41 square feet` remains diagnostic-only evidence.

## Deterministic comparison

`22,096.320 square feet >= 5,000 square feet`

Result: `RULE_REQUIREMENT_SATISFIED`.

The supported Code-defined lot area satisfies the RS-1-7 minimum lot area standard.

This evaluates only the minimum-lot-area rule. It does not establish overall zoning compliance, development capacity, subdivision rights, or project approval.

## Product example

### Minimum lot area

- Required: 5,000 sq ft
- Supported parcel area used for this rule: 22,096.32 sq ft
- Result: requirement satisfied
- Scope: minimum-lot-area rule only
- Source: PM 17383 Parcel 1; DOC # 2001-0706032; SDMC §§113.0246 and 131.0431(a), Table 131-04D

No UI or production runtime is wired.

## Decision

`NEXT_RULE_EVALUATION_TARGET: legal lot depth`

`MINIMUM_LOT_AREA_RULE_EVALUATION_READY`

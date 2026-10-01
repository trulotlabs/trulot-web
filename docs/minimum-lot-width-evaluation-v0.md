# Minimum Lot Width Evaluation V0 — third bounded rule result

Packet 29 evaluates only the RS-1-7 minimum lot width rule for APN `6341302200`.

## Code doctrine and lot classification

SDMC §113.0243(b), July 2026 edition, measures lot width along an imaginary straight line at right angles to the lot depth line, between the side property lines at the point midway between the front and rear property lines. Section 113.0243(c)(1)'s average-width rule does not apply: PM 17383 Parcel 1 is a regular four-sided near-rectangle with equal 94.00-foot front and rear lines and nearly parallel side lines, not an irregular or pie-shaped lot.

Sections 113.0246(a)-(d) resolve the property-line roles and classification. PM 17383 shows only the east line adjoining 27th Street. There is no second adjacent street line and no opposite street frontage. Parcel 1 is therefore an interior, single-frontage, non-corner lot rather than a corner or double-fronted lot. The standard 50-foot width applies; the conditional 55-foot corner-lot width does not.

The front development-regulation line is the line separating the lot from the 27th Street public right-of-way. The dedicated 30-foot street portion lies outside the measurement geometry.

## Geometry and result

The reconstruction uses the 94.00-foot west/rear line, 94.00-foot east/front line, north side at N 89°55′05″ E for 235.04 feet, and south side at N 89°54′59″ E for 235.00 feet. The perpendicular line through the midpoint of the previously resolved lot-depth line intersects both side property lines within their recorded segments.

Its unrounded length is `93.996581771555 feet`. Reported at the recorded map's hundredth-foot precision, the supported Code-defined lot width is `94.00 feet`. The recorded 94-foot boundaries remain survey calls rather than being relabeled as width; the Code construction independently produces the reported width. Parcel V2 geometry is not used.

SDMC §131.0431(a), Table 131-04D, September 2026 edition, states a standard RS-1-7 minimum width of `50 feet`.

`94.00 feet >= 50 feet`

Result: `RULE_REQUIREMENT_SATISFIED`.

The supported Code-defined lot width satisfies the RS-1-7 minimum lot width standard.

This evaluates only the minimum-lot-width rule. It does not establish overall zoning compliance, development capacity, frontage compliance, setback compliance, or project approval.

## Product example

### Minimum lot width

- Required: 50 ft
- Supported measured width: 94.00 ft
- Lot type: interior (single-frontage, non-corner)
- Result: requirement satisfied
- Measurement basis: SDMC §§113.0243(b) and 113.0246 applied to PM 17383 Parcel 1
- Scope: minimum-lot-width rule only

No UI or production runtime is wired.

## Decision

`NEXT_RULE_EVALUATION_TARGET: frontage`

`MINIMUM_LOT_WIDTH_RULE_EVALUATION_READY`

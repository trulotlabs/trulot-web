# Minimum Lot Depth Evaluation V0 — second bounded rule result

Packet 28 evaluates exactly one rule for APN `6341302200`: the RS-1-7 minimum lot depth standard. It does not evaluate width, frontage, setbacks, FAR, overall compliance, or capacity.

## Controlling Code semantics

SDMC §113.0243(a), July 2026 edition, defines lot depth as the imaginary straight line from the midpoint of the front property line to the midpoint of the rear property line. Section 113.0246(a) defines the front property line as the line separating the lot from public right-of-way or a private street. Section 113.0246(c) defines the rear property line as the property line opposite and most distant from the front property line.

PM 17383 depicts Parcel 1 adjoining only 27th Street. Applying §113.0246, the north-south 94.00-foot line at the west edge of the 27th Street public right-of-way is the front property line. The opposite, most distant 94.00-foot west line is the rear property line. The parcel is neither a corner lot, a double-fronted lot, nor a triangular lot, and the Code states no separate depth method for this four-sided configuration.

Section 113.0246 applies development regulations using the property line that separates the lot from public right-of-way, regardless of ownership extending into the right-of-way. The mapped 30-by-94-foot dedicated street portion is therefore outside the front-to-rear measurement geometry. This conclusion is specific to the depth measurement doctrine; it does not merely import Packet 27's area calculation.

## Recorded geometry and reconstruction

The recorded map supplies these distinct facts:

- rear property line: west boundary, 94.00 feet;
- front property line: boundary at the west edge of the 27th Street right-of-way, 94.00 feet;
- north rear-to-front side: N 89°55′05″ E, 235.04 feet;
- south rear-to-front side: N 89°54′59″ E, 235.00 feet, reversing the recorded S 89°54′59″ W call;
- excluded dedicated street portion: 30 feet by 94 feet.

For a four-sided parcel, the vector from the rear-line midpoint to the front-line midpoint equals the arithmetic mean of the two rear-to-front side vectors. The reconstructed vector is approximately 235.019754698 feet east and 0.339543507 feet north. Its length is 235.019999975 feet. Because recorded lengths are stated to the nearest hundredth foot, the supported Code-defined lot depth is `235.02 feet`.

The 94.00-, 235.00-, 235.04-, 265.00-, and 265.04-foot values remain recorded boundary lengths. None is relabeled as Code-defined lot depth. Parcel V2 geometry is not used in the calculation.

## Applicable standard and comparison

SDMC §131.0431(a), Table 131-04D, September 2026 edition, states a minimum lot depth of `95 feet` for RS-1-7. The sealed rule is `RECORDED`, uses operator `MIN`, has no condition, and belongs to outside-Coastal rule set `sd-rs-base-standards-2026-09-30-v0`. Section 131.0442 was reviewed: its RS/RM exception concerns street frontage, and its other provisions concern RX frontage or RX-1-2 dimensions; it does not modify this RS-1-7 lot-depth value.

`235.02 feet >= 95 feet`

Result: `RULE_REQUIREMENT_SATISFIED`.

The supported Code-defined lot depth satisfies the RS-1-7 minimum lot depth standard.

This evaluates only the minimum-lot-depth rule. It does not establish overall zoning compliance, development capacity, setback compliance, or project approval.

## Product example

### Minimum lot depth

- Required: 95 ft
- Supported measured depth: 235.02 ft
- Result: requirement satisfied
- Measurement basis: SDMC §§113.0243(a) and 113.0246 applied to PM 17383 Parcel 1 recorded map geometry
- Scope: minimum-lot-depth rule only
- Source: PM 17383 Parcel 1; DOC # 2001-0706032; SDMC §§113.0243, 113.0246, and 131.0431(a), Table 131-04D

No UI or production runtime is wired.

## Decision

`NEXT_RULE_EVALUATION_TARGET: legal lot width`

`MINIMUM_LOT_DEPTH_RULE_EVALUATION_READY`

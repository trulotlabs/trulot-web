# Minimum Frontage Evaluation V0 — fourth bounded rule result

Packet 30 evaluates only the RS-1-7 minimum street-frontage rule for APN `6341302200`.

## Definition and recorded line

The July 2026 SDMC definition states: street frontage is the length of one premises' property line along the street it borders. Under §113.0246, Parcel 1's east development-regulation property line separates the premises from the 27th Street public right-of-way. PM 17383 records this straight line as `N 00°03′42″ W, 94.00 feet`. The street centerline has the same straight bearing. The dedicated 30-foot street portion lies east of the premises line and is not itself the frontage length.

The Code definition therefore supports using the recorded 94.00-foot premises property line as street frontage. Parcel V2 geometry is not used.

## Applicable standard

SDMC §131.0431(a), Table 131-04D, September 2026 edition, states `50 feet` for RS-1-7 street frontage and cross-references §131.0442(a). That section reduces the requirement to 60 percent only where a lot fronts principally on a turnaround or curving street with centerline radius under 100 feet. PM 17383 depicts a straight 27th Street segment with no curve, radius, or turnaround at Parcel 1. The exception does not apply, so the applicable minimum remains 50 feet.

`94.00 feet >= 50 feet`

Result: `RULE_REQUIREMENT_SATISFIED`.

The supported Code-defined lot frontage satisfies the RS-1-7 minimum frontage standard.

This evaluates only the minimum-frontage rule. It does not establish access adequacy, driveway compliance, setback compliance, development capacity, or project approval.

## Frontage is not access

Frontage is the measured premises boundary along 27th Street. Street adjacency establishes that boundary relationship. Neither establishes a legal right of access, driveway permission, an approved curb cut, access adequacy, or compliance with access regulations. Those questions remain unevaluated.

## Product example

### Minimum frontage

- Required: 50 ft
- Supported frontage: 94.00 ft
- Street: 27th Street
- Result: requirement satisfied
- Measurement basis: SDMC street-frontage definition and §§113.0246/131.0442(a) applied to PM 17383 Parcel 1
- Scope: minimum-frontage rule only

No UI or production runtime is wired.

## Dimensional evaluator assessment

Area, depth, width, and frontage now demonstrate a stable reusable sequence: authoritative legal-lot evidence, Code measurement doctrine, geometry construction, rule and condition resolution, deterministic comparison, bounded result, and provenance. Consolidation should occur in a separately bounded packet so the four sealed outputs remain unchanged.

`DIMENSIONAL_EVALUATOR_PATTERN_READY`

## Decision

`NEXT_RULE_EVALUATION_TARGET: front setback`

`MINIMUM_FRONTAGE_RULE_EVALUATION_READY`

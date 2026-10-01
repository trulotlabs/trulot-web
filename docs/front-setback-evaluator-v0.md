# Front Setback Evaluator V0

Packet 32 evaluates only the current outside-Coastal RS-1-7 front-setback rule envelope for APN `6341302200`. It uses the shared Dimensional Rule Evaluator V0 evidence gates, comparator, conclusion guards, provenance graph, contract validation, fingerprints, and deterministic JSON rendering.

## Controlling rule and branches

The September 2026 SDMC Table 131-04D gives RS-1-7 a 15-foot minimum front setback. The complete bounded expression retains three distinct modifications:

- §131.0443(a)(1) permits `max(5, 15 - 5) = 10 feet` for a portion of a lot fronting a cul-de-sac. PM 17383 depicts the target frontage and 27th Street centerline as straight survey lines, so this parcel predicate is false and the branch is excluded.
- Table 131-04D footnote 1 permits a 6-foot minimum for the setback closest to street frontage when at least one-half of the front 50 feet of lot depth has a minimum slope gradient of 25 percent. The front line is resolved, but no sealed authoritative topography measures that literal test and no project election is supplied.
- §131.0443(i), effective outside Coastal under O-22109, permits the Fire Code Official to require a defensible-space buffer greater than the otherwise applicable base-zone setback. There is no project-specific Fire Code Official determination, and the sealed evidence does not resolve the ordinance's airport-transition condition.

The two reduction permissions are not cumulative. The cul-de-sac provision reduces the table requirement; it does not authorize subtracting five feet from the separate six-foot slope permission.

The parcel-specific requirement is therefore `SETBACK_REQUIREMENT_CONDITIONAL`. Its valid possible branches are the 15-foot base, the optional 6-foot slope minimum if the literal condition is proven and elected, and an unquantified greater Fire Code Official buffer if required. This packet does not treat 15 feet as final.

## Predicate evidence

Every condition has one of `TRUE`, `FALSE`, `UNKNOWN`, `SOURCE_UNAVAILABLE`, or `NOT_APPLICABLE`. The recorded map supports the front-line role, excludes cul-de-sac geometry, excludes an alley front line, and supports non-corner status. The current-version scope makes protected earlier applications outside this evaluation; it does not claim that an unknown historical application used the current profile. The separate Code-defined steep-hillside concept is also not substituted for footnote 1's literal test. Slope, slope-permission election, Fire Code Official buffer, airport-transition context, documentary modification, special programs, proposed dedication, structure classification, projections, and project scope remain explicit rather than defaulting false.

The highest-value next bounded evidence source is authoritative slope/topography for the front 50 feet. It can resolve the literal Table 131-04D footnote test. Fire-buffer and project elections remain project-specific even after that source is obtained.

## Measurement and structure evidence

The front property line is the east boundary of PM 17383 Parcel 1 at the west edge of the 27th Street public right-of-way. Under §§113.0249 and 113.0252, the setback is measured inward and perpendicular to that line and, for new-development compliance, to the outer edge of the building frame. A valid comparison also requires a resolved requirement, authoritative current or proposed structure geometry, and resolved structure/project and projection semantics. Assessor living area is not geometry.

Sealed Packet 17 evidence contains two directly linked City/SANDAG outlines derived from Spring 2017 imagery, plus one ambiguous boundary-touching outline in its linkage record. The compact evidence retains hashes rather than coordinates, and current completeness is not proven. No distance is computed. Their only allowed class is `HISTORICAL_DIAGNOSTIC_SETBACK`; they are not current compliance evidence.

The compliance gate therefore returns `SETBACK_COMPLIANCE_NOT_EVALUATED`. This is not a negative finding.

## Product result and containment

The product fixture keeps “Applicable front setback” separate from “Existing structure.” It displays the 15-foot base and conditional branches, then states that current structure compliance was not evaluated and names the missing evidence. No UI is wired.

The result cannot propagate into overall zoning compliance, legal nonconformity, variance requirement, permit violation, capacity, buildability, entitlement likelihood, or permit approval. No other rule family is evaluated.

`NEXT_FEASIBILITY_SOURCE_TARGET: authoritative slope/topography for the front 50 feet`

`FRONT_SETBACK_EVALUATOR_V0_READY`

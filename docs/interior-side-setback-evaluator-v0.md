# Interior Side Setback Evaluator V0

Packet 36 evaluates only the current outside-Coastal RS-1-7 interior-side-setback rule envelope for APN `6341302200`. It reuses the shared Dimensional Rule Evaluator V0 for evidence gates, explicit predicate states, comparison guards, conclusion guards, provenance, fingerprints, contract validation, and deterministic rendering. It also consumes the sealed Packet 35 Fire predicate rather than reconstructing Fire doctrine.

## Rule and parcel branches

September 2026 SDMC Table 131-04D gives RS-1-7 a 4-foot minimum interior-side setback. PM 17383 and §§113.0246(a)-(d) resolve the north and south rear-to-front boundaries as the parcel's two interior side lines. The parcel is single-frontage, interior, and non-corner; no street-side setback is evaluated.

Section 131.0443(a)(4)(A) requires each side setback to equal 8 percent of actual lot width only when that width is strictly less than the applicable zone minimum. The sealed Code-defined width is 94.00 feet and the RS-1-7 ordinary minimum is 50 feet, so that mandatory branch is excluded. Its arithmetic result, 7.520 feet, is recorded only as the value the excluded formula would produce and is not an applicable requirement.

Because 94.00 feet is strictly greater than 50 feet, §131.0443(a)(4)(B) makes side-setback reallocation available in principle. This non-corner parcel has two interior side lines: the table total is 8 feet, and each reallocated interior side has an independent 4-foot floor. Reallocation therefore cannot reduce either interior side below the 4-foot table base for this parcel configuration. The evaluator does not infer that reallocation was elected. If a project is an addition and a qualifying side setback was previously established, §§113.0249(d) and 131.0443(a)(4)(B)(i) may require maintaining that established dimension. No complete approval/history record or compliance-grade dimension is sealed, so that addition branch remains explicit and unresolved.

Section 131.0461(a) separately permits specified projections and encroachments subject to element-specific conditions. The evaluator retains roof and openly supported projections, bay windows, fireplace enclosures, mechanical equipment, patios, dormers, low unroofed structures, pools/spas/hot tubs, and qualifying accessory buildings as a distinct element branch. It selects none without a proposed element and complete geometry. The garage/non-habitable accessory-building permission in §131.0461(a)(12) is excluded because the sealed Code lot area is 22,096.320 square feet, above its 10,000-square-foot ceiling. Section 131.0449(a)'s embankment-garage rule is limited to front and street-side yards.

Packet 35 establishes `FIRE_BUFFER_PROJECT_REVIEW_REQUIRED`: §131.0443(i) applies to the current outside-Coastal profile, but mapped fire geography does not itself select a numeric greater setback. A project-specific Fire Code Official determination can require a buffer greater than the otherwise applicable side setback. Documentary and special-program modifications likewise remain unresolved. The parcel-specific result is therefore `SETBACK_REQUIREMENT_CONDITIONAL`.

## Measurement and compliance

For each interior side, §113.0249(a) places the setback line parallel to the nearest side property line at the required inward distance. Section 113.0252(a)(2) measures inward and perpendicular to that side property line. New-development compliance is measured to the outer edge of the building frame under §113.0252(c), subject to qualifying §131.0461(a) element rules. Above-grade portions of underground parking, first stories, and basements remain subject to setbacks; the bounded completely-underground exception in §113.0252(b) requires project facts.

Packet 17 supplies assessor living area and two directly linked Spring 2017 building outlines. Living area is not setback geometry. The compact outline evidence retains hashes instead of coordinates and does not prove current completeness or compliance-grade registration to the legal side lines. The evaluator therefore records `HISTORICAL_DIAGNOSTIC_INTERIOR_SIDE_SETBACK` for both north and south as `NOT_MEASURED` and never promotes it to current evidence.

The compliance gate requires a resolved final requirement, current authoritative structure geometry registered to the legal boundaries, resolved structure/project classification, resolved projection treatment, and complete measurement semantics. Those gates do not all pass, so the result is `SETBACK_COMPLIANCE_NOT_EVALUATED`. This is not a negative finding.

## Containment and family pattern

The side-specific concepts—two measurement lines, strict width thresholds, optional combined-total reallocation with line floors, and addition continuation—fit as rule-family data and predicates within the existing pipeline. They do not require new generic evaluator behavior.

The artifacts prevent propagation into overall zoning compliance, legal nonconformity, variance requirement, permit violation, capacity, buildability, entitlement likelihood, or permit approval. They acquire no data, evaluate no street-side rule, and wire no UI or production path.

`SETBACK_FAMILY_PATTERN_STABLE`

`NEXT_RULE_EVALUATION_TARGET: street-side setback`

`INTERIOR_SIDE_SETBACK_EVALUATOR_V0_READY`

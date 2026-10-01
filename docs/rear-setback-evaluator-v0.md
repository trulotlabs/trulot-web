# Rear Setback Evaluator V0

Packet 34 evaluates only the current outside-Coastal RS-1-7 rear-setback rule envelope for APN `6341302200`. It uses the shared Dimensional Rule Evaluator V0 evidence gates, comparator, conclusion guards, provenance graph, contract validation, fingerprints, and deterministic JSON rendering.

## Controlling rule and branches

The September 2026 SDMC Table 131-04D gives RS-1-7 a 13-foot minimum rear setback. Section 131.0443(a)(2)(A)'s general sentence contains the printed reference `Table 141-04D`. This evaluator does not silently repair that source defect. Parcel 1 is more than 150 feet deep, however, so the mutually exclusive long-lot clause in §131.0443(a)(2)(A)(ii) applies and expressly references the valid Table 131-04D. The sealed 235.02-foot depth therefore produces `max(10% × 235.02, 13) = 23.502 feet` without relying on the malformed general reference. An ordinary lot from 100 through 150 feet deep would remain source-unavailable under this evidence.

PM 17383 depicts the west rear line adjoining land, not an alley, so the §131.0443(a)(2)(B) alley-width credit and §131.0443(a)(2)(C) parking-access distance are excluded. The four-foot alley permission in §131.0443(a)(3) applies only to RS-1-8 through RS-1-14 and is not applicable. Section 131.0449(a) concerns front and street-side embankment garages. The separate §131.0461(a)(12) garage/non-habitable accessory-building rear-yard encroachment is unavailable because the sealed Code lot area is 22,096.320 square feet, above its 10,000-square-foot ceiling.

Section 131.0443(i), effective outside Coastal under O-22109, permits the Fire Code Official to require a defensible-space buffer greater than the otherwise applicable base-zone setback. No project-specific determination is sealed. Documentary and special-program modifications also remain unknown. The parcel-specific requirement is therefore `SETBACK_REQUIREMENT_CONDITIONAL`, with the 23.502-foot depth-adjusted base, an unquantified greater Fire Official branch, and any controlling document/program branch preserved separately.

## Predicate and measurement evidence

Every condition has one of `TRUE`, `FALSE`, `UNKNOWN`, `SOURCE_UNAVAILABLE`, or `NOT_APPLICABLE`. The recorded map and prior dimensional evaluations resolve the rear line, 235.02-foot depth, no-rear-alley state, and Code lot area. Fire applicability, documentary modifications, special programs, future dedication, current/proposed structure classification, underground status, and permitted projections remain explicit rather than defaulting false.

The rear setback is measured inward and perpendicular to the west rear property line. The setback line is parallel to that line, and new-development compliance is measured to the outer edge of the building frame. Alley treatment is rear-specific under §§113.0246(e)(3) and 131.0443(a)(2)(B)-(C). Element-specific projections and encroachments remain governed by §131.0461(a).

Packet 17 contains two directly linked Spring 2017 building outlines, but the compact facts retain only geometry hashes, do not prove current completeness, and do not provide compliance-grade legal-boundary registration. No historical distance is forced. Their only allowed class is `HISTORICAL_DIAGNOSTIC_REAR_SETBACK`.

The compliance gate returns `SETBACK_COMPLIANCE_NOT_EVALUATED` because the final requirement, current structure geometry, structure/project classification, and projection scope are not all resolved. This is not a negative finding.

## Shared pattern and containment

The setback-family pipeline is stable: evidence gates, rule selection, explicit predicates, valid branches, measurement doctrine, compliance gates, and contained output. Rear setback adds one reusable rule: a malformed general cross-reference remains closed unless a selected, mutually exclusive parcel branch contains its own valid authoritative reference.

The result cannot propagate into overall zoning compliance, legal nonconformity, variance requirement, permit violation, capacity, buildability, entitlement likelihood, or permit approval. No other rule family is evaluated and no UI is wired.

`SETBACK_FAMILY_PATTERN_READY`

`NEXT_FEASIBILITY_SOURCE_TARGET: Fire Official / defensible-space applicability`

`REAR_SETBACK_EVALUATOR_V0_READY`

# Fire Defensible-Space Predicate V0

Packet 35 resolves the evidence doctrine for the Fire Code Official branch in current outside-Coastal SDMC §131.0443(i), for APN `6341302200`. It does not determine a final project setback, structure compliance, fire safety, or development capacity.

## Controlling doctrine

Section 131.0443(i) applies “for all structures” and contains no VHFHSZ, WUI, or other geographic precondition. It authorizes the Fire Code Official to require a defensible-space buffer greater than the applicable base-zone setback to ensure compliance with safety regulations. The provision supplies no automatic numeric increment and does not convert mapped fire geography into a greater setback.

The current San Diego Fire Code adopts the 2025 California Fire Code. The separate San Diego WUI Code defines mapped Wildland-Urban Interface Areas and regulates vegetation, fuel-modification zones, Zone 0, and building siting. Sections 512.0603 and 512.0604 permit site-specific Fire Code Official increases to fuel-modification distances. Those distances are distinct from the §131.0443(i) structure-to-property-line setback override and require project/site review before they can support an actual greater setback.

## Separate concepts and parcel context

The contract keeps four concepts separate: fire-hazard geography, vegetation/brush-management obligations, the development-setback override, and an actual project-specific Fire Code Official determination.

An exact APN query used the sealed SanGIS parcel geometry and found that Parcel 716690 intersects the City-adopted 2025 VHFHSZ layer. The State-recommended LRA layer classifies the parcel geometry as `NonWildland`; the City layer adds or increases mapped areas under its adopted map. City FAQ Q25 states that mapped requirements apply if any portion of a lot falls within the VHFHSZ. This supports mapped defensible-space context. It does not prove that a greater §131.0443(i) setback has been imposed.

No project-specific Fire Code Official determination is present in the sealed evidence. The parcel state is therefore `FIRE_BUFFER_PROJECT_REVIEW_REQUIRED`. The absence of such a record is not `FALSE` and supplies no numeric buffer.

## Evidence and presentation contract

An actual greater buffer requires an authoritative project record such as an approved project condition, Fire plan-review comment, Fire Code Official determination, approved fire-access/defensible-space plan, or permit record that states the required distance. General maps, guidance, brush obligations, and an unsuccessful record search are not determinations.

TruLot may report a base zoning setback with a scoped caveat. Permitted examples are:

- `Base front setback from zoning: 15 ft. The slope branch remains unresolved. A greater fire-safety buffer may be required for a specific project by the Fire Code Official.`
- `Base rear setback derived from zoning and lot depth: 23.502 ft. A greater fire-safety buffer may be required for a specific project by the Fire Code Official.`

Neither value is the final project setback. Product text must not say `fire compliant`, `fire safe`, or `no fire issue`.

Further parcel GIS lookup can refine hazard and defensible-space context but cannot resolve whether the Fire Code Official will impose a greater project setback. The GIS hunt for this predicate is closed.

`FIRE_BUFFER_GIS_LOOKUP_NOT_DETERMINATIVE`

`NEXT_RULE_EVALUATION_TARGET: interior side setback`

`FIRE_DEFENSIBLE_SPACE_PREDICATE_V0_READY`

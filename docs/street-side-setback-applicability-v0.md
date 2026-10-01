# Street-Side Setback Applicability V0

Packet 37 determines only whether the street-side-setback family applies to APN `6341302200`. It does not adjudicate the unresolved RS street-side numeric branches, measure a structure, or calculate compliance or capacity.

## Code definition and prerequisites

Under the July 2026 SDMC measurement division, §113.0246(d), side property lines connect front property lines to rear property lines, and the side property line that abuts public right-of-way is the street-side property line. Section 113.0246(a) and Diagram 113-02Z show the normal corner-lot relationship: the narrower street frontage is front and the other street-adjoining side is street side. Section 113.0252(a)(3) would measure a street-side setback inward and perpendicular to that street-side line, but that measurement rule is not invoked when no such line exists.

The Code preserves distinct unusual cases. A double-fronted lot ordinarily has front property lines along both street frontages under §113.0246(b). Under §113.0246(e), an alley-abutting line is not a street property line for setback or street-yard purposes; paragraph (e)(2) applies an interior-side-yard standard to an alley-adjacent side line. Under §113.0246(f), a resubdivided residential corner lot preserves the original configuration's front and street-side setback treatment. Those conditions remain semantic prerequisites and cannot be inferred from a nearby street or address orientation.

A street-side family can be marked `NOT_APPLICABLE` only after lot identity, legal-lot reconciliation, line-role geometry, corner status, double-fronted status, side-line street adjacency, and resubdivided-corner status are affirmatively resolved. Missing geometry or unresolved classification returns `RULE_EVALUATION_UNRESOLVED`. A supported corner or resubdivided-corner case returns an applicable state requiring its own complete numeric rule evaluation.

## APN 6341302200

PM 17383 Parcel 1 is sealed as `SINGLE_FRONTAGE_INTERIOR_NON_CORNER`. Its east line alone adjoins 27th Street and is the front property line. The west line is rear. The north and south lines connect front to rear, adjoin land rather than public right-of-way, and are interior-side property lines. The parcel is not double-fronted and is not a resubdivided corner lot under the sealed classification.

Table 131-04D contains an RS-1-7 street-side entry, so the rule is available when a qualifying street-side condition exists. That availability does not make the rule applicable here. The table's 5-foot entry is retained only as source evidence and is not selected as this parcel's requirement. The result is `STREET_SIDE_SETBACK_NOT_APPLICABLE`, with truth state `NOT_APPLICABLE`, a null applicable requirement, and no numeric comparison.

Allowed product wording is: `Street-side setback: Not applicable to this parcel because no side property line adjoins a street.` This is not a zero-foot setback, waiver, or compliance finding.

## Shared framework and next move

The shared Dimensional Rule Evaluator V0 now validates `NOT_APPLICABLE` as a nonnumeric result. Its applicability resolver requires literal-true semantic prerequisites before returning that state. Applicable numeric, conditional, unresolved, and affirmatively inapplicable families remain distinct.

The parcel's setback-family summary is front conditional, rear conditional, interior side conditional, and street side not applicable. With all four setback families now safely represented, a bounded parcel feasibility summary is more valuable than immediately opening another rule family: it can compose supported results and unresolved conditions without implying overall compliance or capacity.

`NEXT_FEASIBILITY_STEP: parcel feasibility summary V0`

`STREET_SIDE_SETBACK_APPLICABILITY_V0_READY`

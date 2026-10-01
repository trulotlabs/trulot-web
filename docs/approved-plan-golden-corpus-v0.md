# Approved Plan Golden Corpus V0

Packet 41 establishes a private, deterministic validation corpus from operator-controlled project records. It does not publish plans, alter public parcel truth, calculate compliance or capacity, or wire any product path.

## Selection and limits

The bounded source inventory contained five candidate project records. Three related projects at 639-659 N 67th Street were selected: submitted ADU building plans (PRJ-1111087), issued site-wall plans (PRJ-1140985), and grading/ROW reference sheets (PRJ-1110168). Two ROW proposal emails were excluded because they contain no plan sets. V0 therefore covers one property and three project scopes. No simple RS project was available in the bounded source set, so the corpus is not citywide or zone-representative.

Every selected source is classified `PRIVATE_OPERATOR_OWNED_OR_AUTHORIZED` and used only as `PRIVATE_VALIDATION_EVIDENCE`. Exact source paths and SHA-256 hashes live in the manifest. PDF, TIFF, drawing, screenshot, payment, and contact artifacts remain outside Git.

## Evidence contract

Each project records address/APN, plan identifier and status, sheet number/title, plan date, design professional, scale, legal-boundary and survey/map references, geometry semantics, dimensions, footprint/area/height/story facts, grading/topography, use, proposed units, notes, provenance, and privacy class. Unknown values remain null or explicitly unresolved.

Sheet review is bounded. Tier 1 covers site/plot, civil, grading, and boundary/survey sheets. Tier 2 covers foundation, architectural site, and roof sheets when necessary. Tier 3 covers floor plans, elevations, sections, and project-data/code sheets. Only sheets needed for a specific golden fact enter the manifest.

The geometry model preserves legal property lines, surveyed/calculated property lines, setback lines, building-frame edges, roof edges, wall faces, foundation edges, projections, accessory structures, hardscape, and lot-coverage footprints as separate meanings. A direct recorded dimension is preferred, followed by a clear direct labeled plan dimension tied to sheet geometry. Scale-derived and pixel-derived measurements remain diagnostic.

## Pilot results

PRJ-1111087 supplies proposed-project facts for 26 ADUs, a 40-foot project-data height, a proposed FAR statement of 22,219.6 square feet divided by 20,084 square feet equals 1.10, a direct four-foot ADU setback label, and labeled property-line lengths. It is `COMPLIANCE_GEOMETRY_READY` only for proposed-project geometry. The submitted plan and calculated-boundary survey do not prove as-built or current existing conditions.

PRJ-1140985 supplies issued proposed site-wall facts: approximately 557 linear feet, wall heights from 1 foot 2 inches to 9 feet 3 inches, and 2,619.6 square feet of projected wall area. It is ready for site-wall geometry validation, but not building setback validation because the building frames belong to another project.

PRJ-1110168 supplies survey, legal-description, grading/topography, and civil linkage evidence. Its direct approval status was not independently reviewed, and it is not ready for building setback validation.

The plan facts remain `PROPOSED_PROJECT_FACT`. None is promoted to `EXISTING_PARCEL_FACT`.

## Public intelligence and evaluator compatibility

The repository contains no public-intelligence fixture for APN 5442140600. Parcel identity, zoning, Coastal state, legal-lot evidence, dimensions, structure facts, and feasibility therefore remain incomplete or unresolved on the public side. Plan-provided RM-2-5, legal description, dimensions, and project facts are retained as project evidence without replacing public truth.

The shared dimensional framework already supports literal evidence gates, numeric comparison, containment, and provenance. Existing front, rear, interior-side, and street-side adapters are sealed to APN 6341302200, RS-1-7, its authority profile, and current-structure semantics. A non-production `PlanFactEnvelope` or `ProjectEvidenceAdapter` is needed to carry parcel/rule identity, proposed-vs-existing subject, plan status, line roles, geometry semantics, direct dimensions, and sheet provenance. The shared framework does not need an architectural change.

## Decision

`APPROVED_PLAN_GOLDEN_CORPUS_V0_READY`

`NEXT_FEASIBILITY_STEP: validate setback compliance against approved plans`

That next packet should first add the bounded adapter and independently seal the applicable RM/ADU rule profile. It must keep proposed-plan validation separate from assertions about current structures or general parcel compliance.

# Current Structure Compliance Geometry V0

Packet 56 separates four evidence levels: observational structure geometry, project-plan geometry, survey-controlled geometry, and current as-built geometry. Only the last level can support an existing-structure compliance comparison, and only after every rule-specific gate passes.

`COMPLIANCE_GEOMETRY_READY` requires an established legal boundary and property-line roles; an identified current existing structure and Code-relevant edge; a direct or survey-controlled distance to the relevant property line; known plan/survey status; a currentness date; no unresolved later footprint-changing work; and geometry semantics compatible with the selected Code rule. Any unresolved gate fails closed.

For SDMC §113.0252(c), the relevant edge is the outer edge of the building frame. Wall face and foundation edge remain distinct unless their equivalence is expressly proved. Roof/eave, projections, balconies/decks, accessory structures, retaining walls, and hardscape retain separate semantics and rules. A generic “building footprint” is insufficient.

Currentness may be supported by a recent existing-conditions survey or as-built record with later-change reconciliation, or by approved plans coupled to construction/final-inspection or equivalent as-built evidence and later reconciliation. Imagery and permit history may corroborate a controlled source, but “no visible change” and permit silence do not independently prove currentness.

For APN `6341302200`, PM 17383 Parcel 1 and the 2001 deed establish recorded identity, boundary dimensions, and property-line roles. They do not provide modern survey registration to a structure. The 2017 outlines and Spring 2023 imagery are observational and do not distinguish the building frame from roof/eave geometry. PMT-3276742 is a 2024 no-plan gas-pipe repair with no stated footprint effect; that record does not exclude later or unpermitted change. No bounded operator file supplied a survey, site plan, final/as-built plan, or inspection drawing for the parcel.

Therefore:

- `BOUNDARY_CONTROL_PARTIAL`
- `STRUCTURE_CONTROL_PARTIAL`
- `CURRENTNESS_PARTIAL`
- `COMPLIANCE_GEOMETRY_NOT_READY: no current survey-controlled building-frame tie to the recorded property lines`
- `CURRENT_STRUCTURE_SETBACK_EVALUATOR_COMPATIBLE`
- `CURRENT_STRUCTURE_GOLDEN_BENCHMARK_BLOCKED: no current survey-controlled building-frame tie and unresolved post-2023 currentness`
- `NEXT_FEASIBILITY_STEP: acquire current survey-controlled geometry`

The smallest resolving package is one current boundary/topographic or existing-conditions survey tied to PM 17383 Parcel 1. It must identify existing outer building-frame edges, supply direct perpendicular offsets or controlled coordinates to the applicable property lines, state its reference system and date, distinguish other edge/feature types, and reconcile later footprint-changing work through the evaluation date. An approved site plan is an alternative only when final inspection/as-built corroboration and later-change reconciliation establish the current existing subject. One or two controlling sheets are sufficient when they contain these facts.

The reusable envelope maps direct survey dimensions to available/supported/recorded; coordinate-derived controlled distances to available/supported/deterministic-derived; imagery estimates to partial/partial/inferred diagnostic facts; and unresolved currentness to partial/unknown/conditional. It uses no numeric confidence score.

Observational or project-plan geometry may not support claims that an existing setback complies, a structure is legal, a current building is conforming, or an approved design is as-built. Project facts remain separate from existing-parcel facts. This packet makes no setback, lot-coverage, legality, or capacity conclusion.

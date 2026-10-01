# Approved Plan Setback Benchmark V0

Packet 42 establishes one bounded `PROPOSED_PLAN_RULE_VALIDATION` for PRJ-1111087. The PlanFactEnvelope identifies Building 1, the north interior property line, and the directly labeled 5 feet 11-1/2 inch distance to the enclosed ADU building frame on A0.1. It retains the fourth correction-drawing submittal status and does not represent the plan as approved, permitted, constructed, or as-built.

Public SanGIS parcel evidence independently identifies APN 5442140600 as Block 7, Lot 4 of Encanto Heights Map 1063 at 639 N 67th Street in the City of San Diego. Exact area coverage yields principal zoning RM-2-5 over 99.9995 percent of the parcel and a retained 0.099-square-foot RS-1-6 boundary sliver. The mapping result is `SINGLE_ZONE` with detailed state `BOUNDARY_SLIVER`; the plan-reported RM-2-5 value only corroborates the public conclusion.

The parcel has no intersection with the sealed City Coastal layer, intersects the official Sustainable Development Area, and intersects the City-adopted 2025 fire-hazard layer. The north adjoining parcel is independently identified as APN 5442140500 in RS-1-6. Mapped fire geography remains context rather than a project-specific Fire Official requirement.

The application record opened January 29, 2024. The selected outside-Coastal application profile is the O-21618 version of SDMC §141.0302 in force at that time, preserved as old language in the O-21758 strikeout ordinance. A multistory ADU beside a residentially zoned or exclusively residential premises has a 4-foot interior-side and rear setback. The current O-21989 profile also has a 4-foot High/VHFHSZ minimum but permits a Fire Official to require more; that later clause is retained as a forward-profile limitation and is not silently applied to the selected application profile.

Current RM-2-5 base standards from Table 131-04G are 15-foot minimum and 20-foot standard front, a conditional interior side minimum of 5 feet or 10 percent of premises width, 10-foot street side, and 15-foot rear. The ADU application-profile rule selects the 4-foot interior-side branch for the chosen enclosed ADU frame. Other setback families remain recorded but unevaluated.

The deterministic comparison is `5.958333333333333333333333333 ft >= 4 ft`, producing `PLAN_RULE_REQUIREMENT_SATISFIED`. City Planning Comment 00332 separately requires roofed balconies to observe the 10-foot base-zone setback unless enclosed within an ADU. The benchmark does not use a roofed balcony as its target and does not treat comment silence as approval. Fire Comment 00279 confirms VHFHSZ context and records no brush-management requirement; it is not treated as a general Fire approval.

The Packet 31 shared Decimal minimum comparator is reused unchanged. The project adapter adds proposed-subject, plan-status, geometry-semantic, and private-provenance gates. Private plan paths and files are absent from generated artifacts and public fixtures.

Decision: `APPROVED_PLAN_SETBACK_BENCHMARK_V0_READY`.

Next: `NEXT_FEASIBILITY_STEP: expand approved-plan setback benchmarks`.

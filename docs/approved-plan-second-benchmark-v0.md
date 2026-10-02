# Approved-plan second feasibility benchmark v0

Packet 49 selects PRJ-1140985, the City-issued 67th Street site-wall project, from the Packet 41 golden corpus. Its direct T-1 project fact states that proposed site walls range from 1 foot 2 inches to 9 feet 3 inches. The fact remains private validation evidence and is never promoted to current parcel truth or as-built evidence.

The public profile independently identifies APN 5442140600 at 639 N 67th Street in the City of San Diego, Lot 4 of Block 7 in Encanto Heights, Map 1063. The authoritative mapped zone is RM-2-5 and the parcel is outside the Coastal Overlay Zone. The plan-reported zone is not used to select these facts.

The selected rule family is the wall-height building-permit trigger in SDMC Table 142-03A. The table requires a Process One building permit for a fence at least 7 feet high and for a retaining wall at least 3 feet high. The table was last amended by O-21836 N.S., effective October 5, 2024, before the November 25, 2025 issued plan date. The City’s 9-2026 compiled code retains both thresholds.

The corpus fact does not distinguish whether the 9-foot-3-inch maximum belongs to the site-wall or retaining-wall subset. That predicate does not change this comparison: 9 feet 3 inches exceeds both thresholds. The evaluator therefore uses the more conservative 7-foot threshold and returns `PLAN_RULE_REQUIREMENT_SATISFIED` for the permit-trigger predicate. A height between 3 and 7 feet would fail closed until the subtype was known.

The conclusion is `ISSUED_PLAN_RULE_VALIDATION`. It establishes only that the issued proposed-plan maximum height crosses the building-permit threshold. It does not establish maximum-height compliance, current parcel compliance, construction, as-built conditions, or complete project approval. No rule-specific City reviewer comment was available; issuance of the full plan set is recorded but is not treated as proof of every rule interpretation.

The generic ProjectEvidenceAdapter validates both Packet 42 and Packet 49 using caller-supplied project identity and allowed status. It contains no PRJ-1111087, APN, or submittal-status constant. Both packets preserve the public/private boundary and use the shared Decimal comparison framework, while Packet 49 changes the project, plan status, and rule family.

Decision: `APPROVED_PLAN_BENCHMARK_TRANSFERABILITY_SUPPORTED`.

Corpus: `MULTI_PROJECT_BENCHMARK_CORPUS_ESTABLISHED`.

Next: `NEXT_FEASIBILITY_STEP: height/FAR golden evaluation`.

# Bounded Feasibility Product Contract V0

Packet 60D emits the V2 deterministic contract for bounded parcel-rule and named-project comparisons. Badges, summary groups, project status copy, and context labels are derived by the consumer from closed semantic states. The contract does not calculate capacity, wire production, or promote private evidence into public outputs.

Generate and test locally:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/bounded-feasibility-product-contract-v0/build.py
PYTHONDONTWRITEBYTECODE=1 python3 scripts/bounded-feasibility-product-contract-v0/test.py
```

Validation runs in a fixed order: structural JSON Schema, semantic invariants, privacy, deterministic templates, then evidence/value consistency. Unknown states, contradictory context tuples, producer-authored semantic labels, incomplete evidence, and privacy conflicts fail closed.

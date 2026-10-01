# Development Feasibility V0

Build deterministic contract artifacts:

```sh
python3 scripts/development-feasibility-v0/build.py
```

Run the Packet 23 contract tests:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/development-feasibility-v0/test.py
```

The resolver evaluates evidence readiness only. It does not calculate compliance, capacity, buildable area, entitlement outcomes, or economics.

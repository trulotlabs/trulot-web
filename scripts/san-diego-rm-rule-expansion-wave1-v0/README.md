# Packet 80 RM Wave 1 builder

`build.py` seals five City of San Diego RM profiles from the pinned September 2026 Division 4 authority and derives exact target-zone APN selection from Packet 79. `test.py` validates authority/version boundaries, profile completeness, exact populations and unique coverage, deterministic goldens, V4 shape, fail-closed behavior, and reproducibility.

Run with `PYTHONDONTWRITEBYTECODE=1 python3 scripts/san-diego-rm-rule-expansion-wave1-v0/test.py`.

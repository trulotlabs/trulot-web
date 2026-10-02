# RM Rule Profile V0 generator

`build.py` writes the deterministic Packet 51 artifacts in `data/rm-rule-profile-v0/`.
`resolver.py` contains generic, fail-closed version, unit-band, footnote, modifier, and proportional-setback primitives.
`test.py` verifies the legal-version boundary, RM-2-5 reconstruction, branches, evidence gates, Packet 50 replay, and committed artifact equality.

Run with `PYTHONDONTWRITEBYTECODE=1 python3 scripts/rm-rule-profile-v0/build.py` and then `PYTHONDONTWRITEBYTECODE=1 python3 scripts/rm-rule-profile-v0/test.py`.

# Approved-plan FAR closure V0

`build.py` reuses the sealed Packet 52 ledger, records only Packet 52A evidence deltas, and emits deterministic non-sensitive JSON. It never copies the private plan or County map image into Git.

Run `python3 scripts/approved-plan-far-closure-v0/build.py` and `python3 scripts/approved-plan-far-closure-v0/test.py` from the repository root.

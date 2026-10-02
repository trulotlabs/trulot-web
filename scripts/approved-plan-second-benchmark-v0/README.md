# Approved-plan second benchmark v0

Packet 49 builds a deterministic, non-production issued-plan rule benchmark from the existing Packet 41 golden corpus.

```bash
python3 scripts/approved-plan-second-benchmark-v0/build.py
python3 scripts/approved-plan-second-benchmark-v0/test.py
```

The build reads bounded private-plan facts already sealed in the corpus. It does not publish or copy the private plan. Public parcel, zoning, Coastal, and code evidence remain independently sourced.

# Packet 50 height/FAR golden benchmark

This deterministic builder evaluates height and FAR as separate proposed-plan rule families for PRJ-1111087. It reuses the generic project evidence adapter, reconstructs the public RM-2-5 branches, recomputes FAR with `Decimal`, and fails closed before either numeric comparison because the bounded private facts do not seal the required Code measurement semantics.

Run:

```sh
python3 scripts/approved-plan-height-far-benchmark-v0/build.py
python3 scripts/approved-plan-height-far-benchmark-v0/test.py
```

The package publishes no private plan binary or private filesystem path. Its outputs are non-production validation evidence and do not state compliance, approval, capacity, or as-built conditions.

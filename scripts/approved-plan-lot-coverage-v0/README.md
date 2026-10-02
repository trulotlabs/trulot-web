# Packet 54 lot-coverage evaluation

`python3 scripts/approved-plan-lot-coverage-v0/build.py` deterministically rebuilds the Packet 54 artifacts. `python3 scripts/approved-plan-lot-coverage-v0/test.py` verifies rule existence, component classification, Decimal arithmetic, fail-closed numerator and denominator handling, reusable-schema containment, project-evidence adapter compatibility, and byte-equivalent committed JSON.

The private plan binary is never copied into the repository. Generated artifacts contain only bounded facts and hashes. The historical RM-2-5 table supplies no lot-coverage standard, so the builder does not manufacture a compliance comparison.

# Packet 82 builder

`build.py` deterministically seals the final observed RS, RM, and RT base-zone profiles, generates target and citywide APN-selection evidence, and publishes the complete residential profile registry. `test.py` verifies prior packet integrity, source and family boundaries, exact set-union coverage, fail-closed states, goldens, negative cases, reproducibility, containment, and the stop-expansion decision.

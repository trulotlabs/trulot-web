# Parcel Intelligence V2

`resolver.py` composes immutable offline layer outputs into `ParcelIntelligenceV2`. It imports the sealed Packet 13 standards resolver and never queries a database or network. `build.py` produces stable fixture artifacts; `test.py` verifies truth propagation, split-zone and Coastal behavior, source failures, provenance, exclusions, and byte-identical reconstruction.

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-intelligence-v2/build.py --check
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-intelligence-v2/test.py
```

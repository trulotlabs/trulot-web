#!/usr/bin/env python3
"""Packet 72 deterministic derivation notes.

Inputs: sealed Packet 69 serving/evaluation artifacts; the locally sealed SanGIS
parcel acquisition; bounded official MaintStar sample; official SanGIS outline
metadata/capture; and the City active-project list. Raw bulk source captures are
intentionally not repackaged because production reuse rights remain unresolved.
See source-manifest.json for hashes and build methodology in the committed
artifacts. Run validate.py for the offline acceptance checks.
"""
from pathlib import Path
ROOT=Path(__file__).resolve().parent
print(f"Packet 72 artifacts are materialized at {ROOT}")
print("Run: python3 validate.py")

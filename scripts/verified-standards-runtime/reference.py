#!/usr/bin/env python3
"""Emit the approved Python consumer's per-zone output for equivalence tests."""

import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]


def module(path):
    spec = importlib.util.spec_from_file_location("approved_expanded_gate", path)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


gate = module(ROOT / "scripts/rs17-parameter-rehearsal/gate.py")
observation = json.loads((ROOT / "data/high-value-residential-review/authority-observation.json").read_text())
baseline = json.loads((ROOT / "data/residential-standards-review/residential_standards_v2_integration_safe.json").read_text())
promoted = json.loads((ROOT / "data/high-value-residential-review/proposed-safe-subset.json").read_text())["new_display_safe_records"]
source_paths = json.loads(Path(sys.argv[1]).read_text())
zones = sorted({record["zone_code"] for record in baseline + promoted})
context = {
    "evaluation_date": "2026-09-24",
    "coastal_context": "outside",
    "application_context": "new_application",
    "airport_context": "outside_miramar_transition",
    "lot_context": "unknown",
}
result = {}
for zone in zones:
    result[zone] = gate.resolve({
        "mode": "expanded_residential",
        "context": {**context, "zone_code": zone},
        "observation": observation,
        "source_paths": source_paths,
    })
print(json.dumps(result, sort_keys=True, separators=(",", ":")))

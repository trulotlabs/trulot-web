#!/usr/bin/env python3
"""Build sealed Packet 13 offline fixtures and evidence."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATA = ROOT / "data/parcel-rs-standards-runtime-v0"


def module(path: Path):
    spec = importlib.util.spec_from_file_location("parcel_rs_runtime_resolver", path)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


resolver = module(HERE / "resolver.py")
GENERATED = ["fixture-results.json", "example-result.json", "decision.json", "integrity.json"]


def dump(path: Path, value) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(source_dir: Path = DATA, output_dir: Path = DATA) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    if output_dir.resolve() != source_dir.resolve():
        for name in ["contract.json", "fixtures.json"]:
            shutil.copyfile(source_dir / name, output_dir / name)
    fixtures = json.loads((source_dir / "fixtures.json").read_text())
    results = [{"name": item["name"], "result": resolver.resolve(item["input"])} for item in fixtures["cases"]]
    fixture_results = {
        "contract_version": resolver.CONTRACT_VERSION,
        "case_count": len(results),
        "canonical_output_sha256": resolver.fingerprint(results),
        "results": results,
    }
    dump(output_dir / "fixture-results.json", fixture_results)
    example = next(item["result"] for item in results if item["name"] == "single-zone-rs-1-7")
    dump(output_dir / "example-result.json", example)
    zone_results = [zone for item in results for zone in item["result"]["standards"]["zone_results"]]
    supported_zones = [zone for zone in zone_results if zone["state"] == "supported"]
    supported_rules = [rule for zone in supported_zones for rule in zone["rules"]]
    fact_state_counts = {state: sum(1 for rule in supported_rules if rule["fact_state"] == state)
                         for state in ["RECORDED", "CONDITIONAL", "UNKNOWN", "NOT_APPLICABLE"]}
    decision = {
        "decision": "RS_STANDARDS_RUNTIME_V0_READY",
        "contract_version": resolver.CONTRACT_VERSION,
        "fixture_cases": len(results),
        "zone_results": len(zone_results),
        "supported_zone_sets": len(supported_zones),
        "unsupported_zone_results": sum(1 for zone in zone_results if zone["state"] == "not_applicable"),
        "returned_rules": len(supported_rules),
        "returned_rule_fact_states": fact_state_counts,
        "supported_values_without_provenance": sum(1 for rule in supported_rules if not rule.get("provenance_sha256")),
        "canonical_output_sha256": fixture_results["canonical_output_sha256"],
        "production_runtime_wiring": False,
        "parcel_compliance_logic": False,
        "capacity_logic": False,
    }
    dump(output_dir / "decision.json", decision)
    files = ["contract.json", "fixtures.json", "fixture-results.json", "example-result.json", "decision.json"]
    dump(output_dir / "integrity.json", {"algorithm": "sha256", "files": {name: sha(output_dir / name) for name in files}})


if __name__ == "__main__":
    build()

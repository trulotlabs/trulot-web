#!/usr/bin/env python3
"""Build deterministic Packet 14 condition-input evidence."""
from __future__ import annotations

import collections
import hashlib
import importlib.util
import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATA = ROOT / "data/rs-parcel-condition-inputs-v0"
GENERATED = ["dependency-matrix.json", "fact-inventory.json", "fixture-results.json", "rs-1-7-example.json",
             "diagnostic-analysis.json", "decision.json", "integrity.json"]


def module(path):
    spec = importlib.util.spec_from_file_location("rs_parcel_condition_resolver", path)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


resolver = module(HERE / "resolver.py")


def load(path): return json.loads(Path(path).read_text())
def dump(path, value): Path(path).write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def extract_row(spec):
    data = load(ROOT / spec["source_artifact"])
    kind = spec["selector"]["kind"]
    if kind == "identity_sample":
        return next(row for row in data["rows"] if row["apn_norm"] == spec["apn"])
    if kind == "zoning_case":
        return data["cases"][spec["selector"]["key"]]["parcelResponse"]["rows"][0]
    if kind == "zoning_stacked":
        return data["stacked"][spec["selector"]["index"]]["parcelResponse"]["rows"][0]
    if kind == "serving_case":
        return data[spec["selector"]["key"]]["response"]["rows"][0]
    if kind == "casebook_only":
        case = next(item for item in data["cases"] if item["apn"] == spec["apn"])
        if case["apn"] != spec["apn"]: raise ValueError("casebook APN mismatch")
        return None
    raise ValueError(f"unknown selector: {kind}")


def build(source_dir=DATA, output_dir=DATA):
    source_dir, output_dir = Path(source_dir), Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    static = ["contract.json", "dependencies.json", "fixtures.json", "future-source-priorities.json"]
    if source_dir.resolve() != output_dir.resolve():
        for name in static: shutil.copyfile(source_dir / name, output_dir / name)
    rules = load(ROOT / "data/rs-base-standards-v0/standards.json")
    dependencies = load(source_dir / "dependencies.json")
    rule_counts = collections.Counter(rule["standard_key"] for rule in rules)
    if set(rule_counts) != {item["standard_family"] for item in dependencies["families"]}:
        raise ValueError("dependency matrix does not cover every Packet 12 standard family")
    matrix = {"rule_set_version": rules[0]["rule_set_version"], "family_count": len(dependencies["families"]), "families": []}
    for item in dependencies["families"]:
        matrix["families"].append({**item, "packet12_rule_count": rule_counts[item["standard_family"]]})
    dump(output_dir / "dependency-matrix.json", matrix)
    specs = load(source_dir / "fixtures.json")["fixtures"]
    results = []
    for spec in specs:
        row = extract_row(spec)
        if row is not None and row["apn_norm"] != spec["apn"]: raise ValueError("fixture APN mismatch")
        results.append(resolver.resolve(spec, row))
    fixture_results = {"contract_version": resolver.CONTRACT_VERSION, "fixture_count": len(results),
                       "canonical_output_sha256": resolver.sha256_value(results), "results": results}
    dump(output_dir / "fixture-results.json", fixture_results)
    rs17 = next(item for item in results if item["fixture_id"] == "ordinary-rs-1-7")
    dump(output_dir / "rs-1-7-example.json", rs17)
    facts = collections.defaultdict(lambda: {"states": collections.Counter(), "derivations": collections.Counter(), "supported_examples": 0})
    for result in results:
        for item in result["facts"]:
            facts[item["fact_key"]]["states"][item["state"]] += 1
            facts[item["fact_key"]]["derivations"][item["derivation_class"]] += 1
            facts[item["fact_key"]]["supported_examples"] += item["state"] == "supported"
    inventory = {"fixture_count": len(results), "facts": [{"fact_key": key, "states": dict(value["states"]),
                 "derivations": dict(value["derivations"]), "supported_examples": value["supported_examples"]}
                 for key, value in sorted(facts.items())]}
    dump(output_dir / "fact-inventory.json", inventory)
    diagnostic_results = [item for item in results if item["geometry_diagnostics"]]
    disagreements = []
    for item in diagnostic_results:
        values = {fact["fact_key"]: fact["value"] for fact in item["geometry_diagnostics"]}
        disagreements.append({"apn": item["parcel"]["apn"], "minimum_rotated_rectangle_min_span_ft": values["geometry_minimum_rotated_rectangle_min_span_ft"],
                              "principal_axis_transverse_span_ft": values["geometry_principal_axis_transverse_span_ft"],
                              "minimum_method_delta_ft": round(abs(values["geometry_minimum_rotated_rectangle_min_span_ft"] - values["geometry_principal_axis_transverse_span_ft"]), 6),
                              "maximum_rotated_rectangle_span_ft": values["geometry_minimum_rotated_rectangle_max_span_ft"],
                              "convex_hull_maximum_span_ft": values["geometry_convex_hull_maximum_span_ft"],
                              "maximum_method_delta_ft": round(abs(values["geometry_minimum_rotated_rectangle_max_span_ft"] - values["geometry_convex_hull_maximum_span_ft"]), 6)})
    diagnostic = {"evaluated_parcels": len(diagnostic_results), "legal_width_conclusions": 0, "legal_depth_conclusions": 0,
                  "finding": "Candidate geometric methods produce shape descriptors, not Code-defined lot width or depth.",
                  "comparisons": disagreements}
    dump(output_dir / "diagnostic-analysis.json", diagnostic)
    readiness = collections.Counter(item["readiness"] for item in matrix["families"])
    decision = {"decision": "RS_PARCEL_INPUTS_NOT_READY_FOR_COMPLIANCE", "contract_version": resolver.CONTRACT_VERSION,
                "standard_families": len(matrix["families"]), "fixture_count": len(results),
                "readiness_counts": dict(readiness), "legal_width_conclusions": 0, "legal_depth_conclusions": 0,
                "corner_lot_conclusions": 0, "frontage_conclusions": 0, "compliance_conclusions": 0,
                "capacity_calculations": 0, "production_runtime_wiring": False,
                "canonical_output_sha256": fixture_results["canonical_output_sha256"]}
    dump(output_dir / "decision.json", decision)
    files = static + GENERATED[:-1]
    dump(output_dir / "integrity.json", {"algorithm": "sha256", "files": {name: sha(output_dir / name) for name in files}})


if __name__ == "__main__": build()

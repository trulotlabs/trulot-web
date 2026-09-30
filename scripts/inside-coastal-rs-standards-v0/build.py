#!/usr/bin/env python3
"""Build the sealed inside-Coastal RS standards and comparison evidence.

This is an offline legal-data transformation. It records source rules and selects
versions; it does not evaluate parcel compliance or development capacity.
"""
from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import shutil
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATA = ROOT / "data/inside-coastal-rs-standards-v0"
OUTSIDE = ROOT / "data/rs-base-standards-v0"
VERSION = "sd-rs-base-standards-inside-coastal-2026-09-10-v0"
PROFILE = "inside-coastal-2026-09-10-through-2026-09-30"
EFFECTIVE_FROM = "2026-09-10"
VERIFIED_THROUGH = "2026-09-30"
O22109_CONDITION = "Outside Coastal, section 131.0443(i) permits the Fire Code Official to require a greater defensible-space buffer."
STATIC = ["sources.json", "legal-version-chain.json", "versions.json", "fixtures.json"]
GENERATED = [
    "standards.json", "footnotes.json", "comparison.json", "fixture-results.json",
    "fingerprints.json", "decision.json", "validation.json", "preservation.json", "integrity.json",
]


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def load(path: Path) -> Any:
    return json.loads(path.read_text())


def dump(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n")


def module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


def transform_rule(source: dict[str, Any]) -> dict[str, Any]:
    rule = copy.deepcopy(source)
    rule["rule_set_version"] = VERSION
    rule["rule_id"] = rule["rule_id"].replace("sd-rs-base-standards-2026-09-30-v0", VERSION)
    rule["jurisdiction_variant"] = "INSIDE_COASTAL"
    rule["effective_from"] = EFFECTIVE_FROM
    rule["effective_to"] = None
    rule["effective_date_basis"] = (
        "O-21836, conditionally certified as LCP-6-SAN-24-0038-3 with modifications accepted in O-22117; "
        "City effective-date ledger records inside-Coastal effect on 2026-09-10; O-21934 was separately certified "
        "as LCP-6-SAN-25-0037-1 effective 2025-09-21; O-22109 is excluded."
    )
    rule["source_document"] = (
        "Inside-Coastal composite: O-21836 / LCP-6-SAN-24-0038-3 / O-22117, "
        "transcribed against September 2026 Residential Base Zones"
    )
    rule["legal_basis"] = {
        "city_ordinance": "O-21836",
        "coastal_amendment": "LCP-6-SAN-24-0038-3",
        "coastal_action": "CONDITIONALLY_CERTIFIED_2026-02-05",
        "city_acceptance_ordinance": "O-22117",
        "inside_coastal_effective": EFFECTIVE_FROM,
        "o21934": "CERTIFIED_INSIDE_COASTAL_EFFECTIVE_2025-09-21",
        "o22109": "PENDING_NOT_EFFECTIVE_INSIDE_COASTAL_AS_OF_2026-09-30",
        "source_keys": [
            "adopted_updates", "residential_division_4", "o21836", "ccc_2024_ldc", "o22117",
            "o21934", "ccc_o21934_report", "ccc_o21934_minutes", "o22109",
        ],
    }
    rule["condition"] = [value for value in rule.get("condition", []) if value != O22109_CONDITION]
    rule["unresolved_dependencies"] = [value for value in rule.get("unresolved_dependencies", []) if value != "131.0443(i)"]
    rule["notes"] = [
        *rule.get("notes", []),
        "Inside-Coastal version identity and legal basis are retained separately even where the printed value matches outside Coastal.",
    ]
    rule["provenance_sha256"] = fingerprint({key: value for key, value in rule.items() if key != "provenance_sha256"})
    return rule


def comparison_class(outside: dict[str, Any], inside: dict[str, Any]) -> str:
    if outside["standard_key"] == "bedroom_regulation":
        return "UNRESOLVED"
    changed_condition = outside.get("condition") != inside.get("condition") or outside.get("unresolved_dependencies") != inside.get("unresolved_dependencies")
    if changed_condition:
        return "CONDITIONAL_DIFFERENCE"
    return "PROVENANCE_ONLY_DIFFERENCE"


def build(source_dir: Path = DATA, output_dir: Path = DATA) -> None:
    source_dir, output_dir = Path(source_dir), Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    if source_dir.resolve() != output_dir.resolve():
        for name in STATIC:
            shutil.copyfile(source_dir / name, output_dir / name)

    outside = load(OUTSIDE / "standards.json")
    inside = [transform_rule(rule) for rule in outside]
    dump(output_dir / "standards.json", inside)

    footnotes = load(OUTSIDE / "footnotes.json")
    footnotes = dict(sorted(footnotes.items(), key=lambda item: int(item[0].split(":")[1])))
    dump(output_dir / "footnotes.json", footnotes)

    rows = []
    counts = {"VALUE_SAME": 0, "VALUE_CHANGED": 0, "CONDITIONAL_DIFFERENCE": 0, "PROVENANCE_ONLY_DIFFERENCE": 0, "UNRESOLVED": 0}
    for old, new in zip(outside, inside, strict=True):
        values_same = old["value"] == new["value"] and old.get("operator") == new.get("operator") and old.get("unit") == new.get("unit")
        counts["VALUE_SAME" if values_same else "VALUE_CHANGED"] += 1
        classification = comparison_class(old, new)
        counts[classification] += 1
        rows.append({
            "zone": old["zone_code"],
            "standard": old["standard_key"],
            "outside_coastal": old["value"],
            "inside_coastal": new["value"],
            "same_or_different": "SAME" if values_same else "DIFFERENT",
            "review_class": classification,
            "outside_rule_id": old["rule_id"],
            "inside_rule_id": new["rule_id"],
            "source": new["source_document"],
        })
    comparison = {
        "as_of": VERIFIED_THROUGH,
        "total_cells_compared": len(rows),
        "counts": counts,
        "classification_note": "Review classes are mutually exclusive; value equality is an independent axis.",
        "rows": rows,
    }
    dump(output_dir / "comparison.json", comparison)

    runtime = module("packet16_runtime", ROOT / "scripts/parcel-rs-standards-runtime-v0/resolver.py")
    fixtures = load(source_dir / "fixtures.json")["cases"]
    results = [{"name": case["name"], "result": runtime.resolve(case["input"])} for case in fixtures]
    fixture_results = {
        "case_count": len(results),
        "canonical_output_sha256": fingerprint(results),
        "results": results,
    }
    dump(output_dir / "fixture-results.json", fixture_results)

    sources = load(source_dir / "sources.json")
    fingerprints = {
        "canonical_rendering": "UTF-8 sorted-key compact JSON; ensure_ascii=false; allow_nan=false",
        "source_bundle_sha256": fingerprint(sources),
        "inside_standards_sha256": fingerprint(inside),
        "inside_outside_comparison_sha256": fingerprint(comparison),
        "runtime_fixture_output_sha256": fixture_results["canonical_output_sha256"],
    }
    dump(output_dir / "fingerprints.json", fingerprints)
    decision = {
        "decision": "INSIDE_COASTAL_RS_STANDARDS_V0_READY",
        "verified_as_of": VERIFIED_THROUGH,
        "inside_rule_set_version": VERSION,
        "inside_rule_count": len(inside),
        "zones": len({rule["zone_code"] for rule in inside}),
        "supported_values_without_provenance": sum(not rule.get("provenance_sha256") for rule in inside),
        "o21934_inside_coastal": "CERTIFIED_EFFECTIVE_2025-09-21",
        "o22109_inside_coastal": "PENDING_NOT_EFFECTIVE",
        "parcel_compliance_evaluated": False,
        "development_capacity_calculated": False,
        "production_runtime_wiring": False,
        "parcel_v1_modified": False,
        "production_access": False,
    }
    dump(output_dir / "decision.json", decision)
    validation = {
        "rule_count": len(inside),
        "zone_counts": {zone: sum(rule["zone_code"] == zone for rule in inside) for zone in sorted({rule["zone_code"] for rule in inside})},
        "comparison_counts": counts,
        "o22109_conditions_removed": sum("131.0443(i)" in old.get("unresolved_dependencies", []) for old in outside),
        "footnote_7_conditioned_rules": sum("131-04D:7" in rule["unresolved_dependencies"] for rule in inside),
        "orphan_footnote_8_rules": sum("131-04D:8" in rule.get("exceptions", []) for rule in inside),
        "fixture_cases": len(results),
    }
    dump(output_dir / "validation.json", validation)
    dump(output_dir / "preservation.json", {
        "production_access": False,
        "production_mutation": False,
        "packet_11_frozen": True,
        "production_zoning_load": False,
        "selected_snapshot": False,
        "parcel_compliance_evaluated": False,
        "development_capacity_calculated": False,
        "production_runtime_wiring": False,
        "parcel_v1_modified": False,
        "deployed": False,
        "pushed": False,
    })
    names = STATIC + GENERATED[:-1]
    dump(output_dir / "integrity.json", {
        "algorithm": "sha256",
        "files": {name: hashlib.sha256((output_dir / name).read_bytes()).hexdigest() for name in names},
    })


if __name__ == "__main__":
    build()

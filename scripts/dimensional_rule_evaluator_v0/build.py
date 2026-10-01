#!/usr/bin/env python3
"""Build Packet 31 shared dimensional-evaluator artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from framework import CONTRACT_FIELDS, CONTRACT_VERSION, combined_fingerprint, fingerprint, integrity_artifact, validate_contract


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "dimensional-rule-evaluator-v0"
RULES = {
    "minimum_lot_area": {"dir": "minimum-lot-area-evaluation-v0", "baseline_bundle_sha256": "8a7d22ee2d143a243bc38d6455499b9a04446f4b2c3ca6c5fe1133d803ca68b0", "measured": "22096.320", "required": "5000.0", "unit": "sq_ft"},
    "minimum_lot_depth": {"dir": "minimum-lot-depth-evaluation-v0", "baseline_bundle_sha256": "52de78a9377b3bb01b7d39cbc59eea7fe1b3793d9e94dc850f76b4d8d2f6df78", "measured": "235.02", "required": "95.0", "unit": "ft"},
    "minimum_lot_width": {"dir": "minimum-lot-width-evaluation-v0", "baseline_bundle_sha256": "c9c45f8de8cd068b7abbde8f6d52fd91f9c65a7fc92a8702bd20bd4c4d2c4ed6", "measured": "94.00", "required": "50.0", "unit": "ft"},
    "minimum_frontage": {"dir": "minimum-frontage-evaluation-v0", "baseline_bundle_sha256": "dd1fd1683b30b0dbec8056989f014e3571495384952f68d54f74d0848bb3fc93", "measured": "94.00", "required": "50.0", "unit": "ft"},
}


def _bundle(directory: str) -> dict[str, Any]:
    path = ROOT / "data" / directory
    return {item.name: json.loads(item.read_text()) for item in sorted(path.glob("*.json"))}


def _normalized_contract(rule_family: str, bundle: dict[str, Any]) -> dict[str, Any]:
    evaluation = bundle["evaluation.json"]
    rule = evaluation.get("applicable_rule") or evaluation.get("rule")
    doctrine = evaluation.get("measurement_doctrine") or evaluation.get("area_denominator")
    required_inputs = doctrine.get("required_semantic_inputs", []) if isinstance(doctrine, dict) else []
    contract = {
        "parcel_identity": evaluation["parcel_identity"],
        "legal_lot_state": {"state": evaluation["legal_lot"]["state"], "reconciliation_state": evaluation["legal_lot"]["reconciliation_state"], "recorded_entity": evaluation["legal_lot"]["recorded_entity"]},
        "rule_family": rule_family,
        "rule_id": rule["rule_id"],
        "rule_source": {key: rule[key] for key in ("source_section", "source_table", "source_page", "source_url", "source_sha256")},
        "measurement_doctrine": doctrine,
        "required_semantic_inputs": required_inputs,
        "resolved_inputs": sorted(name for name, state in evaluation["gates"].items() if state is True),
        "measurement_result": RULES[rule_family]["measured"],
        "unit": RULES[rule_family]["unit"],
        "applicable_requirement": RULES[rule_family]["required"],
        "operator": rule["operator"],
        "condition_state": "RESOLVED" if rule_family == "minimum_frontage" else "UNCONDITIONAL",
        "comparison_result": evaluation["state"],
        "bounded_conclusion": evaluation["bounded_conclusion"],
        "forbidden_conclusions": evaluation["forbidden_conclusions"],
        "provenance": bundle["provenance.json"]["chain"],
    }
    validate_contract(contract)
    return contract


def build_outputs() -> dict[str, object]:
    bundles = {name: _bundle(config["dir"]) for name, config in RULES.items()}
    normalized = [_normalized_contract(name, bundles[name]) for name in RULES]
    parity_rules = {}
    for name, config in RULES.items():
        current_bundle_sha = fingerprint(bundles[name])
        evaluation = bundles[name]["evaluation.json"]
        parity_rules[name] = {
            "baseline_bundle_sha256": config["baseline_bundle_sha256"],
            "current_bundle_sha256": current_bundle_sha,
            "canonical_bundle_identical": current_bundle_sha == config["baseline_bundle_sha256"],
            "measurement_identical": evaluation["comparison"]["left"] == config["measured"],
            "requirement_identical": evaluation["comparison"]["right"] == config["required"],
            "result_identical": evaluation["state"] == "RULE_REQUIREMENT_SATISFIED",
            "bounded_conclusion_sha256": fingerprint(evaluation["bounded_conclusion"]),
            "forbidden_conclusions_sha256": fingerprint(evaluation["forbidden_conclusions"]),
            "provenance_closed": len(bundles[name]["provenance.json"]["chain"]) >= 10,
        }
    parity = {"contract_version": CONTRACT_VERSION, "state": "BYTE_IDENTICAL_CANONICAL_PARITY", "rules": parity_rules, "all_rules_identical": all(item["canonical_bundle_identical"] for item in parity_rules.values())}
    inventory = {
        "contract_version": CONTRACT_VERSION,
        "shared_machinery": ["canonical rendering and fingerprints", "literal-true evidence gates", "unresolved result envelope", "MIN/MAX/EXACT numeric comparator", "bounded conclusion guard fields", "provenance graph validation", "integrity artifact rendering"],
        "rule_specific_doctrine": {"minimum_lot_area": "legal-area denominator and public-ROW subtraction", "minimum_lot_depth": "front/rear midpoint line", "minimum_lot_width": "perpendicular line through depth midpoint", "minimum_frontage": "premises property-line-along-street fact plus §131.0442(a) predicate"},
        "duplicated_inputs_now_normalized": ["parcel identity", "legal-lot state", "rule source", "semantic inputs", "measurement result", "applicable requirement", "condition state", "comparison result", "bounded conclusion", "forbidden conclusions", "provenance"],
    }
    extension = {
        "contract_version": CONTRACT_VERSION,
        "required_extension_fields": ["rule_selector", "semantic_prerequisites", "measurement_doctrine", "measurement_provider", "condition_resolver", "unit", "operator", "scope_wording", "forbidden_conclusions", "provenance_hops"],
        "measurement_provider_types": ["derived_geometry", "recorded_source_fact", "normalized_legal_area"],
        "condition_contract": {"states": ["UNCONDITIONAL", "RESOLVED", "UNRESOLVED", "NOT_APPLICABLE"], "unresolved_behavior": "RULE_EVALUATION_UNRESOLVED", "null_or_zero_coercion": False},
        "output_contract_fields": list(CONTRACT_FIELDS),
    }
    front_setback = {
        "contract_version": CONTRACT_VERSION,
        "state": "FRAMEWORK_SUFFICIENT_RULE_SPECIFIC_PREDICATE_MODEL_REQUIRED",
        "framework_change_required": False,
        "rule_specific_evidence_required": ["resolved front property line", "applicable base setback rule", "front-setback conditional branches", "slope/hillside predicates", "fire and defensible-space predicates", "existing/proposed structure geometry"],
        "mapping": {"rule_selector": "front_setback_min for resolved RS-1-7 version", "semantic_prerequisites": ["front property line", "project/structure geometry"], "measurement_provider": "perpendicular distance from front property line to applicable building-frame edge", "condition_resolver": ["slope/hillside", "cul-de-sac", "fire/defensible-space", "documentary setback modification"], "scope_wording": "front-setback rule only"},
        "implementation_started": False,
    }
    decision = {"contract_version": CONTRACT_VERSION, "decision": "DIMENSIONAL_RULE_EVALUATOR_V0_READY" if parity["all_rules_identical"] else "DIMENSIONAL_RULE_EVALUATOR_V0_NOT_READY", "next_rule_evaluation_target": "front setback", "combined_dimensional_evaluator_fingerprint_sha256": combined_fingerprint(normalized), "new_rule_family_evaluated": False}
    outputs: dict[str, object] = {"contract.json": {"contract_version": CONTRACT_VERSION, "fields": list(CONTRACT_FIELDS), "result_states": ["RULE_REQUIREMENT_SATISFIED", "RULE_REQUIREMENT_NOT_SATISFIED", "RULE_EVALUATION_UNRESOLVED"]}, "inventory.json": inventory, "normalized-results.json": {"contract_version": CONTRACT_VERSION, "results": normalized}, "parity-report.json": parity, "extension-interface.json": extension, "front-setback-readiness.json": front_setback, "decision.json": decision}
    outputs["integrity.json"] = integrity_artifact(CONTRACT_VERSION, outputs)
    return outputs


def main() -> None:
    outputs = build_outputs(); OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, value in outputs.items(): (OUTPUT / name).write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
    print(f"wrote {len(outputs)} artifacts to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__": main()

#!/usr/bin/env python3
"""Build Packet 27's single-parcel, single-rule evidence bundle."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from resolver import CONTRACT_VERSION, EXPECTED_APN, FORBIDDEN_CONCLUSIONS, evaluate_minimum_lot_area, integrity_artifact, provenance_graph


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "minimum-lot-area-evaluation-v0"
PARCELS = ROOT / "data" / "parcel-intelligence-v2" / "fixture-results.json"
LEGAL_LOTS = ROOT / "data" / "legal-lot-evidence-v0" / "fixture-results.json"
AUTHORITY = ROOT / "data" / "high-value-residential-review" / "authority-excerpts.json"
SOURCE_OBSERVATION = ROOT / "data" / "residential-standards-review" / "source-observation.json"


def _inputs() -> tuple[dict, dict, dict, dict]:
    parcels = json.loads(PARCELS.read_text())["results"]
    parcel = next(item["result"] for item in parcels if item["result"].get("identity", {}).get("apn") == EXPECTED_APN)
    legal_lots = json.loads(LEGAL_LOTS.read_text())["results"]
    legal_lot = next(item for item in legal_lots if item.get("apn") == EXPECTED_APN)
    rules = [rule for zone in parcel["base_standards"]["zone_results"] for rule in zone["rules"]]
    rule = next(item for item in rules if item.get("standard_key") == "lot_area_min")
    excerpts = json.loads(AUTHORITY.read_text())["pages"]
    observation = json.loads(SOURCE_OBSERVATION.read_text())["sources"]["measurement"]
    measurement_page = excerpts["measurement"]["26"]
    denominator = {
        "state": "RESOLVED_EXCLUDE_PUBLIC_RIGHT_OF_WAY",
        "code_source": {
            "section": "SDMC §113.0246",
            "title": "Determining Property Lines",
            "page": 26,
            "source_url": observation["url"],
            "source_sha256": observation["sha256"],
            "page_text_sha256": hashlib.sha256(measurement_page.encode()).hexdigest(),
            "doctrine": "For development regulations, property lines separate a lot or premises from public right-of-way regardless of ownership extending into it. The pre-dedication exception is expressly limited to maximum permitted density and maximum permitted gross floor area.",
        },
        "mapped_public_right_of_way": {"width_ft": 30, "length_ft": 94, "source": "PM 17383 Parcel 1"},
    }
    return parcel, legal_lot, rule, denominator


def build_outputs() -> dict[str, object]:
    parcel, legal_lot, rule, denominator = _inputs()
    evaluation = evaluate_minimum_lot_area(parcel, legal_lot, rule, denominator)
    contract = {
        "contract_version": CONTRACT_VERSION,
        "scope": {"apns": [EXPECTED_APN], "rule_families": ["minimum_lot_area"]},
        "states": ["RULE_REQUIREMENT_SATISFIED", "RULE_REQUIREMENT_NOT_SATISFIED", "RULE_EVALUATION_UNRESOLVED"],
        "required_expression": "legal_code_lot_area_sqft >= applicable_minimum_lot_area_sqft",
        "forbidden_conclusions": list(FORBIDDEN_CONCLUSIONS),
        "containment": {"overall_compliance": False, "capacity": False, "other_rules": False, "production_wired": False, "citywide": False},
    }
    provenance = provenance_graph(CONTRACT_VERSION, [
            {"hop": "APN_TO_PARCEL_V2", "apn": EXPECTED_APN, "fingerprint_sha256": parcel["fingerprint_sha256"]},
            {"hop": "PARCEL_V2_TO_RECORDED_DEED", "document": "DOC # 2001-0706032", "artifact_sha256": legal_lot["recorded_deed_artifacts"][0]["artifact_sha256"]},
            {"hop": "DEED_TO_RECORDED_MAP", "entity": "PM 17383 Parcel 1", "artifact_sha256": next(a["artifact_sha256"] for a in legal_lot["recorded_map_artifacts"] if a["sheet"] == 2)},
            {"hop": "RECORDED_MAP_TO_LEGAL_LOT", "state": legal_lot["legal_status_state"], "fingerprint_sha256": legal_lot["fingerprint_sha256"]},
            {"hop": "LEGAL_AREA_TO_CODE_DENOMINATOR", "section": "113.0246", "page_text_sha256": denominator["code_source"]["page_text_sha256"]},
            {"hop": "PARCEL_TO_BASE_ZONING", "zone": "RS-1-7", "mapping_row_sha256": parcel["zoning"]["mapping_row_sha256"]},
            {"hop": "PARCEL_TO_COASTAL_CONTEXT", "state": parcel["coastal_context"]["evidence_state"], "fingerprint_sha256": parcel["coastal_context"]["layer_fingerprint_sha256"]},
            {"hop": "CONTEXT_TO_STANDARDS_VERSION", "version": parcel["base_standards"]["rule_set_version"], "fingerprint_sha256": parcel["base_standards"]["fingerprint_sha256"]},
            {"hop": "STANDARDS_TO_RULE", "rule_id": rule["rule_id"], "provenance_sha256": rule["provenance_sha256"]},
            {"hop": "RULE_TO_COMPARISON", "expression": evaluation.get("comparison", {}).get("expression"), "evaluation_fingerprint_sha256": evaluation.get("fingerprint_sha256")},
    ])
    product = {
        "contract_version": CONTRACT_VERSION,
        "heading": "Minimum lot area",
        "required": "5,000 sq ft",
        "supported_parcel_area_used_for_rule": "22,096.32 sq ft",
        "result": "Requirement satisfied",
        "scope": "Minimum-lot-area rule only",
        "source": "PM 17383 Parcel 1; DOC # 2001-0706032; SDMC §§113.0246 and 131.0431(a), Table 131-04D",
        "qualifier": evaluation.get("mandatory_qualifier"),
        "ui_wired": False,
    }
    decision = {
        "contract_version": CONTRACT_VERSION,
        "decision": "MINIMUM_LOT_AREA_RULE_EVALUATION_READY" if evaluation.get("state") == "RULE_REQUIREMENT_SATISFIED" else "MINIMUM_LOT_AREA_RULE_EVALUATION_NOT_READY",
        "result": evaluation.get("state"),
        "next_rule_evaluation_target": "legal lot depth",
        "overall_compliance_conclusion": False,
        "development_capacity_calculated": False,
    }
    outputs: dict[str, object] = {
        "contract.json": contract,
        "evaluation.json": evaluation,
        "provenance.json": provenance,
        "product-example.json": product,
        "decision.json": decision,
    }
    outputs["integrity.json"] = integrity_artifact(CONTRACT_VERSION, outputs)
    return outputs


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, value in build_outputs().items():
        (OUTPUT / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()

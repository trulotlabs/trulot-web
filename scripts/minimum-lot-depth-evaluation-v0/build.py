#!/usr/bin/env python3
"""Build Packet 28's single-parcel, single-rule evidence bundle."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from resolver import CONTRACT_VERSION, EXPECTED_APN, FORBIDDEN_CONCLUSIONS, canonical_json, evaluate_minimum_lot_depth


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "minimum-lot-depth-evaluation-v0"
PARCELS = ROOT / "data" / "parcel-intelligence-v2" / "fixture-results.json"
LEGAL_LOTS = ROOT / "data" / "legal-lot-evidence-v0" / "fixture-results.json"
AUTHORITY = ROOT / "data" / "high-value-residential-review" / "authority-excerpts.json"
SOURCE_OBSERVATION = ROOT / "data" / "residential-standards-review" / "source-observation.json"


def sha(value: object) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def _inputs() -> tuple[dict, dict, dict, dict]:
    parcels = json.loads(PARCELS.read_text())["results"]
    parcel = next(item["result"] for item in parcels if item["result"].get("identity", {}).get("apn") == EXPECTED_APN)
    legal_lots = json.loads(LEGAL_LOTS.read_text())["results"]
    legal_lot = next(item for item in legal_lots if item.get("apn") == EXPECTED_APN)
    rules = [rule for zone in parcel["base_standards"]["zone_results"] for rule in zone["rules"]]
    rule = next(item for item in rules if item.get("standard_key") == "lot_depth_min")
    excerpts = json.loads(AUTHORITY.read_text())["pages"]
    sources = json.loads(SOURCE_OBSERVATION.read_text())["sources"]
    depth_page = excerpts["measurement"]["25"]
    line_pages = excerpts["measurement"]["26"] + excerpts["measurement"]["27"]
    measurement = {
        "depth_definition_state": "RESOLVED_MIDPOINT_TO_MIDPOINT",
        "geometry_state": "RECORDED_MAP_SUFFICIENT",
        "lot_depth": {
            "section": "SDMC §113.0243(a)",
            "definition": "Lot depth is measured along an imaginary straight line drawn from the midpoint of the front property line to the midpoint of the rear property line.",
            "page": 25,
            "source_url": sources["measurement"]["url"],
            "source_sha256": sources["measurement"]["sha256"],
            "page_text_sha256": hashlib.sha256(depth_page.encode()).hexdigest(),
            "edition": "7-2026",
        },
        "front_property_line": {
            "state": "RESOLVED_27TH_STREET_RIGHT_OF_WAY_BOUNDARY",
            "section": "SDMC §113.0246(a)",
            "basis": "The front property line separates a lot from public right-of-way. Parcel 1 has one street adjacency, 27th Street, so the 94.00-foot north-south line at the west edge of that right-of-way is the front property line.",
        },
        "rear_property_line": {
            "state": "RESOLVED_OPPOSITE_MOST_DISTANT_WEST_LINE",
            "section": "SDMC §113.0246(c)",
            "basis": "The 94.00-foot west line is opposite and most distant from the resolved front property line.",
        },
        "right_of_way_treatment": {
            "state": "RESOLVED_USE_BOUNDARY_SEPARATING_LOT_FROM_PUBLIC_RIGHT_OF_WAY",
            "section": "SDMC §113.0246",
            "basis": "Property lines used to apply development regulations separate the lot from public right-of-way regardless of ownership extending into it. The 30-foot dedicated 27th Street portion is therefore outside the front-to-rear depth geometry.",
        },
        "property_line_source": {
            "pages": [26, 27],
            "source_url": sources["measurement"]["url"],
            "source_sha256": sources["measurement"]["sha256"],
            "page_text_sha256": hashlib.sha256(line_pages.encode()).hexdigest(),
            "edition": "7-2026",
        },
        "configuration": {
            "corner_lot": False,
            "double_fronted_lot": False,
            "triangular_lot": False,
            "irregular_lot_special_depth_rule": False,
            "reason": "PM 17383 depicts a four-sided Parcel 1 with only the east boundary adjoining 27th Street; the Code states no separate lot-depth method for this configuration.",
        },
        "required_semantic_inputs": ["legal lot boundary", "public-right-of-way boundary", "front property line", "rear property line", "front and rear midpoints", "recorded connecting-line bearings and lengths", "applicable minimum depth"],
        "recorded_geometry": {
            "rear_line": {"role": "rear property line", "boundary": "west", "length_ft": 94.00},
            "front_line": {"role": "front property line", "boundary": "west edge of 27th Street right-of-way", "length_ft": 94.00},
            "north_rear_to_front": {"bearing": "N 89°55′05″ E", "length_ft": 235.04},
            "south_rear_to_front": {"bearing": "N 89°54′59″ E (reverse of recorded S 89°54′59″ W)", "length_ft": 235.00},
            "excluded_dedicated_street_portion": {"width_ft": 30, "frontage_length_ft": 94},
            "record": "PM 17383 Parcel 1, sheet 2",
            "artifact_sha256": next(a["artifact_sha256"] for a in legal_lot["recorded_map_artifacts"] if a["sheet"] == 2),
        },
    }
    return parcel, legal_lot, rule, measurement


def build_outputs() -> dict[str, object]:
    parcel, legal_lot, rule, measurement = _inputs()
    evaluation = evaluate_minimum_lot_depth(parcel, legal_lot, rule, measurement)
    contract = {
        "contract_version": CONTRACT_VERSION,
        "scope": {"apns": [EXPECTED_APN], "rule_families": ["minimum_lot_depth"]},
        "states": ["RULE_REQUIREMENT_SATISFIED", "RULE_REQUIREMENT_NOT_SATISFIED", "RULE_EVALUATION_UNRESOLVED"],
        "required_expression": "code_defined_lot_depth_ft >= minimum_lot_depth_ft",
        "forbidden_conclusions": list(FORBIDDEN_CONCLUSIONS),
        "containment": {"overall_compliance": False, "capacity": False, "width": False, "frontage": False, "setbacks": False, "far": False, "production_wired": False, "citywide": False},
    }
    provenance = {
        "contract_version": CONTRACT_VERSION,
        "chain": [
            {"hop": "APN_TO_PARCEL_V2", "apn": EXPECTED_APN, "fingerprint_sha256": parcel["fingerprint_sha256"]},
            {"hop": "PARCEL_V2_TO_RECORDED_DEED", "document": "DOC # 2001-0706032", "artifact_sha256": legal_lot["recorded_deed_artifacts"][0]["artifact_sha256"]},
            {"hop": "DEED_TO_RECORDED_MAP", "entity": "PM 17383 Parcel 1", "artifact_sha256": measurement["recorded_geometry"]["artifact_sha256"]},
            {"hop": "RECORDED_MAP_TO_LEGAL_LOT", "state": legal_lot["legal_status_state"], "fingerprint_sha256": legal_lot["fingerprint_sha256"]},
            {"hop": "MAP_TO_FRONT_REAR_LINES", "sections": ["113.0246(a)", "113.0246(c)"], "page_text_sha256": measurement["property_line_source"]["page_text_sha256"]},
            {"hop": "LINES_TO_CODE_DEPTH", "section": "113.0243(a)", "page_text_sha256": measurement["lot_depth"]["page_text_sha256"], "value_ft": evaluation.get("geometry_reconstruction", {}).get("reported_code_defined_lot_depth_ft")},
            {"hop": "PARCEL_TO_BASE_ZONING", "zone": "RS-1-7", "mapping_row_sha256": parcel["zoning"]["mapping_row_sha256"]},
            {"hop": "PARCEL_TO_COASTAL_CONTEXT", "state": parcel["coastal_context"]["evidence_state"], "fingerprint_sha256": parcel["coastal_context"]["layer_fingerprint_sha256"]},
            {"hop": "CONTEXT_TO_STANDARDS_VERSION", "version": parcel["base_standards"]["rule_set_version"], "fingerprint_sha256": parcel["base_standards"]["fingerprint_sha256"]},
            {"hop": "STANDARDS_TO_RULE", "rule_id": rule["rule_id"], "provenance_sha256": rule["provenance_sha256"]},
            {"hop": "RULE_TO_COMPARISON", "expression": evaluation.get("comparison", {}).get("expression"), "evaluation_fingerprint_sha256": evaluation.get("fingerprint_sha256")},
        ],
    }
    product = {
        "contract_version": CONTRACT_VERSION,
        "heading": "Minimum lot depth",
        "required": "95 ft",
        "supported_measured_depth": "235.02 ft",
        "result": "RULE_REQUIREMENT_SATISFIED",
        "measurement_basis": "SDMC §§113.0243(a) and 113.0246 applied to PM 17383 Parcel 1 recorded map geometry",
        "scope": "Minimum-lot-depth rule only",
        "source": "PM 17383 Parcel 1; DOC # 2001-0706032; SDMC §§113.0243, 113.0246, and 131.0431(a), Table 131-04D",
        "qualifier": evaluation.get("mandatory_qualifier"),
        "ui_wired": False,
    }
    decision = {
        "contract_version": CONTRACT_VERSION,
        "decision": "MINIMUM_LOT_DEPTH_RULE_EVALUATION_READY" if evaluation.get("state") in {"RULE_REQUIREMENT_SATISFIED", "RULE_REQUIREMENT_NOT_SATISFIED"} else "MINIMUM_LOT_DEPTH_RULE_EVALUATION_NOT_READY",
        "result": evaluation.get("state"),
        "next_rule_evaluation_target": "legal lot width",
        "overall_compliance_conclusion": False,
        "development_capacity_calculated": False,
    }
    outputs: dict[str, object] = {"contract.json": contract, "evaluation.json": evaluation, "provenance.json": provenance, "product-example.json": product, "decision.json": decision}
    outputs["integrity.json"] = {"contract_version": CONTRACT_VERSION, "artifacts": {name: sha(value) for name, value in outputs.items()}, "bundle_sha256": sha(outputs)}
    return outputs


def main() -> None:
    outputs = build_outputs()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, value in outputs.items():
        (OUTPUT / name).write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
    print(f"wrote {len(outputs)} artifacts to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

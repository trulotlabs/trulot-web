#!/usr/bin/env python3
"""Build Packet 29's single-parcel, single-rule evidence bundle."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from resolver import CONTRACT_VERSION, EXPECTED_APN, FORBIDDEN_CONCLUSIONS, canonical_json, evaluate_minimum_lot_width, integrity_artifact, provenance_graph

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "minimum-lot-width-evaluation-v0"
PARCELS = ROOT / "data" / "parcel-intelligence-v2" / "fixture-results.json"
LEGAL_LOTS = ROOT / "data" / "legal-lot-evidence-v0" / "fixture-results.json"
AUTHORITY = ROOT / "data" / "high-value-residential-review" / "authority-excerpts.json"
SOURCE_OBSERVATION = ROOT / "data" / "residential-standards-review" / "source-observation.json"


def _inputs() -> tuple[dict, dict, dict, dict, dict]:
    parcels = json.loads(PARCELS.read_text())["results"]
    parcel = next(x["result"] for x in parcels if x["result"].get("identity", {}).get("apn") == EXPECTED_APN)
    legal_lot = next(x for x in json.loads(LEGAL_LOTS.read_text())["results"] if x.get("apn") == EXPECTED_APN)
    rules = [r for z in parcel["base_standards"]["zone_results"] for r in z["rules"]]
    standard_rule = next(r for r in rules if r.get("standard_key") == "lot_width_min")
    corner_rule = next(r for r in rules if r.get("standard_key") == "corner_lot_width_min")
    pages = json.loads(AUTHORITY.read_text())["pages"]["measurement"]
    source = json.loads(SOURCE_OBSERVATION.read_text())["sources"]["measurement"]
    width_page = pages["25"]
    property_pages = pages["26"] + pages["27"] + pages["28"]
    map_sha = next(a["artifact_sha256"] for a in legal_lot["recorded_map_artifacts"] if a["sheet"] == 2)
    authority = {
        "width_definition_state": "RESOLVED_PERPENDICULAR_AT_DEPTH_MIDPOINT", "property_line_roles_state": "RESOLVED", "geometry_state": "RECORDED_MAP_SUFFICIENT",
        "lot_width": {"section": "SDMC §113.0243(b)", "definition": "Lot width is measured along an imaginary straight line drawn at right angles to the lot depth line, between the side lot lines at the point midway between the front and rear property lines.", "page": 25, "source_url": source["url"], "source_sha256": source["sha256"], "page_text_sha256": hashlib.sha256(width_page.encode()).hexdigest(), "edition": "7-2026"},
        "irregular_lot_disposition": {"section": "SDMC §113.0243(c)(1)", "state": "NOT_APPLICABLE", "basis": "PM 17383 Parcel 1 is a regular four-sided near-rectangle with equal 94.00-foot front and rear lines and nearly parallel side lines, not an irregular or pie-shaped lot."},
        "lot_classification": {"state": "SINGLE_FRONTAGE_INTERIOR_NON_CORNER", "display": "interior (single-frontage, non-corner)", "corner_lot": False, "double_fronted_lot": False, "through_lot": False, "basis": "PM 17383 shows only the east line adjoining 27th Street. There is no second adjacent street line as in §113.0246(a)/(d) corner-lot geometry and no opposite street frontage under §113.0246(b)."},
        "property_lines": {"front": "east boundary at west edge of 27th Street right-of-way", "rear": "opposite and most distant west boundary", "sides": ["north rear-to-front boundary", "south rear-to-front boundary"], "sections": ["SDMC §113.0246(a)", "SDMC §113.0246(b)", "SDMC §113.0246(c)", "SDMC §113.0246(d)"], "source_url": source["url"], "source_sha256": source["sha256"], "page_text_sha256": hashlib.sha256(property_pages.encode()).hexdigest(), "edition": "7-2026"},
        "right_of_way_treatment": {"state": "RESOLVED_USE_BOUNDARY_SEPARATING_LOT_FROM_PUBLIC_RIGHT_OF_WAY", "section": "SDMC §113.0246", "basis": "Development-regulation property lines separate the lot from public right-of-way regardless of ownership extending into it; width geometry uses the front line at the west edge of 27th Street."},
        "required_semantic_inputs": ["legal lot boundary", "public-right-of-way boundary", "lot classification", "front and rear property lines", "side property lines", "lot depth line and midpoint", "perpendicular width line", "applicable standard or corner minimum"],
        "recorded_geometry": {"rear_line": {"bearing": "N 00°04′59″ W", "length_ft": 94.00}, "front_line": {"bearing": "N 00°03′42″ W", "length_ft": 94.00}, "north_rear_to_front": {"bearing": "N 89°55′05″ E", "length_ft": 235.04}, "south_rear_to_front": {"bearing": "N 89°54′59″ E", "length_ft": 235.00}, "excluded_dedicated_street_portion": {"width_ft": 30, "frontage_length_ft": 94}, "record": "PM 17383 Parcel 1, sheet 2", "artifact_sha256": map_sha},
    }
    return parcel, legal_lot, standard_rule, corner_rule, authority


def build_outputs() -> dict[str, object]:
    parcel, legal_lot, standard_rule, corner_rule, authority = _inputs()
    evaluation = evaluate_minimum_lot_width(parcel, legal_lot, standard_rule, corner_rule, authority)
    contract = {"contract_version": CONTRACT_VERSION, "scope": {"apns": [EXPECTED_APN], "rule_families": ["minimum_lot_width"]}, "states": ["RULE_REQUIREMENT_SATISFIED", "RULE_REQUIREMENT_NOT_SATISFIED", "RULE_EVALUATION_UNRESOLVED"], "required_expression": "code_defined_lot_width_ft >= applicable_minimum_width_ft", "forbidden_conclusions": list(FORBIDDEN_CONCLUSIONS), "containment": {"overall_compliance": False, "capacity": False, "frontage": False, "setbacks": False, "far": False, "production_wired": False, "citywide": False}}
    provenance = provenance_graph(CONTRACT_VERSION, [
        {"hop": "APN_TO_PARCEL_V2", "apn": EXPECTED_APN, "fingerprint_sha256": parcel["fingerprint_sha256"]},
        {"hop": "PARCEL_V2_TO_RECORDED_DEED", "document": "DOC # 2001-0706032", "artifact_sha256": legal_lot["recorded_deed_artifacts"][0]["artifact_sha256"]},
        {"hop": "DEED_TO_RECORDED_MAP", "entity": "PM 17383 Parcel 1", "artifact_sha256": authority["recorded_geometry"]["artifact_sha256"]},
        {"hop": "MAP_TO_LOT_CLASSIFICATION", "state": authority["lot_classification"]["state"], "sections": authority["property_lines"]["sections"]},
        {"hop": "MAP_TO_PROPERTY_LINES", "state": authority["property_line_roles_state"], "page_text_sha256": authority["property_lines"]["page_text_sha256"]},
        {"hop": "LINES_TO_CODE_WIDTH", "section": "113.0243(b)", "page_text_sha256": authority["lot_width"]["page_text_sha256"], "value_ft": evaluation.get("geometry_reconstruction", {}).get("reported_code_defined_lot_width_ft")},
        {"hop": "PARCEL_TO_BASE_ZONING", "zone": "RS-1-7", "mapping_row_sha256": parcel["zoning"]["mapping_row_sha256"]},
        {"hop": "PARCEL_TO_COASTAL_CONTEXT", "state": parcel["coastal_context"]["evidence_state"], "fingerprint_sha256": parcel["coastal_context"]["layer_fingerprint_sha256"]},
        {"hop": "CONTEXT_TO_STANDARDS_VERSION", "version": parcel["base_standards"]["rule_set_version"], "fingerprint_sha256": parcel["base_standards"]["fingerprint_sha256"]},
        {"hop": "CLASSIFICATION_TO_APPLICABLE_RULE", "selected_rule_id": standard_rule["rule_id"], "excluded_corner_rule_id": corner_rule["rule_id"]},
        {"hop": "RULE_TO_COMPARISON", "expression": evaluation.get("comparison", {}).get("expression"), "evaluation_fingerprint_sha256": evaluation.get("fingerprint_sha256")},
    ])
    product = {"contract_version": CONTRACT_VERSION, "heading": "Minimum lot width", "required": "50 ft", "supported_measured_width": "94.00 ft", "lot_type": "interior (single-frontage, non-corner)", "result": "RULE_REQUIREMENT_SATISFIED", "measurement_basis": "SDMC §§113.0243(b) and 113.0246 applied to PM 17383 Parcel 1", "scope": "Minimum-lot-width rule only", "source": "PM 17383 Parcel 1; DOC # 2001-0706032; SDMC §§113.0243, 113.0246, and 131.0431(a), Table 131-04D", "qualifier": evaluation.get("mandatory_qualifier"), "ui_wired": False}
    decision = {"contract_version": CONTRACT_VERSION, "decision": "MINIMUM_LOT_WIDTH_RULE_EVALUATION_READY" if evaluation.get("state") in {"RULE_REQUIREMENT_SATISFIED", "RULE_REQUIREMENT_NOT_SATISFIED"} else "MINIMUM_LOT_WIDTH_RULE_EVALUATION_NOT_READY", "result": evaluation.get("state"), "next_rule_evaluation_target": "frontage", "overall_compliance_conclusion": False, "development_capacity_calculated": False}
    outputs: dict[str, object] = {"contract.json": contract, "evaluation.json": evaluation, "provenance.json": provenance, "product-example.json": product, "decision.json": decision}
    outputs["integrity.json"] = integrity_artifact(CONTRACT_VERSION, outputs)
    return outputs


def main() -> None:
    outputs = build_outputs(); OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, value in outputs.items(): (OUTPUT / name).write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
    print(f"wrote {len(outputs)} artifacts to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__": main()

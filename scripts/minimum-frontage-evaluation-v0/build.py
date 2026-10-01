#!/usr/bin/env python3
"""Build Packet 30's single-parcel, single-rule evidence bundle."""

from __future__ import annotations
import hashlib, json
from pathlib import Path
from resolver import CONTRACT_VERSION, EXPECTED_APN, FORBIDDEN_CONCLUSIONS, canonical_json, evaluate_minimum_frontage

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "minimum-frontage-evaluation-v0"
PARCELS = ROOT / "data" / "parcel-intelligence-v2" / "fixture-results.json"
LEGAL_LOTS = ROOT / "data" / "legal-lot-evidence-v0" / "fixture-results.json"
AUTHORITY = ROOT / "data" / "high-value-residential-review" / "authority-excerpts.json"
SOURCE_OBSERVATION = ROOT / "data" / "residential-standards-review" / "source-observation.json"


def sha(value: object) -> str: return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def _inputs() -> tuple[dict, dict, dict, dict]:
    parcels = json.loads(PARCELS.read_text())["results"]
    parcel = next(x["result"] for x in parcels if x["result"].get("identity", {}).get("apn") == EXPECTED_APN)
    legal_lot = next(x for x in json.loads(LEGAL_LOTS.read_text())["results"] if x.get("apn") == EXPECTED_APN)
    rules = [r for z in parcel["base_standards"]["zone_results"] for r in z["rules"]]
    rule = next(r for r in rules if r.get("standard_key") == "street_frontage_min")
    excerpts = json.loads(AUTHORITY.read_text())["pages"]
    sources = json.loads(SOURCE_OBSERVATION.read_text())["sources"]
    definition_page = excerpts["definitions"]["27"]
    property_page = excerpts["measurement"]["26"]
    exception_page = excerpts["residential"]["47"]
    map_sha = next(a["artifact_sha256"] for a in legal_lot["recorded_map_artifacts"] if a["sheet"] == 2)
    authority = {
        "frontage_definition_state": "RESOLVED_PROPERTY_LINE_ALONG_STREET", "lot_classification_state": "SINGLE_FRONTAGE_INTERIOR_NON_CORNER", "geometry_state": "RECORDED_MAP_SUFFICIENT",
        "street_frontage": {"definition": "Street frontage means the length of one premises’ property line along the street it borders.", "source": "SDMC Chapter 11, Article 3, Division 1 definition of Street frontage", "page": 27, "edition": "7-2026", "source_url": sources["definitions"]["url"], "source_sha256": sources["definitions"]["sha256"], "page_text_sha256": hashlib.sha256(definition_page.encode()).hexdigest()},
        "front_property_line": {"state": "RESOLVED_27TH_STREET_RIGHT_OF_WAY_BOUNDARY", "section": "SDMC §113.0246(a)", "basis": "The front property line separates the lot from public right-of-way; PM 17383 shows the east Parcel 1 line bordering 27th Street.", "source_url": sources["measurement"]["url"], "source_sha256": sources["measurement"]["sha256"], "page_text_sha256": hashlib.sha256(property_page.encode()).hexdigest()},
        "right_of_way_treatment": {"state": "RESOLVED_PROPERTY_LINE_ALONG_STREET", "section": "SDMC §113.0246", "basis": "The frontage line is the premises property line separating Parcel 1 from the public right-of-way, not the street centerline, curb, or outer edge of dedicated right-of-way."},
        "street_geometry": {"state": "STRAIGHT_NOT_TURNAROUND", "basis": "PM 17383 sheet 2 depicts the 27th Street centerline and Parcel 1 street boundary as straight survey lines with bearing N 00°03′42″ W; no curve, radius, or turnaround is shown at the frontage."},
        "frontage_exception": {"state": "NOT_APPLICABLE", "section": "SDMC §131.0442(a)", "rule": "The RS/RM minimum is reduced to 60 percent only where a lot fronts principally on a turnaround or curving street with centerline radius under 100 feet.", "basis": "The recorded frontage is on a straight 27th Street segment, so neither predicate is present.", "source_url": sources["residential"]["url"], "source_sha256": sources["residential"]["sha256"], "page": 47, "page_text_sha256": hashlib.sha256(exception_page.encode()).hexdigest(), "edition": "7-2026"},
        "required_semantic_inputs": ["legal premises boundary", "street-adjoining property line", "public-right-of-way relationship", "recorded street adjacency", "line or curve length", "turnaround/curvature predicate", "lot classification", "applicable frontage rule"],
        "recorded_geometry": {"street_adjoining_property_line": {"street": "27th Street", "role": "front development-regulation property line", "bearing": "N 00°03′42″ W", "length_ft": 94.00, "geometry": "straight line"}, "street_centerline": {"bearing": "N 00°03′42″ W", "geometry": "straight line"}, "dedicated_right_of_way": {"width_ft": 30, "note": "Portion of 27th Street dedicated per Old Road Survey 172, January 20, 1890"}, "record": "PM 17383 Parcel 1, sheet 2", "artifact_sha256": map_sha},
    }
    return parcel, legal_lot, rule, authority


def build_outputs() -> dict[str, object]:
    parcel, legal_lot, rule, authority = _inputs(); evaluation = evaluate_minimum_frontage(parcel, legal_lot, rule, authority)
    contract = {"contract_version": CONTRACT_VERSION, "scope": {"apns": [EXPECTED_APN], "rule_families": ["minimum_frontage"]}, "states": ["RULE_REQUIREMENT_SATISFIED", "RULE_REQUIREMENT_NOT_SATISFIED", "RULE_EVALUATION_UNRESOLVED"], "required_expression": "code_defined_frontage_ft >= applicable_minimum_frontage_ft", "forbidden_conclusions": list(FORBIDDEN_CONCLUSIONS), "containment": {"legal_access": False, "driveway": False, "setbacks": False, "overall_compliance": False, "capacity": False, "production_wired": False, "citywide": False}}
    provenance = {"contract_version": CONTRACT_VERSION, "chain": [
        {"hop": "APN_TO_PARCEL_V2", "apn": EXPECTED_APN, "fingerprint_sha256": parcel["fingerprint_sha256"]},
        {"hop": "PARCEL_V2_TO_RECORDED_DEED", "document": "DOC # 2001-0706032", "artifact_sha256": legal_lot["recorded_deed_artifacts"][0]["artifact_sha256"]},
        {"hop": "DEED_TO_RECORDED_MAP", "entity": "PM 17383 Parcel 1", "artifact_sha256": authority["recorded_geometry"]["artifact_sha256"]},
        {"hop": "MAP_TO_STREET_PROPERTY_LINE", "state": authority["front_property_line"]["state"], "page_text_sha256": authority["front_property_line"]["page_text_sha256"]},
        {"hop": "PROPERTY_LINE_TO_CODE_FRONTAGE", "definition_page_text_sha256": authority["street_frontage"]["page_text_sha256"], "value_ft": evaluation.get("frontage_measurement", {}).get("code_defined_frontage_ft")},
        {"hop": "MAP_TO_EXCEPTION_PREDICATE", "street_geometry": authority["street_geometry"]["state"], "exception_state": authority["frontage_exception"]["state"]},
        {"hop": "PARCEL_TO_BASE_ZONING", "zone": "RS-1-7", "mapping_row_sha256": parcel["zoning"]["mapping_row_sha256"]},
        {"hop": "PARCEL_TO_COASTAL_CONTEXT", "state": parcel["coastal_context"]["evidence_state"], "fingerprint_sha256": parcel["coastal_context"]["layer_fingerprint_sha256"]},
        {"hop": "CONTEXT_TO_STANDARDS_VERSION", "version": parcel["base_standards"]["rule_set_version"], "fingerprint_sha256": parcel["base_standards"]["fingerprint_sha256"]},
        {"hop": "CONDITION_TO_APPLICABLE_RULE", "rule_id": rule["rule_id"], "condition_resolved": True, "provenance_sha256": rule["provenance_sha256"]},
        {"hop": "RULE_TO_COMPARISON", "expression": evaluation.get("comparison", {}).get("expression"), "evaluation_fingerprint_sha256": evaluation.get("fingerprint_sha256")},
    ]}
    product = {"contract_version": CONTRACT_VERSION, "heading": "Minimum frontage", "required": "50 ft", "supported_frontage": "94.00 ft", "street": "27th Street", "result": "RULE_REQUIREMENT_SATISFIED", "measurement_basis": "SDMC street-frontage definition and §§113.0246/131.0442(a) applied to PM 17383 Parcel 1", "scope": "Minimum-frontage rule only", "source": "PM 17383 Parcel 1; DOC # 2001-0706032; SDMC definition of street frontage; §§113.0246, 131.0431(a), and 131.0442(a)", "qualifier": evaluation.get("mandatory_qualifier"), "ui_wired": False}
    assessment = {"contract_version": CONTRACT_VERSION, "state": "DIMENSIONAL_EVALUATOR_PATTERN_READY", "completed_rule_families": ["minimum_lot_area", "minimum_lot_depth", "minimum_lot_width", "minimum_frontage"], "stable_stages": ["authoritative legal-lot evidence", "Code measurement doctrine", "geometry construction", "rule selection and condition resolution", "deterministic comparison", "bounded result", "provenance"], "refactor_performed": False, "recommended_follow_up": "Consolidate shared gates, provenance hops, comparison states, and containment fields in a separately bounded packet without changing sealed outputs."}
    decision = {"contract_version": CONTRACT_VERSION, "decision": "MINIMUM_FRONTAGE_RULE_EVALUATION_READY" if evaluation.get("state") in {"RULE_REQUIREMENT_SATISFIED", "RULE_REQUIREMENT_NOT_SATISFIED"} else "MINIMUM_FRONTAGE_RULE_EVALUATION_NOT_READY", "result": evaluation.get("state"), "dimensional_evaluator_assessment": assessment["state"], "next_rule_evaluation_target": "front setback", "overall_compliance_conclusion": False, "development_capacity_calculated": False}
    outputs: dict[str, object] = {"contract.json": contract, "evaluation.json": evaluation, "provenance.json": provenance, "product-example.json": product, "dimensional-evaluator-assessment.json": assessment, "decision.json": decision}
    outputs["integrity.json"] = {"contract_version": CONTRACT_VERSION, "artifacts": {name: sha(value) for name, value in outputs.items()}, "bundle_sha256": sha(outputs)}
    return outputs


def main() -> None:
    outputs = build_outputs(); OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, value in outputs.items(): (OUTPUT / name).write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
    print(f"wrote {len(outputs)} artifacts to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__": main()

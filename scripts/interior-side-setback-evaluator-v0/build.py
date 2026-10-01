#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json
from pathlib import Path
from typing import Any
from resolver import CONTRACT_VERSION, EXPECTED_APN, FORBIDDEN_CONCLUSIONS, evaluate_interior_side_setback, integrity_artifact, provenance_graph, validate_contract
ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "interior-side-setback-evaluator-v0"

def _json(path: str) -> Any: return json.loads((ROOT / path).read_text())

def _inputs() -> tuple[dict[str, Any], ...]:
    parcels = _json("data/parcel-intelligence-v2/fixture-results.json")["results"]
    parcel = next(x["result"] for x in parcels if x["result"].get("identity", {}).get("apn") == EXPECTED_APN)
    legal_lot = next(x for x in _json("data/legal-lot-evidence-v0/fixture-results.json")["results"] if x.get("apn") == EXPECTED_APN)
    width = _json("data/minimum-lot-width-evaluation-v0/evaluation.json")
    area = _json("data/minimum-lot-area-evaluation-v0/evaluation.json")
    rule = next(r for z in parcel["base_standards"]["zone_results"] for r in z["rules"] if r.get("standard_key") == "interior_side_setback_min")
    bundle = _json("data/structure-facts-v0/fixture-results.json")
    sr = next(r for r in bundle["results"] if r.get("parcel", {}).get("apn") == EXPECTED_APN)
    structure = {**sr["parcel"], "contract_version": bundle["contract_version"], "result_fingerprint_sha256": sr["fingerprint_sha256"]}
    fire = _json("data/fire-defensible-space-predicate-v0/evaluation.json")
    excerpts = _json("data/rs-base-standards-v0/source-excerpts.json")
    sources = _json("data/rs-base-standards-v0/sources.json")
    pages = _json("data/high-value-residential-review/authority-excerpts.json")["pages"]["measurement"]
    authority = {"section_131_0443_text_sha256": excerpts["131.0443"]["text_sha256"], "section_131_0461_text_sha256": excerpts["131.0461"]["text_sha256"], "residential_source": sources["sources"]["residential_division_4"], "measurement_source": sources["sources"]["measurement_rules"], "measurement_pages_text_sha256": hashlib.sha256((pages["28"] + pages["30"] + pages["31"]).encode()).hexdigest()}
    return parcel, legal_lot, rule, width, area, structure, fire, authority

def build_outputs() -> dict[str, object]:
    parcel, legal_lot, rule, width, area, structure, fire, authority = _inputs()
    evaluation = evaluate_interior_side_setback(parcel, legal_lot, rule, width, area, structure, fire, authority)
    provenance = provenance_graph(CONTRACT_VERSION, [
        {"hop": "APN_TO_PARCEL_V2", "apn": EXPECTED_APN, "fingerprint_sha256": parcel["fingerprint_sha256"]},
        {"hop": "PARCEL_TO_RECORDED_LOT", "entity": "PM 17383 Parcel 1", "fingerprint_sha256": legal_lot["fingerprint_sha256"]},
        {"hop": "RECORDED_MAP_TO_SIDE_LINES", "state": "RESOLVED_NORTH_AND_SOUTH_INTERIOR_SIDE_LINES", "artifact_sha256": next(x["artifact_sha256"] for x in legal_lot["recorded_map_artifacts"] if x["sheet"] == 2)},
        {"hop": "RECORDED_MAP_TO_CODE_LOT_WIDTH", "value_ft": width["geometry_reconstruction"]["reported_code_defined_lot_width_ft"], "fingerprint_sha256": width["fingerprint_sha256"]},
        {"hop": "RECORDED_MAP_TO_CODE_LOT_AREA", "value_sq_ft": area["area_denominator"]["code_lot_area_used"]["value"], "fingerprint_sha256": area["fingerprint_sha256"]},
        {"hop": "PARCEL_TO_BASE_ZONING", "zone": "RS-1-7", "mapping_row_sha256": parcel["zoning"]["mapping_row_sha256"]},
        {"hop": "PARCEL_TO_COASTAL_CONTEXT", "state": "OUTSIDE_COASTAL", "fingerprint_sha256": parcel["coastal_context"]["layer_fingerprint_sha256"]},
        {"hop": "TABLE_TO_BASE_RULE", "rule_id": rule["rule_id"], "source_sha256": rule["source_evidence"]["source_sha256"]},
        {"hop": "WIDTH_TO_SIDE_BRANCHES", "section": "131.0443(a)(4)", "section_text_sha256": authority["section_131_0443_text_sha256"], "narrow_lot": False, "reallocation_eligible": True},
        {"hop": "SECTION_TO_ELEMENT_BRANCHES", "section": "131.0461(a)", "section_text_sha256": authority["section_131_0461_text_sha256"]},
        {"hop": "PACKET_35_TO_FIRE_BRANCH", "state": fire["state"], "fingerprint_sha256": fire["fingerprint_sha256"]},
        {"hop": "MEASUREMENT_SEMANTICS", "sections": ["113.0246(d)", "113.0249", "113.0252(a)(2),(b)-(c)"], "page_text_sha256": authority["measurement_pages_text_sha256"]},
        {"hop": "PARCEL_TO_STRUCTURE_EVIDENCE", "contract_version": structure["contract_version"], "footprint_state": structure["footprint_linkage"]["state"]},
        {"hop": "PREDICATES_TO_REQUIREMENT_STATE", "state": evaluation["state"], "unresolved": evaluation["unresolved_requirement_predicates"]},
        {"hop": "REQUIREMENT_TO_COMPLIANCE_GATE", "state": evaluation["compliance_state"], "failed_gates": evaluation["compliance"]["failed_gates"]},
    ])
    framework = {"parcel_identity": evaluation["parcel_identity"], "legal_lot_state": evaluation["legal_lot"], "rule_family": "interior_side_setback", "rule_id": rule["rule_id"], "rule_source": {"source_section": rule["source_section"], "source_table": rule["source_table"], "source_page": rule["source_page"], "source_url": rule["source_url"], "source_sha256": rule["source_evidence"]["source_sha256"]}, "measurement_doctrine": evaluation["measurement_doctrine"], "required_semantic_inputs": evaluation["measurement_doctrine"]["required_inputs"], "resolved_inputs": ["parcel identity", "legal lot", "base zoning", "outside-Coastal context", "north and south interior-side lines", "Code-defined lot width", "Code lot area", "measurement direction", "building-frame edge semantics", "Packet 35 fire doctrine"], "measurement_result": None, "unit": "ft", "applicable_requirement": evaluation["valid_possible_requirement_branches"], "operator": "MIN", "condition_state": "UNRESOLVED", "comparison_result": "RULE_EVALUATION_UNRESOLVED", "bounded_conclusion": evaluation["bounded_conclusion"], "forbidden_conclusions": list(FORBIDDEN_CONCLUSIONS), "provenance": provenance["chain"]}
    validate_contract(framework)
    product = {"contract_version": CONTRACT_VERSION, "apn": EXPECTED_APN, "applicable_interior_side_setback": {"base_rule": "4 ft from each north and south interior side property line", "state": evaluation["state"], "alternate_branches": ["an established side setback may control an addition", "element-specific §131.0461(a) encroachment permissions may apply", "a greater Fire Official buffer may apply", "a controlling document, program, or overlay may modify the base line"], "excluded_branches": ["8-percent narrow-lot rule", "small-lot garage/non-habitable accessory-building encroachment", "front/street-side embankment garage"], "reallocation": "Available in principle because width is 94 ft, but it cannot reduce either interior side below the 4-ft table base for this two-interior-side configuration.", "unresolved_predicates": evaluation["unresolved_requirement_predicates"]}, "existing_structure": {"current_compliance_evaluated": False, "result": "SETBACK_COMPLIANCE_NOT_EVALUATED", "missing_evidence": ["resolved final project-specific requirement", "authoritative current structure geometry registered to legal side lines", "resolved structure/project and projection/encroachment classification", "established-side history if addition"], "historical_diagnostic": evaluation["historical_diagnostic"]}, "qualifier": evaluation["mandatory_qualifier"], "ui_wired": False}
    contract = {"contract_version": CONTRACT_VERSION, "scope": {"apns": [EXPECTED_APN], "rule_families": ["interior_side_setback"], "jurisdiction_profile": "outside-coastal-2026-09-30"}, "predicate_states": ["TRUE", "FALSE", "UNKNOWN", "SOURCE_UNAVAILABLE", "NOT_APPLICABLE"], "requirement_states": ["SETBACK_REQUIREMENT_RESOLVED", "SETBACK_REQUIREMENT_CONDITIONAL", "SETBACK_REQUIREMENT_SOURCE_UNAVAILABLE"], "compliance_states": ["RULE_REQUIREMENT_SATISFIED", "RULE_REQUIREMENT_NOT_SATISFIED", "RULE_EVALUATION_UNRESOLVED", "SETBACK_COMPLIANCE_NOT_EVALUATED"], "forbidden_conclusions": list(FORBIDDEN_CONCLUSIONS), "shared_framework": "dimensional-rule-evaluator-v0-2026-10-01-p31", "fire_dependency": "fire-defensible-space-predicate-v0-2026-10-01-p35"}
    decision = {"contract_version": CONTRACT_VERSION, "decision": "INTERIOR_SIDE_SETBACK_EVALUATOR_V0_READY", "applicable_setback_state": evaluation["state"], "ordinary_base_value_ft_each_side": 4, "compliance_result": evaluation["compliance_state"], "setback_family_pattern": evaluation["setback_family_assessment"]["state"], "next_rule_evaluation_target": evaluation["next_rule_evaluation_target"], "development_capacity_calculated": False, "overall_compliance_conclusion": False}
    outputs: dict[str, object] = {"contract.json": contract, "evaluation.json": evaluation, "framework-contract.json": framework, "provenance.json": provenance, "product-example.json": product, "decision.json": decision}
    outputs["integrity.json"] = integrity_artifact(CONTRACT_VERSION, outputs)
    return outputs

def main() -> None:
    outputs = build_outputs(); OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, value in outputs.items(): (OUTPUT / name).write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
    print(f"wrote {len(outputs)} artifacts to {OUTPUT.relative_to(ROOT)}")
if __name__ == "__main__": main()

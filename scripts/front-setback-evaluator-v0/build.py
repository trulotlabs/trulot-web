#!/usr/bin/env python3
"""Build Packet 32 front-setback evaluator artifacts."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from resolver import CONTRACT_VERSION, EXPECTED_APN, FORBIDDEN_CONCLUSIONS, evaluate_front_setback, fingerprint, integrity_artifact, provenance_graph, validate_contract


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "front-setback-evaluator-v0"


def _json(path: str) -> Any:
    return json.loads((ROOT / path).read_text())


def _inputs() -> tuple[dict[str, Any], ...]:
    parcels = _json("data/parcel-intelligence-v2/fixture-results.json")["results"]
    parcel = next(x["result"] for x in parcels if x["result"].get("identity", {}).get("apn") == EXPECTED_APN)
    legal_lot = next(x for x in _json("data/legal-lot-evidence-v0/fixture-results.json")["results"] if x.get("apn") == EXPECTED_APN)
    rule = next(r for z in parcel["base_standards"]["zone_results"] for r in z["rules"] if r.get("standard_key") == "front_setback_min")
    proposal = next(r for r in _json("data/high-value-residential-review/setback-proposals.json")["records"] if r.get("zone_code") == "RS-1-7" and r.get("standard_type") == "front_setback")
    structure_bundle = _json("data/structure-facts-v0/fixture-results.json")
    structure_result = next(r for r in structure_bundle["results"] if r.get("parcel", {}).get("apn") == EXPECTED_APN)
    structure = {**structure_result["parcel"], "contract_version": structure_bundle["contract_version"], "result_fingerprint_sha256": structure_result["fingerprint_sha256"]}
    excerpts = _json("data/rs-base-standards-v0/source-excerpts.json")
    sources = _json("data/rs-base-standards-v0/sources.json")
    measurement_pages = _json("data/high-value-residential-review/authority-excerpts.json")["pages"]["measurement"]
    authority = {
        "section_131_0443_text_sha256": excerpts["131.0443"]["text_sha256"],
        "section_131_0443_pages": excerpts["131.0443"]["pages"],
        "residential_source": sources["sources"]["residential_division_4"],
        "o22109_source": sources["sources"]["o22109"],
        "measurement_source": sources["sources"]["measurement_rules"],
        "measurement_pages_text_sha256": hashlib.sha256((measurement_pages["30"] + measurement_pages["31"]).encode()).hexdigest(),
    }
    return parcel, legal_lot, rule, proposal, structure, authority


def build_outputs() -> dict[str, object]:
    parcel, legal_lot, rule, proposal, structure, authority = _inputs()
    evaluation = evaluate_front_setback(parcel, legal_lot, rule, proposal, structure, authority)
    provenance = provenance_graph(CONTRACT_VERSION, [
        {"hop": "APN_TO_PARCEL_V2", "apn": EXPECTED_APN, "fingerprint_sha256": parcel["fingerprint_sha256"]},
        {"hop": "PARCEL_TO_RECORDED_LOT", "entity": "PM 17383 Parcel 1", "fingerprint_sha256": legal_lot["fingerprint_sha256"]},
        {"hop": "RECORDED_MAP_TO_FRONT_LINE", "state": "RESOLVED_27TH_STREET_RIGHT_OF_WAY_BOUNDARY", "artifact_sha256": next(x["artifact_sha256"] for x in legal_lot["recorded_map_artifacts"] if x["sheet"] == 2)},
        {"hop": "MAP_TO_CUL_DE_SAC_PREDICATE", "state": "FALSE", "basis": "straight recorded frontage and centerline"},
        {"hop": "PARCEL_TO_BASE_ZONING", "zone": "RS-1-7", "mapping_row_sha256": parcel["zoning"]["mapping_row_sha256"]},
        {"hop": "PARCEL_TO_COASTAL_CONTEXT", "state": "OUTSIDE_COASTAL", "fingerprint_sha256": parcel["coastal_context"]["layer_fingerprint_sha256"]},
        {"hop": "CONTEXT_TO_STANDARDS_VERSION", "version": parcel["base_standards"]["rule_set_version"], "fingerprint_sha256": parcel["base_standards"]["fingerprint_sha256"]},
        {"hop": "TABLE_TO_BASE_RULE", "rule_id": rule["rule_id"], "source_sha256": rule["source_evidence"]["source_sha256"]},
        {"hop": "FOOTNOTE_TO_SLOPE_BRANCH", "proposal_rule_id": proposal["rule_id"], "source_sha256": proposal["canonical_source_text_hash"]},
        {"hop": "SECTION_TO_CUL_DE_SAC_AND_FIRE_BRANCHES", "section": "131.0443(a)(1),(i)", "section_text_sha256": authority["section_131_0443_text_sha256"]},
        {"hop": "MEASUREMENT_SEMANTICS", "sections": ["113.0249", "113.0252"], "page_text_sha256": authority["measurement_pages_text_sha256"]},
        {"hop": "PARCEL_TO_STRUCTURE_EVIDENCE", "contract_version": structure["contract_version"], "footprint_state": structure["footprint_linkage"]["state"]},
        {"hop": "PREDICATES_TO_REQUIREMENT_STATE", "state": evaluation["state"], "unresolved": evaluation["unresolved_requirement_predicates"]},
        {"hop": "REQUIREMENT_TO_COMPLIANCE_GATE", "state": evaluation["compliance_state"], "failed_gates": evaluation["compliance"]["failed_gates"]},
    ])
    shared_contract = {
        "parcel_identity": evaluation["parcel_identity"],
        "legal_lot_state": evaluation["legal_lot"],
        "rule_family": "front_setback",
        "rule_id": rule["rule_id"],
        "rule_source": {"source_section": rule["source_section"], "source_table": rule["source_table"], "source_page": rule["source_page"], "source_url": rule["source_url"], "source_sha256": rule["source_evidence"]["source_sha256"]},
        "measurement_doctrine": evaluation["measurement_doctrine"],
        "required_semantic_inputs": evaluation["measurement_doctrine"]["required_inputs"],
        "resolved_inputs": ["parcel identity", "legal lot", "base zoning", "outside-Coastal context", "front property line", "cul-de-sac predicate", "measurement direction", "building-frame edge semantics"],
        "measurement_result": None,
        "unit": "ft",
        "applicable_requirement": evaluation["valid_possible_requirement_branches"],
        "operator": "MIN",
        "condition_state": "UNRESOLVED",
        "comparison_result": "RULE_EVALUATION_UNRESOLVED",
        "bounded_conclusion": evaluation["bounded_conclusion"],
        "forbidden_conclusions": list(FORBIDDEN_CONCLUSIONS),
        "provenance": provenance["chain"],
    }
    validate_contract(shared_contract)
    product = {
        "contract_version": CONTRACT_VERSION,
        "apn": EXPECTED_APN,
        "applicable_front_setback": {
            "base_rule": "15 ft",
            "conditional_branches": ["6 ft may be used only if the literal front-50-foot slope test is met and the permission is elected", "a greater buffer may be required by the Fire Code Official"],
            "excluded_branch": "10 ft cul-de-sac permission does not apply to the recorded straight 27th Street frontage",
            "state": "SETBACK_REQUIREMENT_CONDITIONAL",
            "unresolved_predicates": evaluation["unresolved_requirement_predicates"],
        },
        "existing_structure": {
            "current_compliance_evaluated": False,
            "result": "SETBACK_COMPLIANCE_NOT_EVALUATED",
            "missing_evidence": ["resolved parcel-specific requirement", "authoritative current or proposed structure geometry", "resolved projection/encroachment and project scope"],
            "historical_diagnostic": "Two direct Spring 2017 outline records are available; no setback is measured and they are not current compliance evidence.",
        },
        "qualifier": evaluation["mandatory_qualifier"],
        "ui_wired": False,
    }
    contract = {
        "contract_version": CONTRACT_VERSION,
        "scope": {"apns": [EXPECTED_APN], "rule_families": ["front_setback"], "jurisdiction_profile": "outside-coastal-2026-09-30"},
        "predicate_states": ["TRUE", "FALSE", "UNKNOWN", "SOURCE_UNAVAILABLE", "NOT_APPLICABLE"],
        "requirement_states": ["SETBACK_REQUIREMENT_RESOLVED", "SETBACK_REQUIREMENT_CONDITIONAL", "SETBACK_REQUIREMENT_SOURCE_UNAVAILABLE"],
        "compliance_states": ["RULE_REQUIREMENT_SATISFIED", "RULE_REQUIREMENT_NOT_SATISFIED", "RULE_EVALUATION_UNRESOLVED", "SETBACK_COMPLIANCE_NOT_EVALUATED"],
        "forbidden_conclusions": list(FORBIDDEN_CONCLUSIONS),
        "shared_framework": "dimensional-rule-evaluator-v0-2026-10-01-p31",
    }
    decision = {
        "contract_version": CONTRACT_VERSION,
        "decision": "FRONT_SETBACK_EVALUATOR_V0_READY",
        "applicable_setback_state": evaluation["state"],
        "compliance_result": evaluation["compliance_state"],
        "next_feasibility_source_target": evaluation["next_feasibility_source_target"],
        "development_capacity_calculated": False,
        "overall_compliance_conclusion": False,
    }
    outputs: dict[str, object] = {
        "contract.json": contract,
        "evaluation.json": evaluation,
        "framework-contract.json": shared_contract,
        "provenance.json": provenance,
        "product-example.json": product,
        "decision.json": decision,
    }
    outputs["integrity.json"] = integrity_artifact(CONTRACT_VERSION, outputs)
    return outputs


def main() -> None:
    outputs = build_outputs()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, value in outputs.items():
        (OUTPUT / name).write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
    print(f"wrote {len(outputs)} artifacts to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build the bounded Packet 57 negative-selection artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from resolver import CONTRACT_VERSION, integrity_artifact, select_candidate


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data/approved-plan-fourth-benchmark-v0"


def candidates() -> list[dict[str, Any]]:
    common = {
        "jurisdiction": "CITY_OF_SAN_DIEGO",
        "coastal_context": "UNKNOWN_NOT_ESTABLISHED_BY_BOUNDED_CORPUS",
        "privacy_classification": "PRIVATE_VALIDATION_EVIDENCE",
    }
    return [
        {
            **common,
            "project_id": "PRJ-1111087", "project_name": "67th Street ADUs",
            "address": "639-659 N 67th Street, San Diego, CA 92114", "apn": "5442140600",
            "project_type": "26 proposed ADUs in seven buildings with tuck-under parking",
            "plan_set_status": "FOURTH_CD_SUBMITTAL_NOT_PROVEN_ISSUED", "plan_date": "2026-05-09_PRINTED_LATEST_ISSUE",
            "base_zone_if_known": "RM-2-5_PLAN_PROVIDED_AND_PREVIOUSLY_PUBLICLY_CORROBORATED",
            "plan_set_available": True, "direct_site_dimensions_available": True, "setbacks_available": True,
            "height_available": True, "grading_available": True, "civil_or_row_available": True,
            "permit_or_review_evidence_available": True, "authoritative_rule_candidate_available": True,
            "source_sha256": "93d8bae01e2f1458f9a65ced9b06c7df55d2c593db8b7dd26ae68207b7d68b12",
            "qualitative_disposition": "EXCLUDED_ALREADY_USED_PRIMARY_PARCEL",
        },
        {
            **common,
            "project_id": "PRJ-1140985", "project_name": "67th Street Site Walls",
            "address": "639 N 67th Street, San Diego, CA 92114", "apn": "5442140600",
            "project_type": "Site and retaining walls", "plan_set_status": "CITY_ISSUED_PLAN_SET",
            "plan_date": "2025-10-30_PRINTED_LATEST_ISSUE; CITY_STAMP_2025-11-25",
            "base_zone_if_known": "RM-2-5_PLAN_PROVIDED_AND_PREVIOUSLY_PUBLICLY_CORROBORATED",
            "plan_set_available": True, "direct_site_dimensions_available": True, "setbacks_available": False,
            "height_available": True, "grading_available": True, "civil_or_row_available": False,
            "permit_or_review_evidence_available": True, "authoritative_rule_candidate_available": True,
            "source_sha256": "7b682112c7495bd01569071059c7ea61f381f13a65862f37d0aab083715faf17",
            "qualitative_disposition": "EXCLUDED_ALREADY_USED_PRIMARY_PARCEL",
        },
        {
            **common,
            "project_id": "PRJ-1110168", "project_name": "67th Street Grading and Right-of-Way",
            "address": "639-659 N 67th Street, San Diego, CA 92114", "apn": "5442140600",
            "project_type": "Grading and public improvements",
            "plan_set_status": "REFERENCE_SHEETS_EMBEDDED; DIRECT_APPROVAL_STATUS_NOT_INDEPENDENTLY_VERIFIED",
            "plan_date": "REFERENCE_SHEETS_IN_2026_SUBMITTAL",
            "base_zone_if_known": "RM-2-5_PLAN_PROVIDED_BY_PARENT_SET_AND_PREVIOUSLY_PUBLICLY_CORROBORATED",
            "plan_set_available": True, "direct_site_dimensions_available": True, "setbacks_available": False,
            "height_available": False, "grading_available": True, "civil_or_row_available": True,
            "permit_or_review_evidence_available": True, "authoritative_rule_candidate_available": True,
            "source_sha256": "93d8bae01e2f1458f9a65ced9b06c7df55d2c593db8b7dd26ae68207b7d68b12",
            "qualitative_disposition": "EXCLUDED_ALREADY_USED_PRIMARY_PARCEL",
        },
        {
            **common,
            "project_id": "3927-UTAH-ROW-PROPOSAL", "project_name": "3927 Utah Street ROW proposal correspondence",
            "address": "3927 Utah Street, San Diego, CA", "apn": None,
            "project_type": "ROW proposal correspondence only", "plan_set_status": "NO_PLAN_SET", "plan_date": None,
            "base_zone_if_known": None, "plan_set_available": False, "direct_site_dimensions_available": False,
            "setbacks_available": False, "height_available": False, "grading_available": False,
            "civil_or_row_available": False, "permit_or_review_evidence_available": False,
            "authoritative_rule_candidate_available": False,
            "source_sha256": "18e386da9876ba9c354478ece8c3c300518f2e523fdffc36bb27a57caa78f97e",
            "qualitative_disposition": "EXCLUDED_CORRESPONDENCE_ONLY_WEAK_EVIDENCE",
        },
        {
            **common,
            "project_id": "4324-MEADE-ROW-PROPOSAL", "project_name": "4324 Meade Avenue ROW proposal correspondence",
            "address": "4324 Meade Avenue, San Diego, CA", "apn": None,
            "project_type": "ROW proposal correspondence only", "plan_set_status": "NO_PLAN_SET", "plan_date": None,
            "base_zone_if_known": None, "plan_set_available": False, "direct_site_dimensions_available": False,
            "setbacks_available": False, "height_available": False, "grading_available": False,
            "civil_or_row_available": False, "permit_or_review_evidence_available": False,
            "authoritative_rule_candidate_available": False,
            "source_sha256": "9cd23d05d5b01a722b751c53d560811244ad3f0b016b134d741478938d929fdc",
            "qualitative_disposition": "EXCLUDED_CORRESPONDENCE_ONLY_WEAK_EVIDENCE",
        },
    ]


def build_outputs() -> dict[str, Any]:
    inventory = candidates()
    selection = select_candidate(inventory)
    outputs: dict[str, Any] = {
        "candidate-inventory.json": {
            "contract_version": CONTRACT_VERSION,
            "search_scope": "EXISTING_OPERATOR_AUTHORIZED_LOCAL_TRULOT_PROJECT_FOLDERS_AND_SEALED_PACKET_41_INVENTORY_ONLY",
            "ranking_doctrine": ["different parcel", "different base zone", "different overlay/context", "issued/approved status", "direct labeled dimensions", "authoritative rule availability", "low unresolved predicate burden", "high reusable-rule value"],
            "numeric_score_used": False,
            "candidates": inventory,
        },
        "selection.json": {
            "contract_version": CONTRACT_VERSION,
            **selection,
            "selection_reason": "Every plan-bearing candidate is on excluded APN 5442140600. The only different-address candidates are correspondence-only records without plan sets, resolved APNs, direct dimensions, or sealed rule candidates.",
            "private_plan_contents_newly_ingested": False,
        },
        "rule-selection.json": {
            "contract_version": CONTRACT_VERSION,
            "candidate_rule_families_on_eligible_projects": [],
            "excluded_already_represented_families": ["INTERIOR_SIDE_SETBACK", "RETAINING_WALL_PERMIT_TRIGGER", "DRIVEWAY_WIDTH"],
            "selected_rule_family": "SELECTED_RULE_FAMILY: NONE",
            "predicate_resolution": "FOURTH_BENCHMARK_RULE_SELECTION_UNRESOLVED",
            "authoritative_rule": None,
            "bounded_plan_fact": None,
            "comparison": {"state": "PLAN_RULE_EVALUATION_UNRESOLVED", "performed": False},
            "scoped_result": None,
        },
        "provenance.json": {
            "contract_version": CONTRACT_VERSION,
            "inputs": [
                {"artifact": "Packet 41 candidate inventory", "path": "data/approved-plan-golden-corpus-v0/candidate-inventory.json", "privacy": "REPOSITORY_BOUNDED_EVIDENCE"},
                {"artifact": "Packet 41 source manifest", "path": "data/approved-plan-golden-corpus-v0/manifest.json", "privacy": "REPOSITORY_BOUNDED_EVIDENCE"},
                {"artifact": "Local TruLot Projects filename inventory", "privacy": "PRIVATE_VALIDATION_EVIDENCE", "contents_ingested": False},
            ],
            "source_hashes_reverified": True,
            "private_source_paths_published": False,
            "private_plan_published": False,
            "new_external_research": False,
        },
        "decision.json": {
            "contract_version": CONTRACT_VERSION,
            "project": "FOURTH_BENCHMARK_PROJECT_NOT_AVAILABLE",
            "selected_rule_family": "SELECTED_RULE_FAMILY: NONE",
            "comparison": "PLAN_RULE_EVALUATION_UNRESOLVED",
            "transferability": "FOUR_PROJECT_TRANSFERABILITY_NOT_SUPPORTED: no unused authorized parcel has a qualifying plan set with a direct fact and sealed public rule predicates",
            "corpus": "FOUR_PROJECT_BENCHMARK_CORPUS_NOT_ESTABLISHED",
            "architecture": "BENCHMARK_EXPANSION_STILL_HIGH_VALUE",
            "next": "NEXT_FEASIBILITY_STEP: fifth approved-plan benchmark",
            "capacity_calculated": False,
            "whole_project_compliance_concluded": False,
            "production_wired": False,
        },
    }
    outputs["integrity.json"] = integrity_artifact(outputs)
    return outputs


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, value in build_outputs().items():
        (OUTPUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()

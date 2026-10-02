#!/usr/bin/env python3
"""Build deterministic, non-production Packet 49 benchmark artifacts."""

from __future__ import annotations

import json
import sys
from copy import deepcopy
from decimal import Decimal
from pathlib import Path
from typing import Any

from resolver import (
    CONTRACT_VERSION,
    EXPECTED_APN,
    EXPECTED_PROJECT,
    EXPECTED_STATUS,
    compare_plan_rule,
    feet_inches_to_decimal,
    fingerprint,
    integrity_artifact,
    select_wall_permit_requirement,
)

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "approved-plan-second-benchmark-v0"
sys.path.insert(0, str(ROOT / "scripts"))
from dimensional_rule_evaluator_v0 import compare_values  # noqa: E402
from project_evidence_adapter_v0 import validate_project_evidence_envelope  # noqa: E402


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def selected_corpus_project() -> dict[str, Any]:
    corpus = _load_json(ROOT / "data" / "approved-plan-golden-corpus-v0" / "pilot-extractions.json")
    project = next(item for item in corpus["projects"] if item["project_id"] == EXPECTED_PROJECT)
    if project["address_apn"]["apn"] != EXPECTED_APN or project["plan_status"] != EXPECTED_STATUS:
        raise ValueError("GOLDEN_CORPUS_PROJECT_IDENTITY_OR_STATUS_MISMATCH")
    return project


def plan_envelope() -> dict[str, Any]:
    project = selected_corpus_project()
    fact = next(item for item in project["facts"] if item["fact_id"] == "p41-wall-height-range")
    maximum_label = fact["value"]["max"]
    maximum_ft = feet_inches_to_decimal(maximum_label)
    envelope = {
        "contract_version": CONTRACT_VERSION,
        "project_id": project["project_id"],
        "apn": project["address_apn"]["apn"],
        "address": project["address_apn"]["address"],
        "project_status": project["plan_status"],
        "plan_set_version": project["plan_date"],
        "subject": "PROPOSED_PROJECT_FACT",
        "sheet_provenance": {
            "sheet": fact["sheet_number"],
            "title": fact["sheet_title"],
            "pdf_page": fact["pdf_page"],
            "source_ref": "PRIVATE_PLAN_PRJ-1140985_CITY_ISSUED",
        },
        "legal_survey_line_roles": {
            "scope": "PARCEL_TIED_SITE_WALL_PLAN",
            "selected_line": None,
            "required_for_selected_rule": False,
            "authority_state": "PLAN_GEOMETRY_ONLY_NOT_PUBLIC_PARCEL_TRUTH",
        },
        "structure_id": {
            "scope": "PROJECT_MAXIMUM_SITE_WALL_HEIGHT",
            "project_type": project["project_use"],
            "individual_wall_segment": "NOT_REQUIRED_FOR_BRANCH_INVARIANT_PERMIT_TRIGGER",
        },
        "geometry_semantics": {
            "measurement": "DIRECT_LABELED_PROJECT_MAXIMUM_HEIGHT",
            "wall_scope": "SITE_OR_RETAINING_WALL",
            "yard_location": "NOT_REQUIRED_FOR_SELECTED_PERMIT_TRIGGER",
            "scale_derived": False,
            "maximum_height_compliance_evaluated": False,
        },
        "direct_dimensions": {
            "minimum_height_label": fact["value"]["min"],
            "maximum_height_label": maximum_label,
            "maximum_height_ft": str(maximum_ft),
            "plan_callout": fact["exact_callout_or_dimension"],
            "evidence_class": fact["method"],
        },
        "height": {"project_wall_range": fact["value"], "selected_maximum_ft": str(maximum_ft), "scale_derived": False},
        "floor_area": {"evaluated": False, "reason": "NOT_RELEVANT_TO_SELECTED_RULE"},
        "proposed_use_units": {"use": "SITE_AND_RETAINING_WALLS", "dwelling_units_evaluated": False},
        "project_specific_conditions": {
            "no_right_of_way_work_plan_note": True,
            "separate_building_project_excluded": True,
            "wall_subtype_for_maximum": "NOT_DISTINGUISHED_BY_CORPUS_FACT",
            "subtype_changes_selected_result": False,
        },
        "privacy_classification": "PRIVATE_VALIDATION_EVIDENCE",
        "source_sha256": fact["provenance"]["source_sha256"],
        "public_truth_promotion": False,
    }
    validate_project_evidence_envelope(
        envelope,
        expected_project_id=EXPECTED_PROJECT,
        expected_apn=EXPECTED_APN,
        allowed_project_statuses={EXPECTED_STATUS},
    )
    envelope["fingerprint_sha256"] = fingerprint(envelope)
    return envelope


def public_profile() -> dict[str, Any]:
    packet42 = _load_json(ROOT / "data" / "approved-plan-setback-benchmark-v0" / "public-rule-profile.json")["public_profile"]
    if packet42["parcel_identity"]["apn"] != EXPECTED_APN:
        raise ValueError("PUBLIC_PROFILE_APN_MISMATCH")
    public_zone = packet42["zoning"]
    return {
        "parcel_identity": deepcopy(packet42["parcel_identity"]),
        "zoning": {
            key: deepcopy(public_zone[key])
            for key in (
                "authoritative_zone", "selected_zone", "mapping_state", "detailed_mapping_state",
                "principal_feature", "retained_secondary", "acquisition", "acquired_at",
                "source_modified_at", "artifact_sha256",
            )
        },
        "coastal": deepcopy(packet42["coastal"]),
        "jurisdiction": "CITY_OF_SAN_DIEGO",
        "authority_classification": "PUBLIC_AUTHORITY",
        "private_plan_used_to_select_public_truth": False,
    }


def rule_profile() -> dict[str, Any]:
    return {
        "rule_family": "WALL_HEIGHT_BUILDING_PERMIT_TRIGGER",
        "application_version": {
            "project_plan_issued": "2025-11-25",
            "selected_profile": "OUTSIDE_COASTAL_TABLE_142_03A_EFFECTIVE_2024-10-05",
            "compiled_code_edition_verified": "9-2026",
            "table_last_amended": "2024-07-22",
            "effective_date": "2024-10-05",
            "ordinance": "O-21836 N.S.",
        },
        "authority": {
            "section": "SDMC Table 142-03A, Fence Regulations Applicability",
            "source_url": "https://docs.sandiego.gov/municode/MuniCodeChapter14/Ch14Art02Division03.pdf",
            "source_sha256": "e328b7d946263d0bdb67ff7cda828a48fbdca003cb6126bb4dd3de607d82cd72",
            "publisher": "City of San Diego",
        },
        "branches": {
            "fence": {"height_ft_greater_than_or_equal": "7", "required_permit": "BUILDING_PERMIT_PROCESS_ONE"},
            "retaining_wall": {"height_ft_greater_than_or_equal": "3", "required_permit": "BUILDING_PERMIT_PROCESS_ONE"},
        },
        "applicability_predicates": {
            "city_jurisdiction": True,
            "outside_coastal": True,
            "wall_is_fence_or_retaining_wall": True,
            "direct_maximum_height": True,
            "yard_location_required": False,
        },
        "exceptions_and_limits": {
            "coastal_between_shoreline_and_first_public_roadway": "NOT_APPLICABLE_OUTSIDE_COASTAL",
            "walls_exceeding_permitted_height": "SEPARATE_NDP_PROCESS_TWO_RULE_NOT_EVALUATED",
            "maximum_height_compliance": "NOT_EVALUATED",
            "project_review_override": "NONE_USED",
        },
    }


def build_outputs() -> dict[str, Any]:
    envelope = plan_envelope()
    public = public_profile()
    rules = rule_profile()
    proposed = Decimal(envelope["direct_dimensions"]["maximum_height_ft"])
    requirement = select_wall_permit_requirement(
        subject=envelope["subject"],
        jurisdiction=public["jurisdiction"],
        outside_coastal=public["coastal"]["state"] == "OUTSIDE_COASTAL",
        direct_dimension=True,
        scale_derived=envelope["geometry_semantics"]["scale_derived"],
        wall_scope=envelope["geometry_semantics"]["wall_scope"],
        proposed_max_height_ft=proposed,
        application_profile=rules["application_version"]["selected_profile"],
    )
    comparison = compare_plan_rule(proposed_max_height_ft=proposed, requirement=requirement)
    shared = compare_values(
        measured=proposed,
        required=Decimal(requirement["required_ft"]),
        unit="ft",
        operator="MIN",
        expression="proposed_plan_max_wall_height_ft >= branch_invariant_building_permit_trigger_ft",
    )
    if comparison["state"] != "PLAN_RULE_REQUIREMENT_SATISFIED" or shared.state != "RULE_REQUIREMENT_SATISFIED":
        raise ValueError("SHARED_EVALUATOR_PARITY_FAILURE")

    benchmark = {
        "contract_version": CONTRACT_VERSION,
        "project_identity": {"project_id": envelope["project_id"], "apn": envelope["apn"]},
        "plan_status": envelope["project_status"],
        "conclusion_scope": "ISSUED_PLAN_RULE_VALIDATION",
        "selected_rule_family": rules["rule_family"],
        "selected_plan_fact": {
            "subject": envelope["subject"],
            "maximum_height_label": envelope["direct_dimensions"]["maximum_height_label"],
            "maximum_height_ft": envelope["direct_dimensions"]["maximum_height_ft"],
            "sheet": envelope["sheet_provenance"]["sheet"],
            "pdf_page": envelope["sheet_provenance"]["pdf_page"],
            "scale_derived": False,
        },
        "predicate_resolution": {
            "subject_is_proposed": True,
            "city_jurisdiction": True,
            "outside_coastal": True,
            "direct_labeled_dimension": True,
            "wall_scope_is_fence_or_retaining_wall": True,
            "subtype_needed_for_result": False,
            "project_status_recorded": True,
            "all_required_predicates_resolved": True,
        },
        "requirement": requirement,
        "comparison": comparison,
        "issued_status_evidence": {
            "state": "CITY_ISSUED_PLAN_SET",
            "date": "2025-11-25",
            "scope": "SITE_WALL_PROJECT_ONLY",
            "as_built_proof": False,
        },
        "city_review_corroboration": {
            "state": "NO_RELEVANT_RULE_SPECIFIC_REVIEW_EVIDENCE",
            "issuance_treated_as_rule_interpretation_proof": False,
            "whole_plan_issuance_treated_as_complete_approval": False,
        },
        "privacy": {
            "plan_evidence": "PRIVATE_VALIDATION_EVIDENCE",
            "public_profile": "PUBLIC_AUTHORITY",
            "private_plan_promoted_to_public_truth": False,
            "private_path_in_output": False,
            "private_plan_published": False,
        },
        "forbidden_conclusions": [
            "AS_BUILT_COMPLIANCE", "CURRENT_PARCEL_COMPLIANCE", "MAXIMUM_WALL_HEIGHT_COMPLIANCE",
            "COMPLETE_PROJECT_APPROVAL", "OVERALL_PROJECT_FEASIBILITY", "DEVELOPMENT_CAPACITY",
            "CITYWIDE_RULE_CONCLUSION",
        ],
        "capacity_calculated": False,
        "production_wired": False,
        "bounded_conclusion": "The issued plan's directly labeled 9-foot-3-inch project maximum wall height is above the branch-invariant 7-foot Table 142-03A threshold at which either a fence/site wall or retaining wall requires a Process One building permit. This validates only the issued proposed-plan permit-trigger fact, not maximum-height compliance or as-built conditions.",
    }
    transferability = {
        "contract_version": CONTRACT_VERSION,
        "decision": "APPROVED_PLAN_BENCHMARK_TRANSFERABILITY_SUPPORTED",
        "same_adapter": "ProjectEvidenceAdapter/PlanFactEnvelope via project_evidence_adapter_v0",
        "same_public_private_boundary": True,
        "same_comparator_pattern": "Decimal MIN comparison through dimensional-rule-evaluator-v0-2026-10-01-p37",
        "different_project": {"packet_42": "PRJ-1111087", "packet_49": EXPECTED_PROJECT},
        "different_status": {"packet_42": "SUBMITTED_NOT_PROVEN_ISSUED", "packet_49": "CITY_ISSUED_PLAN_SET"},
        "different_rule_family": {"packet_42": "INTERIOR_SIDE_SETBACK", "packet_49": "WALL_HEIGHT_BUILDING_PERMIT_TRIGGER"},
        "adapter_project_constants": False,
        "architectural_fork_required": False,
    }
    provenance = {
        "contract_version": CONTRACT_VERSION,
        "public": [
            {"hop": "APN_TO_SANGIS_PARCEL", "source": "SanGIS Parcels FeatureServer/0", "acquisition": public["parcel_identity"]["parcel_acquisition"], "artifact_sha256": public["parcel_identity"]["artifact_sha256"]},
            {"hop": "PARCEL_TO_BASE_ZONE", "source": "SanGIS Zoning_Base_SD FeatureServer/0", "acquisition": public["zoning"]["acquisition"], "artifact_sha256": public["zoning"]["artifact_sha256"]},
            {"hop": "PARCEL_TO_COASTAL", "source": "City DSD Zoning Overlay MapServer/2", "acquisition": public["coastal"]["acquisition"], "artifact_sha256": public["coastal"]["source_artifact_sha256"]},
            {"hop": "APPLICATION_PROFILE_TO_RULE", "source": rules["authority"]["source_url"], "source_sha256": rules["authority"]["source_sha256"]},
        ],
        "private": [
            {"hop": "AUTHORIZED_ISSUED_PLAN_TO_PLAN_FACT_ENVELOPE", "source_ref": envelope["sheet_provenance"]["source_ref"], "source_sha256": envelope["source_sha256"], "privacy": envelope["privacy_classification"]},
        ],
        "boundary": "Private evidence supplies only the issued proposed-plan wall fact and status; public authority supplies parcel identity, zoning, Coastal context, and law.",
    }
    contract = {
        "contract_version": CONTRACT_VERSION,
        "scope": "ONE_PROJECT_ONE_DIRECT_WALL_HEIGHT_ONE_BUILDING_PERMIT_TRIGGER",
        "result_states": ["PLAN_RULE_REQUIREMENT_SATISFIED", "PLAN_RULE_REQUIREMENT_NOT_SATISFIED", "PLAN_RULE_EVALUATION_UNRESOLVED"],
        "unresolved_rule_selection_state": "SECOND_BENCHMARK_RULE_SELECTION_UNRESOLVED",
        "conclusion_scope": "ISSUED_PLAN_RULE_VALIDATION",
        "production": False,
    }
    decision = {
        "contract_version": CONTRACT_VERSION,
        "benchmark": "SECOND_APPROVED_PLAN_BENCHMARK_READY",
        "transferability": "APPROVED_PLAN_BENCHMARK_TRANSFERABILITY_SUPPORTED",
        "corpus_status": "MULTI_PROJECT_BENCHMARK_CORPUS_ESTABLISHED",
        "next": "NEXT_FEASIBILITY_STEP: height/FAR golden evaluation",
        "reason": "A third dimensional family on the existing direct height/FAR facts gives more confidence than another permit-trigger case while preserving bounded scope.",
    }
    outputs = {
        "contract.json": contract,
        "plan-fact-envelope.json": envelope,
        "public-rule-profile.json": {"public_profile": public, "rule_profile": rules},
        "benchmark-result.json": benchmark,
        "transferability.json": transferability,
        "provenance.json": provenance,
        "decision.json": decision,
    }
    outputs["integrity.json"] = integrity_artifact(outputs)
    return outputs


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, value in build_outputs().items():
        (OUTPUT / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

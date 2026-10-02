#!/usr/bin/env python3
"""Build deterministic, non-production Packet 55 benchmark artifacts."""

from __future__ import annotations

import json
import sys
from copy import deepcopy
from decimal import Decimal
from pathlib import Path
from typing import Any

from resolver import (
    CONTRACT_VERSION, EXPECTED_APN, EXPECTED_PROJECT, EXPECTED_STATUS,
    compare_plan_rule, fingerprint, integrity_artifact, select_driveway_requirement,
)

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "approved-plan-third-benchmark-v0"
sys.path.insert(0, str(ROOT / "scripts"))
from dimensional_rule_evaluator_v0 import compare_values  # noqa: E402
from project_evidence_adapter_v0 import validate_project_evidence_envelope  # noqa: E402


def load(path: Path) -> Any:
    return json.loads(path.read_text())


def selected_corpus_project() -> dict[str, Any]:
    corpus = load(ROOT / "data/approved-plan-golden-corpus-v0/pilot-extractions.json")
    project = next(item for item in corpus["projects"] if item["project_id"] == EXPECTED_PROJECT)
    if project["address_apn"]["apn"] != EXPECTED_APN or project["plan_status"] != EXPECTED_STATUS:
        raise ValueError("GOLDEN_CORPUS_PROJECT_IDENTITY_OR_STATUS_MISMATCH")
    return project


def plan_envelope() -> dict[str, Any]:
    project = selected_corpus_project()
    envelope = {
        "contract_version": CONTRACT_VERSION,
        "project_id": project["project_id"],
        "apn": project["address_apn"]["apn"],
        "address": project["address_apn"]["address"],
        "project_status": project["plan_status"],
        "plan_set_version": "REFERENCE_CIVIL_SHEET_C001_DATED_2025-12-03_IN_2026_SUBMITTAL",
        "subject": "PROPOSED_PROJECT_FACT",
        "sheet_provenance": {
            "sheet": "C001", "title": "Improvement Plan", "pdf_page": 10,
            "source_ref": "PRIVATE_PLAN_PRJ-1110168_REFERENCE_CIVIL_C001",
        },
        "legal_survey_line_roles": {
            "scope": "PARCEL_TIED_CIVIL_IMPROVEMENT_PLAN",
            "selected_line": "PROPOSED_DRIVEWAY_AT_67TH_STREET_RIGHT_OF_WAY",
            "required_for_selected_rule": True,
            "authority_state": "PLAN_GEOMETRY_ONLY_NOT_PUBLIC_PARCEL_TRUTH",
        },
        "structure_id": {
            "scope": "PROPOSED_RIGHT_OF_WAY_DRIVEWAY",
            "project_type": project["project_use"],
            "individual_feature": "C001_CONSTRUCTION_NOTE_2",
        },
        "geometry_semantics": {
            "measurement": "DIRECT_LABELED_CONSTRUCTED_DRIVEWAY_WIDTH",
            "feature": "DRIVEWAY",
            "directionality_corroboration": "PROPOSED_2_WAY_DRIVEWAY_PER_CIVIL_ON_ASSOCIATED_TITLE_SHEET",
            "scale_derived": False,
            "curb_opening_or_flare_width": False,
        },
        "direct_dimensions": {
            "width_ft": "20",
            "plan_callout": "CONSTRUCT 20 FT DRIVEWAY PER SDG-159, SDG-164",
            "method": "DIRECT_LABELED_PLAN_DIMENSION",
            "primary_fact_count": 1,
        },
        "height": {"evaluated": False, "reason": "NOT_RELEVANT_TO_SELECTED_RULE"},
        "floor_area": {"evaluated": False, "reason": "NOT_RELEVANT_TO_SELECTED_RULE"},
        "proposed_use_units": {
            "use_category": "DETACHED_SINGLE_DWELLING_UNIT_WITH_ACCESSORY_DWELLING_UNITS",
            "basis": "ASSOCIATED_PLAN_IDENTIFIES_ONE_EXISTING_SINGLE_FAMILY_HOME_AND ONLY_NEW_ADUS; SDMC_131_0112_EXCLUDES_ADUS_FROM_MULTIPLE_DWELLING_UNIT_DEFINITION",
            "unit_count_used_for_capacity": False,
        },
        "project_specific_conditions": {
            "standard_drawing_references": ["SDG-159", "SDG-164"],
            "standard_drawings_used_as_selected_legal_rule": False,
            "approval_block_observed_blank": True,
            "direct_issuance_proven": False,
            "related_building_project_used_only_for_use_and_directionality_predicates": True,
        },
        "privacy_classification": "PRIVATE_VALIDATION_EVIDENCE",
        "source_sha256": "93d8bae01e2f1458f9a65ced9b06c7df55d2c593db8b7dd26ae68207b7d68b12",
        "public_truth_promotion": False,
    }
    validate_project_evidence_envelope(
        envelope, expected_project_id=EXPECTED_PROJECT, expected_apn=EXPECTED_APN,
        allowed_project_statuses={EXPECTED_STATUS},
    )
    envelope["fingerprint_sha256"] = fingerprint(envelope)
    return envelope


def public_profile() -> dict[str, Any]:
    p42 = load(ROOT / "data/approved-plan-setback-benchmark-v0/public-rule-profile.json")["public_profile"]
    map_evidence = load(ROOT / "data/approved-plan-far-closure-v0/map-1063-evidence.json")
    return {
        "parcel_identity": deepcopy(p42["parcel_identity"]),
        "zoning": {
            "authoritative_zone": p42["zoning"]["authoritative_zone"],
            "mapping_state": p42["zoning"]["mapping_state"],
            "detailed_mapping_state": p42["zoning"]["detailed_mapping_state"],
            "artifact_sha256": p42["zoning"]["artifact_sha256"],
        },
        "coastal": deepcopy(p42["coastal"]),
        "jurisdiction": "CITY_OF_SAN_DIEGO",
        "lot_width": {
            "state": "GREATER_THAN_50_FT_RESOLVED",
            "recorded_map_frontage_ft": map_evidence["lot_4_block_7"]["street_frontage_distance_ft"],
            "public_vector_code_midpoint_width_ft": "98.56",
            "measurement_method": "SDMC_113_0243_MIDPOINT_WIDTH_FROM_PUBLIC_PARCEL_VECTOR_EPSG_2230",
            "parcel_geometry_sha256": "05073c1c7e7c910e4b60ce05df6c80b2fb61dd3da2d0cd99f4d42d20f3c176be",
            "recorded_map_evidence_sha256": fingerprint(map_evidence),
            "threshold_ft": "50",
            "pixel_scaled": False,
        },
        "parking_impact_overlay": {
            "state": "OUTSIDE_PARKING_IMPACT_OVERLAY_ZONE",
            "layer": "City DSD Zoning_Overlay MapServer layer 7",
            "query_scope": "FULL_PUBLIC_PARCEL_POLYGON_INTERSECTS",
            "feature_count": 0,
            "queried_on": "2026-10-02",
            "query_response_sha256": "a91e8e808fb8be122eb1af9b10c9a6d0395c842bfc9af52e3cabd66f71743007",
            "source_url": "https://webmaps.sandiego.gov/arcgis/rest/services/DSD/Zoning_Overlay/MapServer/7",
        },
        "only_selected_rule_overlays_included": ["PARKING_IMPACT_OVERLAY_ZONE"],
        "authority_classification": "PUBLIC_AUTHORITY",
        "private_plan_used_to_select_public_truth": False,
    }


def rule_profile() -> dict[str, Any]:
    return {
        "rule_family": "DRIVEWAY_WIDTH",
        "authority": {
            "section": "SDMC 142.0560(j)(1), Table 142-05M",
            "compiled_source_url": "https://docs.sandiego.gov/municode/municodechapter14/ch14art02division05.pdf",
            "compiled_source_sha256": "5791eb4ea46a5cf4c79c550be85dda069fefa6846ea7155349a10d9e8e43dc5d",
            "compiled_pdf_page": 60,
            "lot_width_section": "SDMC 113.0243",
            "lot_width_source_url": "https://docs.sandiego.gov/municode/MuniCodeChapter11/Ch11Art03Division02.pdf",
            "lot_width_source_sha256": "c3dfa2f75b21fcd4d1d1c896e3112d6de588a2079c54fb138b199575d2a03f1e",
            "publisher": "City of San Diego",
        },
        "use_classification_authority": {
            "section": "SDMC 131.0112(a)(3)(C)-(D)",
            "source_url": "https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division01.pdf",
            "source_sha256": "b6247ec6f6d8cdb9457f730ddf9dfc9758198f13731507f89351811f49d7b001",
            "source_edition": "10-2022",
            "source_pdf_page": 7,
            "rule": "Accessory dwelling units are excluded when determining whether more than one dwelling unit constitutes the Multiple Dwelling Units use category.",
        },
        "application_version": {
            "project_record_date": "2024-01-09",
            "reference_plan_date": "2025-12-03",
            "selected_profile": "RESIDENTIAL_TABLE_142_05M_UNCHANGED_ACROSS_2024_APPLICATION_AND_2025_PLAN",
            "version_basis": "O-21836_CORRECTED_COPY_MARKS_DETACHED_SINGLE_THROUGH_MULTIPLE_DWELLING_ROW_NO_CHANGE; 2026_COMPILED_CODE_SUPPLIES_VALUES",
            "o21836_source_url": "https://docs.sandiego.gov/council_reso_ordinance/rao2024/O-21836.pdf",
            "o21836_download_sha256": "2ab750ff80f2d1aaf860e625d9d640e5b06c027aabf31d3dd7636b8411a00d48",
            "residential_row_changed_by_o21836": False,
            "originating_numeric_source": {
                "ordinance": "O-19650 N.S.",
                "effective_date": "2007-08-31",
                "table_at_enactment": "Table 142-05L; renumbered to Table 142-05M in 2012",
                "source_url": "https://docs.sandiego.gov/council_reso_ordinance/rao2007/O-19650.pdf",
                "source_sha256": "0ddf0818d0440ee7958330fe2f37586b77966079bac9937559332d91f5f31d4a",
                "detached_single_dwelling_outside_pioz_minimum_ft": "12",
                "detached_single_dwelling_outside_pioz_maximum_ft": "25",
            },
        },
        "selected_branch": {
            "lot_size": "GREATER_THAN_50_FT",
            "use": "DETACHED_SINGLE_DWELLING_UNIT",
            "parking_impact_overlay": "OUTSIDE",
            "minimum_width_ft": "12",
            "maximum_width_ft": "25",
        },
        "exceptions_and_limits": {
            "industrial_loading_dock_exception": "NOT_APPLICABLE_TO_RESIDENTIAL_USE",
            "parking_impact_area_maximum": "NOT_SELECTED_OUTSIDE_OVERLAY",
            "standard_drawing_flare_or_curb_opening": "NOT_EVALUATED",
            "project_specific_review_override": "NONE_FOUND_IN_BOUNDED_EVIDENCE",
        },
    }


def candidate_rules() -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "selected": "DRIVEWAY_WIDTH",
        "candidates": [
            {"family": "DRIVEWAY_WIDTH", "state": "SELECTED", "reason": "Direct 20-foot callout, sealed public predicates, numeric minimum and maximum."},
            {"family": "DRIVEWAY_SLOPE", "state": "REJECTED", "reason": "Profiles contain several grades and transition segments; no single direct fact seals every 142.0560(j)(9) segment predicate."},
            {"family": "GRADING_SLOPE_RATIO", "state": "REJECTED", "reason": "Multiple proposed slopes and wall conditions prevent one unambiguous controlling fact/rule pair."},
            {"family": "GRADING_QUANTITY_THRESHOLD", "state": "REJECTED", "reason": "Direct cut, fill, and export quantities exist, but the bounded review did not seal all permit-threshold and exemption predicates."},
            {"family": "CUT_FILL_HEIGHT", "state": "REJECTED", "reason": "Direct maximum cut and fill depths exist, but location-specific retaining, slope, and permit branches remain unresolved."},
            {"family": "RETAINING_WALL_PERMIT_TRIGGER", "state": "REJECTED", "reason": "Already covered by Packet 49 and walls are identified as separate-permit work."},
            {"family": "CURB_OR_ROW_DIMENSION", "state": "REJECTED", "reason": "Standard-drawing and field/as-built branches need additional technical predicates."},
            {"family": "VISIBILITY_TRIANGLE_GEOMETRY", "state": "REJECTED", "reason": "The bounded plan does not seal all obstruction and applicable triangle semantics."},
            {"family": "SEWER_LATERAL_SLOPE", "state": "REJECTED", "reason": "Less reusable than the direct civil driveway fact and would require a separate plumbing/utility standard chain."},
        ],
    }


def build_outputs() -> dict[str, Any]:
    envelope = plan_envelope()
    public = public_profile()
    rules = rule_profile()
    proposed = Decimal(envelope["direct_dimensions"]["width_ft"])
    requirement = select_driveway_requirement(
        subject=envelope["subject"], jurisdiction=public["jurisdiction"],
        lot_width_gt_50=public["lot_width"]["state"] == "GREATER_THAN_50_FT_RESOLVED",
        use_category=envelope["proposed_use_units"]["use_category"],
        outside_parking_impact_overlay=public["parking_impact_overlay"]["state"] == "OUTSIDE_PARKING_IMPACT_OVERLAY_ZONE",
        direct_dimension=True, scale_derived=envelope["geometry_semantics"]["scale_derived"],
        application_profile=rules["application_version"]["selected_profile"],
    )
    comparison = compare_plan_rule(proposed_width_ft=proposed, requirement=requirement)
    shared_min = compare_values(measured=proposed, required=Decimal(requirement["minimum_ft"]), unit="ft", operator="MIN", expression="proposed_driveway_width_ft >= applicable_minimum_width_ft")
    shared_max = compare_values(measured=proposed, required=Decimal(requirement["maximum_ft"]), unit="ft", operator="MAX", expression="proposed_driveway_width_ft <= applicable_maximum_width_ft")
    if comparison["state"] != "PLAN_RULE_REQUIREMENT_SATISFIED" or {shared_min.state, shared_max.state} != {"RULE_REQUIREMENT_SATISFIED"}:
        raise ValueError("SHARED_EVALUATOR_PARITY_FAILURE")

    inventory = {
        "contract_version": CONTRACT_VERSION,
        "project_identity": {"project_id": EXPECTED_PROJECT, "permit_id": "PMT-3269275", "apn": EXPECTED_APN, "address": envelope["address"]},
        "plan_status": envelope["project_status"],
        "available": {
            "survey_sheets": True, "grading_sheets": True, "right_of_way_sheets": True,
            "civil_geometry": True, "topography": True, "legal_description": True,
            "improvement_dimensions": True, "slopes": True, "walls": True,
            "driveways": True, "curb_and_gutter": True, "utility_references": True,
            "direct_regulatory_callouts": ["SDG-159", "SDG-164"],
        },
        "sheet_inventory": [
            {"sheet": "G001", "pdf_page": 7, "scope": "GENERAL_AND_TITLE"},
            {"sheet": "G002", "pdf_page": 8, "scope": "GENERAL_NOTES"},
            {"sheet": "G003", "pdf_page": 9, "scope": "WATER_AND_SEWER_NOTES"},
            {"sheet": "C001", "pdf_page": 10, "scope": "IMPROVEMENT_PLAN"},
            {"sheet": "C002", "pdf_page": 11, "scope": "GRADING"},
            {"sheet": "C003", "pdf_page": 12, "scope": "UTILITIES"},
            {"sheet": "C004", "pdf_page": 13, "scope": "PROFILES_AND_DETAILS"},
            {"sheet": "C005", "pdf_page": 14, "scope": "BMP_AND_EROSION_CONTROL"},
        ],
        "private_source_sha256": envelope["source_sha256"],
        "private_source_published": False,
    }
    predicates = {
        "contract_version": CONTRACT_VERSION,
        "state": "ALL_SELECTED_RULE_PREDICATES_RESOLVED",
        "predicates": {
            "city_jurisdiction": True,
            "lot_width_greater_than_50_ft": True,
            "detached_single_dwelling_use_with_adus": True,
            "outside_parking_impact_overlay": True,
            "direct_constructed_driveway_width": True,
            "not_pixel_or_scale_derived": True,
            "residential_rule_unchanged_across_relevant_dates": True,
            "project_status_explicit": True,
        },
        "unresolved_predicates": [],
    }
    benchmark = {
        "contract_version": CONTRACT_VERSION,
        "project_identity": {"project_id": EXPECTED_PROJECT, "apn": EXPECTED_APN},
        "viability": "THIRD_BENCHMARK_PROJECT_VIABLE",
        "selected_rule_family": "DRIVEWAY_WIDTH",
        "selected_plan_fact": {
            "subject": "PROPOSED_PROJECT_FACT", "value": "20", "unit": "ft",
            "sheet": "C001", "pdf_page": 10,
            "measurement_semantics": "CONSTRUCTED_DRIVEWAY_WIDTH",
            "direct_or_derived": "DIRECT_LABELED", "scale_derived": False,
            "source_sha256": envelope["source_sha256"],
            "project_status": envelope["project_status"],
            "proposed_vs_existing": "PROPOSED",
        },
        "requirement": requirement,
        "comparison": comparison,
        "conclusion_scope": "PROPOSED_PLAN_RULE_VALIDATION",
        "city_review_corroboration": {
            "state": "NO_RELEVANT_RULE_SPECIFIC_REVIEW_EVIDENCE",
            "approval_block_blank": True,
            "record_list_statuses": {"PRJ-1110168": "Pending Invoice Payment", "PMT-3269275": "Opened"},
            "record_list_source_sha256": "49541bf72a0a6dc1cf3928c2e2a1ac8963631ed66a43d5204dfdf0dd955c4ea9",
            "silence_treated_as_approval": False,
            "plan_standard_drawing_callout_treated_as_legal_authority": False,
        },
        "bounded_conclusion": "The reference civil plan's directly labeled proposed 20-foot driveway falls within the 12-to-25-foot SDMC Table 142-05M range selected for a greater-than-50-foot residential lot outside the Parking Impact Overlay Zone. This validates only that proposed plan fact against that rule branch.",
        "forbidden_conclusions": [
            "AS_BUILT_COMPLIANCE", "CURRENT_PARCEL_COMPLIANCE", "COMPLETE_PROJECT_APPROVAL",
            "OVERALL_PROJECT_COMPLIANCE", "DEVELOPMENT_CAPACITY", "CITYWIDE_FEASIBILITY",
        ],
        "capacity_calculated": False, "production_wired": False,
    }
    transferability = {
        "contract_version": CONTRACT_VERSION,
        "decision": "THREE_PROJECT_TRANSFERABILITY_SUPPORTED",
        "projects": ["PRJ-1111087", "PRJ-1140985", "PRJ-1110168"],
        "rule_families": ["INTERIOR_SIDE_SETBACK", "WALL_HEIGHT_BUILDING_PERMIT_TRIGGER", "DRIVEWAY_WIDTH"],
        "third_evidence_type": "CIVIL_RIGHT_OF_WAY_IMPROVEMENT_PLAN",
        "third_project_status": envelope["project_status"],
        "same_adapter": "project_evidence_adapter_v0",
        "same_public_private_boundary": True,
        "same_fail_closed_semantics": True,
        "same_shared_decimal_comparator": True,
        "adapter_project_constants": False,
        "architectural_fork_required": False,
    }
    reusable = {
        "contract_version": CONTRACT_VERSION,
        "model": "CIVIL_DIMENSION_EVIDENCE",
        "fields": {
            "feature_type": "enum", "dimension_semantics": "enum", "value": "decimal",
            "unit": "enum", "sheet": "string", "page": "integer", "direct_or_derived": "enum",
            "scale_derived": "boolean", "source_sha256": "sha256", "project_status": "string",
            "subject": "PROPOSED_PROJECT_FACT", "privacy_classification": "PRIVATE_VALIDATION_EVIDENCE",
        },
        "project_constants": False, "parcel_constants": False,
    }
    provenance = {
        "contract_version": CONTRACT_VERSION,
        "public": [
            {"artifact": "Packet 42 public parcel profile", "privacy": "PUBLIC_AUTHORITY"},
            {"artifact": "County Map 1063 evidence", "privacy": "PUBLIC_AUTHORITY"},
            {"artifact": "SDMC 113.0243 and 142.0560(j)(1)/Table 142-05M", "privacy": "PUBLIC_AUTHORITY"},
            {"artifact": "City Parking Impact Overlay layer 7 query", "privacy": "PUBLIC_AUTHORITY"},
        ],
        "private": [
            {"artifact": "PRJ-1110168 C001 direct driveway callout", "privacy": "PRIVATE_VALIDATION_EVIDENCE"},
            {"artifact": "Bounded associated title-sheet use/directionality facts", "privacy": "PRIVATE_VALIDATION_EVIDENCE"},
            {"artifact": "Local record-list status rows", "privacy": "PRIVATE_VALIDATION_EVIDENCE"},
        ],
        "private_plan_published": False,
    }
    decision = {
        "contract_version": CONTRACT_VERSION,
        "viability": "THIRD_BENCHMARK_PROJECT_VIABLE",
        "selected_rule_family": "DRIVEWAY_WIDTH",
        "evaluation": comparison["state"],
        "transferability": "THREE_PROJECT_TRANSFERABILITY_SUPPORTED",
        "corpus_status": "THREE_PROJECT_BENCHMARK_CORPUS_ESTABLISHED",
        "feasibility_suite_addition": ["CIVIL_PLAN_EVIDENCE_TRANSFER", "RIGHT_OF_WAY_RULE_EVALUATION", "BOUNDED_RANGE_COMPARISON"],
        "next": "NEXT_FEASIBILITY_STEP: current-structure compliance geometry",
    }
    contract = {
        "contract_version": CONTRACT_VERSION,
        "project": EXPECTED_PROJECT, "rule_family": "DRIVEWAY_WIDTH",
        "project_fact_subject": "PROPOSED_PROJECT_FACT",
        "result_scope": "PROPOSED_PLAN_RULE_VALIDATION",
        "allowed_result_states": ["PLAN_RULE_REQUIREMENT_SATISFIED", "PLAN_RULE_REQUIREMENT_NOT_SATISFIED", "PLAN_RULE_EVALUATION_UNRESOLVED"],
        "production": False,
    }
    outputs = {
        "contract.json": contract,
        "evidence-inventory.json": inventory,
        "plan-fact-envelope.json": envelope,
        "public-rule-profile.json": {"contract_version": CONTRACT_VERSION, "public_profile": public, "rule_profile": rules},
        "candidate-rule-families.json": candidate_rules(),
        "predicate-resolution.json": predicates,
        "benchmark-result.json": benchmark,
        "transferability.json": transferability,
        "reusable-model.json": reusable,
        "provenance.json": provenance,
        "decision.json": decision,
    }
    outputs["integrity.json"] = integrity_artifact(outputs)
    return outputs


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, value in build_outputs().items():
        (OUTPUT / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()

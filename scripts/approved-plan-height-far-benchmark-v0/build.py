#!/usr/bin/env python3
"""Build deterministic, non-production Packet 50 artifacts."""

from __future__ import annotations

import json
import sys
from copy import deepcopy
from decimal import Decimal, localcontext
from pathlib import Path
from typing import Any

from resolver import (
    CONTRACT_VERSION, EXPECTED_APN, EXPECTED_PROJECT, EXPECTED_STATUS,
    feet_inches_to_decimal, fingerprint, integrity_artifact, recompute_far,
    unresolved_far, unresolved_height,
)

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "approved-plan-height-far-benchmark-v0"
sys.path.insert(0, str(ROOT / "scripts"))
from project_evidence_adapter_v0 import validate_project_evidence_envelope  # noqa: E402


def load(path: Path) -> Any:
    return json.loads(path.read_text())


def corpus_project() -> dict[str, Any]:
    projects = load(ROOT / "data/approved-plan-golden-corpus-v0/pilot-extractions.json")["projects"]
    project = next(value for value in projects if value["project_id"] == EXPECTED_PROJECT)
    if project["address_apn"]["apn"] != EXPECTED_APN or project["plan_status"] != EXPECTED_STATUS:
        raise ValueError("CORPUS_IDENTITY_OR_STATUS_MISMATCH")
    return project


def selected_fact(fact_id: str) -> dict[str, Any]:
    return next(value for value in corpus_project()["facts"] if value["fact_id"] == fact_id)


def base_envelope() -> dict[str, Any]:
    project = corpus_project()
    return {
        "contract_version": CONTRACT_VERSION,
        "project_id": EXPECTED_PROJECT,
        "apn": EXPECTED_APN,
        "address": project["address_apn"]["address"],
        "project_status": EXPECTED_STATUS,
        "plan_set_version": project["plan_date"],
        "subject": "PROPOSED_PROJECT_FACT",
        "sheet_provenance": {"sheet": "T-1", "title": "Title Sheet", "pdf_page": 1, "source_ref": "PRIVATE_PLAN_PRJ-1111087_FOURTH_CD"},
        "legal_survey_line_roles": {"scope": "PLAN_CALCULATED_BOUNDARY", "authority_state": "PLAN_GEOMETRY_ONLY_NOT_PUBLIC_PARCEL_TRUTH"},
        "structure_id": {"scope": "PROJECT_MAXIMUM_ACROSS_SEVEN_PROPOSED_BUILDINGS", "individual_controlling_building": "NOT_IDENTIFIED_IN_BOUNDED_FACT"},
        "geometry_semantics": {"scope": "DIRECT_TITLE_SHEET_PROJECT_DATA", "scale_derived": False},
        "direct_dimensions": {"height_fact_id": "p41-adu-height", "far_fact_id": "p41-adu-far"},
        "height": {"evaluated": False},
        "floor_area": {"evaluated": False},
        "proposed_use_units": {"use": "ACCESSORY_DWELLING_UNITS", "project_units": 26, "program_annotation": "ADU_HOME_DENSITY_BONUS_WITH_AFFORDABLE_ADUS"},
        "project_specific_conditions": {"application_record_date": "2024-01-29", "outside_coastal": True, "inside_sda": True},
        "privacy_classification": "PRIVATE_VALIDATION_EVIDENCE",
        "source_sha256": selected_fact("p41-adu-height")["provenance"]["source_sha256"],
        "public_truth_promotion": False,
    }


def private_facts() -> tuple[dict[str, Any], dict[str, Any]]:
    height = selected_fact("p41-adu-height")
    far = selected_fact("p41-adu-far")
    common = base_envelope()
    common["direct_dimensions"] = {
        "height_label": height["value"], "height_ft": str(feet_inches_to_decimal(height["value"])),
        "far_numerator_sq_ft": str(far["value"]["gross_floor_area_sq_ft"]),
        "far_denominator_sq_ft": str(far["value"]["lot_area_sq_ft"]),
        "far_display_ratio": format(far["value"]["far"], ".2f"),
    }
    common["height"] = {"evaluated": False, "project_maximum_label": height["value"], "measurement_datum": None, "highest_point_semantics": None, "roof_parapet_treatment": None}
    common["floor_area"] = {"evaluated": False, "plan_labeled_numerator_sq_ft": "22219.6", "plan_labeled_denominator_sq_ft": "20084.0", "code_gfa_semantics_proven": False, "total_premises_area_semantics_proven": False}
    validate_project_evidence_envelope(common, expected_project_id=EXPECTED_PROJECT, expected_apn=EXPECTED_APN, allowed_project_statuses={EXPECTED_STATUS})
    height_artifact = {
        "contract_version": CONTRACT_VERSION, "project_id": EXPECTED_PROJECT, "apn": EXPECTED_APN,
        "subject": height["subject"], "privacy_classification": "PRIVATE_VALIDATION_EVIDENCE",
        "fact_id": height["fact_id"], "value_label": height["value"], "value_ft": str(feet_inches_to_decimal(height["value"])),
        "method": height["method"], "source_state": height["source_state"],
        "sheet": height["sheet_number"], "sheet_title": height["sheet_title"], "pdf_page": height["pdf_page"],
        "project_maximum": True, "controlling_building": None, "measurement_datum": None,
        "highest_point_semantics": None, "roof_parapet_treatment": None, "scale_derived": False,
        "source_ref": "PRIVATE_PLAN_PRJ-1111087_FOURTH_CD", "source_sha256": height["provenance"]["source_sha256"],
    }
    far_artifact = {
        "contract_version": CONTRACT_VERSION, "project_id": EXPECTED_PROJECT, "apn": EXPECTED_APN,
        "subject": far["subject"], "privacy_classification": "PRIVATE_VALIDATION_EVIDENCE",
        "fact_id": far["fact_id"], "method": far["method"], "source_state": far["source_state"],
        "sheet": far["sheet_number"], "sheet_title": far["sheet_title"], "pdf_page": far["pdf_page"],
        "numerator_sq_ft": "22219.6", "numerator_label_semantics": "PLAN_PROPOSED_GROSS_FLOOR_AREA",
        "numerator_matches_code_113_0234": None,
        "denominator_sq_ft": "20084.0", "denominator_label_semantics": "PLAN_LOT_AREA_USED_IN_FAR_CALCULATION",
        "denominator_is_total_premises_area": None, "display_ratio": "1.10", "plan_provided_calculation": True,
        "independently_derived_from_geometry": False, "source_ref": "PRIVATE_PLAN_PRJ-1111087_FOURTH_CD",
        "source_sha256": far["provenance"]["source_sha256"],
    }
    return height_artifact, far_artifact


def public_profile() -> dict[str, Any]:
    p42 = load(ROOT / "data/approved-plan-setback-benchmark-v0/public-rule-profile.json")["public_profile"]
    return {
        "contract_version": CONTRACT_VERSION,
        "parcel_identity": deepcopy(p42["parcel_identity"]), "zoning": deepcopy(p42["zoning"]),
        "coastal": deepcopy(p42["coastal"]), "sda": deepcopy(p42["sda"]),
        "authority_classification": "PUBLIC_AUTHORITY", "private_plan_used_to_select_public_truth": False,
        "application_version": {
            "record_opened": "2024-01-29", "selected_profile": "OUTSIDE_COASTAL_O-21618_EFFECTIVE_2023-05-06",
            "ordinance": "O-21618 N.S.", "ordinance_sha256": "a3b3bdbbc9a3d780f099e4404a2c13d82341c73db8abddb23476da988f9ef467",
            "later_o_21758_effective": "2024-03-16", "later_profile_not_selected": True,
        },
        "project_program": {
            "classification": "ADU_HOME_DENSITY_BONUS_PROGRAM", "classification_basis": "PRIVATE_PLAN_ANNOTATION_ONLY",
            "inside_sda_public_predicate": True, "program_eligibility_proven": False, "deed_restriction_recorded_proven": False,
        },
    }


def height_rule() -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION, "family": "HEIGHT", "zone": "RM-2-5",
        "selected_branch": "RM_2_5_BASE_TABLE_CANDIDATE_FOOTNOTE_37_UNRESOLVED",
        "maximum_ft": "40", "operator": "MAX", "source": "SDMC Table 131-04G, RM-2-5, footnotes 18 and 37",
        "source_sha256": "513f34d5245e24ec90b6d2cb2c621cab16b29847dcbfd0ef67c9b697ce464cc9",
        "version_chain": {
            "application_date": "2024-01-29",
            "selected_ordinance_profile": "O-21618_EFFECTIVE_2023-05-06_OUTSIDE_COASTAL",
            "o_21618_table_treatment": "MAXIMUM_DENSITY_THROUGH_MAX_LOT_COVERAGE_NO_CHANGE; HEIGHT_CELL_PREEXISTING",
            "current_cell_used_as_corrobative_transcription": True,
        },
        "measurement": {
            "section": "SDMC 113.0270(a)", "plumb_line": "all top points to lower of existing or proposed grade directly below",
            "overall": "lowest grade within 5 ft or property line to highest structure point; zone maximum plus lesser of footprint grade differential or 10 ft",
            "separate_structures": "measure separately when separated by 6 ft or more",
            "special_circumstances": ["extreme_topographic_variation", "subterranean_areas", "pool", "coastal_height_limit"],
            "roof_parapet": "ordinary top points included; only expressly qualifying exclusions may be omitted",
        },
        "footnote_37": "30 ft only within Coastal Height Limit Overlay Zone in Peninsula Community Plan area",
        "footnote_37_selected": None, "coastal_state": "OUTSIDE_COASTAL",
        "coastal_height_limit_overlay_and_peninsula_predicate": "UNRESOLVED_IN_BOUNDED_PUBLIC_PROFILE",
        "adu_treatment": "ADUs, including multiple/bonus ADUs, remain subject to underlying base-zone and overlay maximum structure height",
        "bonus_height_increase_found": False, "sda_height_increase_found": False,
    }


def far_rule() -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION, "family": "FAR", "zone": "RM-2-5",
        "selected_branch": "RM_2_5_EIGHT_OR_MORE_DWELLING_UNITS", "maximum_ratio": "1.35", "operator": "MAX",
        "source": "SDMC Table 131-04G, RM-2-5, 8 or more dwelling units",
        "source_sha256": "513f34d5245e24ec90b6d2cb2c621cab16b29847dcbfd0ef67c9b697ce464cc9",
        "version_chain": {
            "application_date": "2024-01-29",
            "selected_ordinance_profile": "O-21618_EFFECTIVE_2023-05-06_OUTSIDE_COASTAL",
            "o_21618_rm_2_5_cells": {"one_to_two": "1.35", "three_to_seven": "1.35", "eight_or_more": "1.35"},
            "o_21618_source_sha256": "a3b3bdbbc9a3d780f099e4404a2c13d82341c73db8abddb23476da988f9ef467",
        },
        "definition": "gross floor area of all buildings on a premises divided by total area of that premises",
        "gfa_section": "SDMC 113.0234", "multiple_building_aggregation": True,
        "base_branch_predicates": {"project_units": 26, "eight_or_more": True, "historic_resource_status": "UNRESOLVED_RESULT_INVARIANT_BECAUSE_ALL_RM_2_5_UNIT_BANDS_EQUAL_1_35"},
        "rm_specific_modifiers": {"child_care_bonus": "UNRESOLVED_MONOTONE_INCREASE_CANNOT_DEFEAT_SATISFACTION_AT_OR_BELOW_BASE_MAXIMUM", "rm_5_12_height_bonus": "NOT_APPLICABLE_TO_RM_2_5"},
        "adu_treatment": {
            "general": "ADU gross floor area is included in premises total and underlying-zone FAR applies",
            "one_adu_up_to_800_sq_ft_exception": "retained but branch-invariant only after Code-compatible plan FAR is established",
            "home_density_bonus_override": "NO_SEPARATE_RM_2_5_FAR_MAXIMUM_IDENTIFIED",
            "sda_override": "NO_SEPARATE_RM_2_5_FAR_MAXIMUM_IDENTIFIED",
        },
    }


def build_outputs() -> dict[str, Any]:
    height_fact, far_fact = private_facts()
    public = public_profile()
    h_rule, f_rule = height_rule(), far_rule()
    with localcontext() as context:
        context.prec = 40
        arithmetic = recompute_far(Decimal("22219.6"), Decimal("20084"))
    h_result = unresolved_height(plan_fact=height_fact, rule=h_rule)
    f_result = unresolved_far(plan_fact=far_fact, rule=f_rule)
    height_predicates = {
        "contract_version": CONTRACT_VERSION, "family": "HEIGHT",
        "resolved": {"city_jurisdiction": True, "zone_rm_2_5": True, "outside_coastal": True, "base_maximum_40_ft": True, "adu_uses_base_zone_height": True, "direct_project_maximum_label": True},
        "unresolved": h_result["failed_gates"], "all_comparison_predicates_resolved": False,
    }
    far_predicates = {
        "contract_version": CONTRACT_VERSION, "family": "FAR",
        "resolved": {"city_jurisdiction": True, "zone_rm_2_5": True, "outside_coastal": True, "eight_or_more_units": True, "base_maximum_1_35": True, "direct_plan_calculation": True},
        "unresolved": f_result["failed_gates"], "all_comparison_predicates_resolved": False,
    }
    height_comparison = {"contract_version": CONTRACT_VERSION, "classification": "PROPOSED_PLAN_HEIGHT_VALIDATION", **h_result, "shared_comparator_invoked": False, "prohibited_numeric_comparison": "40.00 <= 40 was not evaluated because semantic gates failed"}
    far_comparison = {"contract_version": CONTRACT_VERSION, "classification": "PROPOSED_PLAN_FAR_VALIDATION", "arithmetic": arithmetic, **f_result, "shared_comparator_invoked": False, "prohibited_numeric_comparison": "recomputed FAR <= 1.35 was not evaluated because semantic gates failed"}
    corroboration = {
        "contract_version": CONTRACT_VERSION,
        "height": {"state": "NO_RELEVANT_RULE_SPECIFIC_REVIEW_EVIDENCE", "silence_treated_as_approval": False},
        "far": {"state": "NO_RELEVANT_RULE_SPECIFIC_REVIEW_EVIDENCE", "silence_treated_as_approval": False},
        "note": "The bounded review evidence used by Packet 42 concerns setback and fire context, not height or FAR acceptance.",
    }
    compatibility = {
        "contract_version": CONTRACT_VERSION, "shared_framework": "dimensional-rule-evaluator-v0-2026-10-01-p37",
        "height": {"operator": "MAX", "decimal_compatible": True, "invoked": False, "reason": "semantic gates fail before comparison"},
        "far": {"operator": "MAX", "decimal_ratio_compatible": True, "new_comparator_required": False, "invoked": False, "reason": "semantic gates fail before comparison"},
        "architectural_fork_required": False,
    }
    provenance = {
        "contract_version": CONTRACT_VERSION,
        "public": [
            {"hop": "APN_TO_SANGIS_PARCEL", "source": "SanGIS Parcels FeatureServer/0", "artifact_sha256": public["parcel_identity"]["artifact_sha256"]},
            {"hop": "PARCEL_TO_BASE_ZONE", "source": "SanGIS Zoning_Base_SD FeatureServer/0", "artifact_sha256": public["zoning"]["artifact_sha256"]},
            {"hop": "PARCEL_TO_COASTAL", "source": "City DSD Zoning Overlay MapServer/2", "artifact_sha256": public["coastal"]["source_artifact_sha256"]},
            {"hop": "PARCEL_TO_SDA", "source": "City DSD Planning MapServer/11", "query_evidence_sha256": public["sda"]["query_evidence_sha256"]},
            {"hop": "APPLICATION_DATE_TO_VERSION_PROFILE", "source": "O-21618 N.S.", "source_sha256": public["application_version"]["ordinance_sha256"]},
            {"hop": "ZONE_TO_HEIGHT_AND_FAR", "source": "SDMC Table 131-04G and §§113.0234, 113.0270, 131.0444, 131.0446", "source_sha256": h_rule["source_sha256"]},
        ],
        "private": [
            {"hop": "AUTHORIZED_PLAN_TO_HEIGHT_FACT", "source_ref": height_fact["source_ref"], "source_sha256": height_fact["source_sha256"], "privacy": "PRIVATE_VALIDATION_EVIDENCE"},
            {"hop": "AUTHORIZED_PLAN_TO_FAR_FACT", "source_ref": far_fact["source_ref"], "source_sha256": far_fact["source_sha256"], "privacy": "PRIVATE_VALIDATION_EVIDENCE"},
        ],
        "boundary": "Private facts supply proposed values and program annotation only; public evidence supplies parcel identity, overlays, version profile, definitions, and base rules.",
    }
    decision = {
        "contract_version": CONTRACT_VERSION,
        "height": "HEIGHT_GOLDEN_BENCHMARK_UNRESOLVED: footnote 37 applicability and plan height datum/highest-point/roof semantics are not sealed",
        "far": "FAR_GOLDEN_BENCHMARK_UNRESOLVED: plan numerator and total-premises denominator semantics are not sealed",
        "artifacts_useful": True,
        "utility": ["maximum-type comparator preconditions validated", "ratio arithmetic independently validated", "fail-closed semantic gates validated", "RM-2-5 8-plus branch reconstructed"],
        "next": "NEXT_FEASIBILITY_STEP: broader RM rule profile",
        "reason": "The largest confidence gain is to seal reusable RM height/FAR definitions, exceptions, and application-version branches before acquiring more project facts.",
    }
    contract = {
        "contract_version": CONTRACT_VERSION, "scope": "ONE_PROJECT_TWO_INDEPENDENT_PROPOSED_PLAN_RULE_FAMILIES",
        "height_states": ["HEIGHT_RULE_REQUIREMENT_SATISFIED", "HEIGHT_RULE_REQUIREMENT_NOT_SATISFIED", "HEIGHT_RULE_EVALUATION_UNRESOLVED"],
        "far_states": ["FAR_RULE_REQUIREMENT_SATISFIED", "FAR_RULE_REQUIREMENT_NOT_SATISFIED", "FAR_RULE_EVALUATION_UNRESOLVED"],
        "cross_family_inference": False, "production": False,
        "forbidden_conclusions": ["AS_BUILT_COMPLIANCE", "FINAL_PERMIT_APPROVAL", "WHOLE_PROJECT_COMPLIANCE", "DEVELOPMENT_CAPACITY", "LEGAL_LOT_STATUS"],
    }
    outputs = {
        "contract.json": contract, "public-parcel-profile.json": public,
        "height-public-rule-profile.json": h_rule, "height-private-plan-fact.json": height_fact,
        "height-predicate-resolution.json": height_predicates, "height-selected-branch.json": {"contract_version": CONTRACT_VERSION, "family": "HEIGHT", "branch": h_rule["selected_branch"], "numeric_maximum_ft": "40", "comparison_authorized": False},
        "height-comparison.json": height_comparison,
        "height-result.json": {"contract_version": CONTRACT_VERSION, "decision": decision["height"], "classification": "PROPOSED_PLAN_HEIGHT_VALIDATION", "comparison_state": h_result["state"], "whole_project_compliance": False},
        "far-public-rule-profile.json": f_rule, "far-private-plan-fact.json": far_fact,
        "far-predicate-resolution.json": far_predicates, "far-selected-branch.json": {"contract_version": CONTRACT_VERSION, "family": "FAR", "branch": f_rule["selected_branch"], "numeric_maximum_ratio": "1.35", "comparison_authorized": False},
        "far-comparison.json": far_comparison,
        "far-result.json": {"contract_version": CONTRACT_VERSION, "decision": decision["far"], "classification": "PROPOSED_PLAN_FAR_VALIDATION", "comparison_state": f_result["state"], "whole_project_compliance": False},
        "city-review-corroboration.json": corroboration, "evaluator-compatibility.json": compatibility,
        "provenance.json": provenance, "decision.json": decision,
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

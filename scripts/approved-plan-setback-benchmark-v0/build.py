#!/usr/bin/env python3
"""Build deterministic, non-production Packet 42 benchmark artifacts."""

from __future__ import annotations

import json
import sys
from decimal import Decimal
from pathlib import Path
from typing import Any

from resolver import (
    CONTRACT_VERSION,
    compare_plan_setback,
    fingerprint,
    integrity_artifact,
    reconcile_zone,
    select_setback_requirement,
    validate_plan_fact_envelope,
)

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "approved-plan-setback-benchmark-v0"
sys.path.insert(0, str(ROOT / "scripts"))
from dimensional_rule_evaluator_v0 import compare_values  # noqa: E402


def plan_envelope() -> dict[str, Any]:
    envelope = {
        "contract_version": CONTRACT_VERSION,
        "project_id": "PRJ-1111087",
        "apn": "5442140600",
        "address": "639-659 N 67th Street, San Diego, CA 92114",
        "project_status": "FOURTH_CD_SUBMITTAL_NOT_PROVEN_ISSUED",
        "application_record_date": "2024-01-29",
        "application_record_provenance": {"source_ref": "PRIVATE_CITY_RECORD_EXPORT_PRJ-1111087", "source_sha256": "49541bf72a0a6dc1cf3928c2e2a1ac8963631ed66a43d5204dfdf0dd955c4ea9"},
        "plan_set_version": "2026-05-09_PRINTED_LATEST_ISSUE; 2026-05-18_FILE_REVISION",
        "subject": "PROPOSED_PROJECT_FACT",
        "sheet_provenance": {"sheet": "A0.1", "title": "Architectural Site Plan", "pdf_page": 15, "source_ref": "PRIVATE_PLAN_PRJ-1111087_FOURTH_CD"},
        "legal_survey_line_roles": {"selected_line": "NORTH_INTERIOR_PROPERTY_LINE", "label": "PROPERTY LINE - 199.59 FT", "authority_state": "PLAN_GEOMETRY_ONLY_NOT_PUBLIC_PARCEL_TRUTH"},
        "structure_id": {"building": "BUILDING_1", "address_label": "641 67TH ST", "units": ["ADU_1", "ADU_2"], "stories": 2},
        "geometry_semantics": {"origin": "NORTH_INTERIOR_PROPERTY_LINE", "target": "OUTER_BUILDING_FRAME_OF_ENCLOSED_ADU_AREA", "direction": "PERPENDICULAR_INWARD", "scale_derived": False, "roofed_balcony_used_as_target": False},
        "direct_dimensions": {"proposed_setback_ft": "5.958333333333333333333333333", "plan_label": "5 FT 11-1/2 IN", "rule_line_annotation_ft": "4", "evidence_class": "GOLDEN_PLAN_DIMENSION"},
        "height": {"selected_structure_stories": 2, "project_max_height_label": "40 FT 0 IN", "evaluated": False},
        "floor_area": {"project_far_label": "1.10", "project_gross_floor_area_sq_ft": "22219.6", "evaluated": False},
        "proposed_use_units": {"use": "ACCESSORY_DWELLING_UNITS", "project_units": 26, "selected_building_units": 2, "program_annotation": "ADU_HOME_DENSITY_BONUS_WITH_AFFORDABLE_ADUS"},
        "project_specific_conditions": {"mapped_vhfhsz": True, "fire_review_comment_279": "CLOSED_INFORMATION_ONLY", "greater_property_line_setback_imposed_for_building_1": False, "roofed_balcony_base_setback_issue": "SEPARATE_OPEN_PLANNING_COMMENT_NOT_SELECTED_GEOMETRY", "planning_review_source_sha256": "e8a1757223ca62f5c217f10e4df310f0623470e77e5e54e26ccd2ddc1cfc759a", "fire_review_source_sha256": "3dd65d8143a2fd188d575d044e6ec5166fabb4f823beea2dba4e80fea32605bf"},
        "privacy_classification": "PRIVATE_VALIDATION_EVIDENCE",
        "source_sha256": "93d8bae01e2f1458f9a65ced9b06c7df55d2c593db8b7dd26ae68207b7d68b12",
        "public_truth_promotion": False,
    }
    validate_plan_fact_envelope(envelope)
    envelope["fingerprint_sha256"] = fingerprint(envelope)
    return envelope


def public_profile() -> dict[str, Any]:
    zoning = reconcile_zone("RM-2-5", "RM-2-5")
    return {
        "contract_version": CONTRACT_VERSION,
        "parcel_identity": {
            "apn": "5442140600", "parcel_id": 53299, "source_object_id": 7815,
            "situs": "639 N 67TH ST, SAN DIEGO, CA 92114-2910", "jurisdiction": "CITY_OF_SAN_DIEGO",
            "legal_description": "BLOCK 7 LOT 4", "subdivision": "ENCANTO HEIGHTS", "map_reference": "1063",
            "parcel_acquisition": "sangis-20260924T183743Z", "source_currency": "2026-08-29",
            "artifact_sha256": "07913d1007d0e2f5b80c681c19c76bb1338f4b06d99c401c1784744bbd1a4544",
        },
        "zoning": {
            **zoning, "mapping_state": "SINGLE_ZONE", "detailed_mapping_state": "BOUNDARY_SLIVER",
            "principal_feature": {"objectid": 1888, "zone": "RM-2-5", "intersection_sq_ft": "20343.024965", "share": "0.999995123815", "ordinance": "O-20580 N.S.", "implementation_date": "2016-01-14"},
            "retained_secondary": {"objectid": 1866, "zone": "RS-1-6", "intersection_sq_ft": "0.099197", "share": "0.000004876186", "classification": "BOUNDARY_SLIVER"},
            "acquisition": "zoning-city-sd-20260930T024032Z", "acquired_at": "2026-09-30T02:40:39.064005Z", "source_modified_at": "2026-08-10T22:44:01.705Z", "artifact_sha256": "7f65bfd9bb0ea11fda8537e3fc121c0d8e37f15c37f82d1f00afa7a0fa6542b6",
        },
        "coastal": {"state": "OUTSIDE_COASTAL", "intersection_sq_ft": "0", "acquisition": "coastal-city-sd-20260930T143055Z", "source_artifact_sha256": "9b7b744247278000123a56965597917cdc560db4de78c539f4876aa09b267f97"},
        "sda": {"state": "INSIDE_SDA", "feature_objectid": 1548, "feature_name": "Sustainable Development Area", "intersection_share": "0.999999999981", "source": "City DSD Planning MapServer layer 11", "query_evidence_sha256": "2bacc1003b8262a5c8f34ea18513c2756d17b83b609924ef182975d2bf36f117"},
        "fire": {"state": "CITY_VHFHSZ_INTERSECTION_SUPPORTED", "intersection_share": "1.0", "map": "City of San Diego Fire Hazard Severity Zone Map 2025", "effective_date": "2025-08-30", "layer": "COSD_CalFire_FHSZ_LRA_Dissolve", "query_evidence_sha256": "a840518dec4c382dca8c6976a3f87f3e31b32d64269aa6966aa686adac0d16f4", "mapped_geography_is_final_project_requirement": False},
        "adjacent_premises": {"line": "NORTH_INTERIOR_PROPERTY_LINE", "apn": "5442140500", "situs": "713 67TH ST", "legal_description": "BLOCK 7 LOT 3", "zone": "RS-1-6", "residentially_zoned": True, "parcel_objectid": 7814, "zone_objectid": 1866},
        "authority_classification": "PUBLIC_AUTHORITY",
    }


def rule_profile() -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "project_program": {"classification": "ADU_HOME_DENSITY_BONUS_PROGRAM", "basis": "Private plan expressly identifies affordable and bonus ADUs; classification is not inferred from unit count.", "sda_dependency": "PUBLIC_SDA_MEMBERSHIP_SUPPORTED", "deed_restriction_state": "PLAN_STATED_NOT_INDEPENDENTLY_RECORDED", "eligibility_or_capacity_evaluated": False},
        "application_version": {"record_opened": "2024-01-29", "selected_profile": "OUTSIDE_COASTAL_O-21618_EFFECTIVE_2023-05-06", "section": "SDMC 141.0302(c)(2)(G)(ii)", "ordinance_source": "O-21618 N.S.", "ordinance_source_sha256": "a3b3bdbbc9a3d780f099e4404a2c13d82341c73db8abddb23476da988f9ef467", "rule_text_source": "O-21758 strikeout ordinance old-language baseline", "rule_text_source_sha256": "5a1584050862cc02fa8427466f5eeff372b32a8b1bcbb92e0d8814e5f65f77cb", "later_o_21758_effective": "2024-03-16", "city_review_corroboration": "2026 Planning Comment 00332 distinguishes the reduced ADU setback from the 10-foot roofed-balcony base setback."},
        "adu_setbacks": {
            "front": {"rule": "BASE_ZONE_FRONT_SETBACK", "exceptions_not_evaluated": True},
            "interior_side": {"rule": "ZERO_IF_ONE_STORY_AT_OR_BELOW_16_FT; FOUR_FT_IF_TALLER_OR_MULTISTORY_AND_ADJOINING_PREMISES_IS_RESIDENTIAL", "selected_required_ft": "4"},
            "rear": {"rule": "SAME_HEIGHT_AND_ADJACENCY_BRANCH_AS_INTERIOR_SIDE", "evaluated": False},
            "street_side": {"rule": "BASE_ZONE_STREET_SIDE_SETBACK", "evaluated": False},
        },
        "current_forward_profile": {"ordinance": "O-21989 N.S.", "effective_outside_coastal": "2025-08-22", "section": "SDMC 141.0302(b)(9)(D)(ii)", "compiled_code_edition": "9-2026", "compiled_code_source_sha256": "fd641f3de53b183ea1e163838d573be8f50b81b5bfb2bb9976923bbee9d0ecd1", "minimum_ft_in_high_or_vhfhsz": "4", "fire_official_may_require_greater": True, "used_for_selected_application_comparison": False, "limitation": "A new/current-profile application would require containment of any project-specific greater Fire Official setback before comparison."},
        "rm_2_5_base_setbacks": {
            "source": "SDMC Table 131-04G (9-2026)", "source_sha256": "9a15478c65d5498e79e85e3399d7c18ec198436cc008cf87c34e7408bf2aa538",
            "front": {"minimum_ft": 15, "standard_ft": 20, "condition": "Section 131.0443(e)(1) envelope allocation applies."},
            "interior_side": {"minimum_ft": 5, "condition": "Section 131.0443(e)(2): 5 feet or 10 percent of premises width, whichever is greater, subject to listed narrow-premises exceptions."},
            "street_side": {"minimum_ft": 10, "condition": "Section 131.0443(e)(3) applies."},
            "rear": {"minimum_ft": 15, "condition": "Section 131.0443(e)(4) and alley credit conditions apply."},
        },
    }


def build_outputs() -> dict[str, Any]:
    envelope = plan_envelope()
    public = public_profile()
    rules = rule_profile()
    requirement = select_setback_requirement(
        subject=envelope["subject"], family="INTERIOR_SIDE_SETBACK", multistory=True,
        adjacent_residential=public["adjacent_premises"]["residentially_zoned"],
        outside_coastal=public["coastal"]["state"] == "OUTSIDE_COASTAL",
        application_profile=rules["application_version"]["selected_profile"],
        fire_override_applies_to_profile=False, greater_fire_setback_ft=None,
    )
    proposed = Decimal(envelope["direct_dimensions"]["proposed_setback_ft"])
    comparison = compare_plan_setback(proposed_ft=proposed, requirement=requirement)
    shared = compare_values(measured=proposed, required=Decimal("4"), unit="ft", operator="MIN", expression="proposed_plan_setback_ft >= applicable_required_setback_ft")
    if comparison["state"] != "PLAN_RULE_REQUIREMENT_SATISFIED" or shared.state != "RULE_REQUIREMENT_SATISFIED":
        raise ValueError("SHARED_EVALUATOR_PARITY_FAILURE")
    benchmark = {
        "contract_version": CONTRACT_VERSION,
        "project_identity": {"project_id": envelope["project_id"], "apn": envelope["apn"]},
        "plan_status": envelope["project_status"], "conclusion_scope": "PROPOSED_PLAN_RULE_VALIDATION",
        "selected_setback_family": "INTERIOR_SIDE_SETBACK",
        "selected_structure": envelope["structure_id"],
        "property_line": envelope["legal_survey_line_roles"]["selected_line"],
        "measurement_semantics": envelope["geometry_semantics"],
        "required_setback_ft": requirement["required_ft"],
        "direct_proposed_setback_ft": envelope["direct_dimensions"]["proposed_setback_ft"],
        "requirement": requirement, "comparison": comparison,
        "city_review_corroboration": {"state": "CITY_REVIEWER_QUESTIONED_CORRECTED_SEPARATE_ELEMENT", "comment": "Planning Comment 00332 requires roofed balconies at the 10-foot base-zone setback and says only fully enclosed ADU area may use the reduced ADU setback.", "selected_building_frame_is_roofed_balcony": False, "silence_treated_as_approval": False, "fire_comment": "Fire Comment 00279 confirms VHFHSZ context and no brush-management comment; it is not treated as a general approval."},
        "privacy": {"plan_evidence": "PRIVATE_VALIDATION_EVIDENCE", "public_profile": "PUBLIC_AUTHORITY", "private_plan_promoted_to_public_truth": False, "private_path_in_output": False, "private_plan_published": False},
        "forbidden_conclusions": ["APPROVED_COMPLIANCE", "PERMITTED_CONDITION", "CONSTRUCTED_COMPLIANCE", "AS_BUILT_COMPLIANCE", "OVERALL_PROJECT_FEASIBILITY", "DEVELOPMENT_CAPACITY", "HEIGHT_COMPLIANCE", "FAR_COMPLIANCE"],
        "height_evaluated": False, "far_evaluated": False, "capacity_calculated": False, "production_wired": False,
        "bounded_conclusion": "The submitted Building 1 north enclosed-ADU frame dimension of 5 feet 11-1/2 inches is at least the independently selected 4-foot application-profile interior-side minimum. This is only a proposed-plan rule comparison.",
    }
    compatibility = {
        "contract_version": CONTRACT_VERSION, "shared_framework": "dimensional-rule-evaluator-v0-2026-10-01-p37",
        "adapter": "ProjectEvidenceAdapter/PlanFactEnvelope", "architectural_fork_required": False,
        "shared_numeric_result": shared.state, "packet_result": comparison["state"], "parity": True,
        "minimal_extension": "Accept PROPOSED_PROJECT_FACT with plan-status and private-provenance gates while retaining the shared Decimal MIN comparison.",
    }
    provenance = {
        "contract_version": CONTRACT_VERSION,
        "public": [
            {"hop": "APN_TO_SANGIS_PARCEL", "source": "SanGIS Parcels FeatureServer/0", "acquisition": "sangis-20260924T183743Z"},
            {"hop": "PARCEL_TO_BASE_ZONE", "source": "SanGIS Zoning_Base_SD FeatureServer/0", "acquisition": "zoning-city-sd-20260930T024032Z"},
            {"hop": "PARCEL_TO_COASTAL", "source": "City DSD Zoning Overlay MapServer/2", "acquisition": "coastal-city-sd-20260930T143055Z"},
            {"hop": "PARCEL_TO_SDA", "source": "City DSD Planning MapServer/11", "query_evidence_sha256": public["sda"]["query_evidence_sha256"]},
            {"hop": "PARCEL_TO_FIRE", "source": "City-adopted FHSZ FeatureServer/21", "query_evidence_sha256": public["fire"]["query_evidence_sha256"]},
            {"hop": "APPLICATION_PROFILE_TO_RULE", "source": "SDMC 141.0302 / O-21618 plus O-21758 old-language baseline", "ordinance_source_sha256": rules["application_version"]["ordinance_source_sha256"], "rule_text_source_sha256": rules["application_version"]["rule_text_source_sha256"]},
        ],
        "private": [
            {"hop": "AUTHORIZED_PLAN_TO_PLAN_FACT_ENVELOPE", "source_ref": envelope["sheet_provenance"]["source_ref"], "source_sha256": envelope["source_sha256"], "privacy": envelope["privacy_classification"]},
            {"hop": "CITY_RECORD_EXPORT_TO_APPLICATION_DATE", **envelope["application_record_provenance"], "privacy": envelope["privacy_classification"]},
            {"hop": "CITY_REVIEW_RECORDS_TO_CORROBORATION", "planning_source_sha256": envelope["project_specific_conditions"]["planning_review_source_sha256"], "fire_source_sha256": envelope["project_specific_conditions"]["fire_review_source_sha256"], "privacy": envelope["privacy_classification"]},
        ],
        "boundary": "Private facts corroborate project geometry and program selection only; public sources determine parcel, zoning, overlays, and law.",
    }
    contract = {
        "contract_version": CONTRACT_VERSION, "scope": "ONE_PROJECT_ONE_STRUCTURE_ONE_INTERIOR_SIDE_SETBACK",
        "result_states": ["PLAN_RULE_REQUIREMENT_SATISFIED", "PLAN_RULE_REQUIREMENT_NOT_SATISFIED", "PLAN_RULE_EVALUATION_UNRESOLVED"],
        "unresolved_rule_selection_state": "PLAN_SETBACK_VALIDATION_UNRESOLVED",
        "plan_fact_subjects": ["PROPOSED_PROJECT_FACT", "EXISTING_PARCEL_FACT"],
        "conclusion_scope": "PROPOSED_PLAN_RULE_VALIDATION", "production": False,
    }
    decision = {"contract_version": CONTRACT_VERSION, "decision": "APPROVED_PLAN_SETBACK_BENCHMARK_V0_READY", "next": "NEXT_FEASIBILITY_STEP: expand approved-plan setback benchmarks", "reason": "A second project is now more valuable than extracting additional fact families from the same plan because it tests transferability of the adapter and rule-selection gates."}
    outputs = {
        "contract.json": contract, "plan-fact-envelope.json": envelope,
        "public-rule-profile.json": {"public_profile": public, "rule_profile": rules},
        "benchmark-result.json": benchmark, "evaluator-compatibility.json": compatibility,
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

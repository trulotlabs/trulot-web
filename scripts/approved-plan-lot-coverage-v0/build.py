#!/usr/bin/env python3
"""Build deterministic Packet 54 lot-coverage evaluation artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from resolver import CONTRACT_VERSION, decimal_sum, integrity_artifact

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "approved-plan-lot-coverage-v0"

PLAN_SHA = "93d8bae01e2f1458f9a65ced9b06c7df55d2c593db8b7dd26ae68207b7d68b12"
RM_PROFILE_BUNDLE_SHA = "2016a33bb1757254216d9158fd5524638b9a11687533123a99ca582a5643b2c4"
MEASUREMENT_SHA = "5766096f34fe5d5fd6b807e6c9aaa40393f31e6c4c76d85ff4de68cff032a345"
PACKET52A_PREMISES_SHA = "d5d9033c25cc9c2c7385549185cafe90f4c7ae556234b068100af37bd4744e60"


def plan(sheet: str, pdf_page: int, evidence: str) -> dict[str, Any]:
    return {
        "source_ref": "PRIVATE_PLAN_PRJ-1111087_FOURTH_CD",
        "source_sha256": PLAN_SHA,
        "sheet": sheet,
        "pdf_page": pdf_page,
        "evidence": evidence,
    }


def component(
    component_id: str,
    building_id: str,
    footprint_type: str,
    area: str | None,
    sheet: str,
    page: int,
    *,
    roofed: str,
    enclosed: str,
    structural: str,
    inclusion: str,
    uncertainty: str | None,
    evidence: str,
) -> dict[str, Any]:
    return {
        "component_id": component_id,
        "building_id": building_id,
        "footprint_type": footprint_type,
        "direct_labeled_area_sq_ft": area,
        "roofed_state": roofed,
        "enclosure_state": enclosed,
        "structural_state": structural,
        "coverage_inclusion_state": inclusion,
        "uncertainty": uncertainty,
        "provenance": [plan(sheet, page, evidence)],
    }


def building_rows() -> list[dict[str, Any]]:
    labels = [
        ("BUILDING_1_641", "1544.4"),
        ("BUILDING_2_643", "1516.8"),
        ("BUILDING_3_645", "1516.8"),
        ("BUILDING_4_647", "1516.8"),
        ("BUILDING_5_649", "1836.6"),
        ("BUILDING_5_651", "1804.6"),
        ("BUILDING_6_653", "1804.6"),
        ("BUILDING_6_655", "1804.6"),
        ("BUILDING_7_657", "1804.6"),
        ("BUILDING_7_659", "1804.6"),
    ]
    return [
        component(
            f"{building_id}_PLAN_VIEW_AREA",
            building_id,
            "PROPOSED_BUILDING_PLAN_VIEW_OUTLINE",
            area,
            "A0.1",
            15,
            roofed="YES",
            enclosed="MIXED_ENCLOSED_AND_GARAGE_LEVEL",
            structural="YES",
            inclusion="SUPPORTED_COMPONENT_BUT_NOT_COMPLETE_CODE_NUMERATOR",
            uncertainty="A0.1 directly labels an area within each plan-view building outline, but does not call the label lot-coverage footprint or prove that all exterior supports and every Section 113.0240 exclusion are reconciled.",
            evidence=f"Plan-view building outline labeled {area} S.F.; A0.2-A0.3 and roof plans corroborate the multi-level outline",
        )
        for building_id, area in labels
    ]


def build_outputs() -> dict[str, Any]:
    proposed = building_rows()
    proposed_subtotal = decimal_sum([row["direct_labeled_area_sq_ft"] for row in proposed if row["direct_labeled_area_sq_ft"]])
    other = [
        component(
            "EXISTING_HOUSE",
            "EXISTING_HOUSE_639",
            "RETAINED_EXISTING_BUILDING",
            None,
            "A0.1",
            15,
            roofed="YES",
            enclosed="YES",
            structural="YES",
            inclusion="INCLUDED_AREA_UNRESOLVED",
            uncertainty="T-1 labels 719.0 S.F. for the existing single-family home, but that is not labeled as the Section 113.0240 exterior-wall/support footprint.",
            evidence="Existing house is shown in solid outline; the adjacent existing garage alone is dashed and labeled TO BE REMOVED",
        ),
        component(
            "EXISTING_GARAGE",
            "EXISTING_SITE",
            "DEMOLISHED_EXISTING_ACCESSORY_STRUCTURE",
            None,
            "A0.1",
            15,
            roofed="YES",
            enclosed="UNRESOLVED",
            structural="YES",
            inclusion="EXCLUDED_DEMOLISHED",
            uncertainty=None,
            evidence="Dashed outline explicitly labeled EXISTING GARAGE TO BE REMOVED",
        ),
    ]
    garage_ids = ["BUILDING_1_641", "BUILDING_2_643", "BUILDING_3_645", "BUILDING_4_647", "BUILDING_5_649", "BUILDING_5_651", "BUILDING_6_653", "BUILDING_6_655", "BUILDING_7_657", "BUILDING_7_659"]
    garages = [
        component(
            f"GARAGE_{index}",
            building_id,
            "INTEGRATED_TUCK_UNDER_GARAGE",
            "514.0",
            "T-1",
            1,
            roofed="YES",
            enclosed="ENCLOSED_EXCEPT_VEHICLE_OPENING",
            structural="YES",
            inclusion="INCLUDED_WITHIN_PARENT_BUILDING_FOOTPRINT_NOT_ADDITIVE",
            uncertainty=None,
            evidence="Direct 514.0 S.F. garage schedule; A0.2 shows garage within the parent building outline",
        )
        for index, building_id in enumerate(garage_ids, 1)
    ]
    decks = [
        component(
            f"DECK_{index}",
            building_id,
            "OPEN_EXTERIOR_DECK",
            None,
            sheet,
            page,
            roofed="NO",
            enclosed="OPEN",
            structural="YES",
            inclusion="EXCLUDED_OPEN_UNROOFED_PROJECTION",
            uncertainty="The plan schedule conflicts between 6 x 62.0 S.F. and a 327.6 S.F. total; area is immaterial to coverage because direct roof/elevation evidence supports exclusion of the open unroofed deck planes.",
            evidence="Second-floor deck; upper plan identifies DECK BELOW; roof/elevation evidence shows no deck roof",
        )
        for index, (building_id, sheet, page) in enumerate([
            ("BUILDING_5_649", "A1.10", 33),
            ("BUILDING_5_651", "A1.10", 33),
            ("BUILDING_6_653", "A1.14", 37),
            ("BUILDING_6_655", "A1.14", 37),
            ("BUILDING_7_657", "A1.18", 41),
            ("BUILDING_7_659", "A1.18", 41),
        ], 1)
    ]
    projections = [
        component("EAVES_AND_ROOF_OVERHANGS", "PROPOSED_BUILDINGS", "ARCHITECTURAL_PROJECTION", None, "A0.5/A0.7", 19, roofed="YES", enclosed="OPEN", structural="NO", inclusion="EXCLUDED_ARCHITECTURAL_PROJECTION", uncertainty="No project-wide direct area is labeled; no area is needed for the exclusion classification.", evidence="Roof plans distinguish roof edges from exterior-wall building outlines"),
        component("EXTERIOR_STAIRS_AND_LANDINGS", "PROPOSED_BUILDINGS", "OPEN_CIRCULATION_PROJECTION_OR_SUPPORT", None, "A0.2/A0.3", 16, roofed="MIXED_OR_UNRESOLVED", enclosed="OPEN", structural="YES", inclusion="UNRESOLVED_COMPONENT", uncertainty="The plans show exterior stairs and landings, but the bounded sheets do not supply a direct aggregate footprint or seal every Section 113.0240 open-projection predicate.", evidence="Lower- and second-level site plans show exterior inter-building stair and landing systems"),
    ]
    trash = component(
        "TRASH_ENCLOSURE",
        "SITE_ACCESSORY",
        "TRASH_ENCLOSURE_SITE_ALLOCATION",
        "300.0",
        "A0.1",
        15,
        roofed="UNRESOLVED",
        enclosed="PARTIAL_OR_UNRESOLVED",
        structural="YES",
        inclusion="UNRESOLVED_COMPONENT",
        uncertainty="The 300 S.F. label establishes an allocation, not the roof state or Code footprint treatment.",
        evidence="Site plan labels TRASH 300 S.F.; bounded elevation evidence does not establish a roof",
    )
    ledger = proposed + other + garages + decks + projections + [trash]

    rule_existence = {
        "contract_version": CONTRACT_VERSION,
        "decision": "LOT_COVERAGE_RULE_NOT_SPECIFIED",
        "zone": "RM-2-5",
        "profile": "RM25_2023_05_06_OUTSIDE_COASTAL",
        "application_date": "2024-01-29",
        "table": "SDMC Table 131-04G",
        "row": "Maximum lot coverage",
        "cell": "—",
        "normalized_rule_id": "RM25_LOT_COVERAGE",
        "normalized_comparator": "NOT_SPECIFIED",
        "numeric_maximum": None,
        "qualitative_requirement": None,
        "footnotes": [],
        "meaning": "The historical RM-2-5 base-zone table supplies no numeric or qualitative maximum lot-coverage standard. The dash is not converted into zero, unlimited, or a borrowed standard.",
    }
    definition = {
        "contract_version": CONTRACT_VERSION,
        "section": "SDMC 113.0240",
        "formula": "QUALIFYING_STRUCTURE_FOOTPRINT_AT_OUTER_EXTERIOR_WALLS_OR_SUPPORT_STRUCTURE / REGULATORY_LOT_AREA",
        "numerator": "Aggregate qualifying footprint of all structures, measured at outer exterior walls or support structure, after express exclusions.",
        "denominator": "Regulatory lot area; a plan label, APN, or approximate traverse is not silently promoted to exact legal lot area.",
        "multiple_buildings": "Aggregate without overlapping or double-counting nested uses such as garages inside a parent building outline.",
        "treatments": {
            "covered_projections": "Count unless an express Section 113.0240 exclusion is supported.",
            "roofed_patios_or_decks": "Potentially excluded only under the section's roofed-area predicates, including the applicable exterior-wall condition; otherwise count.",
            "garages_and_carports": "Ordinary above-grade footprint counts; qualifying underground/low-above-grade portions follow the express exclusion.",
            "accessory_structures": "Count when their exterior walls or supports create qualifying structure footprint.",
            "trash_enclosure": "Classification depends on roof, wall, and support facts; a site allocation alone is insufficient.",
            "eaves_and_architectural_overhangs": "Express architectural projections are excluded.",
            "uncovered_hardscape": "Excluded because it is not structure footprint.",
            "pools": "Excluded from this structure-footprint numerator absent a separate qualifying structure.",
            "below_grade_structures": "Qualifying underground parking, first stories, and basements at no more than three feet above grade are excluded under the express predicates.",
            "solar_system_exterior_portions": "Excluded under the express solar-system provision.",
        },
        "source_sha256": MEASUREMENT_SHA,
        "historical_use": "Project-fact semantics only in this packet because RM-2-5 has no base-zone maximum; no current rule is substituted for the historical table.",
    }
    evidence_inventory = {
        "contract_version": CONTRACT_VERSION,
        "privacy": "PRIVATE_OPERATOR_AUTHORIZED_NOT_PUBLISHED",
        "source_sha256": PLAN_SHA,
        "sheets": [
            {"sheet": "T-1", "pdf_page": 1, "use": ["project/zone identity", "lot-area label", "existing house area", "garage/deck schedules", "search for stated coverage"]},
            {"sheet": "C-1", "pdf_page": 6, "use": ["legal description", "non-precise boundary traverse context"]},
            {"sheet": "C002", "pdf_page": 11, "use": ["grading and proposed building footprints"]},
            {"sheet": "A0.1", "pdf_page": 15, "use": ["ten direct plan-view building area labels", "existing house retained", "existing garage removed", "trash allocation"]},
            {"sheet": "A0.2-A0.3", "pdf_pages": [16, 17], "use": ["lower/second-level outlines", "garages", "stairs", "decks"]},
            {"sheet": "A0.5/A0.7", "pdf_pages": [19, 21], "use": ["roof outlines", "overhangs", "deck roof-state corroboration"]},
            {"sheet": "A1.1-A1.19", "pdf_pages": [24, 42], "use": ["garage integration", "open-deck and story corroboration"]},
        ],
        "irrelevant_pages_ingested": False,
    }
    existing = {
        "contract_version": CONTRACT_VERSION,
        "house_state": "RETAINED",
        "garage_state": "DEMOLISHED",
        "house_direct_floor_area_label_sq_ft": "719.0",
        "house_code_footprint_sq_ft": None,
        "reason": "A0.1 shows the house in solid outline and separately labels the dashed existing garage TO BE REMOVED. The 719.0 S.F. title-sheet value is not labeled as exterior-wall/support footprint.",
    }
    garage_treatment = {
        "contract_version": CONTRACT_VERSION,
        "count": 10,
        "direct_schedule_area_each_sq_ft": "514.0",
        "coverage_state": "INCLUDED_WITHIN_PARENT_BUILDING_FOOTPRINT_NOT_ADDITIVE",
        "reason": "The tuck-under garages are roofed structural portions of the proposed buildings. A0.2 places each inside its parent outline, so adding 5,140 S.F. to the ten building labels would double count.",
        "far_semantics_reused": False,
    }
    deck_treatment = {
        "contract_version": CONTRACT_VERSION,
        "decks": {"count": 6, "roofed": False, "open": True, "coverage_state": "EXCLUDED_OPEN_UNROOFED_PROJECTION"},
        "schedule_conflict": {"six_times_each_sq_ft": "372.0", "stated_total_sq_ft": "327.6", "difference_sq_ft": "44.4", "coverage_effect": "NONE_FOR_DECK_PLANES_BECAUSE_EXCLUDED"},
        "balconies": "No additional separately quantified balcony footprint is promoted.",
        "canopies": "No project-wide canopy area or complete treatment is established.",
        "eaves_and_overhangs": "Architectural roof projections are excluded; no area is added.",
        "stairs": "Exterior stairs/landings remain unresolved because direct aggregate footprint and every open-projection predicate are absent.",
    }
    covered_area = {
        "contract_version": CONTRACT_VERSION,
        "state": "CODE_COMPATIBLE_COVERED_AREA_UNRESOLVED",
        "exact_sq_ft": None,
        "defensible_range_sq_ft": None,
        "proposed_building_plan_view_label_subtotal_sq_ft": proposed_subtotal,
        "subtotal_semantics": "DIAGNOSTIC_PROPOSED_BUILDING_LABEL_SUBTOTAL_NOT_CODE_NUMERATOR",
        "known_missing_or_unresolved": ["retained existing house exterior-wall/support footprint", "exterior stair/landing treatment and aggregate area", "trash-enclosure roof/wall/support treatment", "confirmation that A0.1 labels reconcile every Section 113.0240 inclusion/exclusion"],
        "reason_no_range": "Unresolved components are not bounded on both sides by direct footprint areas, so a closed minimum/maximum Code-compatible range would be fabricated.",
    }
    denominator = {
        "contract_version": CONTRACT_VERSION,
        "required_semantic": "REGULATORY_LOT_AREA",
        "packet_52a_state": "LEGAL_PREMISES_AREA_PARTIAL",
        "exact_sq_ft": None,
        "plan_label_candidate_sq_ft": "20084.0",
        "non_precise_c1_traverse_candidate_sq_ft": "20084.272422",
        "identity": "Lot 4, Block 7, Encanto Heights, Map 1063",
        "reason": "Packet 52A established identity but no exact recorded or survey-controlled area; this packet does not reopen that research loop.",
    }
    stated = {
        "contract_version": CONTRACT_VERSION,
        "search_terms": ["lot coverage", "building coverage", "coverage percentage", "footprint percentage"],
        "state": "NO_PLAN_STATED_COVERAGE_FOUND",
        "percentage": None,
        "covered_area_sq_ft": None,
        "note": "Building-area and lot-area labels are preserved separately and are not recast as a plan-stated coverage calculation.",
    }
    computation = {
        "contract_version": CONTRACT_VERSION,
        "formula": "covered area / applicable lot area",
        "arithmetic": "Decimal",
        "exact_ratio": None,
        "diagnostic_range": None,
        "reason": "Neither a complete Code-compatible numerator nor an exact regulatory lot-area denominator is supported.",
    }
    comparison = {
        "contract_version": CONTRACT_VERSION,
        "state": "LOT_COVERAGE_RULE_NOT_APPLICABLE_AS_NUMERIC_BASE_STANDARD",
        "comparison": None,
        "maximum": None,
        "reason": "The historical RM-2-5 maximum-lot-coverage cell is a dash and the sealed profile has comparator NOT_SPECIFIED.",
    }
    project_fact = {
        "contract_version": CONTRACT_VERSION,
        "classification": "PROPOSED_PROJECT_FACT",
        "useful": True,
        "current_numeric_state": "UNRESOLVED",
        "supported_now": {"ten_proposed_plan_view_labels_sq_ft": proposed_subtotal, "component_classifications": True, "exact_coverage": False},
        "uses": ["design comparison after the missing footprint semantics are sealed", "precedent analysis with identical measurement doctrine", "future program-rule inputs", "project benchmarking"],
        "not_compliance_evidence": True,
    }
    corroboration = {
        "contract_version": CONTRACT_VERSION,
        "searched": ["lot coverage", "building coverage", "footprint", "coverage percentage"],
        "state": "NO_RELEVANT_EVIDENCE",
        "source_scope": "Existing bounded Packet 42/50 city-review evidence",
        "silence_treated_as_approval": False,
    }
    reusable = {
        "contract_version": CONTRACT_VERSION,
        "project_independent": True,
        "coverage_component_ledger": ["component_id", "building_id", "footprint_type", "direct_labeled_area_sq_ft", "roofed_state", "enclosure_state", "structural_state", "coverage_inclusion_state", "uncertainty", "provenance"],
        "component_states": ["INCLUDED", "EXCLUDED", "INCLUDED_WITHIN_PARENT_NOT_ADDITIVE", "UNRESOLVED"],
        "denominator": ["regulatory_lot_identity", "area_sq_ft", "area_state", "source", "uncertainty"],
        "computation": {"exact": "Decimal(sum(included_nonoverlapping_areas) / lot_area)", "range": "Only when every unresolved component and denominator has supported closed bounds", "unresolved": "Return null; never coerce unknown to zero"},
        "rule_existence": ["PRESENT_NUMERIC", "PRESENT_QUALITATIVE", "NOT_SPECIFIED", "UNRESOLVED"],
        "project_constants": [],
    }
    suite = {
        "contract_version": CONTRACT_VERSION,
        "setbacks": "GOLDEN_EVALUATION_AVAILABLE",
        "wall_trigger": "GOLDEN_EVALUATION_AVAILABLE",
        "far": "EXTERNAL_EVIDENCE_BLOCKED_CLOSED_LOOP",
        "height": "EXTERNAL_EVIDENCE_BLOCKED_CLOSED_LOOP",
        "lot_coverage": "NOT_APPLICABLE_NO_RM_2_5_BASE_STANDARD; PROJECT_FACT_NUMERICALLY_UNRESOLVED",
        "rm_rule_profile_v0": "AVAILABLE_PACKET_51",
        "external_evidence_needs": ["architect- or City-certified Section 113.0240 footprint worksheet if a future program requires coverage", "survey-controlled or recorded regulatory lot area", "trash roof/wall/support classification", "complete exterior stair/landing classification"],
        "whole_project_feasibility": "NOT_EVALUATED",
        "next": "NEXT_FEASIBILITY_STEP: third approved-plan benchmark",
    }
    decision = {
        "contract_version": CONTRACT_VERSION,
        "rule_existence": rule_existence["decision"],
        "benchmark": "LOT_COVERAGE_GOLDEN_BENCHMARK_NOT_APPLICABLE: no RM-2-5 lot-coverage standard",
        "comparison": comparison["state"],
        "next": suite["next"],
    }
    provenance = {
        "contract_version": CONTRACT_VERSION,
        "sources": [
            {"source": "Packet 51 historical RM-2-5 rule profile", "bundle_sha256": RM_PROFILE_BUNDLE_SHA},
            {"source": "SDMC 113.0240 measurement source already reviewed by the residential standards corpus", "sha256": MEASUREMENT_SHA, "published": True},
            {"source": "Private PRJ-1111087 Fourth CD plan", "sha256": PLAN_SHA, "published": False},
            {"source": "Packet 52A legal-premises decision", "sha256": PACKET52A_PREMISES_SHA},
            {"source": "Bounded Packet 42/50 city-review evidence", "published": True},
        ],
        "chain": ["historical profile → rule-existence gate", "Section 113.0240 → component semantics", "bounded plan sheets → component ledger", "Packet 52A → denominator gate", "gates → non-applicable legal comparison and unresolved project fact"],
    }
    outputs = {
        "contract.json": {"contract_version": CONTRACT_VERSION, "scope": "PACKET_54_LOT_COVERAGE_EVALUATION", "application_date": "2024-01-29", "coastal_context": "OUTSIDE_COASTAL", "whole_project_compliance": False, "capacity": False, "private_sources_published": False},
        "rule-existence.json": rule_existence,
        "lot-coverage-definition.json": definition,
        "evidence-inventory.json": evidence_inventory,
        "footprint-component-ledger.json": {"contract_version": CONTRACT_VERSION, "components": ledger, "proposed_building_plan_view_label_subtotal_sq_ft": proposed_subtotal},
        "existing-house-treatment.json": existing,
        "garage-treatment.json": garage_treatment,
        "deck-projection-treatment.json": deck_treatment,
        "trash-enclosure-treatment.json": {"contract_version": CONTRACT_VERSION, **trash},
        "code-compatible-covered-area.json": covered_area,
        "denominator.json": denominator,
        "plan-stated-coverage.json": stated,
        "lot-coverage-computation.json": computation,
        "rule-comparison.json": comparison,
        "project-fact-value.json": project_fact,
        "city-review-corroboration.json": corroboration,
        "reusable-lot-coverage-model.json": reusable,
        "feasibility-suite-status.json": suite,
        "decision.json": decision,
        "provenance.json": provenance,
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

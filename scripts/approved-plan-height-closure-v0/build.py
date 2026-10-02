#!/usr/bin/env python3
"""Build bounded Packet 53 height-closure artifacts without publishing the plan."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from resolver import CONTRACT_VERSION, feet, integrity_artifact

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "approved-plan-height-closure-v0"
PLAN_SHA = "93d8bae01e2f1458f9a65ced9b06c7df55d2c593db8b7dd26ae68207b7d68b12"
PACKET51_HEIGHT_SHA = "513f34d5245e24ec90b6d2cb2c621cab16b29847dcbfd0ef67c9b697ce464cc9"
PARCEL_GEOMETRY_SHA = "05073c1c7e7c910e4b60ce05df6c80b2fb61dd3da2d0cd99f4d42d20f3c176be"
CHLOZ_QUERY_SHA = "cb6a356c9aaa2202c63bd784344844ba274424ce14172dde1749df88a507f28b"
COMMUNITY_QUERY_SHA = "0778c73cf7f234ef896b337b7197e174a6a0feb1f061f2ba97af94c76b083f9e"


def plan(sheet: str, pdf_page: int, evidence: str) -> dict[str, Any]:
    return {
        "source_ref": "PRIVATE_PLAN_PRJ-1111087_FOURTH_CD",
        "source_sha256": PLAN_SHA,
        "sheet": sheet,
        "pdf_page": pdf_page,
        "evidence": evidence,
    }


def build_outputs() -> dict[str, Any]:
    inventory = {
        "contract_version": CONTRACT_VERSION,
        "source_sha256": PLAN_SHA,
        "sheets": [
            {"sheet": "T-1", "pdf_page": 1, "role": "project data", "facts": ["MAX. BUILDING HEIGHT: 40'-0\"", "seven proposed buildings", "RM-2-5"]},
            {"sheet": "C-1", "pdf_page": 6, "role": "topographic survey", "facts": ["existing contours and spot elevations", "existing house finish floor 266.48 ft", "benchmark 234.18 ft", "not a precise boundary survey"]},
            {"sheet": "C002", "pdf_page": 11, "role": "grading plan", "facts": ["proposed finish-floor and pad elevations", "proposed spot grades and contours", "building footprints"]},
            {"sheet": "A0.2", "pdf_page": 16, "role": "lower-level site plan", "facts": ["building IDs 1-7", "property and setback lines", "motor court", "inter-building layout"]},
            {"sheet": "A0.3", "pdf_page": 17, "role": "second-level site plan", "facts": ["building edges", "property and setback lines", "floor layouts"]},
            {"sheet": "A0.5", "pdf_page": 19, "role": "Buildings 1-4 roof plan", "facts": ["flat built-up roof geometry", "roof edges"]},
            {"sheet": "A0.7", "pdf_page": 21, "role": "Buildings 5-7 roof plan", "facts": ["flat built-up roof geometry", "roof edges"]},
            {"sheet": "A1.4/A1.8/A1.12/A1.16/A1.20", "pdf_pages": [27, 31, 35, 39, 43], "role": "building roof plans", "facts": ["Class A built-up roofing", "roof drains", "parapet condition"]},
            {"sheet": "A2.1", "pdf_page": 44, "role": "typical building sections", "facts": ["Buildings 1 and 5 representative sections", "story stacks", "grade/contour callouts", "roof and parapet"]},
            {"sheet": "A2.2", "pdf_page": 45, "role": "wall/roof sections", "facts": ["top of parapet", "30-inch minimum parapets", "roof framing and finish-floor callouts"]},
            {"sheet": "A3-0 through A3-4", "pdf_pages": [48, 49, 50, 51, 52, 53], "role": "exterior elevations", "facts": ["building-specific/grouped facades", "story dimensions", "grade lines and spot elevations on selected views", "roof/top-of-parapet callouts"]},
        ],
        "excluded": "Unrelated structural, MEP, landscape, and interior-detail content was not ingested.",
    }

    buildings = []
    for number in range(1, 8):
        low_group = number <= 4
        buildings.append({
            "building_id": f"BUILDING_{number}",
            "stories": 2 if low_group else 3,
            "parking_or_garage_level": True,
            "direct_height_label": "No unique Code-height label" if number not in (1, 5) else ("30'-0 1/2\" architectural elevation dimension on representative west elevation" if number == 1 else "33'-0 1/2\" and 37'-3 1/4\" architectural elevation dimensions on representative west elevation"),
            "direct_height_decimal_ft": None if number not in (1, 5) else ([feet("30", "0.5")] if number == 1 else [feet("33", "0.5"), feet("37", "3.25")]),
            "roof_form": "flat Class A built-up roof with parapet",
            "top_elevation": None,
            "grade_elevation": "partial proposed finish-floor/pad and spot-grade evidence; no complete Code datum pairing",
            "separation_at_least_six_ft": False,
            "separation_basis": "A0.2/A0.3 directly dimension narrow stair/gap conditions below six feet between adjacent building modules; no building is treated as independently measurable under the six-foot predicate from this evidence.",
            "provenance": [plan("A0.2/A0.3", 16, "building layout and separations"), plan("A2.1", 44, "representative section"), plan("A3-0 through A3-4", 48, "elevation set")],
        })

    semantics = {
        "contract_version": CONTRACT_VERSION,
        "labels": [
            {"label": "40'-0\"", "sheet": "T-1", "classification": "NONCOMPARABLE_HEIGHT_LABEL", "reason": "Project-data maximum does not identify a controlling building, grade datum, measured top point, or Code measurement method."},
            {"label": "30'-0 1/2\"", "sheet": "A3-1", "building": "BUILDING_1", "classification": "PARTIALLY_COMPARABLE_HEIGHT_LABEL", "reason": "Direct architectural elevation dimension reaches the roof/parapet diagram, but its lower endpoint is not proven to be the lower of existing/proposed grade directly below every top point or the Code overall low point."},
            {"label": "33'-0 1/2\" / 37'-3 1/4\"", "sheet": "A3-1", "building": "BUILDING_5", "classification": "PARTIALLY_COMPARABLE_HEIGHT_LABEL", "reason": "Direct architectural dimensions use depicted floor/site datums, but the plan does not label either as a complete §113.0270 plumb-line or overall-height calculation."},
            {"label": "8'-0\", 9'-0\", 10'-0\" story-stack dimensions", "sheets": ["A2.1", "A3-0", "A3-2", "A3-3", "A3-4"], "classification": "NONCOMPARABLE_HEIGHT_LABEL", "reason": "Floor-to-floor and level dimensions are not Code structure heights."},
            {"label": "30-inch minimum parapets", "sheet": "A2.2", "classification": "NONCOMPARABLE_HEIGHT_LABEL", "reason": "A parapet detail dimension does not establish height from the Code datum."},
        ],
    }

    grade = {
        "contract_version": CONTRACT_VERSION,
        "supported": [
            {"fact": "existing site contours and spot elevations", "source": plan("C-1", 6, "topographic survey")},
            {"fact": "proposed finish-floor, pad, contour, and spot-grade elevations", "source": plan("C002", 11, "grading plan")},
            {"fact": "selected elevation views depict solid and dashed grade/contour lines", "source": plan("A2.1/A3-1/A3-2a", 44, "sections and east/west elevations")},
        ],
        "by_building": {f"BUILDING_{n}": {"proposed_ff_pad": "DIRECT_ON_C002", "existing_grade": "PARTIAL_SITE_SURVEY", "perimeter_lower_of_existing_proposed": "UNRESOLVED", "lowest_grade_within_5ft_or_property_line": "UNRESOLVED"} for n in range(1, 8)},
        "limitation": "The sheets do not provide a sealed point-by-point correspondence between every roof/parapet top point and the lower of existing or proposed grade directly below, nor a complete labeled lowest-grade search within five feet around each combined structure.",
    }

    datum = {
        "contract_version": CONTRACT_VERSION,
        "plumb_line_lower_existing_or_proposed_grade": "UNRESOLVED",
        "overall_lowest_applicable_grade": "UNRESOLVED",
        "highest_structure_point": "PARTIAL_PARAPET_GEOMETRY_NO_ABSOLUTE_TOP_ELEVATION",
        "per_structure_rule": "ADJACENT_MODULES_SHOWN_LESS_THAN_SIX_FEET_APART; COMBINED-TREATMENT GEOMETRY NOT SEALED",
        "code_compatible_reconstruction": False,
        "unresolved_predicates": ["pointwise lower-of-existing/proposed grade", "complete five-foot/perimeter low-point search", "absolute highest parapet/top elevations", "combined-structure treatment for sub-six-foot separations"],
    }

    roof = {
        "contract_version": CONTRACT_VERSION,
        "buildings": [{"building_id": f"BUILDING_{n}", "roof_type": "flat Class A built-up", "parapet": "present; 30 inches minimum by A2.2", "highest_point": "parapet/top geometry depicted but absolute elevation not stated", "equipment": "no controlling rooftop equipment elevation established", "code_exclusion": "NONE_PROVEN"} for n in range(1, 8)],
        "result": "Roof form and parapet presence are supported; Code highest-point elevations and any exception/exclusion remain unsealed.",
    }

    predicates = {
        "contract_version": CONTRACT_VERSION,
        "parcel_geometry_sha256": PARCEL_GEOMETRY_SHA,
        "query_geometry": "FULL_PARCEL_POLYGON_WGS84",
        "predicates": [
            {"predicate": "IN_COASTAL_HEIGHT_LIMIT_OVERLAY", "state": "SUPPORTED_FALSE", "authority": "City of San Diego DSD/Zoning_Overlay MapServer/1", "query_result": "zero intersecting features", "query_evidence_sha256": CHLOZ_QUERY_SHA},
            {"predicate": "IN_PENINSULA_COMMUNITY_PLAN", "state": "SUPPORTED_FALSE", "authority": "City of San Diego DSD/Planning MapServer/2", "query_result": {"OBJECTID": 56, "CPCODE": 11, "CPNAME": "ENCANTO NEIGHBORHOODS"}, "query_evidence_sha256": COMMUNITY_QUERY_SHA},
        ],
        "coastal_overlay_zone_equated_to_coastal_height_limit_overlay": False,
    }

    angled = {
        "contract_version": CONTRACT_VERSION,
        "state": "HEIGHT_ANGLED_PLANE_UNRESOLVED",
        "supported": ["side property and setback lines shown on A0.2/A0.3", "building/roof edges shown on site and roof plans", "flat roofs and parapets shown", "some architectural vertical dimensions exceed 30 feet"],
        "missing": ["dimensioned 60-degree plane section normal to each side setback line", "Code-datum height at each potentially controlling roof/parapet point", "coordinated horizontal offset from each side setback line to each controlling point", "complete combined-structure geometry under the less-than-six-foot separation rule"],
        "inference_prohibited": "A 40-foot project maximum or a four-foot setback does not prove angled-plane compliance.",
    }

    calculations = {
        "contract_version": CONTRACT_VERSION,
        "decimal_arithmetic": True,
        "architectural_dimensions": [
            {"building_id": "BUILDING_1", "label": "30'-0 1/2\"", "decimal_ft": feet("30", "0.5"), "code_height": False},
            {"building_id": "BUILDING_5", "label": "33'-0 1/2\"", "decimal_ft": feet("33", "0.5"), "code_height": False},
            {"building_id": "BUILDING_5", "label": "37'-3 1/4\"", "decimal_ft": feet("37", "3.25"), "code_height": False},
        ],
        "per_structure": [{"building_id": f"BUILDING_{n}", "plumb_line_height_ft": None, "overall_height_ft": None, "state": "CODE_HEIGHT_INPUTS_INSUFFICIENT"} for n in range(1, 8)],
        "scale_derived": False,
    }

    outputs: dict[str, Any] = {
        "contract.json": {"contract_version": CONTRACT_VERSION, "scope": "FINAL_BOUNDED_APPROVED_PLAN_HEIGHT_EVIDENCE_CLOSURE", "rule_profile": "RM Rule Profile V0 Packet 51", "whole_project_compliance": False, "capacity": False, "private_source_published": False},
        "height-evidence-inventory.json": inventory,
        "building-height-inventory.json": {"contract_version": CONTRACT_VERSION, "project_maximum_label": "40'-0\"", "project_maximum_scope": "PROJECT_DATA_MAXIMUM_ONLY", "buildings": buildings},
        "height-label-semantics.json": semantics,
        "grade-evidence.json": grade,
        "code-datum-reconstruction.json": datum,
        "roof-parapet-classification.json": roof,
        "footnote-37-predicates.json": predicates,
        "height-limit-branch.json": {"contract_version": CONTRACT_VERSION, "footnote_37_applies": False, "branch": "RM_2_5_BASE_HEIGHT", "numeric_maximum_ft": "40", "state": "SUPPORTED", "reason": "Both Footnote 37 trigger predicates are supported false; either false predicate defeats the combined trigger."},
        "footnote-18-evidence.json": angled,
        "per-structure-calculations.json": calculations,
        "plan-vs-code-height.json": {"contract_version": CONTRACT_VERSION, "plan_maximum_label": "40'-0\"", "code_height_ft": None, "classification": "DIFFERENT_SEMANTICS_UNRESOLVED", "comparison": None, "reason": "Project-data maximum and architectural elevation dimensions are not reconstructed §113.0270 heights."},
        "base-height-result.json": {"contract_version": CONTRACT_VERSION, "applicable_maximum_ft": "40", "state": "HEIGHT_RULE_EVALUATION_UNRESOLVED", "shared_decimal_max_comparator_invoked": False, "reason": "Controlling Code-compatible per-structure height is unavailable."},
        "angled-plane-result.json": {"contract_version": CONTRACT_VERSION, "state": "HEIGHT_ANGLED_PLANE_UNRESOLVED", "reason": "The plan does not coordinate the side-setback origin, horizontal run, and Code-datum controlling roof/parapet point in a dimensioned 60-degree analysis."},
        "city-review-corroboration.json": {"contract_version": CONTRACT_VERSION, "state": "NO_RELEVANT_HEIGHT_EVIDENCE", "reviewer_confirmed": [], "reviewer_questioned_or_corrected": [], "basis": "Existing bounded Packet 42/50 review artifacts address setbacks and fire, with no explicit height, grade, Footnote 18, or Coastal Height Limit finding.", "silence_treated_as_approval": False},
        "outcome-invariance.json": {"contract_version": CONTRACT_VERSION, "legal_branch_invariant": True, "numeric_maximum_ft": "40", "project_height_outcome_invariant": False, "existing_doctrine_authorizes_result": False, "reason": "The legal maximum branch is fixed, but supported plan labels have different/non-Code semantics and unknown Code datum pairing; not all Code-compatible building-height possibilities are bounded."},
        "remaining-external-evidence.json": {"contract_version": CONTRACT_VERSION, "broad_research_loop_closed": True, "smallest_evidence": ["Architect- or City-certified zoning/height worksheet identifying the controlling structure and each §113.0270 plumb-line and overall-height datum/top point.", "Approved grading/elevation or survey sheet pairing existing and proposed perimeter grades with absolute controlling parapet/roof elevations.", "Dimensioned section(s) normal to both side setback lines showing the Footnote 18 60-degree plane and every controlling roof/parapet point." ]},
        "reusable-height-evidence-model.json": {"contract_version": CONTRACT_VERSION, "project_independent": True, "entities": {"building_height_inventory": ["building_id", "stories", "direct_height_label", "roof_form", "top_elevation", "grade_elevation", "separation_at_least_six_ft"], "grade_datum": ["existing_grade", "proposed_grade", "lower_grade_directly_below", "lowest_applicable_grade", "scope"], "highest_point": ["point_id", "absolute_elevation", "appurtenance", "exclusion"], "roof_parapet": ["roof_type", "parapet", "equipment", "exception_predicates"], "overlay_branch": ["overlay_predicate", "community_predicate", "maximum_ft"], "angled_plane": ["setback_line", "origin_elevation", "angle_degrees", "horizontal_run", "controlling_point"], "code_height": ["plumb_line_inputs", "overall_inputs", "Decimal_result", "provenance"]}, "project_constants": []},
        "feasibility-suite-status.json": {"contract_version": CONTRACT_VERSION, "setbacks": "GOLDEN_EVALUATION_AVAILABLE", "wall_permit_trigger": "GOLDEN_EVALUATION_AVAILABLE", "far": "EXTERNAL_EVIDENCE_BLOCKED_CLOSED_LOOP", "height": "EXTERNAL_EVIDENCE_BLOCKED_CLOSED_LOOP", "reusable_rm_profile": "AVAILABLE_PACKET_51", "whole_project_feasibility": "NOT_EVALUATED", "next": "NEXT_FEASIBILITY_STEP: lot coverage golden evaluation"},
        "decision.json": {"contract_version": CONTRACT_VERSION, "benchmark": "HEIGHT_GOLDEN_BENCHMARK_UNRESOLVED: the 40-ft legal branch is resolved, but no controlling Code-compatible per-structure height or Footnote 18 angled-plane analysis can be reconstructed from the bounded plan evidence", "basis": "IRREDUCIBLE_EXTERNAL_EVIDENCE_BLOCKER", "base_height": "HEIGHT_RULE_EVALUATION_UNRESOLVED", "angled_plane": "HEIGHT_ANGLED_PLANE_UNRESOLVED", "next": "NEXT_FEASIBILITY_STEP: lot coverage golden evaluation"},
        "provenance.json": {"contract_version": CONTRACT_VERSION, "sources": [{"source": "Private PRJ-1111087 Fourth CD plan", "sha256": PLAN_SHA, "published": False}, {"source": "Packet 51 RM height profile", "sha256": PACKET51_HEIGHT_SHA}, {"source": "City CHLOZ full-parcel intersection query", "sha256": CHLOZ_QUERY_SHA}, {"source": "City Community Plan full-parcel intersection query", "sha256": COMMUNITY_QUERY_SHA}], "chain": ["full parcel polygon → CHLOZ/community predicates → 40-ft branch", "bounded sheets → building/grade/roof evidence → datum gate", "datum gate + Footnote 18 geometry gate → unresolved evaluations"]},
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

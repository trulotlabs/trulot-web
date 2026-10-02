#!/usr/bin/env python3
"""Build deterministic, non-sensitive Packet 52 FAR evidence artifacts."""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from typing import Any

from resolver import CONTRACT_VERSION, compare_max, integrity_artifact, recompute_far, sum_areas, survey_traverse_area

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "approved-plan-far-evidence-v0"
PLAN_SHA = "93d8bae01e2f1458f9a65ced9b06c7df55d2c593db8b7dd26ae68207b7d68b12"
PACKET51_BUNDLE_SHA = "2016a33bb1757254216d9158fd5524638b9a11687533123a99ca582a5643b2c4"
PUBLIC_PROFILE_SHA = "fe706b433bc7cc808dc8541465494b032a0acb6f7e17a6f678e9910ced023c91"
PARCEL_SOURCE_RECORDS_SHA = "b871a054a16d6b0fe67af1a80a764cb9aebdb7c9ea09bca052cd95f493cdab5e"
CITY_REVIEW_SHA = "7fee5f043d326db208c7ed389d0175d2c78e60268bc81d87d7c8153c01aacd4b"


def prov(sheet: str, page: int, callout: str) -> dict[str, Any]:
    return {"source_ref": "PRIVATE_PLAN_PRJ-1111087_FOURTH_CD", "source_sha256": PLAN_SHA, "sheet": sheet, "pdf_page": page, "direct_callout": callout}


def component(component_id: str, building: str, floor: str, area: str, category: str, plan_included: bool, code_state: str, rule: str, uncertainty: str | None = None, source: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "component_id": component_id, "building_id": building, "floor_or_story": floor,
        "labeled_area_sq_ft": area, "use_category": category, "direct_provenance": source or prov("T-1", 1, component_id),
        "included_by_plan": plan_included, "excluded_by_plan": not plan_included,
        "historical_113_0234_treatment": rule, "code_inclusion_state": code_state, "uncertainty": uncertainty,
    }


def component_rows() -> list[dict[str, Any]]:
    unit_areas = [
        (1, "BUILDING_1", "FIRST", "724.5", "A1-2", 25), (2, "BUILDING_1", "SECOND", "704.8", "A1-3", 26),
        (3, "BUILDING_2", "FIRST", "710.5", "A1-2", 25), (4, "BUILDING_2", "SECOND", "690.8", "A1-3", 26),
        (5, "BUILDING_3", "FIRST", "710.5", "A1-6", 29), (6, "BUILDING_3", "SECOND", "690.8", "A1-7", 30),
        (7, "BUILDING_4", "FIRST", "710.5", "A1-6", 29), (8, "BUILDING_4", "SECOND", "690.8", "A1-7", 30),
        (9, "BUILDING_5_649", "LOWER", "383.6", "A1-9", 32), (10, "BUILDING_5_649", "FIRST", "724.5", "A1-10", 33), (11, "BUILDING_5_649", "SECOND", "704.8", "A1-11", 34),
        (12, "BUILDING_5_651", "LOWER", "383.6", "A1-9", 32), (13, "BUILDING_5_651", "FIRST", "710.5", "A1-10", 33), (14, "BUILDING_5_651", "SECOND", "690.8", "A1-11", 34),
        (15, "BUILDING_6_653", "LOWER", "383.6", "A1-13", 36), (16, "BUILDING_6_653", "FIRST", "710.5", "A1-14", 37), (17, "BUILDING_6_653", "SECOND", "690.8", "A1-15", 38),
        (18, "BUILDING_6_655", "LOWER", "383.6", "A1-13", 36), (19, "BUILDING_6_655", "FIRST", "710.5", "A1-14", 37), (20, "BUILDING_6_655", "SECOND", "690.8", "A1-15", 38),
        (21, "BUILDING_7_657", "LOWER", "383.6", "A1-17", 40), (22, "BUILDING_7_657", "FIRST", "710.5", "A1-18", 41), (23, "BUILDING_7_657", "SECOND", "690.8", "A1-19", 42),
        (24, "BUILDING_7_659", "LOWER", "383.6", "A1-17", 40), (25, "BUILDING_7_659", "FIRST", "710.5", "A1-18", 41), (26, "BUILDING_7_659", "SECOND", "690.8", "A1-19", 42),
    ]
    rows = [component(f"ADU_{n}", b, floor, area, "HABITABLE_DWELLING_UNIT", True, "INCLUDED_IN_CODE_GFA", "§113.0234(a): actual floor within exterior walls", source=prov("T-1", 1, f"ADU {n}: {area} S.F.; story corroborated by {sheet} / PDF page {page}")) for n, b, floor, area, sheet, page in unit_areas]
    buildings = ["BUILDING_1", "BUILDING_2", "BUILDING_3", "BUILDING_4", "BUILDING_5_649", "BUILDING_5_651", "BUILDING_6_653", "BUILDING_6_655", "BUILDING_7_657", "BUILDING_7_659"]
    rows.extend(component(f"GARAGE_{i+1}", b, "TUCK_UNDER_OR_GARAGE_LEVEL", "514.0", "GARAGE_PARKING", True, "CONDITIONAL_GFA", "Application-time §113.0234(a) parking inclusion and (d)(3) parking-structure exclusion predicates", "Plan includes every garage; Code exclusion eligibility requires parking-design predicates not sealed by the bounded ledger.", prov("T-1", 1, f"{b}: GARAGE 514.0 S.F.")) for i, b in enumerate(buildings))
    rows.append(component("EXISTING_HOUSE", "EXISTING_HOUSE", "EXISTING", "719.0", "HABITABLE_EXISTING_BUILDING", True, "INCLUDED_IN_CODE_GFA", "§113.0234 total GFA of all buildings on the premises", source=prov("T-1", 1, "EXISTING SINGLE FAMILY HOME: 719.0 S.F.")))
    rows.append(component("DECKS_6", "BUILDINGS_5_TO_7", "EXTERIOR_DECKS", "327.6", "EXTERIOR_DECK_OR_BALCONY", False, "CONDITIONAL_GFA", "Application-time §113.0234(b) roofed exterior balcony/opening predicates", "Six 62.0-square-foot decks are labeled, but the bounded evidence does not seal roof/open-enclosure predicates.", prov("T-1", 1, "DECKS: 6 x 62.0 S.F.; TOTALS DECKS: 327.6 S.F.")))
    rows.append(component("TRASH_ENCLOSURE", "SITE_ACCESSORY", "GROUND", "300.0", "TRASH_ENCLOSURE", False, "UNRESOLVED_GFA", "Classification depends on structural enclosure and roof facts under §113.0234", "A0.1 labels 300 S.F.; the bounded evidence does not establish whether it is a GFA-counted building element.", prov("A0.1", 15, "TRASH 300 S.F.; 96 S.F. refuse, 96 S.F. recycle, 96 S.F. organic")))
    return rows


def reusable_schema() -> dict[str, Any]:
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "trulot://schemas/far-evidence-v0", "project_specific": False,
        "contracts": {
            "gfa_component": {"required": ["component_id", "building_id", "floor_or_story", "labeled_area_sq_ft", "use_category", "direct_provenance", "included_by_plan", "historical_113_0234_treatment", "code_inclusion_state", "uncertainty"], "states": ["INCLUDED_IN_CODE_GFA", "EXCLUDED_FROM_CODE_GFA", "CONDITIONAL_GFA", "UNRESOLVED_GFA"]},
            "legal_premises_area": {"required": ["legal_identity", "recorded_map", "boundary_authority", "area_sq_ft", "multiple_lot_status", "unity_of_use", "decision"]},
            "dedication_adjustment": {"required": ["status", "evidence", "pre_dedication_area", "post_dedication_area", "selected_area"]},
            "far_computation": {"required": ["numerator_state", "denominator_state", "unrounded_decimal", "presentation_rounding", "comparison_authorized"]},
            "unresolved_handling": {"rule": "Unknown components remain explicit; compute no exact Code FAR unless numerator and denominator gates pass. A bounded interval may inform materiality but cannot replace a required exact benchmark gate."},
        },
    }


def build_outputs() -> dict[str, Any]:
    rows = component_rows()
    adu_total = sum_areas(rows, lambda r: r["use_category"] == "HABITABLE_DWELLING_UNIT")
    garage_total = sum_areas(rows, lambda r: r["use_category"] == "GARAGE_PARKING")
    plan_included_total = sum_areas(rows, lambda r: r["included_by_plan"])
    definitely_included = sum_areas(rows, lambda r: r["code_inclusion_state"] == "INCLUDED_IN_CODE_GFA")
    possible_upper = sum_areas(rows)
    courses = [
        {"line": "WEST", "north_south": "N", "degrees": 0, "minutes": 36, "seconds": 41, "east_west": "E", "length_ft": 99.88},
        {"line": "NORTH", "north_south": "S", "degrees": 89, "minutes": 33, "seconds": 1, "east_west": "E", "length_ft": 199.58},
        {"line": "EAST", "north_south": "S", "degrees": 1, "minutes": 7, "seconds": 25, "east_west": "E", "length_ft": 99.91},
        {"line": "SOUTH", "north_south": "N", "degrees": 89, "minutes": 33, "seconds": 8, "east_west": "W", "length_ft": 202.60},
    ]
    traverse = survey_traverse_area(courses)
    stated = recompute_far("22219.6", "20084")
    corrected_components = recompute_far(str(plan_included_total), "20084")
    upper = recompute_far(str(possible_upper), "20084")
    comparison = compare_max(measured=None, maximum="1.35", gates_pass=False)
    inventory = {
        "contract_version": CONTRACT_VERSION, "project_id": "PRJ-1111087", "apn": "5442140600", "privacy": "PRIVATE_OPERATOR_AUTHORIZED_NOT_PUBLISHED",
        "sheets": [
            {"sheet": "T-1", "pdf_page": 1, "use": ["project data", "FAR calculation", "lot area label", "existing/new/building/unit/garage/deck area schedules"]},
            {"sheet": "C-1", "pdf_page": 6, "use": ["legal description", "calculated boundary courses", "boundary disclaimer"]},
            {"sheet": "G001-C005", "pdf_pages": [7, 8, 9, 10, 11, 12, 13, 14], "use": ["existing/proposed legal description", "grading/ROW and public-improvement dedication search"]},
            {"sheet": "A0.1", "pdf_page": 15, "use": ["site component inventory", "trash area", "building labels"]},
            {"sheet": "A1-1 through A1-19", "pdf_pages": [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42], "use": ["garage, dwelling-story, deck, stair, and roof-plan corroboration"]},
        ], "irrelevant_pages_ingested": False, "source_sha256": PLAN_SHA,
    }
    numerator = {
        "contract_version": CONTRACT_VERSION, "plan_stated_numerator_sq_ft": "22219.6", "direct_component_sum_sq_ft": str(plan_included_total),
        "difference_component_sum_minus_stated_sq_ft": str(plan_included_total - Decimal("22219.6")), "state": "CONFLICT",
        "checks": {"adu_sum_sq_ft": str(adu_total), "garage_sum_sq_ft": str(garage_total), "new_construction_sum_sq_ft": str(adu_total + garage_total), "existing_house_sq_ft": "719.0", "title_new_plus_existing_line_sq_ft": "22219.6", "arithmetically_expected_new_plus_existing_sq_ft": str(plan_included_total)},
        "explanation": "The 26 direct ADU labels sum to 16,370.6 and ten garages sum to 5,140.0, matching the 21,510.6 new-construction line. Adding the separately labeled 719.0 existing house produces 22,229.6, not 22,219.6.",
    }
    classification = {
        "contract_version": CONTRACT_VERSION, "selected_profile": "RM25_2023_05_06_OUTSIDE_COASTAL", "rule_source": "Packet 51 RM Rule Profile V0; no rule reconstruction",
        "rule_source_artifact": {"path": "data/rm-rule-profile-v0/integrity.json", "bundle_sha256": PACKET51_BUNDLE_SHA},
        "counts": {state: len([r for r in rows if r["code_inclusion_state"] == state]) for state in ["INCLUDED_IN_CODE_GFA", "EXCLUDED_FROM_CODE_GFA", "CONDITIONAL_GFA", "UNRESOLVED_GFA"]},
        "definitely_included_sq_ft": str(definitely_included), "conditional_sq_ft": str(sum_areas(rows, lambda r: r["code_inclusion_state"] == "CONDITIONAL_GFA")), "unresolved_sq_ft": str(sum_areas(rows, lambda r: r["code_inclusion_state"] == "UNRESOLVED_GFA")),
        "historical_boundary": "O-21836 changes are not back-applied to the 2024-01-29 application profile.",
    }
    code_numerator = {
        "contract_version": CONTRACT_VERSION, "state": "CODE_COMPATIBLE_GFA_UNRESOLVED", "exact_total_sq_ft": None,
        "definitely_included_lower_bound_sq_ft": str(definitely_included), "all_catalogued_components_upper_bound_sq_ft": str(possible_upper),
        "upper_bound_far_using_unsealed_plan_denominator": upper["exact"], "rm_2_5_threshold_numerator_at_plan_denominator_sq_ft": str(Decimal("1.35") * Decimal("20084")),
        "unresolved_components_could_change_1_35_comparison_if_denominator_20084": False,
        "reason": "Garage exclusion predicates, deck openness/roof predicates, the trash enclosure, and the 10-square-foot schedule conflict prevent an exact Code-compatible numerator.",
    }
    premises = {
        "contract_version": CONTRACT_VERSION, "plan_label": {"wording": "LOT AREAS: 20,084.0 S.F. (.46 ACRES)", "classification": "PLAN_LABELED_LOT_AREA_NOT_PREMISES_AREA", "sheet": "T-1", "pdf_page": 1},
        "legal_identity": {"description": "Lot 4, Block 7, Encanto Heights, Map 1063", "single_record_lot": True, "multiple_lot_evidence": False, "sources": [
            {"source": "Packet 42 public parcel identity", "path": "data/approved-plan-setback-benchmark-v0/public-rule-profile.json", "artifact_sha256": PUBLIC_PROFILE_SHA, "parcel_identity_sha256": "07913d1007d0e2f5b80c681c19c76bb1338f4b06d99c401c1784744bbd1a4544"},
            {"source": "C-1 survey legal description", "source_ref": "PRIVATE_PLAN_PRJ-1111087_FOURTH_CD", "source_sha256": PLAN_SHA, "sheet": "C-1", "pdf_page": 6},
            {"source": "G001 existing and proposed legal descriptions", "source_ref": "PRIVATE_PLAN_PRJ-1111087_FOURTH_CD", "source_sha256": PLAN_SHA, "sheet": "G001", "pdf_page": 7},
        ]},
        "boundary": {"courses": courses, "derived_traverse_area_sq_ft": traverse["area_sq_ft"], "closure_ft": traverse["closure_ft"], "authority": "CALCULATED_BOUNDARY_PER_RECORD_INFORMATION_AND_FOUND_MONUMENTS", "disclaimer": "THIS IS NOT A PRECISE BOUNDARY SURVEY"},
        "recorded_map": {"map": "1063", "directly_reviewed_in_packet": False}, "unity_of_use": "ONE_PROJECT_AND_ONE_DESCRIBED_LOT_BUT_CONVEYABILITY_NOT_INDEPENDENTLY_RECORDED", "exact_legal_area": None,
    }
    dedication = {
        "contract_version": CONTRACT_VERSION, "classification": "NO_REQUIRED_DEDICATION_EVIDENCE",
        "evidence": ["G001 existing and proposed legal descriptions are identical", "bounded grading/ROW sheets show public improvements but no dedication-area or changed-boundary callout", "C-1 calculated boundary follows Lot 4 record information"],
        "pre_dedication_area_sq_ft": None, "post_dedication_area_sq_ft": None, "selected_area_sq_ft": None,
        "limitation": "This is a bounded absence-of-evidence classification, not affirmative proof that no dedication condition exists outside the reviewed corpus.",
    }
    area_reconciliation = {
        "contract_version": CONTRACT_VERSION, "values": [
            {"source": "T-1 plan lot area", "area_sq_ft": "20084.0", "semantics": "plan-labeled lot area"},
            {"source": "C-1 direct course traverse", "area_sq_ft": traverse["area_sq_ft"], "semantics": "derived from calculated boundary; not precise survey"},
            {"source": "Parcel V2/SanGIS polygon", "area_sq_ft": "20343.182028", "semantics": "approximate GIS geometry; diagnostic only", "path": "data/parcel-lookup-v0/source-records.json", "artifact_sha256": PARCEL_SOURCE_RECORDS_SHA, "geometry_sha256": "05073a61792fcbe67366917c06d8e7330cfd8a5f6b370878c620634a53536d4e"},
            {"source": "assessor", "area_sq_ft": None, "semantics": "no independent assessor area in bounded evidence"},
        ],
        "survey_minus_plan_sq_ft": str(Decimal(traverse["area_sq_ft"]) - Decimal("20084.0")), "gis_minus_plan_sq_ft": str(Decimal("20343.182028") - Decimal("20084.0")),
        "classification": "PLAN_AND_CALCULATED_SURVEY_CORROBORATE; GIS_DIFFERS_SEMANTICALLY; LEGAL_AREA_NOT_SEALED",
    }
    legal_decision = {"contract_version": CONTRACT_VERSION, "decision": "LEGAL_PREMISES_AREA_PARTIAL: recorded Lot 4 identity and a near-closing calculated traverse corroborate approximately 20,084 sq ft, but Map 1063 was not directly reviewed and C-1 expressly is not a precise boundary survey", "supported_area_sq_ft": None}
    rounding = {
        "contract_version": CONTRACT_VERSION, "plan_display": "1.10", "stated_inputs": stated, "component_corrected_inputs": corrected_components,
        "classification": "UNEXPLAINED; NUMERICALLY_CONSISTENT_WITH_ONE_DECIMAL_HALF_UP_DISPLAYED_WITH_TWO_DIGITS",
        "explicit_plan_rounding_rule_found": False, "two_decimal_rounding_of_stated_inputs": "1.11", "legal_policy": "Use unrounded Decimal inputs; presentation rounding cannot repair semantic gates or the component conflict.",
    }
    computation = {
        "contract_version": CONTRACT_VERSION, "code_compatible_numerator_sq_ft": None, "legal_premises_area_sq_ft": None, "code_far": None, "comparison_authorized": False,
        "plan_stated_input_far": stated, "corrected_component_input_far_not_code_far": corrected_components,
        "reason": "Exact Code-compatible numerator and legal premises denominator are not both supported.",
    }
    plan_vs_code = {"contract_version": CONTRACT_VERSION, "plan_stated_far": "1.10", "recomputed_stated_inputs": stated["exact"], "recomputed_direct_plan_components": corrected_components["exact"], "code_far": None, "classification": "UNRESOLVED", "observed_differences": ["presentation rounding", "10-square-foot numerator conflict", "historical GFA component semantics", "legal premises denominator"]}
    provenance_chain = {
        "contract_version": CONTRACT_VERSION,
        "source_artifacts": [
            {"source_ref": "PRIVATE_PLAN_PRJ-1111087_FOURTH_CD", "sha256": PLAN_SHA, "published": False},
            {"path": "data/rm-rule-profile-v0/integrity.json", "sha256": PACKET51_BUNDLE_SHA},
            {"path": "data/approved-plan-setback-benchmark-v0/public-rule-profile.json", "sha256": PUBLIC_PROFILE_SHA},
            {"path": "data/parcel-lookup-v0/source-records.json", "sha256": PARCEL_SOURCE_RECORDS_SHA},
            {"path": "data/approved-plan-height-far-benchmark-v0/city-review-corroboration.json", "sha256": CITY_REVIEW_SHA},
        ],
        "links": [
            {"from": "private plan sheets T-1, A0.1, A1-1 through A1-19", "to": "gfa-component-ledger.json", "state": "INSPECTABLE", "locator": "each component.direct_provenance"},
            {"from": "gfa-component-ledger.json", "to": "historical-gfa-classification.json", "state": "PARTIAL_GARAGE_DECK_TRASH_PREDICATES", "rule_authority": "Packet 51 bundle"},
            {"from": "historical-gfa-classification.json", "to": "code-compatible-numerator.json", "state": "UNRESOLVED", "reason": "conditional and unresolved component states"},
            {"from": "Packet 42 public Lot 4 identity plus private C-1/G001", "to": "legal-premises-evidence.json", "state": "PARTIAL", "locator": "legal_identity.sources"},
            {"from": "legal-premises-evidence.json", "to": "legal-premises-decision.json", "state": "UNRESOLVED", "reason": "recorded map not directly reviewed; survey disclaimer"},
            {"from": "code-compatible-numerator.json plus legal-premises-decision.json", "to": "far-computation.json", "state": "BLOCKED", "reason": "both semantic gates are unresolved"},
            {"from": "far-computation.json plus Packet 51 maximum 1.35", "to": "rm-2-5-comparison.json", "state": "BLOCKED", "comparator": "resolver.compare_max Decimal MAX"},
        ],
    }
    decision = {
        "contract_version": CONTRACT_VERSION, "benchmark": "FAR_GOLDEN_BENCHMARK_UNRESOLVED: the direct area schedule conflicts by 10 sq ft, historical garage/deck/trash classifications are not fully sealed, and the 20,084 sq ft denominator lacks a directly reviewed recorded map or precise boundary survey",
        "legal_premises": legal_decision["decision"], "dedication": dedication["classification"], "comparison": comparison,
        "next": "NEXT_FEASIBILITY_STEP: close Packet 50 height evidence", "useful_artifacts": True,
    }
    city = {"contract_version": CONTRACT_VERSION, "state": "NO_RELEVANT_FAR_EVIDENCE", "basis": "Packet 50's bounded city-review artifact contains no height/FAR-specific review evidence; Packet 42 comments address setbacks and fire only.", "source_artifact": {"path": "data/approved-plan-height-far-benchmark-v0/city-review-corroboration.json", "sha256": CITY_REVIEW_SHA}, "silence_treated_as_approval": False}
    outputs = {
        "contract.json": {"contract_version": CONTRACT_VERSION, "scope": "ONE_PRIVATE_PROPOSED_PLAN_FAR_EVIDENCE_CLOSURE", "whole_project_compliance": False, "capacity": False, "private_plan_publication": False, "production": False},
        "reusable-schema.json": reusable_schema(), "evidence-inventory.json": inventory, "gfa-component-ledger.json": {"contract_version": CONTRACT_VERSION, "components": rows},
        "numerator-reconciliation.json": numerator, "historical-gfa-classification.json": classification, "code-compatible-numerator.json": code_numerator,
        "plan-denominator-semantics.json": {"contract_version": CONTRACT_VERSION, "label": premises["plan_label"], "not_proven_as": ["LEGAL_PREMISES_AREA", "NET_OR_GROSS_POST_DEDICATION_AREA", "ASSESSOR_AREA"]},
        "legal-premises-evidence.json": premises, "dedication-analysis.json": dedication, "area-reconciliation.json": area_reconciliation, "legal-premises-decision.json": legal_decision,
        "rounding-analysis.json": rounding, "far-computation.json": computation, "rm-2-5-comparison.json": {"contract_version": CONTRACT_VERSION, "maximum": "1.35", **comparison},
        "plan-vs-code-comparison.json": plan_vs_code, "city-review-corroboration.json": city, "provenance-chain.json": provenance_chain, "decision.json": decision,
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

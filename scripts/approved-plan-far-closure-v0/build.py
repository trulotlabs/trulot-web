#!/usr/bin/env python3
"""Build bounded Packet 52A closure artifacts without copying source maps or plans."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from resolver import CONTRACT_VERSION, decimal_ratio, integrity_artifact, interval_sensitivity

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "approved-plan-far-closure-v0"

PLAN_SHA = "93d8bae01e2f1458f9a65ced9b06c7df55d2c593db8b7dd26ae68207b7d68b12"
MAP1063_PREVIEW_SHA = "3069d111116c534d3b200252e804cbe21bb8694c1cd06efaae260d97cd1c57a5"
PACKET52_LEDGER_SHA = "5ec41b63ce8788b2695cbc2ed0b16d83e8b9ba15f95b7ee6f2b89a0d4d360b80"
PACKET52_BUNDLE_SHA = "58706109c46340561e7f153c41e91ce05a0ff01015ba110438b3df7982e83d0d"
PACKET51_BUNDLE_SHA = "2016a33bb1757254216d9158fd5524638b9a11687533123a99ca582a5643b2c4"


def plan(sheet: str, pdf_page: int, evidence: str) -> dict[str, Any]:
    return {"source_ref": "PRIVATE_PLAN_PRJ-1111087_FOURTH_CD", "source_sha256": PLAN_SHA, "sheet": sheet, "pdf_page": pdf_page, "evidence": evidence}


def build_outputs() -> dict[str, Any]:
    packet52_ledger = json.loads((ROOT / "data/approved-plan-far-evidence-v0/gfa-component-ledger.json").read_text())
    components = packet52_ledger["components"]
    if len(components) != 39:
        raise ValueError("PACKET52_LEDGER_COUNT_CHANGED")

    garages = []
    garage_sources = {
        1: ("A1.1", 24), 2: ("A1.1", 24), 3: ("A1.5", 28), 4: ("A1.5", 28),
        5: ("A1.9", 32), 6: ("A1.9", 32), 7: ("A1.13", 36), 8: ("A1.13", 36),
        9: ("A1.17", 40), 10: ("A1.17", 40),
    }
    for number, (sheet, page) in garage_sources.items():
        garages.append({
            "component_id": f"GARAGE_{number}", "area_sq_ft": "514.0", "state": "CONDITIONAL_GFA",
            "facts_supported": ["tuck-under parking", "residential parking use", "structure above", "one motor-court-facing open elevation", "integrated with a dwelling building"],
            "unresolved_historical_predicate": "The plans do not seal whether at least two pre-O-21836 §113.0234(d)(3)(B) parking-structure design criteria are met, including wrapped/screened relationships to the public right-of-way.",
            "provenance": [plan("T-1", 1, "Scope identifies tuck-under parking"), plan(sheet, page, "Garage-level plan"), plan("A3-3", 52, "North elevation shows motor-court-facing garage openings")],
        })

    decks = []
    deck_sources = [("A1.10", 33), ("A1.10", 33), ("A1.14", 37), ("A1.14", 37), ("A1.18", 41), ("A1.18", 41)]
    for number, (sheet, page) in enumerate(deck_sources, 1):
        decks.append({
            "component_id": f"DECK_{number}", "state": "EXCLUDED_FROM_CODE_GFA", "exact_area_sq_ft": None,
            "schedule_area_each_sq_ft": "62.0", "reason": "Direct floor, upper-floor, roof, and elevation evidence shows an exterior open deck without a roof; the historical roofed-balcony inclusion is not triggered.",
            "provenance": [plan(sheet, page, "Second-floor deck plan"), plan(sheet.replace("10", "11").replace("14", "15").replace("18", "19"), page + 1, "Upper floor labels DECK BELOW"), plan("A3-4", 53, "South elevation shows open metal guardrails")],
        })

    map_evidence = {
        "contract_version": CONTRACT_VERSION,
        "authority": "San Diego County Survey Records System",
        "record": {"title": "MAP 01063", "document_type": "Subdivision Map", "subdivision_name": "ENCANTO HEIGHTS", "page": 1, "pages": 1, "system_uuid": "92692", "filing_endorsement": "Filed June 6, 1907 at 2:34 PM"},
        "source_url": "https://srs.sandiegocounty.gov/#/s?v=G&a=c&q=1063",
        "reviewed_preview_sha256": MAP1063_PREVIEW_SHA,
        "redistributed": False,
        "lot_4_block_7": {"shown": True, "west_relationship": "fronts the recorded street now identified by project and survey evidence as 67th Street", "south_distance_ft": "202.6", "street_frontage_distance_ft": "100", "explicit_area_sq_ft": None},
        "dedication": {"subdivision_streets_roads_and_alleys_dedicated_to_public_use": True, "additional_lot_4_project_dedication_shown": False},
        "area_reconstruction": {"possible_from_map_alone": False, "reason": "The one-page map shows direct side dimensions but does not state Lot 4 area or provide a complete bearing relationship sufficient for a unique area reconstruction without geometric assumptions."},
    }
    premises = {
        "contract_version": CONTRACT_VERSION,
        "identity": "Lot 4, Block 7, Encanto Heights, Map 1063",
        "identity_state": "SUPPORTED",
        "additional_lot_or_parcel_evidence": False,
        "additional_project_dedication_evidence": False,
        "reconciliation": [
            {"source": "Map 1063", "result": "Lot 4 and recorded street relationship supported; no stated area"},
            {"source": "C-1", "result": "same legal description; 20084.272422 sq ft mathematical traverse; expressly not a precise boundary survey"},
            {"source": "T-1", "result": "same legal description; plan-labeled lot area 20084.0 sq ft"},
            {"source": "G001", "result": "existing and proposed legal descriptions remain identical"},
        ],
        "decision": "LEGAL_PREMISES_AREA_PARTIAL: Map 1063 directly confirms Lot 4, Block 7 and its recorded street relationships, but states no area and lacks a complete bearing relationship for an assumption-free area reconstruction; C-1 remains expressly non-precise",
        "supported_area_sq_ft": None,
    }
    numerator_conflict = {
        "contract_version": CONTRACT_VERSION,
        "state": "NUMERATOR_CONFLICT_UNRESOLVED",
        "direct_new_construction_sq_ft": "21510.6", "existing_house_sq_ft": "719.0", "direct_sum_sq_ft": "22229.6", "plan_stated_far_numerator_sq_ft": "22219.6", "difference_sq_ft": "10.0",
        "bounded_search_results": {"transcription_explanation": None, "excluded_component_line": None, "revision_adjustment": None, "demolition_or_retention_adjustment": None, "unit_or_garage_subtotal_discrepancy": None, "explicit_adjustment": None},
        "finding": "The direct dwelling and garage schedule reproduces 21,510.6 exactly; adding the separately labeled 719.0 existing house produces 22,229.6. No bounded FAR/project-data evidence explains the 10.0-square-foot difference, so it is not labeled a typo.",
    }
    component_resolution = {
        "contract_version": CONTRACT_VERSION,
        "packet52_ledger": {"path": "data/approved-plan-far-evidence-v0/gfa-component-ledger.json", "sha256": PACKET52_LEDGER_SHA, "rebuilt": False},
        "garages": garages,
        "decks": decks,
        "deck_schedule_conflict": {"six_times_schedule_each_sq_ft": "372.0", "plan_stated_total_sq_ft": "327.6", "difference_sq_ft": "44.4", "effect_on_code_bounds": "NONE_BECAUSE_ALL_SIX_DECKS_ARE_EXCLUDED_FROM_CODE_GFA"},
        "trash_enclosure": {"component_id": "TRASH_ENCLOSURE", "area_sq_ft": "300.0", "state": "UNRESOLVED_GFA", "supported_facts": ["plan-labeled trash enclosure", "300.0-square-foot site allocation", "west elevation depicts an approximately eight-foot enclosure"], "missing_fact": "No direct detail or annotation seals roof state and building/GFA treatment under the historical definition.", "provenance": [plan("A0.1", 15, "300 S.F. trash enclosure site allocation"), plan("A3-1", 49, "West elevation depicts trash enclosure")]},
    }
    numerator = {
        "contract_version": CONTRACT_VERSION, "state": "CODE_COMPATIBLE_GFA_INTERVAL_ONLY",
        "minimum_possible_sq_ft": "17089.6", "maximum_possible_sq_ft": "22529.6", "exact_sq_ft": None,
        "included_fixed": {"26_dwelling_areas_plus_existing_house_sq_ft": "17089.6"},
        "conditional": {"ten_garages_sq_ft": "5140.0"}, "unresolved": {"trash_enclosure_sq_ft": "300.0"}, "excluded": {"six_open_unroofed_decks": True},
        "bounds_are_component_defensible": True,
    }
    sensitivity = interval_sensitivity(numerator_min="17089.6", numerator_max="22529.6", denominator_candidates=["20084", "20084.272422"], maximum="1.35")
    invariance = {
        "contract_version": CONTRACT_VERSION, **sensitivity,
        "enumerated_denominators": [{"value": "20084", "status": "PLAN_LABEL_CANDIDATE_NOT_LEGAL_AREA"}, {"value": "20084.272422", "status": "NON_PRECISE_C1_TRAVERSE_CANDIDATE"}],
        "legal_denominator_interval_supported": False,
        "existing_evaluator_allows_branch_invariant_result": False,
        "doctrine_evidence": ["The shared evaluator requires literal-true prerequisite gates before comparison.", "Packet 52's reusable unresolved-component contract permits an interval to inform materiality but not replace an exact benchmark gate."],
        "classification": "NUMERIC_SENSITIVITY_INVARIANT_BUT_NOT_RULE_ENGINE_AUTHORIZED",
    }
    computation = {
        "contract_version": CONTRACT_VERSION, "legal_far": None, "legal_far_interval": None,
        "candidate_sensitivity_interval_not_legal_far": {"minimum": sensitivity["candidate_far_min"], "maximum": sensitivity["candidate_far_max"]},
        "direct_component_plan_denominator_ratio_not_code_far": decimal_ratio("22229.6", "20084"),
        "reason": "The Code numerator is an interval and no supported legal premises area or legal denominator interval is available.",
    }
    comparison = {"contract_version": CONTRACT_VERSION, "maximum": "1.35", "state": "FAR_RULE_EVALUATION_UNRESOLVED", "comparison": None, "margin": None, "candidate_margin_range_not_legal_margin": {"minimum": sensitivity["candidate_margin_min"], "maximum": sensitivity["candidate_margin_max"]}, "reason": "Existing evaluator doctrine does not authorize comparison when required semantic gates remain unresolved."}
    plan_vs_code = {
        "contract_version": CONTRACT_VERSION, "plan_numerator_sq_ft": "22219.6", "direct_component_sum_sq_ft": "22229.6", "plan_denominator_sq_ft": "20084", "exact_plan_input_ratio": decimal_ratio("22219.6", "20084"), "displayed_far": "1.10", "code_far": None,
        "explanation": "The plan's new-construction subtotal is internally reproducible, but new construction plus the existing house is 10.0 sq ft higher than the stated FAR numerator. The displayed 1.10 is consistent only with one-decimal rounding padded to two digits; it is not used as legal FAR.",
    }
    remaining = {
        "contract_version": CONTRACT_VERSION,
        "smallest_external_evidence": [
            "A City-stamped or architect-certified FAR worksheet that reconciles the 10.0-square-foot difference and expressly classifies the ten garages and trash enclosure under application-time §113.0234.",
            "A precise boundary survey or recorded area/bearing calculation tying Lot 4, Block 7, Map 1063 to a total legal premises area.",
        ],
        "broad_research_loop_closed": True,
    }
    decision = {
        "contract_version": CONTRACT_VERSION,
        "benchmark": "FAR_GOLDEN_BENCHMARK_UNRESOLVED: Map 1063 seals the Lot 4 identity but not a legal premises area; the 10 sq ft plan conflict remains unexplained; garage and trash GFA branches remain unresolved; existing evaluator doctrine does not authorize a branch-invariant result with failed semantic gates",
        "basis": "IRREDUCIBLE_EXTERNAL_EVIDENCE_BLOCKER",
        "next": "NEXT_FEASIBILITY_STEP: close Packet 50 height evidence",
    }
    provenance = {
        "contract_version": CONTRACT_VERSION,
        "sources": [
            {"source": "Packet 52 component ledger", "sha256": PACKET52_LEDGER_SHA},
            {"source": "Packet 52 evidence bundle", "sha256": PACKET52_BUNDLE_SHA},
            {"source": "Packet 51 rule-profile bundle", "sha256": PACKET51_BUNDLE_SHA},
            {"source": "Private plan corpus", "sha256": PLAN_SHA, "published": False},
            {"source": "County SRS Map 1063 preview", "sha256": MAP1063_PREVIEW_SHA, "published": False},
        ],
        "chain": ["Map 1063 → legal identity → denominator gate", "Packet 52 ledger + bounded plan details → component states → numerator interval", "numerator interval + denominator candidates → sensitivity test", "shared evaluator doctrine → formal unresolved comparison"],
    }
    outputs = {
        "contract.json": {"contract_version": CONTRACT_VERSION, "scope": "FINAL_BOUNDED_FAR_EVIDENCE_CLOSURE", "reopens_packet52": False, "whole_project_compliance": False, "capacity": False, "private_sources_published": False},
        "map-1063-evidence.json": map_evidence,
        "legal-premises-reconciliation.json": premises,
        "legal-premises-decision.json": {"contract_version": CONTRACT_VERSION, "decision": premises["decision"], "supported_area_sq_ft": None},
        "numerator-conflict.json": numerator_conflict,
        "component-resolution.json": component_resolution,
        "code-compatible-numerator.json": numerator,
        "outcome-invariance.json": invariance,
        "far-computation.json": computation,
        "rm-2-5-comparison.json": comparison,
        "plan-vs-code.json": plan_vs_code,
        "remaining-external-evidence.json": remaining,
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

#!/usr/bin/env python3
"""Build deterministic Bounded Feasibility Product Contract V0 artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from resolver import CONTRACT_VERSION, INTERNAL_TO_PRODUCT, PRODUCT_STATES, STATE_COPY, render, sha256

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "bounded-feasibility-product-contract-v0"


def source(ref: str, privacy: str = "PUBLIC_AUTHORITY") -> dict[str, str]:
    return {"artifact": ref, "privacy": privacy}


def card(card_id: str, name: str, family: str, state: str, requirement: str | None,
         fact: str | None, primary: str, why: str, sources: list[dict[str, str]],
         blocker_codes: list[str] | None = None, scope: str = "PARCEL_RULE",
         privacy: str = "PUBLIC") -> dict[str, Any]:
    return {
        "card_id": card_id, "rule_name": name, "rule_family": family, "scope": scope,
        "requirement": requirement, "fact": fact, "result_state": state,
        "answer": primary, "why": why, "evidence": sources,
        "blocker_codes": blocker_codes or [], "unresolved_condition": None,
        "legal_version_context": "EXPANDABLE_EVIDENCE_UNLESS_MATERIAL",
        "privacy": privacy, "actions": ["REVIEW_SOURCE"],
    }


def schema() -> dict[str, Any]:
    return {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "$id": "trulot://schemas/bounded-feasibility-product-contract-v0",
        "title": "Bounded Feasibility Product Contract V0", "type": "object",
        "required": ["contract_version", "scope", "privacy", "overall_state", "summary", "rule_results", "evidence_state", "actions", "provenance"],
        "properties": {
            "contract_version": {"const": CONTRACT_VERSION},
            "scope": {"enum": ["PUBLIC_PARCEL", "PRIVATE_PROJECT", "EXISTING_STRUCTURE"]},
            "privacy": {"enum": ["PUBLIC", "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX"]},
            "apn": {"type": "string", "pattern": "^[0-9]{10}$"},
            "project_id": {"type": "string"}, "application_date": {"type": "string", "format": "date"},
            "code_profile": {"type": "string"}, "plan_status": {"type": "string"},
            "public_cache": {"type": "boolean"}, "public_index": {"type": "boolean"},
            "private_plan_facts_present": {"type": "boolean"}, "whole_project_compliance": {"type": "boolean"},
            "overall_state": {"enum": ["BASE_PARCEL_RULES_EVALUATED", "PARTIAL_EVALUATION", "MORE_EVIDENCE_NEEDED", "OUTSIDE_CURRENT_SCOPE", "SOURCE_UNAVAILABLE"]},
            "summary": {"type": "object", "required": ["verified", "conditional", "needs_evidence", "not_evaluated"]},
            "rule_results": {"type": "array", "items": {"$ref": "#/definitions/ruleResult"}},
            "evidence_state": {"type": "object"}, "actions": {"type": "array", "items": {"type": "string"}},
            "provenance": {"type": "array", "items": {"$ref": "#/definitions/source"}},
        },
        "definitions": {
            "source": {"type": "object", "required": ["artifact", "privacy"], "properties": {"artifact": {"type": "string"}, "privacy": {"enum": ["PUBLIC_AUTHORITY", "PRIVATE_AUTHORIZED_EVIDENCE"]}}, "additionalProperties": False},
            "ruleResult": {"type": "object", "required": ["card_id", "rule_name", "rule_family", "scope", "requirement", "fact", "result_state", "answer", "why", "evidence", "blocker_codes", "privacy", "actions"], "properties": {
                "card_id": {"type": "string"}, "rule_name": {"type": "string"}, "rule_family": {"type": "string"},
                "scope": {"enum": ["PARCEL_RULE", "PROJECT_COMPARISON", "EXISTING_STRUCTURE_COMPLIANCE", "PROGRAM_OR_OVERLAY"]},
                "requirement": {"type": ["string", "null"]}, "fact": {"type": ["string", "null"]},
                "result_state": {"enum": sorted(PRODUCT_STATES)}, "answer": {"type": "string"}, "why": {"type": "string"},
                "evidence": {"type": "array", "items": {"$ref": "#/definitions/source"}}, "blocker_codes": {"type": "array", "items": {"type": "string"}},
                "unresolved_condition": {"type": ["string", "null"]}, "legal_version_context": {"type": "string"},
                "privacy": {"enum": ["PUBLIC", "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX"]}, "actions": {"type": "array", "items": {"type": "string"}},
            }, "additionalProperties": False},
        }, "additionalProperties": False,
        "deterministic_mapping": "Existing sealed internal states select allowlisted states and templates; uncontrolled generated conclusion text is prohibited.",
    }


def scope_contract() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "classifications": {
        "PRODUCT_READY": ["parcel_identity", "legal_lot_readiness", "base_zoning", "coastal_context", "supported_lot_area_width_depth_frontage_comparisons", "source_availability"],
        "PRODUCT_READY_CONDITIONAL": ["setback_requirements", "street_side_applicability", "base_height_profile", "base_far_profile", "lot_coverage_rule_existence", "mapped_program_overlay_context", "evidence_blockers"],
        "TECHNICAL_ONLY": ["diagnostic_geometry", "internal_fingerprints", "source_adapter_states", "predicate_resolution_trace", "sensitivity_ranges"],
        "OUTSIDE_V0_SCOPE": ["development_capacity", "whole_project_compliance", "existing_structure_legality_without_current_survey", "program_eligibility_without_program_evaluation", "permit_approval", "economics"],
    }, "supported_zones": ["RS profile families", "RM profile families with sealed profiles"], "rule_project_existing_layers_must_remain_distinct": True}


def states() -> dict[str, Any]:
    descriptions = {
        "MEETS_BASE_RULE": "A supported deterministic comparison satisfies the selected base rule.",
        "DOES_NOT_MEET_BASE_RULE": "A supported deterministic comparison does not satisfy the selected base rule.",
        "CONDITIONAL": "The rule depends on an identified unresolved predicate or branch.",
        "NEEDS_EVIDENCE": "Required parcel or project evidence is missing.",
        "NOT_APPLICABLE": "The rule is proven not to apply to this parcel or selected subject.",
        "NOT_EVALUATED": "TruLot has not evaluated the rule or program.",
        "SOURCE_UNAVAILABLE": "The authoritative source cannot currently be evaluated.",
        "OUTSIDE_CURRENT_SCOPE": "The rule or project type is not supported by V0.",
    }
    return {"contract_version": CONTRACT_VERSION, "product_states": [{"state": state, "label": state.replace("_", " ").title(), "meaning": descriptions[state]} for state in sorted(PRODUCT_STATES)], "internal_mapping": INTERNAL_TO_PRODUCT, "ambiguous_likely_state_allowed": False}


def overall() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "states": {
        "BASE_PARCEL_RULES_EVALUATED": "Every requested, supported base parcel rule has a deterministic result; this is not whole-property feasibility.",
        "PARTIAL_EVALUATION": "At least one base parcel rule is evaluated and at least one remains conditional, blocked, or unevaluated.",
        "MORE_EVIDENCE_NEEDED": "The requested evaluation cannot reach a bounded comparison without named evidence.",
        "OUTSIDE_CURRENT_SCOPE": "The requested analysis is outside V0.",
        "SOURCE_UNAVAILABLE": "An authoritative source required for the requested analysis is unavailable.",
    }, "prohibited_top_level_labels": ["Buildable", "Not buildable", "Approved", "Development feasible", "Can build X units"], "qualification": "Top-level state summarizes evaluation coverage, never entitlement, capacity, approval, or whole-project compliance."}


def rule_card_contract() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "fields": ["card_id", "rule_name", "rule_family", "scope", "requirement", "fact", "result_state", "answer", "why", "evidence", "blocker_codes", "unresolved_condition", "legal_version_context", "privacy", "actions"], "layers": {
        "PARCEL_RULE": "The authoritative requirement.", "PARCEL_FACT": "The independently supported parcel measurement or classification.", "COMPARISON": "A bounded deterministic relationship between compatible rule and fact.",
        "PROJECT_COMPARISON": "A named proposed-plan fact compared with the selected rule; not approval or whole-project compliance.",
        "EXISTING_STRUCTURE_COMPLIANCE": "Requires current survey-controlled structure geometry and remains separate from parcel-rule evaluation.",
    }, "internal_adapter_names_exposed": False}


def blockers() -> dict[str, Any]:
    items = {
        "LEGAL_LOT_IDENTITY": "TruLot needs recorded evidence establishing the legal lot or premises.",
        "CODE_LOT_AREA": "TruLot needs a Code-defined regulatory lot or premises area.",
        "LEGAL_BOUNDARY_GEOMETRY": "TruLot needs authoritative legal boundary geometry and property-line roles.",
        "CURRENT_SURVEY_STRUCTURE_GEOMETRY": "TruLot needs a current survey tying the building frame to property lines.",
        "CODE_HEIGHT_ANALYSIS": "TruLot needs a Code-compatible grade and top-elevation analysis.",
        "CODE_GFA_AND_PREMISES_AREA": "TruLot needs a reconciled gross-floor-area worksheet and legal premises area.",
        "PARCEL_SLOPE_EVIDENCE": "TruLot needs reviewable parcel-specific slope evidence.",
        "FIRE_OFFICIAL_DETERMINATION": "TruLot needs any project-specific Fire Official setback determination.",
        "PROGRAM_ELIGIBILITY_EVIDENCE": "TruLot has not established the program’s eligibility predicates.",
        "AUTHORITATIVE_SOURCE": "The authoritative source needed for this rule is currently unavailable.",
        "MAPPING_RESOLUTION": "The parcel’s zoning or overlay mapping must be resolved first.",
    }
    return {"contract_version": CONTRACT_VERSION, "blockers": [{"code": code, "copy": copy, "state": "NEEDS_EVIDENCE", "action": "SEE_EVIDENCE_NEEDED"} for code, copy in items.items()], "copy_is_allowlisted": True}


def explainability() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "levels": [
        {"level": 1, "name": "ANSWER", "content": "Short deterministic product statement."},
        {"level": 2, "name": "EXPLANATION", "content": "One sentence explaining the selected rule, fact, or blocker."},
        {"level": 3, "name": "EVIDENCE", "content": "Expandable authoritative sources, effective-date context, and receipts."},
    ], "unresolved_addition": "WHAT_IS_MISSING", "rule": "Each displayed conclusion must retain the source card and blocker path that produced it."}


def language() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "required_qualifiers": ["base rule", "selected zone", "parcel rule", "proposed-plan comparison when private plan facts are used", "not whole-project compliance"], "preferred": ["Meets the 50 ft minimum lot-width rule.", "A street-side setback does not apply because this parcel has no street-side property line.", "This cannot be evaluated yet because TruLot does not have survey-controlled building geometry."], "avoid_in_product_copy": ["RULE_REQUIREMENT_SATISFIED", "STREET_SIDE_SETBACK_NOT_APPLICABLE", "adapter", "predicate enum", "fingerprint"], "positive_scope_rule": "A positive result describes only the named base rule or bounded proposed-plan comparison.", "no_numeric_confidence": True}


def programs() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "programs": [
        {"program": p, "mapped_copy": f"{label} context is mapped; eligibility has not been evaluated.", "pending_copy": f"{label} context needs verification.", "unavailable_copy": f"{label} source is unavailable.", "eligibility_copy": f"TruLot has not evaluated {label} eligibility yet."}
        for p, label in [("COASTAL", "Coastal"), ("SDA", "SDA"), ("TPA", "TPA"), ("FIRE", "Fire hazard"), ("ADU", "ADU"), ("SB9", "SB 9"), ("COMPLETE_COMMUNITIES", "Complete Communities"), ("OTHER_MODIFIER", "This program")]
    ], "doctrine": "Mapped geography is context, not proof of program eligibility or a project-specific conditional result."}


def rule_family_contracts() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION,
        "height": {"rm": "Show the selected base maximum and angled-envelope/overlay qualifiers; project comparison separately needs Code-compatible height evidence.", "rs": "Show 24 ft at applicable setback lines and 30 ft overall with the lot-width-selected angled plane; never flatten 24/30.", "blocked_copy": "Project-height compliance needs a Code-compatible grade and top-elevation analysis."},
        "far": {"rm": "Show the selected base maximum and unit-band context; project FAR separately needs Code-compatible GFA and legal premises area.", "rs": "Show the applicable Table 131-04J lot-area branch and separately disclose the steep-hillside formula when unresolved.", "diagnostic_ranges_legal": False},
        "lot_coverage": {"not_specified_copy": "No numeric base-zone lot-coverage standard identified.", "prohibited_synonyms": ["Unlimited", "No restriction"], "rs_conditional_copy": "A 50% maximum applies when more than half the premises contains steep hillsides; that condition must be evaluated."},
        "setbacks": {"requirement_known": "Show the selected base value.", "requirement_conditional": "Show the base value and named unresolved branches.", "existing_or_project_compliance": "Requires compatible geometry for the named existing structure or proposal."},
        "legal_lot_area": {"recorded_legal_lot": "Recorded instrument-supported identity.", "code_regulatory_area": "Code-defined area used for the named regulation.", "gis_area": "Approximate diagnostic parcel geometry only.", "assessor_area": "Recorded administrative fact; not automatically Code area.", "unresolved_effect": "Block every rule whose denominator or boundary depends on legal-lot identity."},
    }


def summary_contract() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "groups": [
        {"group": "VERIFIED", "states": ["MEETS_BASE_RULE", "DOES_NOT_MEET_BASE_RULE", "NOT_APPLICABLE"], "content": "Base zone, Coastal context, supported dimensions, and bounded comparisons."},
        {"group": "CONDITIONAL", "states": ["CONDITIONAL"], "content": "Rules with identified unresolved branches."},
        {"group": "NEEDS_EVIDENCE", "states": ["NEEDS_EVIDENCE", "SOURCE_UNAVAILABLE"], "content": "Named blockers for requested comparisons."},
        {"group": "NOT_EVALUATED", "states": ["NOT_EVALUATED", "OUTSIDE_CURRENT_SCOPE"], "content": "Programs and analyses not performed by V0."},
    ], "numeric_score": False, "green_red_score": False}


def actions() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "actions": [
        {"code": "REVIEW_SOURCE", "copy": "Review source", "requires_existing_functionality": True},
        {"code": "SEE_EVIDENCE_NEEDED", "copy": "See what evidence is needed", "requires_existing_functionality": True},
        {"code": "EVALUATE_WITH_PROJECT_PLANS", "copy": "Evaluate with project plans", "requires_existing_functionality": False},
        {"code": "ADD_SURVEY", "copy": "Add a survey", "requires_existing_functionality": False},
        {"code": "VIEW_ZONING_DETAILS", "copy": "View zoning details", "requires_existing_functionality": True},
    ], "availability_rule": "Only actions backed by an existing product capability may render as executable; others are informational next steps."}


def indexing() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "public_indexable": ["base zoning", "current base dimensional rules", "public-source parcel facts", "supported public parcel-rule comparisons", "public-source blockers"], "public_not_indexable": ["private project-plan facts", "private evidence", "operator-owned plan details", "private project comparisons", "current structure conclusions derived from private surveys"], "cache_rule": "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX must never enter public page generation, metadata, search documents, or shared caches."}


def boundary() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "scopes": {
        "PUBLIC_PARCEL": {"allowed": "Authoritative public evidence and deterministic public comparisons only.", "privacy": "PUBLIC"},
        "PRIVATE_PROJECT": {"allowed": "Operator-authorized plans and bounded named-project comparisons.", "privacy": "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX"},
        "EXISTING_STRUCTURE": {"allowed": "Current survey-controlled structure evidence when separately authorized and supported.", "privacy": "MATCH_INPUT_EVIDENCE_AND_NEVER_PROMOTE_PRIVATE_FACTS"},
    }, "hard_invariant": "No private fact may enter public parcel generation, indexing, metadata, cache keys, or public provenance."}


def prohibited() -> dict[str, Any]:
    claims = ["This property is buildable", "You can build X units", "This project complies with zoning", "The existing structure is legal", "The property qualifies for ADU bonus", "Height complies", "FAR complies"]
    return {"contract_version": CONTRACT_VERSION, "denylist": claims, "exception_rule": "A claim may be replaced only by the exact narrower statement supported by a named rule, compatible fact, and completed evidence gate. Whole-project, capacity, legality, and eligibility claims remain outside V0.", "substring_gate": ["buildable", "can build", "complies with zoning", "existing structure is legal", "qualifies for", "development feasible"]}


def renderer() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "templates": STATE_COPY, "input_fields": ["state", "allowlisted template values", "blocker code", "source refs"], "free_form_conclusion_generation": False, "unknown_state_behavior": "REJECT", "missing_template_value_behavior": "REJECT", "copy_versioned": True}


def rs_replay() -> dict[str, Any]:
    public = [source("data/rs-rule-profile-v0/rs-1-7-base-rules.json"), source("data/rs-rule-profile-v0/apn-6341302200-replay.json")]
    cards = [
        card("RS17_AREA", "minimum lot area", "MINIMUM_LOT_AREA", "MEETS_BASE_RULE", "5,000 sq ft minimum", "22,096.320 sq ft Code-defined area", "Meets the 5,000 sq ft base minimum lot-area rule.", "The supported Code-defined lot area is at least the RS-1-7 base minimum.", public),
        card("RS17_WIDTH", "minimum lot width", "MINIMUM_LOT_WIDTH", "MEETS_BASE_RULE", "50 ft minimum", "94.00 ft Code-defined width", "Meets the 50 ft base minimum lot-width rule.", "The supported Code-defined lot width is at least the RS-1-7 base minimum.", public),
        card("RS17_DEPTH", "minimum lot depth", "MINIMUM_LOT_DEPTH", "MEETS_BASE_RULE", "95 ft minimum", "235.02 ft Code-defined depth", "Meets the 95 ft base minimum lot-depth rule.", "The supported Code-defined lot depth is at least the RS-1-7 base minimum.", public),
        card("RS17_FRONTAGE", "minimum frontage", "MINIMUM_STREET_FRONTAGE", "MEETS_BASE_RULE", "50 ft minimum", "94.00 ft supported frontage", "Meets the 50 ft base minimum frontage rule.", "The supported frontage is at least the selected RS-1-7 base requirement.", public),
        card("RS17_FRONT", "front setback", "FRONT_SETBACK", "CONDITIONAL", "15 ft base with slope, cul-de-sac, and Fire branches", None, "The base front-setback requirement is conditional.", "Slope and project-specific Fire predicates can change the selected requirement.", public),
        card("RS17_REAR", "rear setback", "REAR_SETBACK", "CONDITIONAL", "13 ft table value with depth, alley, and Fire branches", "235.02 ft lot depth", "The base rear-setback requirement is conditional.", "The long-lot branch produces 23.502 ft before unresolved Fire or external modifiers.", public),
        card("RS17_SIDE", "interior-side setback", "INTERIOR_SIDE_SETBACK", "CONDITIONAL", "4 ft ordinary base per side", "94.00 ft lot width", "The base interior-side setback is conditional.", "Addition, reallocation, projection, and Fire predicates remain separate.", public),
        card("RS17_STREET_SIDE", "street-side setback", "STREET_SIDE_SETBACK", "NOT_APPLICABLE", "5 ft when a street-side property line exists", "No street-side property line", "This rule does not apply to this parcel.", "The recorded line roles establish a single-frontage, non-corner lot without a street-side property line.", public),
        card("RS17_EXISTING", "existing structure setbacks", "EXISTING_STRUCTURE_SETBACKS", "NEEDS_EVIDENCE", None, None, "This rule cannot be evaluated yet because TruLot needs a current survey tying the building frame to property lines.", "A base setback requirement is not an existing-structure compliance result.", public, ["CURRENT_SURVEY_STRUCTURE_GEOMETRY"], "EXISTING_STRUCTURE_COMPLIANCE"),
    ]
    return {"contract_version": CONTRACT_VERSION, "scope": "PUBLIC_PARCEL", "privacy": "PUBLIC", "apn": "6341302200", "overall_state": "PARTIAL_EVALUATION", "summary": {"verified": ["legal lot identity", "base zone RS-1-7", "outside Coastal", "area", "width", "depth", "frontage", "street-side not applicable"], "conditional": ["front setback", "rear setback", "interior-side setback"], "needs_evidence": ["existing structure compliance", "height", "FAR"], "not_evaluated": ["ADU eligibility", "SB 9 eligibility"]}, "rule_results": cards, "evidence_state": {"legal_lot": "SUPPORTED", "existing_structure_geometry": "MISSING"}, "actions": ["REVIEW_SOURCE", "SEE_EVIDENCE_NEEDED", "VIEW_ZONING_DETAILS"], "provenance": public}


def rm_public_replay() -> dict[str, Any]:
    public = [source("data/approved-plan-setback-benchmark-v0/public-rule-profile.json"), source("data/rm-rule-profile-v0/rm-2-5-base-rules.json")]
    cards = [
        card("RM25_ZONE", "base zoning", "BASE_ZONING", "MEETS_BASE_RULE", "RM-2-5 profile selected", "RM-2-5 public mapped zone", "The parcel’s selected base zone is RM-2-5.", "The authoritative public mapping resolves to RM-2-5 with only a retained boundary sliver.", public),
        card("RM25_HEIGHT", "base height", "STRUCTURE_HEIGHT", "CONDITIONAL", "40 ft maximum with angled-plane and overlay predicates", None, "The RM-2-5 base height profile is 40 ft with additional conditions.", "Project-height compliance needs Code-compatible grade, top, and angled-plane evidence.", public, ["CODE_HEIGHT_ANALYSIS"]),
        card("RM25_FAR", "base FAR", "FAR", "CONDITIONAL", "1.35 maximum in each distinct RM-2-5 unit band", None, "The RM-2-5 base FAR maximum is 1.35; project FAR has not been evaluated.", "A project comparison needs Code-compatible gross floor area and legal premises area.", public, ["CODE_GFA_AND_PREMISES_AREA"]),
        card("RM25_SDA", "SDA", "SDA", "NOT_EVALUATED", "Mapped SDA context", "Inside mapped SDA", "SDA context is mapped; eligibility has not been evaluated.", "Geography alone does not prove eligibility or modify a base rule.", public, ["PROGRAM_ELIGIBILITY_EVIDENCE"], "PROGRAM_OR_OVERLAY"),
        card("RM25_FIRE", "Fire requirements", "FIRE", "NOT_EVALUATED", "Mapped VHFHSZ context", "Mapped Fire hazard intersection", "Fire hazard context is mapped; project-specific requirements have not been evaluated.", "Mapped geography is not a Fire Official determination.", public, ["FIRE_OFFICIAL_DETERMINATION"], "PROGRAM_OR_OVERLAY"),
    ]
    return {"contract_version": CONTRACT_VERSION, "scope": "PUBLIC_PARCEL", "privacy": "PUBLIC", "apn": "5442140600", "overall_state": "PARTIAL_EVALUATION", "summary": {"verified": ["public parcel identity", "base zone RM-2-5", "outside Coastal", "mapped SDA and Fire context"], "conditional": ["base setbacks", "height profile", "FAR profile"], "needs_evidence": ["project height", "project FAR", "existing structure compliance"], "not_evaluated": ["ADU eligibility", "SDA eligibility", "other program eligibility"]}, "rule_results": cards, "evidence_state": {"private_project_facts_used": False}, "actions": ["REVIEW_SOURCE", "SEE_EVIDENCE_NEEDED", "VIEW_ZONING_DETAILS"], "provenance": public, "private_plan_facts_present": False}


def private_replay() -> dict[str, Any]:
    private = [source("data/approved-plan-setback-benchmark-v0/benchmark-result.json", "PRIVATE_AUTHORIZED_EVIDENCE"), source("data/approved-plan-setback-benchmark-v0/plan-fact-envelope.json", "PRIVATE_AUTHORIZED_EVIDENCE"), source("data/approved-plan-setback-benchmark-v0/public-rule-profile.json")]
    result = card("PRJ1111087_SIDE", "proposed interior-side setback", "INTERIOR_SIDE_SETBACK", "MEETS_BASE_RULE", "4 ft selected application-profile minimum", "5 ft 11-1/2 in proposed enclosed-ADU frame setback", "The named proposed building dimension meets the selected 4 ft interior-side setback rule.", "This is a bounded comparison for Building 1’s north enclosed-ADU frame in the identified plan set.", private, scope="PROJECT_COMPARISON", privacy="PRIVATE_NO_PUBLIC_CACHE_OR_INDEX")
    return {"contract_version": CONTRACT_VERSION, "scope": "PRIVATE_PROJECT", "privacy": "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX", "project_id": "PRJ-1111087", "apn": "5442140600", "application_date": "2024-01-29", "code_profile": "OUTSIDE_COASTAL_O-21618_EFFECTIVE_2023-05-06", "plan_status": "FOURTH_CD_SUBMITTAL_NOT_PROVEN_ISSUED", "overall_state": "PARTIAL_EVALUATION", "summary": {"verified": ["one named proposed-plan interior-side setback comparison"], "conditional": [], "needs_evidence": ["height", "FAR", "whole-project review"], "not_evaluated": ["development capacity", "whole-project compliance"]}, "rule_results": [result], "evidence_state": {"plan_evidence": "PRIVATE_AUTHORIZED", "public_promotion": False}, "actions": ["REVIEW_SOURCE", "SEE_EVIDENCE_NEEDED"], "provenance": private, "public_cache": False, "public_index": False}


def blocked_replay() -> dict[str, Any]:
    refs = [source("data/rm-rule-profile-v0/packet-50-replay.json", "PRIVATE_AUTHORIZED_EVIDENCE")]
    return {"contract_version": CONTRACT_VERSION, "scope": "PRIVATE_PROJECT", "privacy": "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX", "project_id": "PRJ-1111087", "overall_state": "MORE_EVIDENCE_NEEDED", "summary": {"verified": ["base RM-2-5 height and FAR profiles"], "conditional": [], "needs_evidence": ["project height", "project FAR"], "not_evaluated": ["whole-project compliance"]}, "rule_results": [
        card("P50_HEIGHT", "project height", "STRUCTURE_HEIGHT", "NEEDS_EVIDENCE", "40 ft base profile plus angled-plane rules", "40 ft plan label not accepted as Code measurement", "Project-height compliance needs a Code-compatible grade and top-elevation analysis.", "The plan label does not seal grade datum, highest point, roof treatment, or angled-plane geometry.", refs, ["CODE_HEIGHT_ANALYSIS"], "PROJECT_COMPARISON", "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX"),
        card("P50_FAR", "project FAR", "FAR", "NEEDS_EVIDENCE", "1.35 selected RM-2-5 maximum", "Plan-labeled FAR 1.10 not accepted as Code computation", "Project FAR needs a reconciled gross-floor-area worksheet and legal premises area.", "The numerator and denominator were not sealed under the applicable Code definitions.", refs, ["CODE_GFA_AND_PREMISES_AREA"], "PROJECT_COMPARISON", "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX"),
    ], "evidence_state": {"height": "BLOCKED", "far": "BLOCKED"}, "actions": ["SEE_EVIDENCE_NEEDED"], "provenance": refs, "whole_project_compliance": False}


def examples() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "examples": [
        {"example_id": "A_RS17_PARTIAL", "artifact": "rs-6341302200-replay.json", "scope": "PUBLIC_PARCEL"},
        {"example_id": "B_RM25_PUBLIC_ONLY", "artifact": "rm-5442140600-public-replay.json", "scope": "PUBLIC_PARCEL"},
        {"example_id": "C_PRIVATE_PLAN", "artifact": "private-prj-1111087-replay.json", "scope": "PRIVATE_PROJECT"},
        {"example_id": "D_BLOCKED_HEIGHT_FAR", "artifact": "blocked-height-far-replay.json", "scope": "PRIVATE_PROJECT"},
        {"example_id": "E_NOT_APPLICABLE", "artifact": "rs-6341302200-replay.json#RS17_STREET_SIDE", "scope": "PUBLIC_PARCEL"},
    ], "new_conclusions_added": False}


def provenance() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "inputs": [
        "data/parcel-feasibility-summary-v0/summary.json", "data/development-feasibility-v0/contract.json",
        "data/rs-rule-profile-v0/decision.json", "data/rm-rule-profile-v0/decision.json",
        "data/current-structure-compliance-geometry-v0/decision.json", "data/approved-plan-setback-benchmark-v0/benchmark-result.json",
        "data/approved-plan-height-far-benchmark-v0/height-result.json", "data/approved-plan-height-far-benchmark-v0/far-result.json",
    ], "public_private_separation_preserved": True, "production_access": False}


def decision() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "readiness": "BOUNDED_FEASIBILITY_PRODUCT_CONTRACT_READY", "next": "NEXT_FEASIBILITY_STEP: implement bounded feasibility preview", "ui_implemented": False, "production_wired": False, "capacity_calculated": False, "whole_project_compliance": False}


def build_outputs() -> dict[str, Any]:
    outputs = {
        "schema.json": schema(), "scope.json": scope_contract(), "states.json": states(), "overall-state.json": overall(),
        "rule-card-contract.json": rule_card_contract(), "evidence-blockers.json": blockers(), "explainability.json": explainability(),
        "language-doctrine.json": language(), "program-overlay-states.json": programs(), "rule-family-contracts.json": rule_family_contracts(),
        "summary-contract.json": summary_contract(), "actions.json": actions(), "indexing-doctrine.json": indexing(),
        "public-private-boundary.json": boundary(), "prohibited-statements.json": prohibited(), "renderer-contract.json": renderer(),
        "rs-6341302200-replay.json": rs_replay(), "rm-5442140600-public-replay.json": rm_public_replay(),
        "private-prj-1111087-replay.json": private_replay(), "blocked-height-far-replay.json": blocked_replay(),
        "examples.json": examples(), "provenance.json": provenance(), "decision.json": decision(),
    }
    outputs["integrity.json"] = {"contract_version": CONTRACT_VERSION, "algorithm": "SHA-256 of canonical JSON with final newline", "files": {name: sha256(value) for name, value in sorted(outputs.items())}}
    return outputs


def write_outputs() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    outputs = build_outputs()
    for path in OUTPUT.glob("*.json"):
        if path.name not in outputs:
            path.unlink()
    for name, value in outputs.items():
        (OUTPUT / name).write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    write_outputs()

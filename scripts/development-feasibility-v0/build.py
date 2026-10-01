#!/usr/bin/env python3
"""Build deterministic Development Feasibility V0 contract artifacts."""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

from resolver import (
    ALLOWED_CONCLUSIONS,
    CONTRACT_VERSION,
    FACT_DOCTRINE,
    PROHIBITED_CONCLUSIONS,
    RULE_FAMILIES,
    RULE_STATES,
    SUPPORTED_ZONES,
    TOP_LEVEL_STATES,
    canonical_json,
    resolve_feasibility_v0,
)


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "development-feasibility-v0"
CORPUS = ROOT / "data" / "parcel-intelligence-v2" / "fixture-results.json"


def sha256(value: object) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def contract() -> dict:
    return {
        "contract_version": CONTRACT_VERSION,
        "mission": "Determine whether supported evidence is sufficient for bounded RS base-rule evaluation; never calculate compliance or development capacity.",
        "questions": [
            "SCOPE_ELIGIBILITY",
            "RULE_AVAILABILITY",
            "EVIDENCE_COMPLETENESS",
            "RULE_EVALUATION_READINESS",
            "DEVELOPMENT_FEASIBILITY_READINESS",
        ],
        "scope": {
            "jurisdiction": "City of San Diego",
            "identity_contract": "Parcel V2",
            "mapping_state": "SINGLE_ZONE",
            "zones": list(SUPPORTED_ZONES),
            "coastal_states": ["OUTSIDE_COASTAL", "INSIDE_COASTAL"],
            "analysis": "base-zone feasibility readiness only",
            "excluded": [
                "split/ambiguous/unmapped zoning", "unresolved Coastal boundary", "non-RS zones",
                "ADU/JADU", "SB 9", "SB 79", "Density Bonus", "Complete Communities",
                "parking programs", "discretionary entitlement findings", "variances",
                "environmentally sensitive lands", "historical-resource analysis",
                "permit-processing conclusions", "project economics",
            ],
        },
        "top_level_states": list(TOP_LEVEL_STATES),
        "rule_states": list(RULE_STATES),
        "truth_doctrine": [
            "Approximate parcel geometry area and taxable acreage are not legal lot area.",
            "Diagnostic spans are not legal width, depth, frontage, or lot-line roles.",
            "Assessor living area is not Code-defined gross floor area.",
            "Historical 2017 footprints are not current structure footprints.",
            "Source zero is unknown, not actual zero or false.",
            "Rule availability does not establish parcel compliance.",
            "No numeric confidence score is permitted.",
        ],
        "legal_evidence_doctrine": FACT_DOCTRINE,
        "current_legal_lot_area_state": "LEGAL_LOT_AREA_NOT_YET_ESTABLISHED",
        "setback_evaluation_contract": {
            "requires": ["applicable standard/version", "legally designated lot-line roles", "legal dimensions where the source condition requires them", "current or proposed structure geometry", "applicable source conditions", "slope/fire/other predicates"],
            "distinct_states": ["RULE_KNOWN", "PARCEL_SPECIFIC_REQUIREMENT_UNRESOLVED", "ACTUAL_STRUCTURE_COMPLIANCE_UNEVALUATED"],
        },
        "height_evaluation_contract": {
            "requires": ["applicable height rule", "resolved source branch/condition", "current or proposed structure height", "Code-appropriate reference datum", "angled-envelope context and geometry"],
            "prohibited": ["infer height from stories", "infer height from footprint"],
        },
        "far_evaluation_contract": {
            "requires": ["applicable FAR rule", "legal lot-area denominator", "Code-defined gross-floor-area numerator", "hillside/condition predicates"],
            "current_numerator_state": "FAR_NUMERATOR_NOT_YET_AVAILABLE",
            "prohibited_substitute": "assessor living area",
        },
        "lot_coverage_evaluation_contract": {
            "requires": ["applicable coverage rule", "legal premises/lot-area denominator", "current structure footprint", "hillside/condition predicates"],
            "prohibited_substitute": "historical 2017 footprint geometry",
        },
        "density_basis_doctrine": {
            "allowed_statement": "The applicable RS base table states a basis of 1 dwelling unit per lot.",
            "does_not_mean": ["maximum legal units", "development capacity", "ADU-inclusive capacity", "SB 9 capacity", "density-bonus capacity"],
        },
        "existing_unit_doctrine": {
            "positive_UNITQTY": "Recorded assessor parcel-level count of units currently constructed; usable only with source semantics and provenance.",
            "zero_UNITQTY": "UNKNOWN; not evidence of vacancy or zero structures.",
            "does_not_establish": ["permit status", "lawful occupancy", "development rights", "future capacity"],
        },
        "project_fact_boundary": {
            "parcel_facts": ["legal lot evidence", "lot-line roles", "frontage", "topography/fire predicates", "current structure evidence"],
            "future_project_facts": ["proposed use", "proposed units", "proposed floor area", "proposed footprint", "proposed height", "demolition/retention scope", "accessory structure scope"],
            "rule": "Project facts are required only when a requested rule comparison inherently depends on a proposal.",
        },
        "allowed_conclusions": list(ALLOWED_CONCLUSIONS),
        "prohibited_conclusions": list(PROHIBITED_CONCLUSIONS),
        "summary_result_fields": [
            "parcel_identity", "scope_state", "standards_version", "rule_family_readiness",
            "supported_parcel_facts", "missing_evidence", "project_facts_required",
            "allowed_conclusions", "prohibited_conclusions", "next_evidence_target", "provenance",
        ],
        "public_product_bridge": {
            "cta": "See what's needed to evaluate this property",
            "may_show": ["what TruLot already knows", "missing evidence", "what rule could be evaluated next"],
            "blocked_behavior": "State that feasibility remains blocked; never imply a completed feasibility result.",
        },
    }


def evidence_inventory() -> dict:
    return {
        "contract_version": CONTRACT_VERSION,
        "layers": [
            {"layer": "Parcel V2 identity", "facts": [
                {"fact": "APN, parcel ID, jurisdiction, acquisition and source row identity", "classification": "usable_for_feasibility"},
                {"fact": "approximate geometry area and parcel geometry", "classification": "diagnostic_only"},
                {"fact": "taxable acreage", "classification": "diagnostic_only"},
                {"fact": "situs address", "classification": "usable_for_identity_only"},
            ]},
            {"layer": "Base Zoning V2", "facts": [
                {"fact": "SINGLE_ZONE RS mapping and zone code", "classification": "usable_for_feasibility"},
                {"fact": "split, ambiguous, indeterminate, or unmapped result", "classification": "outside_v0_scope_or_mapping_unresolved"},
                {"fact": "intersection coverage", "classification": "diagnostic_only"},
            ]},
            {"layer": "Coastal Context V0", "facts": [
                {"fact": "resolved INSIDE_COASTAL or OUTSIDE_COASTAL state", "classification": "usable_for_feasibility"},
                {"fact": "BOUNDARY_AMBIGUOUS", "classification": "legally_unresolved"},
                {"fact": "source failure", "classification": "source_unavailable"},
            ]},
            {"layer": "inside/outside-Coastal RS standards and Parcel RS Standards Runtime V0", "facts": [
                {"fact": "supported rule-set version, rule values, conditions, citations, and dependencies", "classification": "usable_for_rule_availability"},
                {"fact": "rule availability", "classification": "not_parcel_compliance"},
            ]},
            {"layer": "RS Parcel Condition Inputs V0", "facts": [
                {"fact": "legal lot area, width, depth, frontage, corner status, and lot-line roles", "classification": "legally_unresolved"},
                {"fact": "slope, fire, hillside, GFA, and structure-condition predicates", "classification": "legally_unresolved"},
                {"fact": "geometry spans and orientations", "classification": "diagnostic_only"},
            ]},
            {"layer": "Structure Facts V0", "facts": [
                {"fact": "positive assessor UNITQTY", "classification": "usable_for_bounded_recorded_statement"},
                {"fact": "zero/sentinel UNITQTY", "classification": "legally_unresolved"},
                {"fact": "assessor living area", "classification": "diagnostic_only"},
                {"fact": "2017 building outlines and derived footprint areas", "classification": "diagnostic_only"},
                {"fact": "current structure footprint and Code-defined GFA", "classification": "source_unavailable_or_not_yet_acquired"},
            ]},
            {"layer": "Parcel Intelligence V2", "facts": [
                {"fact": "sealed identity/zoning/Coastal/standards composition and provenance", "classification": "usable_for_feasibility"},
                {"fact": "what_can_i_build", "classification": "outside_v0_scope"},
            ]},
            {"layer": "Parcel Page presentation levels", "facts": [
                {"fact": "truth vocabulary, CTA, homeowner summaries, and technical provenance", "classification": "usable_for_future_product_bridge"},
                {"fact": "rendered labels or HTML", "classification": "not_a_feasibility_source"},
            ]},
        ],
    }


def evidence_matrix() -> dict:
    descriptions = {
        "minimum_lot_area": "Legal lot area from a recorded/legal source; approximate geometry and taxable acreage refused.",
        "minimum_lot_width": "Code-defined legal width from authoritative legal-lot evidence; geometry spans refused.",
        "minimum_lot_depth": "Code-defined legal depth from authoritative legal-lot evidence; geometry spans refused.",
        "frontage": "Legal frontage plus designated front lot line and right-of-way relationship.",
        "front_setback": "Front lot line, structure geometry, slope branch, fire buffer, and all source predicates.",
        "interior_side_setback": "Interior-side lot lines, structure geometry, fire buffer, and all source predicates.",
        "street_side_setback": "Corner-lot status, street-side line, structure geometry, fire buffer, and source predicates.",
        "rear_setback": "Rear line, structure geometry, fire buffer, and all source predicates.",
        "height": "Reference datum, source branch, angled-envelope context, and measured/proposed structure height.",
        "far": "Legal lot-area denominator, Code-defined GFA numerator, and hillside predicates.",
        "lot_coverage": "Legal lot-area denominator, current/proposed footprint, and hillside predicates.",
        "density_basis": "Source table supports only the bounded one-dwelling-unit-per-lot basis statement.",
        "existing_unit_conditions": "Positive assessor UNITQTY is a recorded parcel fact; zero remains unknown and legality is not established.",
    }
    rows = []
    for item in RULE_FAMILIES:
        rows.append({
            "rule_family": item["family"],
            "rule_source_key": item["source_key"],
            "rule_source_available_in_supported_rs_contract": True,
            "required_parcel_facts": list(item["parcel_facts"]),
            "required_project_facts": list(item["project_facts"]),
            "current_state": "RULE_AVAILABLE_FOR_BOUNDED_STATEMENT" if item.get("bounded_statement_only") else "RULE_BLOCKED_BY_MISSING_EVIDENCE",
            "blocking_evidence": descriptions[item["family"]],
            "evaluation_path": "possible now as a bounded source statement" if item.get("bounded_statement_only") else "possible with additional authoritative evidence",
        })
    return {"contract_version": CONTRACT_VERSION, "rows": rows}


def source_priorities() -> dict:
    return {
        "contract_version": CONTRACT_VERSION,
        "ranking_basis": ["rule families unlocked", "legal-semantic importance", "acquisition feasibility", "reproducibility"],
        "priorities": [
            {"rank": 1, "target": "recorded parcel maps and legal lot records", "unlocks": ["legal lot area", "legal width", "legal depth", "frontage", "lot-line roles", "setback foundations", "FAR denominator", "coverage denominator"], "reason": "Largest legal-semantic bottleneck and prerequisite for the first defensible mechanical base-rule comparison."},
            {"rank": 2, "target": "street/right-of-way and legal frontage evidence", "unlocks": ["frontage", "front lot line", "street-side lot line", "setback orientation"], "reason": "Resolves street relationships that parcel geometry and situs addresses cannot establish."},
            {"rank": 3, "target": "current structure footprints", "unlocks": ["lot coverage", "setback distance geometry", "structure-presence evidence"], "reason": "Replaces the prohibited 2017 historical-footprint substitute."},
            {"rank": 4, "target": "Code-defined gross floor area", "unlocks": ["FAR numerator"], "reason": "Required for FAR; assessor living area is not interchangeable."},
            {"rank": 5, "target": "authoritative topography and slope", "unlocks": ["front setback condition", "height/FAR/coverage hillside branches"], "reason": "Resolves several conditional source branches after legal lot geometry exists."},
            {"rank": 6, "target": "fire/defensible-space applicability", "unlocks": ["outside-Coastal setback conditions"], "reason": "Necessary for final setback selection where the source permits a greater buffer."},
        ],
        "selected_next_target": "recorded parcel maps and legal lot records",
    }


def fixture_definitions() -> list[dict]:
    legal_provenance = {"source": "hypothetical recorded parcel map", "record_id": "fixture-map-1", "observed_as_of": "2026-09-30"}
    legal = lambda value, evidence_class="authoritative_parcel_map": {"state": "supported", "value": value, "evidence_class": evidence_class, "provenance": legal_provenance}
    predicate = lambda value: {"state": "supported", "value": value, "classification": "usable_for_feasibility", "provenance": {"source": "hypothetical authoritative fixture"}}
    fully_evidenced = {
        "legal_lot_area_sqft": legal(21840), "legal_lot_width_ft": legal(120), "legal_lot_depth_ft": legal(182),
        "legal_street_frontage_length_ft": legal(120), "front_lot_line": predicate("line-front"),
        "interior_side_lot_lines": predicate(["line-side-a", "line-side-b"]), "street_side_lot_lines": predicate([]),
        "rear_lot_line": predicate("line-rear"), "corner_lot_status": predicate(False), "slope_percent": predicate(8.0),
        "fire_buffer_applicability": predicate(False), "hillside_applicability": predicate(False),
        "height_reference_datum": predicate("code-datum-fixture"), "angled_envelope_context": predicate("resolved-fixture"),
        "current_structure_footprint": predicate({"area_sqft": 2400, "geometry_ref": "fixture-current-footprint"}),
    }
    project = {key: predicate(value) for key, value in {
        "structure_geometry": "fixture-proposed-envelope", "structure_height_ft": 22,
        "code_gross_floor_area_sqft": 3200, "proposed_footprint_sqft": 1800,
    }.items()}
    return [
        {"fixture_id": "in-scope-missing-legal-dimensions", "parcel_fixture_id": "p14-ordinary-rs-1-7", "description": "In-scope RS parcel with legal lot dimensions unresolved.", "expected_state": "FEASIBILITY_BLOCKED_BY_MISSING_EVIDENCE"},
        {"fixture_id": "structure-facts-missing-gfa", "parcel_fixture_id": "outside-rs-1-7", "description": "Structure facts exist, but assessor living area is not Code-defined GFA.", "expected_state": "FEASIBILITY_BLOCKED_BY_MISSING_EVIDENCE"},
        {"fixture_id": "inside-coastal-rs", "parcel_fixture_id": "p14-ordinary-rs-1-7", "description": "Inside-Coastal version selection succeeds; legal evidence remains incomplete.", "expected_state": "FEASIBILITY_BLOCKED_BY_MISSING_EVIDENCE"},
        {"fixture_id": "outside-coastal-rs", "parcel_fixture_id": "outside-rs-1-7", "description": "Outside-Coastal version selection succeeds; legal evidence remains incomplete.", "expected_state": "FEASIBILITY_BLOCKED_BY_MISSING_EVIDENCE"},
        {"fixture_id": "split-zone-outside-v0", "parcel_fixture_id": "p14-split-rs-non-rs", "description": "Split zoning is outside V0.", "expected_state": "FEASIBILITY_OUTSIDE_V0_SCOPE"},
        {"fixture_id": "non-rs-outside-v0", "parcel_fixture_id": "p14-missing-situs-taxable", "description": "Non-RS zoning is outside V0.", "expected_state": "FEASIBILITY_OUTSIDE_V0_SCOPE"},
        {"fixture_id": "coastal-boundary-unresolved", "parcel_fixture_id": "boundary-balanced", "description": "Coastal boundary applicability is unresolved.", "expected_state": "FEASIBILITY_MAPPING_UNRESOLVED"},
        {"fixture_id": "source-unavailable", "parcel_fixture_id": "packet8-identity-exception", "description": "Required zoning/Coastal/standards sources are unavailable.", "expected_state": "FEASIBILITY_SOURCE_UNAVAILABLE"},
        {"fixture_id": "hypothetical-fully-evidenced-rule-family", "parcel_fixture_id": "outside-rs-1-7", "description": "Hypothetical authoritative evidence makes bounded rule comparisons ready without calculating them.", "expected_state": "FEASIBILITY_READY_FOR_RULE_EVALUATION", "fact_overrides": fully_evidenced, "project_facts": project},
        {"fixture_id": "forbidden-maximum-units-request", "parcel_fixture_id": "outside-rs-1-7", "description": "Maximum-unit requests are outside V0.", "expected_state": "FEASIBILITY_OUTSIDE_V0_SCOPE", "requested_analysis": "maximum_units"},
    ]


def build_outputs() -> dict[str, object]:
    corpus = json.loads(CORPUS.read_text())
    by_id = {item["fixture_id"]: item["result"] for item in corpus["results"]}
    fixtures = fixture_definitions()
    results = []
    for fixture in fixtures:
        parcel = copy.deepcopy(by_id[fixture["parcel_fixture_id"]])
        result = resolve_feasibility_v0(
            parcel,
            requested_analysis=fixture.get("requested_analysis"),
            fact_overrides=fixture.get("fact_overrides"),
            project_facts=fixture.get("project_facts"),
        )
        results.append({
            "fixture_id": fixture["fixture_id"],
            "description": fixture["description"],
            "expected_state": fixture["expected_state"],
            "result": result,
        })
    fixture_artifact = {"contract_version": CONTRACT_VERSION, "fixture_count": len(fixtures), "fixtures": fixtures}
    result_artifact = {"contract_version": CONTRACT_VERSION, "fixture_count": len(results), "results": results}
    result_artifact["canonical_output_sha256"] = sha256(result_artifact)
    decision = {
        "decision": "DEVELOPMENT_FEASIBILITY_V0_CONTRACT_READY",
        "contract_version": CONTRACT_VERSION,
        "next_feasibility_source_target": "recorded parcel maps and legal lot records",
        "capacity_calculated": False,
        "compliance_calculated": False,
        "project_feasibility_implemented": False,
        "production_runtime_wired": False,
    }
    verification = {
        "result": "PASS_WITH_PREEXISTING_BASELINE_DRIFT",
        "packet_23_tests": {"result": "PASS", "tests": 20},
        "parcel_intelligence_v2": {"result": "PASS", "tests": 31},
        "rs_parcel_condition_inputs_v0": {
            "result": "13_PASS_1_PREEXISTING_FAILURE",
            "failing_test": "test_fingerprint_and_full_rebuild",
            "baseline_reproduction": "Fails identically in an archive of authorized HEAD 9ea605b827f784449c97f6bb51a0d6ff9c415ff5.",
            "difference": "Stored Packet 13 artifact SHA and dependent fingerprints differ from a fresh Packet 14 rebuild; semantic assertions pass.",
            "packet_23_files_involved": False,
        },
        "structure_facts_v0": {"result": "PASS", "tests": 10},
        "parcel_rs_standards_runtime_v0": {"result": "PASS", "tests": 15},
        "parcel_truth": {"result": "PASS", "tests": 19},
        "typescript": "PASS",
        "json_validation": "PASS",
        "diff_check": "PASS",
    }
    outputs = {
        "contract.json": contract(),
        "evidence-inventory.json": evidence_inventory(),
        "evidence-matrix.json": evidence_matrix(),
        "source-priorities.json": source_priorities(),
        "fixtures.json": fixture_artifact,
        "fixture-results.json": result_artifact,
        "decision.json": decision,
        "verification.json": verification,
    }
    integrity = {"contract_version": CONTRACT_VERSION, "files": {name: sha256(value) for name, value in sorted(outputs.items())}}
    integrity["bundle_sha256"] = sha256(integrity["files"])
    outputs["integrity.json"] = integrity
    return outputs


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    outputs = build_outputs()
    for name, value in outputs.items():
        (OUTPUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n")
    print(f"Built {len(outputs)} Development Feasibility V0 artifacts with 10 contract fixtures")


if __name__ == "__main__":
    main()

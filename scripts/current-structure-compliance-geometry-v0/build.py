#!/usr/bin/env python3
"""Build Packet 56 current-structure compliance geometry artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from resolver import (
    CONTRACT_VERSION, GEOMETRY_LEVELS, READY_GATES, assess_currentness,
    assess_readiness, canonical_json, fingerprint, integrity_artifact, validate_envelope,
)

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data/current-structure-compliance-geometry-v0"


def generic_envelope() -> dict[str, Any]:
    envelope = {
        "schema": "CurrentStructureComplianceGeometryEnvelopeV0",
        "parcel_identity": {"parcel_key": None, "jurisdiction": None, "recorded_entity": None},
        "geometry_subject": {"structure_id": None, "structure_class": None, "geometry_level": None},
        "subject_status": "UNKNOWN",
        "legal_boundary_source": {"record_id": None, "status": None, "boundary_definition": None},
        "coordinate_reference_system": {"horizontal_crs": None, "vertical_datum": None, "units": None},
        "property_line_role": {"line_id": None, "role": None, "role_basis": None},
        "structure_edge_type": {"type": None, "applicable_rule": None, "semantic_equivalence_proven": False},
        "direct_dimension": {"value": None, "unit": None, "method": None, "from": None, "to": None},
        "survey_control": {"controlled": False, "registration_method": None, "precision": None, "professional_record": None},
        "source_date": None,
        "currentness_evidence": {"state": "CURRENTNESS_UNRESOLVED", "as_of": None, "basis": []},
        "later_change_reconciliation": {"through_date": None, "records_reviewed": [], "unresolved_change": True},
        "provenance": {"source_id": None, "publisher_or_author": None, "source_sha256": None, "retrieved_at": None, "basis": None},
        "privacy_class": "PUBLIC_AUTHORITY",
    }
    validate_envelope(envelope)
    return envelope


def hierarchy() -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "ordered_levels": list(GEOMETRY_LEVELS),
        "levels": [
            {"level": GEOMETRY_LEVELS[0], "examples": ["aerial imagery", "GIS building outline", "visible roof form"], "supports_existing_compliance": False, "limit": "Observation does not prove boundary registration, building-frame semantics, survey precision, or current/as-built status."},
            {"level": GEOMETRY_LEVELS[1], "examples": ["proposed or approved site plan", "architectural site sheet", "grading/civil plan"], "supports_existing_compliance": False, "limit": "A design or approval is a project fact until construction/as-built corroboration proves the existing condition."},
            {"level": GEOMETRY_LEVELS[2], "requires": ["legal boundary control", "structure location tied to boundary", "direct dimensions or controlled coordinates", "known plan/survey status"], "supports_existing_compliance": False, "limit": "Survey control alone does not prove that the measured subject remains current."},
            {"level": GEOMETRY_LEVELS[3], "requires": ["existing/as-built subject", "survey or equivalent control", "Code-relevant edge", "currentness date", "no unresolved later footprint-changing work"], "supports_existing_compliance": True, "limit": "Readiness is rule- and edge-specific; it is not overall legality or zoning compliance."},
        ],
    }


def contract() -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "ready_state": "COMPLIANCE_GEOMETRY_READY",
        "fail_closed": True,
        "required_gates": list(READY_GATES),
        "distance_methods": ["DIRECT_LABELED_SURVEY_DIMENSION", "DETERMINISTIC_DISTANCE_FROM_SURVEY_CONTROLLED_GEOMETRY"],
        "disallowed_substitutes": ["imagery estimate", "GIS roof outline", "generic building footprint", "assessor living area", "proposed plan without construction/as-built corroboration", "permit silence"],
    }


def edge_semantics() -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "edges": [
            {"type": "BUILDING_FRAME", "compliance_role": "Code reference edge for SDMC 113.0252(c) new-development setback measurement", "may_substitute_for_building_frame": True},
            {"type": "WALL_FACE", "compliance_role": "Distinct wall surface", "may_substitute_for_building_frame": False, "exception": "Only when the source expressly proves coincidence/equivalence to the applicable building-frame edge."},
            {"type": "FOUNDATION_EDGE", "compliance_role": "Distinct foundation limit", "may_substitute_for_building_frame": False, "exception": "Only when the source expressly proves coincidence/equivalence to the applicable building-frame edge."},
            {"type": "ROOF_OR_EAVE", "compliance_role": "Projection/roof geometry subject to separate treatment", "may_substitute_for_building_frame": False},
            {"type": "PROJECTION", "compliance_role": "Element-specific projection or encroachment", "may_substitute_for_building_frame": False},
            {"type": "BALCONY_OR_DECK", "compliance_role": "Separately classified occupied projection/structure", "may_substitute_for_building_frame": False},
            {"type": "ACCESSORY_STRUCTURE", "compliance_role": "Separate structure class and potentially separate standard", "may_substitute_for_building_frame": False},
            {"type": "RETAINING_WALL", "compliance_role": "Wall/fence/grading feature with separate rules", "may_substitute_for_building_frame": False},
            {"type": "HARDSCAPE", "compliance_role": "Surface/site improvement rather than building edge", "may_substitute_for_building_frame": False},
        ],
        "generic_building_footprint_accepted": False,
    }


def truth_states() -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "mappings": [
            {"output": "direct survey dimension", "SourceState": "available", "FactState": "supported", "DerivationClass": "recorded"},
            {"output": "coordinate-derived distance from survey-controlled geometry", "SourceState": "available", "FactState": "supported", "DerivationClass": "deterministic_derived"},
            {"output": "approved/project-plan geometry without as-built corroboration", "SourceState": "available", "FactState": "partial", "DerivationClass": "recorded"},
            {"output": "imagery-only estimate", "SourceState": "partial", "FactState": "partial", "DerivationClass": "inferred", "use": "diagnostic_only"},
            {"output": "unresolved currentness", "SourceState": "partial", "FactState": "unknown", "DerivationClass": "conditional"},
            {"output": "missing controlling geometry", "SourceState": "source_unavailable", "FactState": "unavailable", "DerivationClass": "conditional"},
        ],
        "numeric_confidence_score": False,
    }


def subject_evaluation() -> dict[str, Any]:
    currentness = assess_currentness(source_date="SPRING_2023", existing_or_as_built=False, later_change_reconciled=False, observational_only=True)
    gates = {
        "legal_property_boundary_established": True,
        "property_line_roles_established": True,
        "current_existing_structure_identified": False,
        "code_relevant_structure_edge_identified": False,
        "direct_or_survey_controlled_distance": False,
        "plan_or_survey_status_known": False,
        "currentness_date_known": False,
        "no_unresolved_later_footprint_change": False,
        "geometry_semantics_compatible": False,
    }
    readiness = assess_readiness(gates)
    return {
        "contract_version": CONTRACT_VERSION,
        "parcel_identity": {"apn": "6341302200", "address": "1456 27TH ST", "recorded_entity": "PM 17383 Parcel 1"},
        "evidence_inventory": [
            {"source": "PM 17383 Parcel 1", "classification": "RECORDED_LEGAL_BOUNDARY", "finding": "Legal lot identity, bearings/dimensions, and boundary roles established; no modern coordinate registration to structures."},
            {"source": "2001 deed DOC 2001-0706032", "classification": "RECORDED_IDENTITY_CHAIN", "finding": "Links APN 634-130-22-00 to PM 17383 Parcel 1."},
            {"source": "Legal-premises geometry", "classification": "RECORDED_DIMENSIONAL_EVIDENCE", "finding": "Width 94.00 ft, depth 235.02 ft, area 22,096.320 sq ft, frontage 94.00 ft; not structure geometry."},
            {"source": "2017 City/SANDAG building outlines", "classification": "HISTORICAL_OBSERVATIONAL", "finding": "Two directly linked outlines plus one boundary-touching ambiguity; not current or building-frame geometry."},
            {"source": "Spring 2023 SANDAG/Nearmap 9-inch imagery", "classification": "OBSERVATIONAL", "finding": "Two visible target-parcel roof/structure groupings appear unchanged from 2017; imagery is not survey or frame geometry."},
            {"source": "PMT-3276742", "classification": "NO_STATED_FOOTPRINT_EFFECT", "finding": "2024 no-plan gas-pipe repair; no site/building plan and no stated footprint effect."},
            {"source": "DSD public indexes and 2008-2012 archived activity reports", "classification": "ARCHIVE_INDEX_SEARCH", "finding": "No initial-construction project identified; absence is not proof of no work or no retained plan."},
            {"source": "bounded operator-file review", "classification": "NO_MATCH_FOUND", "finding": "No survey or site-plan evidence for the parcel was found in the bounded prior review."},
        ],
        "boundary_control": {
            "state": "BOUNDARY_CONTROL_PARTIAL",
            "recorded_legal_boundary": True,
            "modern_survey_controlled_geometry": False,
            "coordinates_or_bearings_sufficient_for_structure_tie": False,
            "precision_adequate_for_setback_measurement": False,
            "reason": "The recorded map seals the legal boundary and line roles, but no modern controlled registration ties that boundary to a current structure edge.",
        },
        "structure_control": {
            "state": "STRUCTURE_CONTROL_PARTIAL",
            "current_building_frame_location": False,
            "direct_dimension_to_boundary": False,
            "survey_tie": False,
            "approved_or_as_built_identity": False,
            "roof_eave_distinction": False,
            "reason": "Historical outlines and imagery identify visible forms only; they do not identify the current outer building-frame edge or a survey-controlled offset.",
        },
        "subject_status": {
            "state": "OBSERVATIONAL_VISIBLE_STRUCTURE_ONLY",
            "original_construction_plan": False,
            "approved_proposed_plan": False,
            "final_or_as_built_plan": False,
            "existing_condition_survey": False,
            "inspection_plan": False,
            "unknown_plan_status": True,
        },
        "currentness": {
            "state": currentness,
            "best_observation_date": "SPRING_2023",
            "current_through": None,
            "basis": ["Spring 2023 imagery", "2024 address-matched no-plan plumbing record with no stated footprint effect"],
            "limitation": "No-visible-change observation and permit silence do not prove a current/as-built condition or exclude unpermitted/later work.",
        },
        "later_change_reconciliation": {
            "records": [{"record_id": "PMT-3276742", "date": "2024-02-26/2024-02-29", "classification": "NO_STATED_FOOTPRINT_EFFECT"}],
            "possible_footprint_change_found": False,
            "unresolved_change_excluded": False,
            "permit_silence_used_as_no_change_proof": False,
        },
        "readiness": {**readiness, "decision": "COMPLIANCE_GEOMETRY_NOT_READY: no current survey-controlled building-frame tie to the recorded property lines"},
        "minimal_resolving_evidence": {
            "package": "One current boundary/topographic or existing-conditions survey tied to PM 17383 Parcel 1, prepared under appropriate professional control.",
            "must_show": ["reference system and boundary registration", "existing outer building-frame edges", "direct perpendicular offsets or controlled coordinates for east/front, west/rear, and relevant north/south interior-side lines", "explicit wall/frame/foundation/roof/eave/projection/deck/accessory-structure/retaining-wall/hardscape distinctions", "survey/source date and existing/as-built status", "later-change reconciliation through the evaluation date"],
            "alternative": "An approved site plan may be used only with final inspection/as-built corroboration and later-change reconciliation; one or two controlling sheets are sufficient when they contain these facts.",
        },
        "evaluator_compatibility": {
            "decision": "CURRENT_STRUCTURE_SETBACK_EVALUATOR_COMPATIBLE",
            "reason": "The front, rear, and interior-side evaluators already gate on current authoritative geometry, measurement semantics, structure/element classification, projection treatment, and measured/required values. The envelope supplies those facts without changing their architecture.",
            "adapter_action": "Translate a passing envelope into each evaluator's current_structure_geometry, measurement_semantics, structure_classification/projection, and measured_ft inputs; do not bypass unresolved rule-requirement gates.",
        },
        "golden_benchmark": {"decision": "CURRENT_STRUCTURE_GOLDEN_BENCHMARK_BLOCKED: no current survey-controlled building-frame tie and unresolved post-2023 currentness"},
        "next": "NEXT_FEASIBILITY_STEP: acquire current survey-controlled geometry",
    }


def provenance() -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "inputs": [
            {"path": "data/current-structure-geometry-v0/evaluation.json", "sha256": fingerprint(json.loads((ROOT / "data/current-structure-geometry-v0/evaluation.json").read_text()))},
            {"path": "data/survey-controlled-building-geometry-prep-v0/evaluation.json", "sha256": fingerprint(json.loads((ROOT / "data/survey-controlled-building-geometry-prep-v0/evaluation.json").read_text()))},
            {"path": "data/legal-lot-evidence-v0/fixture-results.json", "sha256": fingerprint(json.loads((ROOT / "data/legal-lot-evidence-v0/fixture-results.json").read_text()))},
        ],
        "new_external_research": False,
        "private_plan_published": False,
    }


def build_outputs() -> dict[str, Any]:
    outputs = {
        "contract.json": contract(),
        "geometry-hierarchy.json": hierarchy(),
        "structure-edge-semantics.json": edge_semantics(),
        "reusable-geometry-envelope.json": generic_envelope(),
        "truth-state-integration.json": truth_states(),
        "subject-evaluation.json": subject_evaluation(),
        "provenance.json": provenance(),
    }
    evaluation = outputs["subject-evaluation.json"]
    outputs["decision.json"] = {
        "contract_version": CONTRACT_VERSION,
        "boundary_control": evaluation["boundary_control"]["state"],
        "structure_control": evaluation["structure_control"]["state"],
        "currentness": evaluation["currentness"]["state"],
        "geometry": evaluation["readiness"]["decision"],
        "evaluator": evaluation["evaluator_compatibility"]["decision"],
        "golden_benchmark": evaluation["golden_benchmark"]["decision"],
        "next": evaluation["next"],
        "existing_compliance_concluded": False,
        "capacity_calculated": False,
        "production_wired": False,
    }
    outputs["integrity.json"] = integrity_artifact(outputs)
    return outputs


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, value in build_outputs().items():
        (OUTPUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()

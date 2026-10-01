"""Bounded Development Feasibility V0 readiness resolver.

This module evaluates evidence readiness only. It never calculates capacity,
compliance, buildable area, entitlement outcomes, or project economics.
"""

from __future__ import annotations

import copy
import hashlib
import json
from typing import Any


CONTRACT_VERSION = "development-feasibility-v0-2026-09-30"
SUPPORTED_ZONES = tuple(f"RS-1-{number}" for number in range(1, 15))
RESOLVED_COASTAL_STATES = {"INSIDE_COASTAL", "OUTSIDE_COASTAL"}

TOP_LEVEL_STATES = (
    "FEASIBILITY_READY_FOR_RULE_EVALUATION",
    "FEASIBILITY_BLOCKED_BY_MISSING_EVIDENCE",
    "FEASIBILITY_OUTSIDE_V0_SCOPE",
    "FEASIBILITY_SOURCE_UNAVAILABLE",
    "FEASIBILITY_MAPPING_UNRESOLVED",
)

RULE_STATES = (
    "RULE_READY_FOR_EVALUATION",
    "RULE_AVAILABLE_FOR_BOUNDED_STATEMENT",
    "RULE_BLOCKED_BY_MISSING_EVIDENCE",
    "RULE_NEEDS_PROJECT_FACTS",
    "RULE_SOURCE_UNAVAILABLE",
    "RULE_OUTSIDE_V0_SCOPE",
)

ALLOWED_CONCLUSIONS = (
    "PARCEL_IN_SUPPORTED_V0_SCOPE",
    "APPLICABLE_RS_STANDARDS_VERSION_SELECTED",
    "BASE_RULE_SOURCE_AVAILABLE",
    "REQUIRED_EVIDENCE_INCOMPLETE",
    "RULE_EVALUATION_BLOCKED_BY_NAMED_EVIDENCE",
    "MECHANICAL_COMPARISON_POSSIBLE_LEGAL_SEMANTICS_UNRESOLVED",
    "REQUIRED_SOURCE_UNAVAILABLE",
    "BASE_DENSITY_TABLE_STATES_ONE_DWELLING_UNIT_PER_LOT",
    "POSITIVE_ASSESSOR_UNIT_COUNT_RECORDED",
)

PROHIBITED_CONCLUSIONS = (
    "MAXIMUM_LEGAL_UNITS",
    "BUILDABLE_AREA",
    "PARCEL_COMPLIES",
    "LOT_IS_BUILDABLE",
    "VARIANCE_REQUIRED",
    "ENTITLEMENT_CERTAINTY",
    "PERMIT_APPROVAL_PREDICTION",
    "PROPERTY_VALUE_OR_PROJECT_ECONOMICS",
    "ADU_JADU_ELIGIBILITY",
    "SB9_ELIGIBILITY",
    "SB79_ELIGIBILITY",
    "DENSITY_BONUS_OR_COMPLETE_COMMUNITIES_CAPACITY",
)

LEGAL_EVIDENCE_CLASSES = {
    "recorded_legal_lot_record",
    "authoritative_subdivision_map",
    "authoritative_parcel_map",
    "licensed_survey",
    "authoritative_legal_dimension_source",
}

FACT_DOCTRINE = {
    "legal_lot_area_sqft": {
        "acceptable": sorted(LEGAL_EVIDENCE_CLASSES),
        "prohibited_substitutes": ["approximate_geometry_area_sqft", "taxable_acreage"],
    },
    "legal_lot_width_ft": {
        "acceptable": sorted(LEGAL_EVIDENCE_CLASSES),
        "prohibited_substitutes": ["geometry_minimum_rotated_rectangle_span", "diagnostic_width_span"],
    },
    "legal_lot_depth_ft": {
        "acceptable": sorted(LEGAL_EVIDENCE_CLASSES),
        "prohibited_substitutes": ["geometry_minimum_rotated_rectangle_span", "diagnostic_depth_span"],
    },
    "legal_street_frontage_length_ft": {
        "acceptable": ["recorded_legal_lot_record", "authoritative_subdivision_map", "authoritative_parcel_map", "licensed_survey", "authoritative_right_of_way_frontage_record"],
        "prohibited_substitutes": ["situs_address", "spatial_street_adjacency", "diagnostic_boundary_length"],
    },
    "lot_line_roles": {
        "acceptable": ["authoritative_subdivision_map", "authoritative_parcel_map", "licensed_survey", "authoritative_legal_dimension_source"],
        "prohibited_substitutes": ["situs_address", "cardinal_direction", "nearest_street", "parcel_geometry_orientation"],
    },
}
for _lot_line_fact in ("front_lot_line", "interior_side_lot_lines", "street_side_lot_lines", "rear_lot_line"):
    FACT_DOCTRINE[_lot_line_fact] = copy.deepcopy(FACT_DOCTRINE["lot_line_roles"])

RULE_FAMILIES = (
    {"family": "minimum_lot_area", "source_key": "lot_area_min", "parcel_facts": ("legal_lot_area_sqft",), "project_facts": ()},
    {"family": "minimum_lot_width", "source_key": "lot_width_min", "parcel_facts": ("legal_lot_width_ft",), "project_facts": ()},
    {"family": "minimum_lot_depth", "source_key": "lot_depth_min", "parcel_facts": ("legal_lot_depth_ft",), "project_facts": ()},
    {"family": "frontage", "source_key": "street_frontage_min", "parcel_facts": ("legal_street_frontage_length_ft", "front_lot_line"), "project_facts": ()},
    {"family": "front_setback", "source_key": "front_setback_min", "parcel_facts": ("front_lot_line", "slope_percent", "fire_buffer_applicability"), "project_facts": ("structure_geometry",)},
    {"family": "interior_side_setback", "source_key": "interior_side_setback_min", "parcel_facts": ("interior_side_lot_lines", "fire_buffer_applicability"), "project_facts": ("structure_geometry",)},
    {"family": "street_side_setback", "source_key": "street_side_setback_min", "parcel_facts": ("corner_lot_status", "street_side_lot_lines", "fire_buffer_applicability"), "project_facts": ("structure_geometry",)},
    {"family": "rear_setback", "source_key": "rear_setback_min", "parcel_facts": ("rear_lot_line", "fire_buffer_applicability"), "project_facts": ("structure_geometry",)},
    {"family": "height", "source_key": "structure_height_max", "parcel_facts": ("height_reference_datum", "angled_envelope_context"), "project_facts": ("structure_height_ft", "structure_geometry")},
    {"family": "far", "source_key": "floor_area_ratio_max", "parcel_facts": ("legal_lot_area_sqft", "hillside_applicability"), "project_facts": ("code_gross_floor_area_sqft",)},
    {"family": "lot_coverage", "source_key": "lot_coverage_max", "parcel_facts": ("legal_lot_area_sqft", "current_structure_footprint", "hillside_applicability"), "project_facts": ("proposed_footprint_sqft",)},
    {"family": "density_basis", "source_key": "density_basis", "parcel_facts": (), "project_facts": (), "bounded_statement_only": True},
    {"family": "existing_unit_conditions", "source_key": "density_basis", "parcel_facts": ("assessor_dwelling_unit_count",), "project_facts": (), "bounded_statement_only": True},
)

REQUESTS_OUTSIDE_SCOPE = {
    "maximum_units", "development_capacity", "adu", "jadu", "sb9", "sb79",
    "density_bonus", "complete_communities", "parking_program", "variance",
    "entitlement", "project_economics",
}


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _fact_record(state: str, value: Any = None, classification: str = "legally_unresolved", **extra: Any) -> dict[str, Any]:
    result = {"state": state, "value": value, "classification": classification}
    result.update(extra)
    return result


def _collect_facts(parcel: dict[str, Any], overrides: dict[str, Any]) -> dict[str, dict[str, Any]]:
    facts: dict[str, dict[str, Any]] = {}
    for item in parcel.get("property_facts", {}).get("parcel_conditions", []):
        key = item.get("fact_key")
        if not key:
            continue
        classification = "usable_for_feasibility" if item.get("state") == "supported" else "legally_unresolved"
        if key in {"approximate_geometry_area_sqft", "taxable_acreage", "geometry_type", "geometry_sha256", "centroid_within"}:
            classification = "diagnostic_only"
        if item.get("state") == "unavailable":
            classification = "source_unavailable"
        facts[key] = _fact_record(item.get("state", "unknown"), item.get("value"), classification, source=item.get("source"), limitations=item.get("limitations", []))

    structure = parcel.get("property_facts", {}).get("structure", {})
    units = structure.get("existing_dwelling_units", {})
    units_value = units.get("value") if units.get("fact_state") == "supported" and isinstance(units.get("value"), (int, float)) and units.get("value") > 0 else None
    units_state = "supported" if units_value is not None else ("unavailable" if units.get("source_state") == "source_unavailable" else "unknown")
    facts["assessor_dwelling_unit_count"] = _fact_record(units_state, units_value, "usable_for_feasibility" if units_state == "supported" else ("source_unavailable" if units_state == "unavailable" else "legally_unresolved"), source_semantics=units.get("source_semantics"), limitations=units.get("limitations", []))

    living = structure.get("living_area", {})
    facts["assessor_living_area_sqft"] = _fact_record(living.get("fact_state", "unknown"), living.get("value"), "diagnostic_only", limitations=living.get("limitations", []))
    footprints = structure.get("historical_footprints", [])
    facts["historical_2017_footprints"] = _fact_record("supported" if footprints else ("unavailable" if structure.get("source_state") == "source_unavailable" else "unknown"), len(footprints) if footprints else None, "diagnostic_only", limitations=["Historical 2017 evidence is not a current structure footprint and is prohibited for lot-coverage evaluation."])
    facts.setdefault("current_structure_footprint", _fact_record("unknown", None, "legally_unresolved"))
    facts.setdefault("fire_buffer_applicability", _fact_record("unknown", None, "legally_unresolved"))
    facts.setdefault("hillside_applicability", _fact_record("unknown", None, "legally_unresolved"))
    facts.setdefault("height_reference_datum", _fact_record("unknown", None, "legally_unresolved"))
    facts.setdefault("angled_envelope_context", _fact_record("unknown", None, "legally_unresolved"))

    for key, supplied in overrides.items():
        record = copy.deepcopy(supplied)
        if record.get("state") == "supported" and key in FACT_DOCTRINE:
            evidence_class = record.get("evidence_class")
            if evidence_class not in set(FACT_DOCTRINE[key]["acceptable"]):
                record = _fact_record("unknown", None, "legally_unresolved", refusal="UNACCEPTABLE_LEGAL_EVIDENCE_CLASS", supplied_evidence_class=evidence_class)
            elif not record.get("provenance"):
                record = _fact_record("unknown", None, "legally_unresolved", refusal="LEGAL_EVIDENCE_PROVENANCE_REQUIRED")
            else:
                record["classification"] = "usable_for_feasibility"
        facts[key] = record
    return facts


def _scope(parcel: dict[str, Any], requested_analysis: str | None) -> tuple[str, list[str], str | None, list[dict[str, Any]]]:
    identity = parcel.get("identity", {})
    zoning = parcel.get("zoning", {})
    coastal = parcel.get("coastal_context", {})
    standards = parcel.get("base_standards", {})
    zones = zoning.get("zone_evidence", [])

    if requested_analysis in REQUESTS_OUTSIDE_SCOPE:
        return "FEASIBILITY_OUTSIDE_V0_SCOPE", [f"REQUEST_OUTSIDE_V0:{requested_analysis}"], None, zones
    if identity.get("source_state") == "source_unavailable" or identity.get("state") != "supported":
        return "FEASIBILITY_SOURCE_UNAVAILABLE", ["PARCEL_IDENTITY_SOURCE_UNAVAILABLE"], None, zones
    if identity.get("jurisdiction_code") != "SD":
        return "FEASIBILITY_OUTSIDE_V0_SCOPE", ["JURISDICTION_OUTSIDE_CITY_OF_SAN_DIEGO"], None, zones
    if zoning.get("source_state") == "source_unavailable" or zoning.get("mapping_state") == "UNAVAILABLE":
        return "FEASIBILITY_SOURCE_UNAVAILABLE", ["BASE_ZONING_SOURCE_UNAVAILABLE"], None, zones
    if zoning.get("mapping_state") in {"AMBIGUOUS", "INDETERMINATE", "UNMAPPED"}:
        return "FEASIBILITY_MAPPING_UNRESOLVED", [f"ZONING_{zoning.get('mapping_state')}"], None, zones
    if zoning.get("mapping_state") != "SINGLE_ZONE" or len(zones) != 1:
        return "FEASIBILITY_OUTSIDE_V0_SCOPE", ["SINGLE_ZONE_REQUIRED"], None, zones
    zone = zones[0].get("zone_code")
    if coastal.get("source_state") == "source_unavailable" or coastal.get("evidence_state") == "SOURCE_UNAVAILABLE":
        return "FEASIBILITY_SOURCE_UNAVAILABLE", ["COASTAL_SOURCE_UNAVAILABLE"], zone, zones
    if coastal.get("evidence_state") not in RESOLVED_COASTAL_STATES:
        return "FEASIBILITY_MAPPING_UNRESOLVED", ["COASTAL_APPLICABILITY_UNRESOLVED"], zone, zones
    if zone not in SUPPORTED_ZONES:
        return "FEASIBILITY_OUTSIDE_V0_SCOPE", ["NON_RS_OR_UNSUPPORTED_RS_ZONE"], zone, zones
    if standards.get("source_state") == "source_unavailable" or standards.get("state") == "unavailable":
        return "FEASIBILITY_SOURCE_UNAVAILABLE", ["RS_STANDARDS_SOURCE_UNAVAILABLE"], zone, zones
    if standards.get("resolution_state") != "RESOLVED" or standards.get("state") != "supported":
        return "FEASIBILITY_OUTSIDE_V0_SCOPE", ["SUPPORTED_APPLICABLE_RS_STANDARDS_REQUIRED"], zone, zones
    return "IN_SCOPE", [], zone, zones


def _rule_results(parcel: dict[str, Any], facts: dict[str, dict[str, Any]], project_facts: dict[str, Any], in_scope: bool) -> list[dict[str, Any]]:
    standards = parcel.get("base_standards", {})
    rules = [rule for zone in standards.get("zone_results", []) for rule in zone.get("rules", [])]
    by_key = {rule.get("standard_key"): rule for rule in rules}
    results = []
    for family in RULE_FAMILIES:
        source = by_key.get(family["source_key"])
        missing_parcel = [key for key in family["parcel_facts"] if facts.get(key, {}).get("state") != "supported"]
        missing_project = [key for key in family["project_facts"] if project_facts.get(key, {}).get("state") != "supported"]
        if not in_scope:
            state = "RULE_OUTSIDE_V0_SCOPE"
        elif not source:
            state = "RULE_SOURCE_UNAVAILABLE"
        elif family.get("bounded_statement_only"):
            state = "RULE_AVAILABLE_FOR_BOUNDED_STATEMENT" if not missing_parcel else "RULE_BLOCKED_BY_MISSING_EVIDENCE"
        elif missing_parcel:
            state = "RULE_BLOCKED_BY_MISSING_EVIDENCE"
        elif missing_project:
            state = "RULE_NEEDS_PROJECT_FACTS"
        else:
            state = "RULE_READY_FOR_EVALUATION"
        results.append({
            "family": family["family"],
            "state": state,
            "source_rule_key": family["source_key"],
            "source_rule_available": bool(source),
            "source_rule_id": source.get("rule_id") if source else None,
            "required_parcel_facts": list(family["parcel_facts"]),
            "required_project_facts": list(family["project_facts"]),
            "missing_parcel_facts": missing_parcel,
            "missing_project_facts": missing_project,
            "blocking_evidence": missing_parcel + missing_project,
            "compliance_evaluated": False,
        })
    return results


def _checklist(scope_state: str, facts: dict[str, dict[str, Any]], rules: list[dict[str, Any]], project_facts: dict[str, Any]) -> dict[str, str]:
    def group(keys: tuple[str, ...]) -> str:
        values = [facts.get(key, {}).get("state", "unknown") for key in keys]
        if any(value == "unavailable" for value in values):
            return "SOURCE_UNAVAILABLE"
        return "SUPPORTED" if values and all(value == "supported" for value in values) else "MISSING_OR_LEGALLY_UNRESOLVED"
    return {
        "parcel_identity": "SUPPORTED" if scope_state not in {"FEASIBILITY_SOURCE_UNAVAILABLE"} else "SOURCE_UNAVAILABLE",
        "zoning_applicability": "SUPPORTED" if scope_state in {"IN_SCOPE", "FEASIBILITY_BLOCKED_BY_MISSING_EVIDENCE", "FEASIBILITY_READY_FOR_RULE_EVALUATION"} else ("MAPPING_UNRESOLVED" if scope_state == "FEASIBILITY_MAPPING_UNRESOLVED" else "OUTSIDE_SCOPE_OR_UNAVAILABLE"),
        "legal_lot_evidence": group(("legal_lot_area_sqft", "legal_lot_width_ft", "legal_lot_depth_ft")),
        "lot_line_geometry": group(("front_lot_line", "interior_side_lot_lines", "street_side_lot_lines", "rear_lot_line", "legal_street_frontage_length_ft")),
        "structure_evidence": group(("current_structure_footprint", "height_reference_datum")),
        "topography_fire_predicates": group(("slope_percent", "hillside_applicability", "fire_buffer_applicability")),
        "project_facts": "SUPPORTED" if project_facts and all(item.get("state") == "supported" for item in project_facts.values()) else "NOT_PROVIDED_OR_INCOMPLETE",
        "rule_coverage": "SUPPORTED" if any(rule["source_rule_available"] for rule in rules) else "SOURCE_UNAVAILABLE_OR_OUTSIDE_SCOPE",
    }


def resolve_feasibility_v0(parcel: dict[str, Any], *, requested_analysis: str | None = None, fact_overrides: dict[str, Any] | None = None, project_facts: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return an evidence-readiness result from a Parcel Intelligence V2 result."""
    if parcel.get("contract_version") != "parcel-intelligence-v2-2026-09-30-v1":
        raise ValueError("Development Feasibility V0 requires the sealed Parcel Intelligence V2 contract")
    if parcel.get("parcel_compliance_evaluated") is not False or parcel.get("development_capacity_calculated") is not False:
        raise ValueError("Development Feasibility V0 accepts only non-compliance, non-capacity inputs")

    requested_analysis = requested_analysis or "base_rule_readiness"
    fact_overrides = fact_overrides or {}
    project_facts = project_facts or {}
    initial_scope, reasons, zone, zones = _scope(parcel, requested_analysis)
    in_scope = initial_scope == "IN_SCOPE"
    facts = _collect_facts(parcel, fact_overrides)
    rules = _rule_results(parcel, facts, project_facts, in_scope)

    if in_scope:
        top_state = "FEASIBILITY_READY_FOR_RULE_EVALUATION" if any(item["state"] == "RULE_READY_FOR_EVALUATION" for item in rules) else "FEASIBILITY_BLOCKED_BY_MISSING_EVIDENCE"
        if top_state.endswith("MISSING_EVIDENCE"):
            reasons = ["NO_BASE_RULE_HAS_COMPLETE_LEGAL_AND_MEASUREMENT_EVIDENCE"]
    else:
        top_state = initial_scope

    supported = sorted(key for key, value in facts.items() if value.get("state") == "supported" and value.get("classification") == "usable_for_feasibility")
    missing = sorted({key for rule in rules for key in rule["missing_parcel_facts"]})
    needed_project = sorted({key for rule in rules for key in rule["missing_project_facts"]})
    standards = parcel.get("base_standards", {})
    result = {
        "contract_version": CONTRACT_VERSION,
        "as_of": parcel.get("as_of"),
        "parcel_identity": {
            "apn": parcel.get("identity", {}).get("apn"),
            "jurisdiction_code": parcel.get("identity", {}).get("jurisdiction_code"),
            "source_state": parcel.get("identity", {}).get("source_state"),
            "acquisition_id": parcel.get("identity", {}).get("acquisition_id"),
        },
        "scope_state": top_state,
        "scope_reasons": reasons,
        "requested_analysis": requested_analysis,
        "zone": zone,
        "zoning_mapping_state": parcel.get("zoning", {}).get("mapping_state"),
        "coastal_evidence_state": parcel.get("coastal_context", {}).get("evidence_state"),
        "standards_version": standards.get("rule_set_version"),
        "rule_family_readiness": rules,
        "supported_parcel_facts": supported,
        "missing_evidence": missing,
        "project_facts_required": needed_project,
        "allowed_conclusions": list(ALLOWED_CONCLUSIONS),
        "prohibited_conclusions": list(PROHIBITED_CONCLUSIONS),
        "readiness_checklist": _checklist(top_state, facts, rules, project_facts),
        "evidence_classification": facts,
        "next_evidence_target": "recorded parcel maps and legal lot records",
        "provenance": {
            "parcel_intelligence_contract": parcel.get("contract_version"),
            "parcel_intelligence_fingerprint": parcel.get("fingerprint_sha256"),
            "standards_version": standards.get("rule_set_version"),
            "source_layers": parcel.get("source_layers", []),
        },
        "parcel_compliance_evaluated": False,
        "development_capacity_calculated": False,
        "production_runtime_wired": False,
    }
    result["fingerprint_sha256"] = fingerprint(result)
    return result

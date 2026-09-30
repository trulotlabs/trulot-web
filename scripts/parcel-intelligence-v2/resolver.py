#!/usr/bin/env python3
"""Deterministic offline composition for ParcelIntelligenceV2.

This module composes sealed evidence layers. It does not evaluate compliance,
capacity, setbacks, FAR utilization, lot coverage, or later program rules.
"""
from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CONTRACT_VERSION = "parcel-intelligence-v2-2026-09-30-v1"
AS_OF = "2026-09-30"
EXCLUSIONS = [
    "DEVELOPMENT_CAPACITY", "PARCEL_COMPLIANCE", "LEGAL_NONCONFORMITY",
    "SETBACK_CALCULATION", "FAR_UTILIZATION", "LOT_COVERAGE",
    "ADU_JADU", "SB9", "SB79", "DENSITY_BONUS", "COMPLETE_COMMUNITIES",
]
LEGAL_UNKNOWN_KEYS = [
    "legal_lot_area_sqft", "legal_lot_width_ft", "legal_lot_depth_ft",
    "corner_lot_status", "front_lot_line", "interior_side_lot_lines",
    "street_side_lot_lines", "rear_lot_line", "legal_street_frontage_length_ft",
    "slope_percent", "gross_floor_area_sqft",
]
CONDITION_KEYS = [
    "approximate_geometry_area_sqft", "taxable_acreage", "geometry_type",
    "geometry_sha256", "centroid_within", *LEGAL_UNKNOWN_KEYS,
]


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def file_fingerprint(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _runtime_module():
    path = ROOT / "scripts/parcel-rs-standards-runtime-v0/resolver.py"
    spec = importlib.util.spec_from_file_location("parcel_rs_runtime_v0", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Packet 13 resolver could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _source_ref(layer: str, version: str, artifact: str, artifact_sha256: str | None,
                record_sha256: str | None) -> dict[str, Any]:
    return {"layer": layer, "contract_version": version, "artifact_path": artifact,
            "artifact_sha256": artifact_sha256, "record_fingerprint_sha256": record_sha256}


def _fact_index(condition: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    if not condition:
        return {}
    return {fact["fact_key"]: fact for fact in condition.get("facts", [])}


def _compact_condition_fact(key: str, fact: dict[str, Any] | None, identity: dict[str, Any]) -> dict[str, Any]:
    if fact is not None:
        return {k: copy.deepcopy(fact.get(k)) for k in (
            "fact_key", "state", "source_state", "value", "unit", "derivation_class",
            "method", "confidence", "limitations", "provenance", "geometry_evidence"
        ) if k in fact}
    identity_map = {
        "approximate_geometry_area_sqft": (identity.get("approximate_geometry_area_sqft"), "square_foot", "DETERMINISTIC_DERIVED"),
        "taxable_acreage": (identity.get("taxable_acreage"), "acre", "RECORDED"),
        "geometry_type": (identity.get("geometry_type"), None, "DETERMINISTIC_DERIVED"),
        "geometry_sha256": (identity.get("geometry_sha256"), None, "DETERMINISTIC_DERIVED"),
        "centroid_within": (identity.get("centroid_within"), None, "DETERMINISTIC_DERIVED"),
    }
    if key in identity_map:
        value, unit, derivation = identity_map[key]
        state = "supported" if value is not None else "unknown"
        return {
            "fact_key": key, "state": state,
            "source_state": identity.get("source_state", "source_unavailable"),
            "value": value, "unit": unit, "derivation_class": derivation if state == "supported" else "NOT_AVAILABLE",
            "method": "Preserved from the Parcel V2 identity source row." if state == "supported" else "No qualifying Parcel V2 value.",
            "limitations": ["Parcel geometry and tax records do not establish Code-defined legal lot dimensions."],
            "provenance": {"source_row_sha256": identity.get("source_row_sha256"), "acquisition_id": identity.get("acquisition_id")},
        }
    return {
        "fact_key": key, "state": "unknown", "source_state": "available" if identity.get("source_state") == "available" else "source_unavailable",
        "value": None, "unit": None, "derivation_class": "NOT_AVAILABLE",
        "method": "No authoritative legal measurement or relationship is present in the composed source layers.",
        "limitations": ["Unknown is not zero or false.", "Geometry diagnostics are not legal lot measurements."],
        "provenance": {"doctrine": "rs-parcel-condition-inputs-2026-09-30-v0"},
    }


def _structure_section(layer: dict[str, Any] | None) -> dict[str, Any]:
    if layer is None:
        unknown = lambda key: {"fact_key": key, "fact_state": "unavailable", "source_state": "source_unavailable", "value": None, "derivation_class": "NOT_AVAILABLE", "limitations": ["Structure Facts V0 output is unavailable for this fixture."]}
        return {"state": "unavailable", "source_state": "source_unavailable", "existing_dwelling_units": unknown("assessor_dwelling_unit_count"), "living_area": unknown("assessor_total_living_area_sq_ft"), "historical_footprints": [], "footprint_linkage": {"state": "SOURCE_UNAVAILABLE", "vacancy_conclusion": None}, "provenance": None}
    facts = layer["parcel"].get("facts", [])
    by_key: dict[str, list[dict[str, Any]]] = {}
    for fact in facts:
        by_key.setdefault(fact["fact_key"], []).append(copy.deepcopy(fact))
    units = by_key.get("assessor_dwelling_unit_count", [])
    living = by_key.get("assessor_total_living_area_sq_ft", [])
    historical = sorted(
        by_key.get("historical_building_footprint_geometry", []) + by_key.get("historical_building_footprint_area_sq_ft", []),
        key=lambda x: (x["fact_key"], x.get("source_record_id", "")),
    )
    return {
        "state": "supported" if any(f.get("fact_state") == "supported" for f in facts) else "partial",
        "source_state": "available",
        "existing_dwelling_units": units[0] if units else None,
        "living_area": living[0] if living else None,
        "historical_footprints": historical,
        "footprint_linkage": copy.deepcopy(layer["parcel"].get("footprint_linkage")),
        "stack_identity": copy.deepcopy(layer["parcel"].get("stack_identity")),
        "provenance": {"contract_version": "structure-facts-2026-09-30-v0", "layer_fingerprint_sha256": layer.get("fingerprint_sha256")},
    }


def _standards_input(bundle: dict[str, Any]) -> dict[str, Any] | None:
    identity, zoning, coastal = bundle["identity"], bundle["zoning"], bundle["coastal_context"]
    if identity.get("source_state") != "available" or zoning.get("mapping_evidence_state") is None:
        return None
    coastal_state = coastal.get("evidence_state")
    context = coastal.get("value") if coastal.get("value") in {"inside_coastal", "outside_coastal"} else "unknown"
    return {
        "apn": identity["apn"], "parcel_acquisition_id": identity.get("acquisition_id"), "as_of": bundle.get("as_of", AS_OF),
        "mapping_evidence_state": zoning["mapping_evidence_state"], "zone_evidence": copy.deepcopy(zoning.get("zone_evidence", [])),
        "mapping_provenance": copy.deepcopy(zoning["provenance"]), "coastal_context": context,
        "coastal_context_state": coastal_state,
    }


def _unresolved(identity: dict[str, Any], zoning: dict[str, Any], coastal: dict[str, Any], standards: dict[str, Any], condition_facts: list[dict[str, Any]], structure: dict[str, Any]) -> list[dict[str, Any]]:
    items: dict[str, dict[str, Any]] = {}
    def add(code: str, category: str, detail: str, blocked: list[str], layer: str):
        items[code] = {"code": code, "category": category, "detail": detail, "blocked_conclusions": blocked, "source_layer": layer}
    if identity.get("source_state") != "available":
        add("PARCEL_IDENTITY_UNAVAILABLE", "SOURCE_UNAVAILABLE", "Parcel V2 identity is unavailable.", ["PROPERTY_IDENTITY", "ALL_DEPENDENT_CONCLUSIONS"], "Parcel V2")
    if identity.get("situs_address") is None:
        add("SITUS_ADDRESS_UNAVAILABLE", "UNKNOWN", "No normalized situs address is present.", ["DISPLAY_ADDRESS"], "Parcel V2")
    if zoning.get("source_state") != "available":
        add("BASE_ZONING_SOURCE_UNAVAILABLE", "SOURCE_UNAVAILABLE", "Base Zoning V2 source is unavailable.", ["BASE_ZONING", "BASE_STANDARDS"], "Base Zoning V2")
    elif zoning.get("mapping_state") == "UNMAPPED":
        add("BASE_ZONING_UNMAPPED", "MAPPING_UNRESOLVED", "No base-zone intersection is mapped.", ["BASE_ZONING", "BASE_STANDARDS"], "Base Zoning V2")
    elif zoning.get("mapping_state") == "AMBIGUOUS":
        add("BASE_ZONING_AMBIGUOUS", "MAPPING_UNRESOLVED", "Candidate zones are preserved but definitive applicability is unresolved.", ["BASE_STANDARDS"], "Base Zoning V2")
    elif zoning.get("mapping_state") == "SPLIT_ZONE":
        add("SPLIT_ZONE_REQUIRES_GEOMETRY_REVIEW", "APPLICABILITY", "Every material zone is preserved separately; no blended standard is selected.", ["PARCEL_WIDE_PRIMARY_STANDARD"], "Base Zoning V2")
    if coastal.get("source_state") != "available":
        add("COASTAL_SOURCE_UNAVAILABLE", "SOURCE_UNAVAILABLE", "Coastal Context V0 source is unavailable.", ["RS_STANDARDS_VERSION"], "Coastal Context V0")
    elif coastal.get("evidence_state") == "BOUNDARY_AMBIGUOUS":
        add("COASTAL_APPLICABILITY_UNRESOLVED", "APPLICABILITY", "Boundary evidence cannot select an inside- or outside-Coastal standards version.", ["RS_STANDARDS_VERSION"], "Coastal Context V0")
    for reason in standards.get("unresolved_reasons", []):
        add(reason["code"], "LEGAL_OR_MAPPING", reason["detail"], ["BASE_STANDARDS"], "Parcel RS Standards Runtime V0")
    for fact in condition_facts:
        if fact["fact_key"] in LEGAL_UNKNOWN_KEYS and fact.get("state") != "supported":
            add(fact["fact_key"].upper()+"_UNKNOWN", "LEGAL_SEMANTICS_UNRESOLVED", fact["limitations"][0], ["PARCEL_COMPLIANCE"], "RS Parcel Condition Inputs V0")
    units = structure.get("existing_dwelling_units") or {}
    if units.get("fact_state") != "supported":
        add("EXISTING_DWELLING_UNITS_UNKNOWN", "UNKNOWN" if structure.get("source_state") == "available" else "SOURCE_UNAVAILABLE", "A positive assessor unit count is not available.", ["EXISTING_UNIT_COUNT"], "Structure Facts V0")
    living = structure.get("living_area") or {}
    if living.get("fact_state") != "supported":
        add("LIVING_AREA_UNKNOWN", "UNKNOWN" if structure.get("source_state") == "available" else "SOURCE_UNAVAILABLE", "A positive valid assessor living-area value is not available.", ["EXISTING_LIVING_AREA"], "Structure Facts V0")
    return [items[k] for k in sorted(items)]


def _next_investigation(result: dict[str, Any]) -> list[dict[str, Any]]:
    actions: dict[str, dict[str, Any]] = {}
    def add(code: str, reason: str, blocked: str, evidence: str):
        actions[code] = {"action": code, "reason": reason, "blocked_conclusion": blocked, "required_evidence": evidence}
    unresolved_codes = {x["code"] for x in result["unresolved"]}
    standards = result["base_standards"]
    rule_keys = {r["standard_key"] for z in standards.get("zone_results", []) for r in z.get("rules", [])}
    if "lot_width_min" in rule_keys and "LEGAL_LOT_WIDTH_FT_UNKNOWN" in unresolved_codes:
        add("VERIFY_LEGAL_LOT_WIDTH", "A sourced minimum-width rule exists while legal parcel width is unknown.", "LOT_WIDTH_COMPLIANCE", "Authoritative survey or legally established lot-line measurement.")
    if rule_keys & {"front_setback_min", "interior_side_setback_min", "street_side_setback_min", "rear_setback_min"}:
        add("VERIFY_LOT_LINE_DESIGNATIONS", "Setback rules require front, side, street-side, and rear lot-line roles.", "SETBACK_COMPLIANCE", "Authoritative survey and Code-defined lot-line designations.")
    if "floor_area_ratio_max" in rule_keys and "GROSS_FLOOR_AREA_SQFT_UNKNOWN" in unresolved_codes:
        add("OBTAIN_GROSS_FLOOR_AREA", "A sourced FAR rule exists while Code-defined gross floor area is unavailable.", "FAR_UTILIZATION", "Code-defined gross-floor-area measurement and legal lot-area denominator.")
    if "COASTAL_APPLICABILITY_UNRESOLVED" in unresolved_codes:
        add("VERIFY_COASTAL_APPLICABILITY", "Coastal boundary evidence cannot select a legal standards version.", "RS_STANDARDS_VERSION", "Authoritative parcel-specific Coastal applicability determination.")
    if result["zoning"].get("mapping_state") == "SPLIT_ZONE":
        add("REVIEW_SPLIT_ZONE_GEOMETRY", "Multiple material zones intersect the parcel.", "PARCEL_WIDE_PRIMARY_STANDARD", "Authoritative zoning map and parcel-specific split-zone geometry review.")
    if result["zoning"].get("mapping_state") in {"UNMAPPED", "AMBIGUOUS", "UNAVAILABLE"}:
        add("VERIFY_BASE_ZONING_MAPPING", "Base zoning is unavailable or unresolved.", "BASE_STANDARDS", "Authoritative parcel-specific base-zoning determination.")
    if "EXISTING_DWELLING_UNITS_UNKNOWN" in unresolved_codes:
        add("VERIFY_EXISTING_UNIT_COUNT", "A positive recorded unit count is unavailable.", "EXISTING_UNIT_COUNT", "Current authoritative building or assessor record with explicit dwelling-unit semantics.")
    if "SITUS_ADDRESS_UNAVAILABLE" in unresolved_codes:
        add("VERIFY_PARCEL_SITUS", "The parcel has no normalized situs address.", "DISPLAY_ADDRESS", "Authoritative parcel situs record.")
    if standards.get("resolution_state") in {"NOT_APPLICABLE", "PARTIAL_RS_RESOLUTION"}:
        add("OBTAIN_SUPPORTED_ZONE_STANDARDS", "One or more mapped zones are outside the RS V0 rule set.", "BASE_STANDARDS_FOR_UNSUPPORTED_ZONE", "Sealed source-backed standards contract for each unsupported zone.")
    return [actions[k] for k in sorted(actions)]


def _presentation(result: dict[str, Any]) -> dict[str, Any]:
    ident, zoning, coastal, standards = result["identity"], result["zoning"], result["coastal_context"], result["base_standards"]
    zones = [z["zone_code"] for z in zoning.get("zone_evidence", [])]
    units = result["property_facts"]["structure"]["existing_dwelling_units"] or {}
    living = result["property_facts"]["structure"]["living_area"] or {}
    labels={"lot_area_min":"Minimum lot area standard","lot_width_min":"Minimum lot width standard","corner_lot_width_min":"Minimum corner-lot width standard","lot_depth_min":"Minimum lot depth standard","front_setback_min":"Minimum front setback standard","interior_side_setback_min":"Minimum interior side setback standard","street_side_setback_min":"Minimum street-side setback standard","rear_setback_min":"Minimum rear setback standard","structure_height_max":"Maximum structure height standard","density_basis":"Density basis","floor_area_ratio_max":"Maximum floor area ratio"}
    rules=[]
    for zone in standards.get("zone_results", []):
        for rule in zone.get("rules", []):
            value=rule["value"]
            if value.get("kind")=="number": rendered=f"{value['number']:g}"+((" "+rule["unit"]) if rule.get("unit") else "")
            elif value.get("kind")=="source_expression": rendered=value["text"]+" (source expression; not evaluated)"
            elif value.get("kind")=="reference": rendered=value["text"]+" — "+", ".join(value.get("targets",[]))
            else: rendered="unresolved"
            rules.append({"zone_code":zone["zone_code"],"standard_key":rule["standard_key"],"text":f"{labels.get(rule['standard_key'],rule['standard_key'])}: {rendered}","truth_state":rule["fact_state"],"rule_id":rule["rule_id"]})
    return {
        "property": f"APN {ident['apn']}" + (f" — {ident['situs_address']}" if ident.get("situs_address") else " — situs address unavailable"),
        "base_zoning": "Base zoning: " + (", ".join(zones) if zones else "not resolved"),
        "coastal_context": {"inside_coastal":"Coastal context: inside Coastal Overlay Zone","outside_coastal":"Coastal context: outside Coastal Overlay Zone"}.get(coastal.get("value"),"Coastal context: unresolved"),
        "rules": rules,
        "legal_lot_width": "Parcel legal lot width: not yet verified",
        "existing_dwelling_units": f"Existing dwelling units: {units.get('value')}, County assessor record" if units.get("fact_state")=="supported" else "Existing dwelling units: not yet verified",
        "living_area": f"Assessor living area: {living.get('value')} sq ft" if living.get("fact_state")=="supported" else "Assessor living area: unavailable",
        "gross_floor_area": "Gross floor area: unavailable",
        "development_capacity": "Development capacity: not evaluated",
    }


def compose(bundle: dict[str, Any], runtime=None) -> dict[str, Any]:
    runtime = runtime or _runtime_module()
    identity = copy.deepcopy(bundle["identity"])
    zoning = copy.deepcopy(bundle["zoning"])
    coastal = copy.deepcopy(bundle["coastal_context"])
    standards_input = _standards_input(bundle)
    if standards_input is None:
        standards = {"state":"unavailable","source_state":"not_evaluated","resolution_state":"IDENTITY_OR_ZONING_UNAVAILABLE","rule_set_version":None,"zone_results":[],"provenance":None,"unresolved_reasons":[{"code":"STANDARDS_INPUT_UNAVAILABLE","detail":"Identity or zoning input is unavailable."}],"fingerprint_sha256":None}
    else:
        runtime_result = runtime.resolve(standards_input)
        standards = copy.deepcopy(runtime_result["standards"])
        standards["unresolved_reasons"] = copy.deepcopy(runtime_result["unresolved_reasons"])
        standards["fingerprint_sha256"] = runtime_result["fingerprint_sha256"]
    index = _fact_index(bundle.get("condition_facts"))
    condition_facts = [_compact_condition_fact(key, index.get(key), identity) for key in CONDITION_KEYS]
    structure = _structure_section(bundle.get("structure_facts"))
    if identity.get("source_state") != "available": state="IDENTITY_UNRESOLVED"
    elif zoning.get("source_state") != "available" and coastal.get("source_state") != "available" and structure.get("source_state") != "available": state="SOURCE_UNAVAILABLE"
    elif zoning.get("mapping_state") in {"UNMAPPED","AMBIGUOUS","UNAVAILABLE"} or coastal.get("evidence_state") in {"BOUNDARY_AMBIGUOUS","SOURCE_UNAVAILABLE","APPLICABILITY_UNRESOLVED"} or standards.get("state") in {"unknown","unavailable","partial"} or structure.get("source_state") != "available": state="PARTIAL"
    else: state="SUPPORTED"
    result = {
        "contract_version": CONTRACT_VERSION, "as_of": bundle.get("as_of", AS_OF), "state": state,
        "identity": identity, "zoning": zoning, "coastal_context": coastal,
        "base_standards": standards,
        "property_facts": {"parcel_conditions": condition_facts, "geometry_diagnostics": copy.deepcopy((bundle.get("condition_facts") or {}).get("geometry_diagnostics", [])), "structure": structure},
        "unresolved": [], "next_investigation": [], "answers": {}, "presentation": {},
        "source_layers": [
            _source_ref("Parcel V2", "parcel-base-v2", identity.get("source_artifact",""), identity.get("source_artifact_sha256"), identity.get("source_row_sha256")),
            _source_ref("Base Zoning V2", "base-zoning-city-sd-v2-area-coverage-v1", zoning["provenance"]["artifact_path"], zoning["provenance"].get("artifact_sha256"), zoning.get("mapping_row_sha256")),
            _source_ref("Coastal Context V0", "coastal-context-city-sd-2026-09-30-v0", coastal["provenance"]["artifact_path"], file_fingerprint(ROOT / coastal["provenance"]["artifact_path"]), coastal.get("layer_fingerprint_sha256")),
            _source_ref("RS Parcel Condition Inputs V0", "rs-parcel-condition-inputs-2026-09-30-v0", "data/rs-parcel-condition-inputs-v0/fixture-results.json", file_fingerprint(ROOT / "data/rs-parcel-condition-inputs-v0/fixture-results.json"), (bundle.get("condition_facts") or {}).get("fingerprint_sha256")),
            _source_ref("Structure Facts V0", "structure-facts-2026-09-30-v0", "data/structure-facts-v0/fixture-results.json", file_fingerprint(ROOT / "data/structure-facts-v0/fixture-results.json"), (bundle.get("structure_facts") or {}).get("fingerprint_sha256")),
            _source_ref("Parcel RS Standards Runtime V0", "parcel-rs-standards-runtime-2026-09-30-v1", "data/parcel-rs-standards-runtime-v0", (standards.get("provenance") or {}).get("source_bundle_sha256"), standards.get("fingerprint_sha256")),
        ],
        "explicit_exclusions": EXCLUSIONS, "parcel_compliance_evaluated": False, "development_capacity_calculated": False,
        "standards_blended": False, "production_runtime_wired": False,
    }
    result["unresolved"] = _unresolved(identity,zoning,coastal,standards,condition_facts,structure)
    result["next_investigation"] = _next_investigation(result)
    result["answers"] = {
        "what_property": {"state": identity["state"], "answer_ref": "identity"},
        "what_zoning": {"state": zoning["state"], "answer_ref": "zoning"},
        "what_base_standards": {"state": standards["state"], "answer_ref": "base_standards"},
        "existing_development": {"state": structure["state"], "answer_ref": "property_facts.structure"},
        "what_is_uncertain": {"state": "supported", "answer_ref": "unresolved"},
        "why": {"state": "supported", "answer_ref": "source_layers"},
        "what_next": {"state": "supported", "answer_ref": "next_investigation"},
        "what_can_i_build": {"state": "not_evaluated", "answer_ref": None},
    }
    result["presentation"] = _presentation(result)
    result["fingerprint_sha256"] = fingerprint(result)
    return result

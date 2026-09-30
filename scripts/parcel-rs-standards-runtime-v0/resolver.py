#!/usr/bin/env python3
"""Deterministic offline Parcel V2 + Base Zoning V2 + RS standards resolver.

This module records sourced standards. It never evaluates parcel compliance or
development capacity and is not imported by the application runtime.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STANDARDS_DIR = ROOT / "data/rs-base-standards-v0"
DEFAULT_INSIDE_STANDARDS_DIR = ROOT / "data/inside-coastal-rs-standards-v0"
CONTRACT_VERSION = "parcel-rs-standards-runtime-2026-09-30-v1"
EXCLUSIONS = [
    "ADU_JADU",
    "SB9",
    "SB79",
    "DENSITY_BONUS",
    "COMPLETE_COMMUNITIES",
    "COASTAL_MODIFICATIONS",
    "OVERLAY_EFFECTS",
    "PARKING",
    "PARCEL_COMPLIANCE",
    "DEVELOPMENT_CAPACITY",
]
DETAILED_TO_CANONICAL = {
    "SINGLE_ZONE": "SINGLE_ZONE",
    "BOUNDARY_SLIVER": "SINGLE_ZONE",
    "MULTI_ZONE": "SPLIT_ZONE",
    "UNMAPPED": "UNMAPPED",
    "INDETERMINATE": "AMBIGUOUS",
}


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


class SourceBundleError(ValueError):
    pass


def load_source_bundle(data_dir: Path = DEFAULT_STANDARDS_DIR, expected_decision: str = "RS_BASE_STANDARDS_V0_SOURCE_COMPLETE") -> dict[str, Any]:
    try:
        standards = load_json(data_dir / "standards.json")
        sources = load_json(data_dir / "sources.json")
        versions = load_json(data_dir / "versions.json")
        decision = load_json(data_dir / "decision.json")
    except (OSError, json.JSONDecodeError) as exc:
        raise SourceBundleError(f"sealed standards bundle unavailable: {exc}") from exc
    if decision.get("decision") != expected_decision:
        raise SourceBundleError("sealed standards decision is not source-complete")
    by_zone: dict[str, list[dict[str, Any]]] = {}
    for rule in standards:
        body = {key: value for key, value in rule.items() if key != "provenance_sha256"}
        if rule.get("provenance_sha256") != fingerprint(body):
            raise SourceBundleError(f"invalid rule provenance: {rule.get('rule_id')}")
        by_zone.setdefault(rule["zone_code"], []).append(rule)
    for rules in by_zone.values():
        rules.sort(key=lambda item: item["rule_id"])
    source_hashes = {item["sha256"] for item in sources["sources"].values() if item.get("sha256")}
    for rule in standards:
        if rule["source_evidence"]["source_sha256"] not in source_hashes:
            raise SourceBundleError(f"unresolved source hash: {rule['rule_id']}")
    return {"by_zone": by_zone, "sources": sources, "versions": versions}


def validate_input(parcel: dict[str, Any]) -> None:
    if not isinstance(parcel.get("apn"), str) or len(parcel["apn"]) != 10 or not parcel["apn"].isdigit():
        raise ValueError("apn must be ten digits")
    state = parcel.get("mapping_evidence_state")
    if state not in DETAILED_TO_CANONICAL:
        raise ValueError("unsupported Base Zoning V2 mapping state")
    evidence = parcel.get("zone_evidence")
    if not isinstance(evidence, list):
        raise ValueError("zone_evidence must be a list")
    if state == "UNMAPPED" and evidence:
        raise ValueError("UNMAPPED must not contain zone evidence")
    if state != "UNMAPPED" and not evidence:
        raise ValueError("mapped evidence state requires zone evidence")
    for item in evidence:
        if not item.get("zone_code") or not isinstance(item.get("source_feature_ids"), list):
            raise ValueError("invalid zone evidence")
    if parcel.get("coastal_context") not in {"outside_coastal", "inside_coastal", "unknown"}:
        raise ValueError("coastal_context must be explicit")
    if parcel.get("coastal_context_state") is not None and parcel["coastal_context_state"] not in {
        "OUTSIDE_COASTAL", "INSIDE_COASTAL", "BOUNDARY_AMBIGUOUS", "SOURCE_UNAVAILABLE", "APPLICABILITY_UNRESOLVED"
    }:
        raise ValueError("unsupported coastal_context_state")
    try:
        date.fromisoformat(parcel["as_of"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("as_of must be an ISO date") from exc


def base_result(parcel: dict[str, Any]) -> dict[str, Any]:
    detailed = parcel["mapping_evidence_state"]
    return {
        "contract_version": CONTRACT_VERSION,
        "parcel": {
            "apn": parcel["apn"],
            "parcel_acquisition_id": parcel.get("parcel_acquisition_id"),
        },
        "request": {"as_of": parcel["as_of"], "coastal_context": parcel["coastal_context"]},
        "base_zoning": {
            "state": "supported" if detailed not in {"UNMAPPED", "INDETERMINATE"} else "unknown" if detailed == "UNMAPPED" else "partial",
            "source_state": "available",
            "derivation_class": "deterministic_derived",
            "mapping_state": DETAILED_TO_CANONICAL[detailed],
            "mapping_evidence_state": detailed,
            "zone_evidence": parcel["zone_evidence"],
            "provenance": parcel["mapping_provenance"],
        },
        "standards": {
            "state": "unknown",
            "source_state": "not_evaluated",
            "derivation_class": "deterministic_derived",
            "resolution_state": "MAPPING_UNRESOLVED",
            "rule_set_version": None,
            "zone_results": [],
            "provenance": None,
        },
        "unresolved_reasons": [],
        "explicit_exclusions": EXCLUSIONS,
        "parcel_compliance_evaluated": False,
        "development_capacity_calculated": False,
        "standards_blended": False,
    }


def finish(result: dict[str, Any]) -> dict[str, Any]:
    result["fingerprint_sha256"] = fingerprint(result)
    return result


def unresolved_source(parcel: dict[str, Any], reason: str) -> dict[str, Any]:
    result = base_result(parcel)
    result["standards"].update({
        "state": "unavailable",
        "source_state": "source_unavailable",
        "resolution_state": "SOURCE_UNAVAILABLE",
    })
    result["unresolved_reasons"] = [{"code": "RS_STANDARDS_SOURCE_UNAVAILABLE", "detail": reason}]
    return finish(result)


def resolve(
    parcel: dict[str, Any],
    standards_dir: Path = DEFAULT_STANDARDS_DIR,
    inside_standards_dir: Path = DEFAULT_INSIDE_STANDARDS_DIR,
) -> dict[str, Any]:
    validate_input(parcel)
    explicit_state = parcel.get("coastal_context_state")
    if explicit_state == "SOURCE_UNAVAILABLE":
        return unresolved_source(parcel, "Coastal context source is unavailable.")
    if explicit_state in {"BOUNDARY_AMBIGUOUS", "APPLICABILITY_UNRESOLVED"} or parcel["coastal_context"] == "unknown":
        result = base_result(parcel)
        result["standards"].update({"state": "unknown", "source_state": "available", "resolution_state": "APPLICABILITY_UNRESOLVED"})
        result["unresolved_reasons"] = [{
            "code": "COASTAL_APPLICABILITY_UNRESOLVED",
            "detail": "Boundary-ambiguous or unresolved Coastal context cannot select a definitive standards version.",
        }]
        return finish(result)
    coastal = parcel["coastal_context"]
    if explicit_state == "INSIDE_COASTAL" and coastal != "inside_coastal":
        raise ValueError("Coastal state/context mismatch")
    if explicit_state == "OUTSIDE_COASTAL" and coastal != "outside_coastal":
        raise ValueError("Coastal state/context mismatch")
    selected_dir = inside_standards_dir if coastal == "inside_coastal" else standards_dir
    expected = "INSIDE_COASTAL_RS_STANDARDS_V0_READY" if coastal == "inside_coastal" else "RS_BASE_STANDARDS_V0_SOURCE_COMPLETE"
    try:
        bundle = load_source_bundle(selected_dir, expected)
    except SourceBundleError as exc:
        return unresolved_source(parcel, str(exc))
    result = base_result(parcel)
    standards = result["standards"]
    versions = bundle["versions"]
    verified_as_of = versions["verified_as_of"]
    as_of = parcel["as_of"]

    inside_supported = coastal == "inside_coastal" and bundle["versions"]["profiles"][0]["effective_from"] <= as_of <= bundle["versions"]["profiles"][0]["verified_through"]
    outside_supported = coastal == "outside_coastal" and as_of == verified_as_of
    if not (inside_supported or outside_supported):
        relation = "FUTURE_SOURCE_REACQUISITION_REQUIRED" if as_of > verified_as_of else "HISTORICAL_VERSION_UNAVAILABLE"
        standards.update({"state": "unknown", "source_state": "available", "resolution_state": "APPLICABILITY_UNRESOLVED"})
        result["unresolved_reasons"] = [{"code": relation, "detail": f"V0 is sealed only for {verified_as_of}."}]
        return finish(result)

    detailed = parcel["mapping_evidence_state"]
    if detailed == "UNMAPPED":
        standards.update({"state": "unknown", "source_state": "not_evaluated", "resolution_state": "MAPPING_UNRESOLVED"})
        result["unresolved_reasons"] = [{"code": "BASE_ZONING_UNMAPPED", "detail": "No definitive base-zone standards can be selected."}]
        return finish(result)
    if detailed == "INDETERMINATE":
        standards.update({"state": "partial", "source_state": "not_evaluated", "resolution_state": "MAPPING_UNRESOLVED"})
        result["unresolved_reasons"] = [{"code": "BASE_ZONING_AMBIGUOUS", "detail": "Candidate zoning evidence is preserved; no definitive standards set is selected."}]
        return finish(result)

    selected = parcel["zone_evidence"][:1] if detailed in {"SINGLE_ZONE", "BOUNDARY_SLIVER"} else parcel["zone_evidence"]
    zone_results = []
    for item in selected:
        zone = item["zone_code"]
        rules = bundle["by_zone"].get(zone)
        if rules is None:
            zone_results.append({
                "zone_code": zone,
                "state": "not_applicable",
                "source_state": "available",
                "derivation_class": "deterministic_derived",
                "resolution_state": "UNSUPPORTED_BY_RS_V0",
                "zone_evidence": item,
                "rules": [],
            })
        else:
            zone_results.append({
                "zone_code": zone,
                "state": "supported",
                "source_state": "available",
                "derivation_class": "deterministic_derived",
                "resolution_state": "RESOLVED",
                "zone_evidence": item,
                "rules": rules,
            })
    supported = [item for item in zone_results if item["resolution_state"] == "RESOLVED"]
    unsupported = [item for item in zone_results if item["resolution_state"] == "UNSUPPORTED_BY_RS_V0"]
    if not supported:
        truth_state, resolution_state = "not_applicable", "NOT_APPLICABLE"
    elif unsupported:
        truth_state, resolution_state = "partial", "PARTIAL_RS_RESOLUTION"
    else:
        truth_state, resolution_state = "supported", "RESOLVED"
    standards.update({
        "state": truth_state,
        "source_state": "available",
        "resolution_state": resolution_state,
        "rule_set_version": versions["rule_set_version"],
        "zone_results": zone_results,
        "provenance": {
            "version_profile": bundle["versions"]["profiles"][0]["id"],
            "verified_as_of": verified_as_of,
            "source_edition": versions["source_edition"],
            "source_bundle_sha256": fingerprint({"sources": bundle["sources"], "versions": versions}),
        },
    })
    if detailed == "BOUNDARY_SLIVER":
        result["unresolved_reasons"].append({
            "code": "SECONDARY_BOUNDARY_SLIVER_RETAINED",
            "detail": "The principal-zone conclusion follows Packet 9 doctrine; secondary evidence remains visible and receives no standards set.",
        })
    if unsupported:
        result["unresolved_reasons"].append({
            "code": "NON_RS_COMPONENT_UNSUPPORTED",
            "detail": "Non-RS zoning is preserved as evidence and is outside this resolver.",
        })
    if any(rule["fact_state"] == "CONDITIONAL" for item in supported for rule in item["rules"]):
        result["unresolved_reasons"].append({
            "code": "CONDITIONAL_RULES_REQUIRE_ADDITIONAL_FACTS",
            "detail": "Conditional source rules are returned unevaluated.",
        })
    if any(rule["fact_state"] == "UNKNOWN" for item in supported for rule in item["rules"]):
        result["unresolved_reasons"].append({
            "code": "SOURCE_RULE_UNKNOWN",
            "detail": "The source does not establish a value; no value is inferred.",
        })
    return finish(result)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    args = parser.parse_args()
    print(json.dumps(resolve(load_json(args.input)), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

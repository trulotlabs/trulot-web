#!/usr/bin/env python3
"""Offline Parcel V2 condition-fact adapter for later RS evaluation.

Geometry diagnostics are deliberately segregated from legal lot facts. This
module does not evaluate compliance, capacity, setbacks, FAR, or entitlement.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/rs-parcel-condition-inputs-v0"
CONTRACT_VERSION = "rs-parcel-condition-inputs-2026-09-30-v0"
PARCEL_ACQUISITION_ID = "sangis-20260924T183743Z"
PARCEL_SOURCE = {
    "dataset_id": "parcel_base_sangis_v2",
    "publisher": "SanGIS",
    "source_url": "https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer/0",
}
PARCEL_ACQUISITION = {
    "acquisition_id": PARCEL_ACQUISITION_ID,
    "retrieved_at": "2026-09-24T18:43:39.950969+00:00",
    "source_temporal_extent": "2026-08-29T00:00:00",
    "artifact_sha256": "07913d1007d0e2f5b80c681c19c76bb1338f4b06d99c401c1784744bbd1a4544",
}
LEGAL_UNKNOWN = {
    "legal_lot_area_sqft": "Parcel geometry area and taxable acreage do not establish the Code-defined or legally recognized lot area.",
    "legal_lot_width_ft": "No authoritative lot-line designations or Code measurement baseline are present.",
    "legal_lot_depth_ft": "No authoritative front/rear lot lines or Code measurement baseline are present.",
    "corner_lot_status": "Parcel shape and situs text do not establish Code-defined corner-lot status.",
    "front_lot_line": "Current parcel data does not designate legal front lot lines.",
    "interior_side_lot_lines": "Current parcel data does not designate interior side lot lines.",
    "street_side_lot_lines": "Current parcel data does not designate street side lot lines.",
    "rear_lot_line": "Current parcel data does not designate rear lot lines.",
    "legal_street_frontage_length_ft": "No authoritative frontage or right-of-way relationship is present.",
    "street_curve_or_turnaround_status": "No authoritative street-configuration relationship is present.",
    "slope_percent": "No terrain, survey elevation, or authoritative slope source is present.",
    "steep_hillside_fraction": "No topographic source establishes the portion of premises containing steep hillsides.",
    "defensible_space_requirement": "No Fire Code Official determination or defensible-space source is present.",
    "existing_lot_legality": "Parcel identity does not establish legal-lot status or subdivision history.",
    "coastal_context": "Parcel V2 contains no authoritative Coastal boundary classification.",
    "structure_height_ft": "Parcel V2 contains no existing or proposed structure-height measurement.",
    "structure_footprint_area_sqft": "Parcel V2 contains no authoritative structure footprint.",
    "gross_floor_area_sqft": "Parcel V2 contains no gross floor area; assessed living area is not a substitute.",
    "proposed_dwelling_unit_count": "No proposed project program is part of Parcel V2.",
    "proposed_use": "No proposed project use is part of Parcel V2.",
    "structure_geometry": "Parcel V2 contains parcel geometry only, not structure geometry.",
    "hardscape_area_sqft": "Parcel V2 contains no paving or hardscape measurement.",
    "garage_context": "Parcel V2 contains no garage or parking-access facts.",
    "resubdivision_history": "Parcel V2 contains no authoritative resubdivision history.",
    "existing_dwelling_units": "Parcel V2 contains no authoritative current dwelling-unit count.",
    "third_story_dimensions": "Parcel V2 contains no story count or third-story dimensions.",
    "visibility_area_context": "Parcel V2 contains no designated visibility-area or obstruction facts.",
    "refuse_storage_context": "Parcel V2 contains no refuse/recycling storage facts.",
    "alley_access": "Parcel V2 contains no authoritative alley-access relationship.",
    "angled_envelope_context": "No Table 131-04H angled-envelope context is established.",
    "applicable_accessory_structure_type": "No existing or proposed accessory-structure facts are present.",
    "height_reference_datum": "No Code-defined height reference datum is established.",
    "proposed_project_scope": "No proposed project is part of Parcel V2.",
    "supplemental_requirement_trigger": "No project or parcel fact selects a supplemental requirement.",
}
CORE_RULE_KEYS = [
    "lot_area_min", "lot_width_min", "corner_lot_width_min", "lot_depth_min", "front_setback_min",
    "interior_side_setback_min", "street_side_setback_min", "rear_setback_min", "structure_height_max",
    "density_basis", "floor_area_ratio_max",
]


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def sha256_value(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_provenance(spec: dict[str, Any], row: dict[str, Any] | None) -> dict[str, Any]:
    path = ROOT / spec["source_artifact"]
    return {
        "artifact_path": spec["source_artifact"],
        "artifact_sha256": sha256_file(path),
        "source_object_id": None if row is None else row.get("source_object_id"),
        "geometry_sha256": None if row is None else row.get("geometry_sha256"),
    }


def fact(key: str, state: str, value: Any, unit: str | None, derivation: str, method: str,
         confidence: str, limitations: list[str], provenance: dict[str, Any],
         source: dict[str, Any] | None = PARCEL_SOURCE,
         acquisition: dict[str, Any] | None = PARCEL_ACQUISITION,
         geometry_evidence: dict[str, Any] | None = None) -> dict[str, Any]:
    result = {
        "fact_key": key,
        "state": state,
        "source_state": "available" if state != "unavailable" else "source_unavailable",
        "value": value,
        "unit": unit,
        "derivation_class": derivation,
        "method": method,
        "source": source,
        "source_acquisition": acquisition,
        "confidence": confidence,
        "limitations": limitations,
        "provenance": provenance,
    }
    if geometry_evidence is not None:
        result["geometry_evidence"] = geometry_evidence
    return result


def unknown_fact(key: str, limitation: str, provenance: dict[str, Any]) -> dict[str, Any]:
    return fact(key, "unknown", None, None, "NOT_AVAILABLE", "No qualifying field or authoritative relationship in current Parcel V2.",
                "not_established", [limitation, "Unknown is not zero or false."], provenance)


def point_value(row: dict[str, Any], name: str) -> dict[str, Any] | None:
    if name in row and isinstance(row[name], dict):
        return row[name]
    if name == "centroid" and row.get("lat") is not None and row.get("lng") is not None:
        return {"type": "Point", "coordinates": [row["lng"], row["lat"]]}
    if name == "point_on_surface" and row.get("pos_lat") is not None and row.get("pos_lng") is not None:
        return {"type": "Point", "coordinates": [row["pos_lng"], row["pos_lat"]]}
    return None


def geometry_type(row: dict[str, Any]) -> str | None:
    if isinstance(row.get("geom"), dict):
        return row["geom"].get("type")
    value = row.get("geometry_type")
    return value.removeprefix("ST_") if isinstance(value, str) else None


def diagnostic_metrics(row: dict[str, Any], provenance: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(row.get("geom"), dict):
        return []
    geometry = transform(Transformer.from_crs("EPSG:4326", "EPSG:2230", always_xy=True).transform, shape(row["geom"]))
    rectangle = geometry.minimum_rotated_rectangle
    coords = list(rectangle.exterior.coords)
    lengths = sorted(math.dist(coords[index], coords[index + 1]) for index in range(4))
    hull_coords = list(geometry.convex_hull.exterior.coords)[:-1]
    max_span = max(math.dist(a, b) for index, a in enumerate(hull_coords) for b in hull_coords[index + 1:])
    points = [point for polygon in ([geometry] if geometry.geom_type == "Polygon" else geometry.geoms)
              for point in list(polygon.exterior.coords)[:-1]]
    mean_x = sum(point[0] for point in points) / len(points)
    mean_y = sum(point[1] for point in points) / len(points)
    xx = sum((point[0] - mean_x) ** 2 for point in points)
    yy = sum((point[1] - mean_y) ** 2 for point in points)
    xy = sum((point[0] - mean_x) * (point[1] - mean_y) for point in points)
    angle = 0.5 * math.atan2(2 * xy, xx - yy)
    ux, uy = math.cos(angle), math.sin(angle)
    vx, vy = -uy, ux
    principal = [point[0] * ux + point[1] * uy for point in points]
    transverse = [point[0] * vx + point[1] * vy for point in points]
    metrics = [
        ("geometry_minimum_rotated_rectangle_min_span_ft", lengths[0], "Minimum side of the minimum rotated rectangle."),
        ("geometry_minimum_rotated_rectangle_max_span_ft", lengths[-1], "Maximum side of the minimum rotated rectangle."),
        ("geometry_convex_hull_maximum_span_ft", max_span, "Maximum vertex-to-vertex span of the convex hull."),
        ("geometry_principal_axis_span_ft", max(principal) - min(principal), "Vertex-covariance principal-axis span."),
        ("geometry_principal_axis_transverse_span_ft", max(transverse) - min(transverse), "Span perpendicular to the vertex-covariance principal axis."),
    ]
    return [fact(key, "supported", round(value, 6), "ft", "INFERRED", method, "diagnostic_only",
                 ["Diagnostic geometry proxy only.", "It is not legal lot width, depth, frontage, or a Code measurement."],
                 provenance, geometry_evidence={"geometry_sha256": row["geometry_sha256"], "analysis_crs": "EPSG:2230"})
            for key, value, method in metrics]


def resolve(spec: dict[str, Any], row: dict[str, Any] | None) -> dict[str, Any]:
    provenance = source_provenance(spec, row)
    apn = spec["apn"]
    facts: list[dict[str, Any]] = []
    facts.append(fact("parcel_apn", "supported", apn, None, "DETERMINISTIC_DERIVED", "Strict ten-digit APN normalization.",
                      "high", ["Identity only; does not establish legal-lot status."], provenance))
    if row is None:
        for key in ["parcel_id", "source_object_id", "jurisdiction_code", "situs_components", "situs_address",
                    "parcel_geometry", "geometry_type", "geometry_sha256", "approximate_geometry_area_sqft",
                    "taxable_acreage", "centroid", "point_on_surface", "centroid_within", "stack_group_count"]:
            facts.append(unknown_fact(key, "No Parcel Serving V2 row for this APN is retained in the bounded repository evidence.", provenance))
        diagnostics: list[dict[str, Any]] = []
    else:
        geometry_evidence = {"geometry_sha256": row.get("geometry_sha256"), "native_crs": row.get("native_crs", "EPSG:2230"),
                             "artifact_crs": row.get("artifact_crs", "EPSG:4326")}
        recorded = [
            ("parcel_id", row.get("parcel_id"), None),
            ("source_object_id", row.get("source_object_id"), None),
            ("jurisdiction_code", row.get("situs_juris"), None),
            ("situs_components", row.get("situs_components"), None),
        ]
        for key, value, unit in recorded:
            facts.append(fact(key, "supported" if value is not None else "unknown", value, unit,
                              "RECORDED" if value is not None else "NOT_AVAILABLE", "Direct Parcel V2 source field.",
                              "high" if value is not None else "not_established", [], provenance))
        address = row.get("address")
        facts.append(fact("situs_address", "supported" if address is not None else "unknown", address, None,
                          "DETERMINISTIC_DERIVED" if address is not None else "NOT_AVAILABLE",
                          "Packet 5 deterministic composition of recorded situs components.", "high" if address else "not_established",
                          ["A situs address does not designate frontage or a front lot line."], provenance))
        geom = row.get("geom")
        geometry_reference = {"type": geometry_type(row), "geometry_sha256": row.get("geometry_sha256"),
                              "coordinates_retained_in_referenced_artifact": geom is not None}
        facts.append(fact("parcel_geometry", "supported" if geom is not None else "partial", geometry_reference,
                          None, "RECORDED" if geom is not None else "RECORDED",
                          "Reference to accepted source polygon; coordinates remain in the cited artifact and are not duplicated here.",
                          "high", ["Cadastral/GIS geometry is not proof of legal lot lines."], provenance,
                          geometry_evidence=geometry_evidence))
        for key, value, method in [
            ("geometry_type", geometry_type(row), "Geometry type read from the accepted geometry."),
            ("geometry_sha256", row.get("geometry_sha256"), "SHA-256 over canonical accepted geometry."),
            ("approximate_geometry_area_sqft", row.get("approximate_geometry_area_sqft"), "Area derived in EPSG:2230 US survey feet."),
            ("centroid", point_value(row, "centroid"), "Centroid derived in EPSG:2230 and transformed to EPSG:4326."),
            ("point_on_surface", point_value(row, "point_on_surface"), "Point-on-surface derived from accepted geometry."),
            ("centroid_within", row.get("centroid_within"), "Deterministic point-in-polygon test for the derived centroid."),
            ("stack_group_count", spec.get("stack_count", row.get("stack_count")), "Count of accepted parcel identities sharing geometry in bounded evidence."),
        ]:
            facts.append(fact(key, "supported" if value is not None else "unknown", value,
                              "sq_ft" if key == "approximate_geometry_area_sqft" else None,
                              "DETERMINISTIC_DERIVED" if value is not None else "NOT_AVAILABLE", method,
                              "high" if value is not None else "not_established",
                              ["Geometry-derived facts do not establish legal lot characteristics."] if key.startswith("geometry") or key in {"centroid", "point_on_surface", "centroid_within"} else [],
                              provenance, geometry_evidence=geometry_evidence if key.startswith("geometry") or key in {"centroid", "point_on_surface", "centroid_within"} else None))
        taxable = row.get("taxable_acreage")
        facts.append(fact("taxable_acreage", "supported" if taxable is not None else "unknown", taxable, "acre",
                          "RECORDED" if taxable is not None else "NOT_AVAILABLE", "Direct source acreage field.",
                          "high" if taxable is not None else "not_established",
                          ["Taxable acreage is not geometry area or legal lot area.", "Null is unknown, not zero."], provenance))
        diagnostics = diagnostic_metrics(row, provenance)
    for key, limitation in LEGAL_UNKNOWN.items():
        facts.append(unknown_fact(key, limitation, provenance))
    by_key = {item["fact_key"]: item for item in facts}
    area_available = by_key["approximate_geometry_area_sqft"]["state"] == "supported"
    rs_standard_available = spec["standards_context"]["state"] in {"resolved_rs", "resolved_rs_split"}
    standards_context = spec["standards_context"]
    rs_zones = [zone for zone in standards_context.get("zones", []) if zone.startswith("RS-1-")]
    known_rule_inputs = []
    if standards_context["state"] in {"resolved_rs", "resolved_rs_split"}:
        all_rules = json.loads((ROOT / "data/rs-base-standards-v0/standards.json").read_text())
        known_rule_inputs = [{"zone_code": zone, "rules": [{key: rule[key] for key in ["rule_id", "standard_key", "fact_state", "value", "unit", "condition", "provenance_sha256"]}
                              for rule in all_rules if rule["zone_code"] == zone and rule["standard_key"] in CORE_RULE_KEYS]}
                             for zone in rs_zones]
    dependencies = json.loads((DATA / "dependencies.json").read_text())["families"]
    if standards_context["state"] in {"resolved_rs", "resolved_rs_split"}:
        blocked = [{"standard_family": item["standard_family"], "readiness": item["readiness"], "blocker": item["blocker"]}
                   for item in dependencies]
        mechanical = ["lot_area_min"] if area_available else []
    else:
        blocked = []
        mechanical = []
    result = {
        "contract_version": CONTRACT_VERSION,
        "fixture_id": spec["id"],
        "parcel": {"apn": apn, "parcel_acquisition_id": PARCEL_ACQUISITION_ID},
        "coverage_tags": spec["coverage_tags"],
        "standards_context": standards_context,
        "standards_provenance": {
            "packet13_artifact": "data/parcel-rs-standards-runtime-v0/fixture-results.json",
            "packet13_artifact_sha256": sha256_file(ROOT / "data/parcel-rs-standards-runtime-v0/fixture-results.json"),
            "rule_set_version": "sd-rs-base-standards-2026-09-30-v0",
        },
        "known_rs_rule_inputs": known_rule_inputs,
        "facts": facts,
        "geometry_diagnostics": diagnostics,
        "lot_area_readiness": {
            "geometry_area_available": area_available,
            "taxable_acreage_available": by_key["taxable_acreage"]["state"] == "supported",
            "rs_minimum_lot_area_available": rs_standard_available,
            "mechanical_comparison_possible": area_available and rs_standard_available,
            "legal_lot_area_equivalence": "unresolved",
            "compliance_conclusion": None,
        },
        "legal_measurement_findings": {
            "width": "LEGAL_WIDTH_NOT_DERIVABLE_FROM_CURRENT_DATA",
            "depth": "LEGAL_DEPTH_NOT_DERIVABLE_FROM_CURRENT_DATA",
            "corner_lot": "UNKNOWN",
            "frontage": "UNKNOWN",
        },
        "evaluation_readiness": {
            "standards_context_state": standards_context["state"],
            "ready_rule_families": [],
            "mechanically_possible_but_legally_unresolved": mechanical,
            "blocked_rule_families": blocked,
        },
        "compliance_evaluated": False,
        "capacity_calculated": False,
    }
    result["fingerprint_sha256"] = sha256_value(result)
    return result

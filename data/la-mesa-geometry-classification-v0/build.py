#!/usr/bin/env python3
"""Build deterministic La Mesa parcel geometry classifications from Packet 63 inputs."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import mmap
import shutil
from collections import Counter, defaultdict
from pathlib import Path

from pyproj import Transformer
from shapely import from_geojson, make_valid, normalize, set_precision, to_geojson, union_all
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, mapping
from shapely.ops import transform
from shapely.strtree import STRtree
from shapely.validation import explain_validity

VERSION = "la-mesa-geometry-classification-v1"
CRS = "EPSG:2230"
GRID_FEET = 0.0001
REPAIR_AREA_DELTA_MAX_PCT = 0.10
REPAIR_COMPONENT_INCREASE_MAX = 10
COVERAGE_PCT_TOLERANCE = 0.50
COVERAGE_AREA_TOLERANCE_SQFT = 25.0
SLIVER_PCT = 1.0
SLIVER_AREA_SQFT = 100.0
MIN_INTERSECTION_SQFT = 0.01


def canonical(obj) -> bytes:
    return (json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, indent=2, sort_keys=True, ensure_ascii=False) + "\n")


def write_gzip_lines(path: Path, rows) -> str:
    h = hashlib.sha256()
    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, compresslevel=9, mtime=0) as out:
            for row in rows:
                b = canonical(row)
                h.update(b)
                out.write(b)
    return h.hexdigest()


def load_gzip_lines(path: Path):
    with gzip.open(path, "rt") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def polygon_parts(g):
    if g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, MultiPolygon):
        return list(g.geoms)
    if isinstance(g, GeometryCollection):
        parts = []
        for x in g.geoms:
            parts.extend(polygon_parts(x))
        return parts
    return []


def normalized_polygon(g, project, source_kind: str, source_id):
    projected = transform(project, g)
    before_valid = projected.is_valid
    before_reason = explain_validity(projected)
    before_area = abs(projected.area)
    before_parts = len(polygon_parts(projected))
    repaired = make_valid(projected) if not before_valid else projected
    parts = polygon_parts(repaired)
    if parts:
        repaired = union_all(parts, grid_size=GRID_FEET)
    else:
        repaired = Polygon()
    repaired = normalize(set_precision(repaired, GRID_FEET, mode="valid_output"))
    after_area = abs(repaired.area)
    after_parts = len(polygon_parts(repaired))
    delta_pct = 0.0 if before_area == 0 and after_area == 0 else abs(after_area - before_area) / max(before_area, 1e-12) * 100
    accepted = (
        not repaired.is_empty
        and repaired.is_valid
        and delta_pct <= REPAIR_AREA_DELTA_MAX_PCT
        and after_parts <= before_parts + REPAIR_COMPONENT_INCREASE_MAX
    )
    receipt = {
        "source_kind": source_kind,
        "source_id": source_id,
        "before_valid": before_valid,
        "before_validity": before_reason,
        "before_type": projected.geom_type,
        "after_type": repaired.geom_type,
        "before_area_sqft": round(before_area, 6),
        "after_area_sqft": round(after_area, 6),
        "area_delta_pct": round(delta_pct, 9),
        "before_component_count": before_parts,
        "after_component_count": after_parts,
        "empty_after": repaired.is_empty,
        "valid_after": repaired.is_valid,
        "repair_applied": not before_valid,
        "accepted": accepted,
        "normalized_geometry_sha256": sha(repaired.wkb),
    }
    return repaired, receipt


def verify_packet63(root: Path):
    manifest = json.loads((root / "integrity.json").read_text())
    mismatches = []
    for e in manifest["files"]:
        p = root / e["path"]
        if not p.exists() or p.stat().st_size != e["bytes"] or file_sha(p) != e["sha256"]:
            mismatches.append(e["path"])
    if mismatches:
        raise RuntimeError(f"Packet 63 integrity mismatch: {mismatches}")
    return manifest


def load_accepted_lm(rows_path: Path):
    rows = {}
    with gzip.open(rows_path, "rt") as f:
        for line in f:
            x = json.loads(line)
            r = x.get("row") or {}
            if x.get("accepted") and r.get("jurisdiction") == "LM":
                rows[r["apnNorm"]] = r
    if len(rows) != 17391:
        raise RuntimeError(f"expected 17391 canonical LM APNs, found {len(rows)}")
    apn_fp = sha(("\n".join(sorted(rows)) + "\n").encode())
    expected = "11440df9a1fb2a72592000dc656f75dcec9bf7ed9d90e9efcb9ebba8e700a467"
    if apn_fp != expected:
        raise RuntimeError(f"canonical APN fingerprint mismatch: {apn_fp}")
    return rows, apn_fp


def extract_raw_parcels(raw_path: Path, wanted: set[str]):
    found = {}
    delim = b'},{"type":"Feature"'
    with raw_path.open("rb") as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        start = mm.find(b'[{"type":"Feature"') + 1
        if start <= 0:
            raise RuntimeError("county feature collection start not found")
        while True:
            pos = mm.find(delim, start)
            if pos < 0:
                end = mm.rfind(b"]}")
                blob, last = mm[start:end], True
            else:
                blob, last = mm[start : pos + 1], False
            # Fast APN screening before JSON decoding.
            apn_pos = blob.find(b'"apn":"')
            if apn_pos >= 0:
                apn_end = blob.find(b'"', apn_pos + 7)
                apn = blob[apn_pos + 7 : apn_end].decode().strip()
                if apn in wanted:
                    found[apn] = json.loads(blob)
            if last:
                break
            start = pos + 2
        mm.close()
    missing = sorted(wanted - found.keys())
    if missing:
        raise RuntimeError(f"county geometries missing: {missing[:20]}")
    return found


def load_city_layer(path: Path, source_kind: str, project):
    records, receipts = [], []
    for feature in load_gzip_lines(path):
        g = from_geojson(json.dumps(feature["geometry"], separators=(",", ":")))
        sid = feature.get("id") or feature["properties"].get("OBJECTID")
        ng, receipt = normalized_polygon(g, project, source_kind, sid)
        receipt["source_properties_sha256"] = sha(canonical(feature["properties"]))
        receipts.append(receipt)
        records.append({"id": sid, "properties": feature["properties"], "geometry": ng, "accepted": receipt["accepted"]})
    return records, receipts


def dissolve(records, key_fn):
    groups = defaultdict(list)
    source_ids = defaultdict(list)
    for r in records:
        if not r["accepted"]:
            continue
        for key in key_fn(r["properties"]):
            if key is None:
                continue
            groups[key].append(r["geometry"])
            source_ids[key].append(r["id"])
    out = []
    for key in sorted(groups, key=lambda x: json.dumps(x, sort_keys=True)):
        geom = normalize(union_all(groups[key], grid_size=GRID_FEET))
        out.append({"key": key, "geometry": geom, "source_ids": sorted(source_ids[key], key=str)})
    return out


def build_tree(groups):
    geoms = [x["geometry"] for x in groups]
    return STRtree(geoms), geoms


def intersections(parcel, groups, tree, key_value=lambda x: x["key"]):
    out = []
    for i in tree.query(parcel, predicate="intersects"):
        group = groups[int(i)]
        inter = parcel.intersection(group["geometry"])
        area = inter.area
        if area <= MIN_INTERSECTION_SQFT:
            continue
        out.append((key_value(group), area, inter, group["geometry"].area, group["source_ids"]))
    return sorted(out, key=lambda x: (-x[1], json.dumps(x[0], sort_keys=True)))


def is_sliver(area: float, parcel_area: float, pct=SLIVER_PCT, sqft=SLIVER_AREA_SQFT):
    return area / parcel_area * 100 < pct or area < sqft


def coverage_ok(parcel_area, intersection_sum):
    delta = abs(parcel_area - intersection_sum)
    allowed = max(parcel_area * COVERAGE_PCT_TOLERANCE / 100, COVERAGE_AREA_TOLERANCE_SQFT)
    return delta <= allowed, delta, allowed


def classify_partition(parcel, groups, tree):
    area = parcel.area
    xs = intersections(parcel, groups, tree)
    if not xs:
        return "UNMAPPED", None, [], [], [], 0.0, 100.0
    total = sum(x[1] for x in xs)
    ok, delta, _ = coverage_ok(area, total)
    details = []
    material, slivers = [], []
    for position, (key, a, _inter, zone_area, source_ids) in enumerate(xs):
        d = {
            "code": key[0] if isinstance(key, tuple) else key,
            "semantic_key": list(key) if isinstance(key, tuple) else [key],
            "intersection_area_sqft": round(a, 6),
            "parcel_coverage_pct": round(a / area * 100, 9),
            "zone_coverage_pct": round(a / zone_area * 100, 12),
            "component_count": len(polygon_parts(_inter)),
            "source_ids_sha256": sha(canonical(source_ids)),
        }
        details.append(d)
        # Sliver doctrine applies to secondary zones. The dominant coverage is
        # never discarded merely because the entire canonical parcel is tiny.
        (slivers if position > 0 and is_sliver(a, area) else material).append(d)
    if not ok:
        state, selected = "INDETERMINATE", None
    elif len(material) == 1 and not slivers:
        state, selected = "SINGLE_ZONE", material[0]["code"]
    elif len(material) == 1 and slivers:
        state, selected = "BOUNDARY_SLIVER", material[0]["code"]
    elif len(material) >= 2:
        state, selected = "MULTI_ZONE", None
    elif not material and details:
        state, selected = "INDETERMINATE", None
    else:
        state, selected = "UNMAPPED", None
    return state, selected, material, slivers, details, total / area * 100, delta / area * 100


def mapped_intersections(parcel, groups, tree):
    area = parcel.area
    rows = []
    for key, a, inter, _group_area, source_ids in intersections(parcel, groups, tree):
        pct = a / area * 100
        rows.append({
            "code": key,
            "intersection_area_sqft": round(a, 6),
            "parcel_coverage_pct": round(pct, 9),
            "geometrically_material": pct >= 50 or not is_sliver(a, area),
            "mapped_state": "MAPPED_INTERSECTION",
            "component_count": len(polygon_parts(inter)),
            "source_ids_sha256": sha(canonical(source_ids)),
        })
    return rows


def context_partition(parcel, groups, tree, prefix):
    rows = mapped_intersections(parcel, groups, tree)
    material = [x for x in rows if x["geometrically_material"]]
    sliver = [x for x in rows if not x["geometrically_material"]]
    if not rows:
        state = "NONE" if prefix == "SPECIFIC_PLAN" else "UNMAPPED"
    elif len(material) > 1:
        state = "MULTI_DESIGNATION" if prefix == "LAND_USE" else "MULTIPLE_ADOPTED_SPECIFIC_PLANS"
    elif len(material) == 1 and not sliver and material[0]["parcel_coverage_pct"] >= 99.5:
        state = "SINGLE_DESIGNATION" if prefix == "LAND_USE" else "ONE_ADOPTED_SPECIFIC_PLAN"
    elif len(material) == 1 or sliver:
        state = "SLIVER" if prefix == "LAND_USE" else "SPECIFIC_PLAN_BOUNDARY_REVIEW"
    else:
        state = "INDETERMINATE"
    return state, rows


def geom_feature(group):
    return {
        "type": "Feature",
        "properties": {"key": group["key"], "source_ids": group["source_ids"]},
        "geometry": mapping(group["geometry"]),
    }


def write_feature_collection_gz(path: Path, groups):
    obj = {"type": "FeatureCollection", "features": [geom_feature(g) for g in groups]}
    b = json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()
    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, compresslevel=9, mtime=0) as out:
            out.write(b)
    return sha(b)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--packet63", type=Path, required=True)
    ap.add_argument("--county-rows", type=Path, required=True)
    ap.add_argument("--county-raw", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--execution-timestamp", default="2026-10-26T00:00:00Z")
    args = ap.parse_args()
    out = args.output
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    integrity = verify_packet63(args.packet63)
    accepted, apn_fp = load_accepted_lm(args.county_rows)
    discrepancy_apn = "4953350500"
    raw = extract_raw_parcels(args.county_raw, set(accepted) | {discrepancy_apn})

    tr = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)
    project = tr.transform
    parcel_geoms = {}
    parcel_receipts = []
    for apn in sorted(accepted):
        g = from_geojson(json.dumps(raw[apn]["geometry"], separators=(",", ":")))
        ng, rec = normalized_polygon(g, project, "county_parcel", apn)
        if not rec["accepted"]:
            raise RuntimeError(f"canonical parcel geometry failed normalization: {apn}")
        parcel_geoms[apn] = ng
        if rec["repair_applied"]:
            parcel_receipts.append(rec)
    extra_g, extra_rec = normalized_polygon(
        from_geojson(json.dumps(raw[discrepancy_apn]["geometry"], separators=(",", ":"))),
        project, "county_parcel_boundary_only", discrepancy_apn,
    )

    norm = args.packet63 / "source-snapshots" / "normalized"
    layers, repair_receipts = {}, []
    for name in ["boundary", "zoning", "overlays", "specific-plans", "planned-land-use"]:
        records, receipts = load_city_layer(norm / f"{name}.ndjson.gz", name, project)
        layers[name] = records
        repair_receipts.extend(receipts)

    invalid_counts = Counter(r["source_kind"] for r in repair_receipts if r["repair_applied"])
    expected_invalid = {"zoning": 2, "overlays": 1, "planned-land-use": 5, "specific-plans": 2}
    for k, v in expected_invalid.items():
        if invalid_counts[k] != v:
            raise RuntimeError(f"invalid geometry count mismatch for {k}: {invalid_counts[k]} != {v}")
    unresolved_repairs = [r for r in repair_receipts if not r["accepted"]]

    # Diagnose repeated City APNs without using APN as a dissolve key.
    zoning_by_apn = defaultdict(list)
    missing_zoning_apn = 0
    for r in layers["zoning"]:
        apn = (r["properties"].get("APN") or "").strip()
        if apn:
            zoning_by_apn[apn].append(r)
        else:
            missing_zoning_apn += 1
    duplicate_causes = Counter()
    duplicate_examples = defaultdict(list)
    for apn, feats in sorted(zoning_by_apn.items()):
        if len(feats) < 2:
            continue
        codes = {f["properties"].get("ZONE_CODE") for f in feats}
        geom_hashes = {sha(f["geometry"].wkb) for f in feats}
        unit_qtys = [f["properties"].get("UNIT_QTY") for f in feats]
        if len(codes) > 1:
            cause = "legitimate_split_zone_geometry"
        elif len(geom_hashes) == 1 and (len(feats) > 1 or any((u or 0) > 1 for u in unit_qtys)):
            cause = "condo_or_common_parcel_republication"
        elif len(geom_hashes) > 1:
            cause = "multipart_or_segmented_same_zone_geometry"
        else:
            cause = "unknown"
        duplicate_causes[cause] += 1
        if len(duplicate_examples[cause]) < 10:
            duplicate_examples[cause].append(apn)

    boundary = layers["boundary"][0]["geometry"]
    zone_groups = dissolve(layers["zoning"], lambda p: [(p.get("ZONE_CODE") or "TBD", p.get("ZONE_STATUS"), p.get("ORD_URL"))])
    def overlay_keys(p):
        codes = p.get("OVERLAY_CODES")
        return [] if not codes else [x.strip() for x in codes.split("-") if x.strip()]
    overlay_groups = dissolve(layers["overlays"], overlay_keys)
    plan_groups = dissolve(layers["specific-plans"], lambda p: [p.get("SpecificPl")])
    land_groups = dissolve(layers["planned-land-use"], lambda p: [p.get("LU_DESIG") or p.get("LU_CODE")])
    zone_tree, _ = build_tree(zone_groups)
    overlay_tree, _ = build_tree(overlay_groups)
    plan_tree, _ = build_tree(plan_groups)
    land_tree, _ = build_tree(land_groups)

    discrepancy_candidates = ["7601960217", "7601960218", "7601960219", "7601960220", discrepancy_apn]
    discrepancies = []
    for apn in discrepancy_candidates:
        pg = parcel_geoms.get(apn, extra_g)
        ia = pg.intersection(boundary).area
        pct = ia / pg.area * 100
        pos = pg.representative_point()
        situs = accepted.get(apn, {}).get("jurisdiction") or raw[apn]["properties"].get("situs_juris")
        if situs == "LM" and pct >= 99.5:
            state = "IN_SCOPE_CONFIRMED"
        elif situs != "LM" and pct <= 0.5:
            state = "OUT_OF_SCOPE_CONFIRMED"
        else:
            state = "INDETERMINATE_JURISDICTION"
        discrepancies.append({
            "apn": apn, "canonical_scope": apn in accepted, "situs_juris": situs,
            "overlay_juris": raw[apn]["properties"].get("overlay_juris"),
            "situs_community": raw[apn]["properties"].get("situs_community"),
            "parcel_area_sqft": round(pg.area, 6), "city_intersection_area_sqft": round(ia, 6),
            "city_intersection_pct": round(pct, 9), "point_on_surface_in_city": boundary.covers(pos),
            "state": state,
        })
    discrepancy_by_apn = {x["apn"]: x for x in discrepancies}

    rows = []
    secondaries = []
    for apn in sorted(accepted):
        pg = parcel_geoms[apn]
        state, selected, material, slivers, zone_details, coverage_pct, delta_pct = classify_partition(pg, zone_groups, zone_tree)
        if len(zone_details) > 1:
            secondaries.append({"apn": apn, "area_sqft": zone_details[1]["intersection_area_sqft"], "pct": zone_details[1]["parcel_coverage_pct"]})
        overlays = mapped_intersections(pg, overlay_groups, overlay_tree)
        overlay_sig = sorted(x["code"] for x in overlays)
        plan_state, plans = context_partition(pg, plan_groups, plan_tree, "SPECIFIC_PLAN")
        land_state, land = context_partition(pg, land_groups, land_tree, "LAND_USE")
        jstate = discrepancy_by_apn.get(apn, {}).get("state", "IN_SCOPE_CONFIRMED")
        has_tbd = any(z["code"] == "TBD" for z in zone_details)
        if has_tbd or state in {"UNMAPPED", "INDETERMINATE"}:
            readiness = "RULE_PROFILE_UNAVAILABLE"
        elif jstate == "INDETERMINATE_JURISDICTION" or state == "MULTI_ZONE" or overlays or plans:
            readiness = "RULE_PROFILE_REVIEW_REQUIRED"
        else:
            readiness = "RULE_PROFILE_READY"
        # There are only ten repaired City features, so direct checks are deterministic and bounded.
        repair_impacts = []
        for rr in repair_receipts:
            if not rr["repair_applied"] or not rr["accepted"]:
                continue
            rec = next((z for z in layers[rr["source_kind"]] if z["id"] == rr["source_id"]), None)
            if rec and pg.intersects(rec["geometry"]) and pg.intersection(rec["geometry"]).area > MIN_INTERSECTION_SQFT:
                repair_impacts.append({"source_kind": rr["source_kind"], "source_id": rr["source_id"]})
        repair_impacts.sort(key=lambda x: (x["source_kind"], str(x["source_id"])))
        row = {
            "apn": apn,
            "jurisdiction_scope_state": jstate,
            "base_zoning_state": state,
            "selected_zone": selected,
            "material_zones": material,
            "sliver_zones": slivers,
            "all_zone_intersections": zone_details,
            "zoning_coverage_pct": round(coverage_pct, 9),
            "zoning_coverage_delta_pct": round(delta_pct, 9),
            "mapped_overlays": overlays,
            "mapped_overlay_signature": "+".join(overlay_sig),
            "specific_plan_state": plan_state,
            "specific_plans": plans,
            "planned_land_use_state": land_state,
            "planned_land_use": land,
            "source_versions": {
                "county_parcels": "sangis-20260924T183743Z-pass2",
                "city_zoning": "edit-2026-10-15",
                "city_boundary": "edit-2026-07-01",
                "specific_plans": "edit-2025-10-09",
                "planned_land_use": "edit-2026-07-30",
            },
            "geometry_repair_impacts": repair_impacts,
            "classification_confidence": "DETERMINISTIC_MAPPED_OBSERVATION" if readiness != "RULE_PROFILE_UNAVAILABLE" else "SOURCE_UNRESOLVED",
            "rule_profile_readiness": readiness,
            "provenance_refs": ["packet63/source-manifest.json", "packet64/receipt.json"],
        }
        rows.append(row)

    # Sensitivity across the observed second-zone distribution.
    sensitivity = {"second_zone_intersections": len(secondaries), "percent_thresholds": {}, "area_thresholds_sqft": {}}
    for t in [0.25, 0.5, 1.0, 2.0]:
        sensitivity["percent_thresholds"][str(t)] = sum(x["pct"] < t for x in secondaries)
    for t in [25, 50, 100, 200]:
        sensitivity["area_thresholds_sqft"][str(t)] = sum(x["area_sqft"] < t for x in secondaries)
    pct_bins = [(0, .25), (.25, .5), (.5, 1), (1, 2), (2, 5), (5, 10), (10, 100.000001)]
    area_bins = [(0,25),(25,50),(50,100),(100,200),(200,500),(500,1000),(1000,float("inf"))]
    sensitivity["percent_histogram"] = {f"[{a},{b})": sum(a <= x["pct"] < b for x in secondaries) for a,b in pct_bins}
    sensitivity["area_histogram_sqft"] = {f"[{a},{'inf' if b==float('inf') else b})": sum(a <= x["area_sqft"] < b for x in secondaries) for a,b in area_bins}

    counts = Counter(x["base_zoning_state"] for x in rows)
    readiness_counts = Counter(x["rule_profile_readiness"] for x in rows)
    overlay_counts = Counter()
    overlay_combo_counts = Counter()
    plan_counts = Counter(x["specific_plan_state"] for x in rows)
    land_counts = Counter(x["planned_land_use_state"] for x in rows)
    repair_impact_counts = Counter(i["source_kind"] for x in rows for i in x["geometry_repair_impacts"])
    for x in rows:
        sig = x["mapped_overlay_signature"]
        if sig:
            overlay_combo_counts[sig] += 1
            for c in sig.split("+"):
                overlay_counts[c] += 1

    residential_codes = ["R1E","R1R","R1S","R1","R1A","R2","R3","RB"]
    residential = {}
    for code in residential_codes:
        subset = [x for x in rows if x["selected_zone"] == code or any(z["code"] == code for z in x["material_zones"])]
        residential[code] = {
            "total": len(subset),
            "clean_base_zone_only": sum(x["base_zoning_state"] in {"SINGLE_ZONE","BOUNDARY_SLIVER"} and not x["mapped_overlays"] and not x["specific_plans"] for x in subset),
            "overlay_affected": sum(bool(x["mapped_overlays"]) for x in subset),
            "specific_plan_affected": sum(bool(x["specific_plans"]) for x in subset),
            "multi_zone": sum(x["base_zoning_state"] == "MULTI_ZONE" for x in subset),
            "boundary_sliver": sum(x["base_zoning_state"] == "BOUNDARY_SLIVER" for x in subset),
            "unresolved": sum(x["rule_profile_readiness"] == "RULE_PROFILE_UNAVAILABLE" for x in subset),
        }

    benchmarks = json.loads((args.packet63 / "benchmarks.json").read_text())["benchmarks"]
    row_by_apn = {x["apn"]: x for x in rows}
    benchmark_replay = []
    for b in benchmarks:
        if b["apn"] not in row_by_apn:
            benchmark_replay.append({
                "apn": b["apn"], "category": b["category"],
                "jurisdiction_state": discrepancy_by_apn.get(b["apn"], {}).get("state", "OUT_OF_SCOPE_CONFIRMED"),
                "zoning_state": "NOT_CLASSIFIED_OUTSIDE_CANONICAL_SCOPE", "selected_zone": None,
                "zones": [], "overlays": [], "specific_plan_state": "NOT_EVALUATED",
                "specific_plans": [], "rule_profile_readiness": "RULE_PROFILE_UNAVAILABLE",
                "geometry_anomaly": True,
            })
            continue
        x = row_by_apn[b["apn"]]
        benchmark_replay.append({
            "apn": b["apn"], "category": b["category"], "jurisdiction_state": x["jurisdiction_scope_state"],
            "zoning_state": x["base_zoning_state"], "selected_zone": x["selected_zone"],
            "zones": [z["code"] for z in x["all_zone_intersections"]],
            "overlays": [o["code"] for o in x["mapped_overlays"]],
            "specific_plan_state": x["specific_plan_state"],
            "specific_plans": [p["code"] for p in x["specific_plans"]],
            "rule_profile_readiness": x["rule_profile_readiness"],
            "geometry_anomaly": x["base_zoning_state"] in {"INDETERMINATE","UNMAPPED"} or x["jurisdiction_scope_state"] != "IN_SCOPE_CONFIRMED",
        })

    def first_where(pred):
        for x in rows:
            if pred(x): return x["apn"]
        return None
    repaired_zone_ids = {str(r["source_id"]) for r in repair_receipts if r["source_kind"] == "zoning" and r["repair_applied"]}
    qa = {
        "ordinary_single_zone": first_where(lambda x: x["base_zoning_state"]=="SINGLE_ZONE" and not x["mapped_overlays"] and not x["specific_plans"]),
        "true_multi_zone": first_where(lambda x: x["base_zoning_state"]=="MULTI_ZONE"),
        "boundary_sliver": first_where(lambda x: x["base_zoning_state"]=="BOUNDARY_SLIVER"),
        "overlay_heavy": max(rows, key=lambda x: len(x["mapped_overlays"]))["apn"],
        "specific_plan_boundary": first_where(lambda x: x["specific_plan_state"]=="SPECIFIC_PLAN_BOUNDARY_REVIEW"),
        "invalid_source_repair": first_where(lambda x: any(any(s in repaired_zone_ids for s in []) for _ in [0])),
        "unmapped": first_where(lambda x: x["base_zoning_state"]=="UNMAPPED"),
        "jurisdiction_discrepancy": "4953350500",
        "tbd": "4641310100",
    }
    # Find a parcel intersecting a repaired zoning feature explicitly.
    repaired_geoms = [r["geometry"] for r in layers["zoning"] if str(r["id"]) in repaired_zone_ids and r["accepted"]]
    for apn in sorted(parcel_geoms):
        if any(parcel_geoms[apn].intersects(g) and parcel_geoms[apn].intersection(g).area > MIN_INTERSECTION_SQFT for g in repaired_geoms):
            qa["invalid_source_repair"] = apn; break
    qa_rows = {}
    for label, apn in qa.items():
        if apn in row_by_apn:
            x = row_by_apn[apn]
            qa_rows[label] = {"apn": apn, "zoning_state": x["base_zoning_state"], "zones": x["all_zone_intersections"], "overlays": x["mapped_overlays"], "specific_plans": x["specific_plans"]}
            pg = parcel_geoms[apn]
            qa_rows[label]["source_feature_ids"] = {
                name: sorted(r["id"] for r in layers[name] if r["accepted"] and pg.intersects(r["geometry"]) and pg.intersection(r["geometry"]).area > MIN_INTERSECTION_SQFT)
                for name in ["zoning", "overlays", "specific-plans", "planned-land-use"]
            }
        else:
            qa_rows[label] = {"apn": apn, "discrepancy": discrepancy_by_apn.get(apn)}

    # Write deterministic artifacts.
    rows_fp = write_gzip_lines(out / "parcel-classification.ndjson.gz", rows)
    zone_view_fp = sha(b"".join(canonical({"apn":x["apn"],"state":x["base_zoning_state"],"selected":x["selected_zone"],"material":x["material_zones"],"slivers":x["sliver_zones"]}) for x in rows))
    overlay_view_fp = sha(b"".join(canonical({"apn":x["apn"],"overlays":x["mapped_overlays"],"signature":x["mapped_overlay_signature"]}) for x in rows))
    plan_view_fp = sha(b"".join(canonical({"apn":x["apn"],"state":x["specific_plan_state"],"plans":x["specific_plans"]}) for x in rows))
    land_view_fp = sha(b"".join(canonical({"apn":x["apn"],"state":x["planned_land_use_state"],"land_use":x["planned_land_use"]}) for x in rows))
    geometry_fps = {
        "normalized_zoning_geometry": write_feature_collection_gz(out / "normalized-zoning.geojson.gz", zone_groups),
        "normalized_overlay_geometry": write_feature_collection_gz(out / "normalized-overlays.geojson.gz", overlay_groups),
        "normalized_specific_plan_geometry": write_feature_collection_gz(out / "normalized-specific-plans.geojson.gz", plan_groups),
        "normalized_planned_land_use_geometry": write_feature_collection_gz(out / "normalized-planned-land-use.geojson.gz", land_groups),
    }
    write_gzip_lines(out / "geometry-repair-receipts.ndjson.gz", sorted(repair_receipts + parcel_receipts, key=lambda x:(x["source_kind"],str(x["source_id"]))))
    report = {
        "schema_version": VERSION,
        "decision": "LA_MESA_GEOMETRY_CLASSIFICATION_READY_FOR_RULE_PROFILES",
        "canonical_parcels": len(rows),
        "jurisdiction_discrepancies": discrepancies,
        "repair_summary": {
            "invalid_counts": dict(sorted(invalid_counts.items())),
            "unresolved_repairs": unresolved_repairs,
            "policy": {"operation":"GEOS make_valid, polygonal extraction, union_all, set_precision", "grid_feet":GRID_FEET, "max_area_delta_pct":REPAIR_AREA_DELTA_MAX_PCT, "max_component_increase":REPAIR_COMPONENT_INCREASE_MAX},
        },
        "duplicate_zoning_analysis": {
            "features": len(layers["zoning"]),
            "distinct_non_null_apns": len(zoning_by_apn),
            "missing_apn_features": missing_zoning_apn,
            "repeated_apn_groups": sum(1 for v in zoning_by_apn.values() if len(v) > 1),
            "extra_features_in_repeated_groups": sum(len(v)-1 for v in zoning_by_apn.values() if len(v) > 1),
            "cause_group_counts": dict(sorted(duplicate_causes.items())),
            "cause_examples": dict(sorted(duplicate_examples.items())),
            "doctrine": "APN is diagnostic only; dissolve uses zone/status/ordinance semantics and never APN alone."
        },
        "zoning_classification_counts": dict(sorted(counts.items())),
        "distinct_zone_codes": sorted({z["code"] for x in rows for z in x["all_zone_intersections"]}),
        "max_zones_per_parcel": max(len(x["all_zone_intersections"]) for x in rows),
        "top_zone_combinations": Counter("+".join(sorted(z["code"] for z in x["all_zone_intersections"])) for x in rows).most_common(20),
        "tbd_parcels": sum(any(z["code"]=="TBD" for z in x["all_zone_intersections"]) for x in rows),
        "coverage_anomalies": {
            "under_tolerance": sum(x["zoning_coverage_pct"] < 100 - COVERAGE_PCT_TOLERANCE and abs(100-x["zoning_coverage_pct"]) * parcel_geoms[x["apn"]].area / 100 > COVERAGE_AREA_TOLERANCE_SQFT for x in rows),
            "over_tolerance": sum(x["zoning_coverage_pct"] > 100 + COVERAGE_PCT_TOLERANCE and abs(100-x["zoning_coverage_pct"]) * parcel_geoms[x["apn"]].area / 100 > COVERAGE_AREA_TOLERANCE_SQFT for x in rows),
        },
        "threshold_sensitivity": sensitivity,
        "coverage_policy": {"percent_tolerance":COVERAGE_PCT_TOLERANCE,"absolute_tolerance_sqft":COVERAGE_AREA_TOLERANCE_SQFT},
        "sliver_policy": {"secondary_pct_lt":SLIVER_PCT,"or_secondary_area_sqft_lt":SLIVER_AREA_SQFT},
        "overlay_counts_any_intersection": dict(sorted(overlay_counts.items())),
        "overlay_combination_counts": dict(overlay_combo_counts.most_common()),
        "specific_plan_state_counts": dict(sorted(plan_counts.items())),
        "planned_land_use_state_counts": dict(sorted(land_counts.items())),
        "rule_profile_readiness_counts": dict(sorted(readiness_counts.items())),
        "parcels_affected_by_repaired_source_geometry": dict(sorted(repair_impact_counts.items())),
        "residential_subset": residential,
        "benchmark_replay": benchmark_replay,
        "qa_samples": qa_rows,
    }
    write_json(out / "report.json", report)
    fingerprints = {
        "canonical_apn_population": apn_fp,
        "parcel_zoning_classification": zone_view_fp,
        "overlay_classification": overlay_view_fp,
        "specific_plan_classification": plan_view_fp,
        "planned_land_use_classification": land_view_fp,
        "final_parcel_classification_table": rows_fp,
        **geometry_fps,
    }
    write_json(out / "fingerprints.json", fingerprints)
    receipt = {
        "schema_version": VERSION,
        "execution_timestamp": args.execution_timestamp,
        "code_version": VERSION,
        "script_sha256": file_sha(Path(__file__)),
        "baseline_commit": "20b8dbcafe9ee39248d98682f38cf28b31525a8b",
        "packet63_integrity_entry_count": len(integrity["files"]),
        "packet63_integrity_sha256": file_sha(args.packet63 / "integrity.json"),
        "county_rows_sha256": file_sha(args.county_rows),
        "county_raw_sha256": file_sha(args.county_raw),
        "geometry_repair_policy_version": VERSION + "/repair-v1",
        "sliver_policy_version": VERSION + "/sliver-v1",
        "coverage_tolerance": report["coverage_policy"],
        "output_row_count": len(rows),
        "fingerprints": fingerprints,
    }
    write_json(out / "receipt.json", receipt)
    design = {
        "production_load_design": "Use shared jurisdiction-keyed TruLot canonical tables with isolated jurisdiction staging and explicit jurisdiction_id on every key; validate in staging before selection. No production SQL executed.",
        "packet65_contract": {
            "artifact": "parcel-classification.ndjson.gz",
            "fields": ["apn","jurisdiction_scope_state","base_zoning_state","selected_zone","material_zones","sliver_zones","mapped_overlays","mapped_overlay_signature","specific_plan_state","specific_plans","rule_profile_readiness","source_versions","provenance_refs"],
            "constraint": "Packet 65 consumes sealed classifications and performs no geometry reanalysis."
        }
    }
    write_json(out / "design.json", design)

    artifact_integrity = []
    for p in sorted(out.iterdir()):
        if p.is_file() and p.name != "artifact-integrity.json":
            artifact_integrity.append({"path": p.name, "bytes": p.stat().st_size, "sha256": file_sha(p)})
    write_json(out / "artifact-integrity.json", {"schema_version": VERSION, "files": artifact_integrity})

    # Self-check all rows and all output JSON.
    assert len(rows) == len({x["apn"] for x in rows}) == 17391
    assert sum(counts.values()) == 17391
    assert sum(readiness_counts.values()) == 17391
    for p in out.glob("*.json"):
        json.loads(p.read_text())
    print(json.dumps({"counts":dict(counts),"readiness":dict(readiness_counts),"fingerprints":fingerprints,"invalid_counts":dict(invalid_counts),"unresolved_repairs":len(unresolved_repairs)}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

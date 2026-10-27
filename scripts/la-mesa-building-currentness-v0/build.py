#!/usr/bin/env python3
"""Build Packet 75 from the immutable Packet 72 outline snapshot.

The committed artifact intentionally omits raw outline polygons. The source
snapshot remains an internal input because SanGIS/SANDAG redistribution rights
have not been cleared.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

from pyproj import Transformer
from shapely import from_geojson, make_valid, normalize, to_wkb
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

VERSION = "la-mesa-building-currentness-v0"
CANONICAL_APN_SHA = "11440df9a1fb2a72592000dc656f75dcec9bf7ed9d90e9efcb9ebba8e700a467"
SOURCE_CONTENT_SHA = "1895e34e2b26b6fd018ff775733d532de0451773c9a396b292fc2b40650166f5"
OBSERVATION_DATE = "2017-Spring"
PUBLICATION_DATE = "2018-08-02"
RETRIEVAL_DATE = "2026-10-26"

DEFAULT_THRESHOLDS = {
    "minimumSecondaryAreaSqft": 120.0,
    "maximumSecondaryAreaSqft": 1200.0,
    "minimumSecondaryToPrimaryRatio": 0.05,
    "maximumSecondaryToPrimaryRatio": 0.45,
    "minimumSeparationFeet": 3.0,
    "minimumParcelCoverageRatio": 0.90,
    "minimumParcelEdgeClearanceFeet": 0.0,
}


def canonical(obj) -> bytes:
    return (json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()


def file_sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, indent=2, sort_keys=True, ensure_ascii=False) + "\n")


def write_gzip_rows(path: Path, rows) -> str:
    content_hash = hashlib.sha256()
    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, compresslevel=9, mtime=0) as out:
            for row in rows:
                line = canonical(row)
                content_hash.update(line)
                out.write(line)
    return content_hash.hexdigest()


def polygonal(geom):
    if isinstance(geom, (Polygon, MultiPolygon)):
        return geom
    if isinstance(geom, GeometryCollection):
        parts = [g for g in geom.geoms if isinstance(g, (Polygon, MultiPolygon)) and not g.is_empty]
        return unary_union(parts) if parts else Polygon()
    return Polygon()


def load_json(path: Path):
    return json.loads(path.read_text())


def load_gzip_rows(path: Path):
    with gzip.open(path, "rt") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def classify_currentness(count, ambiguous, assessor_state, permit_state):
    if permit_state in {"LATER_PERMIT_CHANGE_OBSERVED", "ACTIVE_CHANGE_IN_PROGRESS"}:
        return "LATER_CHANGE_OBSERVED"
    if count == 0 or ambiguous:
        return "CURRENTNESS_UNKNOWN"
    if permit_state == "NO_PERMIT_CHANGE_FOUND":
        return "NO_LATER_CHANGE_KNOWN"
    if assessor_state and assessor_state != "RECORDED_TYPE_UNKNOWN":
        return "CURRENTNESS_PARTIAL"
    return "OBSERVATIONAL_STALE"


def accessory_candidate(secondary, primary, thresholds):
    ratio = secondary["area"] / primary["area"]
    return (
        thresholds["minimumSecondaryAreaSqft"] <= secondary["area"] <= thresholds["maximumSecondaryAreaSqft"]
        and thresholds["minimumSecondaryToPrimaryRatio"] <= ratio <= thresholds["maximumSecondaryToPrimaryRatio"]
        and secondary["separation"] >= thresholds["minimumSeparationFeet"]
        and secondary["coverage"] >= thresholds["minimumParcelCoverageRatio"]
        and secondary["edge_clearance"] >= thresholds["minimumParcelEdgeClearanceFeet"]
    )


def candidate_count(groups, thresholds):
    count = 0
    for rows in groups.values():
        if len(rows) < 2 or any(r["ambiguous"] for r in rows):
            continue
        ordered = sorted(rows, key=lambda r: (-r["area"], r["observation_id"]))
        if any(accessory_candidate(row, ordered[0], thresholds) for row in ordered[1:]):
            count += 1
    return count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--building-snapshot", type=Path, default=Path("/private/tmp/la-mesa-building-outlines.ndjson.gz"))
    parser.add_argument("--parcel-geometries", type=Path, default=Path("/private/tmp/trulot-p64-lm-parcels.geojsonl"))
    parser.add_argument("--output", type=Path, default=Path("data/la-mesa-building-currentness-v0"))
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    output = args.output if args.output.is_absolute() else root / args.output
    output.mkdir(parents=True, exist_ok=True)

    serving = list(load_gzip_rows(root / "data/la-mesa-parcel-lookup-serving-v0/serving-rows.ndjson.gz"))
    canonical_apns = sorted(row["apnNormalized"] for row in serving)
    assert len(canonical_apns) == 17391 and len(set(canonical_apns)) == 17391
    assert hashlib.sha256(("\n".join(canonical_apns) + "\n").encode()).hexdigest() == CANONICAL_APN_SHA
    canonical_set = set(canonical_apns)

    project = Transformer.from_crs("EPSG:4326", "EPSG:2230", always_xy=True).transform
    unproject = Transformer.from_crs("EPSG:2230", "EPSG:4326", always_xy=True).transform
    parcels = []
    with args.parcel_geometries.open() as f:
        for line in f:
            feature = json.loads(line)
            apn = feature["properties"]["apn"]
            if apn not in canonical_set:
                continue
            geom = polygonal(make_valid(transform(project, from_geojson(json.dumps(feature["geometry"])))))
            assert not geom.is_empty and geom.is_valid
            parcels.append({"apn": apn, "geom": geom})
    parcels.sort(key=lambda row: row["apn"])
    assert len(parcels) == 17391
    parcel_geoms = [row["geom"] for row in parcels]
    parcel_tree = STRtree(parcel_geoms)

    source_content_hash = hashlib.sha256()
    normalized_hash = hashlib.sha256()
    outlines = []
    invalid_before = repaired = invalid_after = 0
    with gzip.open(args.building_snapshot, "rt") as f:
        for line_number, line in enumerate(f, 1):
            source_content_hash.update(line.encode())
            feature = json.loads(line)
            original = from_geojson(json.dumps(feature["geometry"], separators=(",", ":")))
            projected = transform(project, original)
            if not projected.is_valid:
                invalid_before += 1
                projected = polygonal(make_valid(projected))
                repaired += 1
            projected = normalize(projected)
            if projected.is_empty or not projected.is_valid:
                invalid_after += 1
                continue
            source_id = str(feature["properties"]["objectid_1"])
            normalized_hash.update(canonical({"sourceId": source_id, "wkb": to_wkb(projected, hex=True)}))
            outlines.append({
                "source_id": source_id,
                "geom": projected,
                "rep": projected.representative_point(),
                "area": projected.area,
                "geometry_sha": hashlib.sha256(projected.wkb).hexdigest(),
                "source_line": line_number,
            })
    assert len(outlines) == 30999 and source_content_hash.hexdigest() == SOURCE_CONTENT_SHA

    groups = defaultdict(list)
    outline_assignment_counts = Counter()
    assigned_outline_ids = set()
    for outline in outlines:
        candidate_indices = [int(i) for i in parcel_tree.query(outline["rep"])]
        assigned = sorted(
            {parcels[i]["apn"] for i in candidate_indices if parcel_geoms[i].covers(outline["rep"])}
        )
        if not assigned:
            continue
        assigned_outline_ids.add(outline["source_id"])
        outline_assignment_counts[len(assigned)] += 1
        parcel_by_apn = {parcels[i]["apn"]: parcels[i]["geom"] for i in candidate_indices if parcels[i]["apn"] in assigned}
        lonlat = transform(unproject, outline["rep"])
        for apn in assigned:
            parcel = parcel_by_apn[apn]
            intersection_area = outline["geom"].intersection(parcel).area
            groups[apn].append({
                "apn": apn,
                "source_id": outline["source_id"],
                "observation_id": f"SANGIS-2017-{outline['source_id']}-{apn}",
                "geom": outline["geom"],
                "area": outline["area"],
                "intersection_area": intersection_area,
                "coverage": intersection_area / outline["area"] if outline["area"] else 0,
                "rep_lon": lonlat.x,
                "rep_lat": lonlat.y,
                "edge_clearance": outline["geom"].distance(parcel.boundary) if parcel.covers(outline["geom"]) else 0.0,
                "candidate_apns": assigned,
                "ambiguous": len(assigned) > 1,
                "geometry_sha": outline["geometry_sha"],
                "source_line": outline["source_line"],
            })

    # Compute within-parcel relationship and deterministic roles.
    for apn, rows in groups.items():
        ordered = sorted(rows, key=lambda row: (-row["area"], row["observation_id"]))
        primary = ordered[0]
        for row in rows:
            row["separation"] = 0.0 if row is primary else row["geom"].distance(primary["geom"])
            row["relation"] = "NOT_APPLICABLE" if row is primary else ("DETACHED" if row["separation"] > 0 else "ATTACHED_OR_TOUCHING")
            if row["ambiguous"]:
                row["role"] = "STACKED_PARCEL_FOOTPRINT"
                row["accessory"] = False
            elif row is primary:
                row["role"] = "PRIMARY_FOOTPRINT_CANDIDATE"
                row["accessory"] = False
            else:
                row["accessory"] = accessory_candidate(row, primary, DEFAULT_THRESHOLDS)
                row["role"] = "SECONDARY_FOOTPRINT_CANDIDATE" if row["accessory"] else "AMBIGUOUS_FOOTPRINT"

    assessor = {row["apn"]: row for row in load_gzip_rows(root / "data/la-mesa-assessor-property-intelligence-v0/property-characteristics.ndjson.gz")}
    permits = load_json(root / "data/la-mesa-permit-intelligence-v0/cohort-results.json")["rows"]
    permit_by_apn = {row["apn"]: row for row in permits}
    classifications = {row["apn"]: row for row in load_gzip_rows(root / "data/la-mesa-geometry-classification-v0/artifacts/parcel-classification.ndjson.gz")}

    observation_rows = []
    summary_rows = []
    for apn in canonical_apns:
        rows = sorted(groups.get(apn, []), key=lambda row: row["observation_id"])
        assessor_row = assessor[apn]
        assessor_state = assessor_row["preliminaryDwellingState"]
        permit_state = permit_by_apn.get(apn, {}).get("currentnessState")
        ambiguous = any(row["ambiguous"] for row in rows)
        composed = classify_currentness(len(rows), ambiguous, assessor_state, permit_state)
        for row in rows:
            observation_rows.append({
                "jurisdiction": "CITY_OF_LA_MESA",
                "apn": apn,
                "observationId": row["observation_id"],
                "sourceId": row["source_id"],
                "sourceAuthority": "OBSERVATIONAL_GEOMETRY",
                "geometryDate": OBSERVATION_DATE,
                "sourcePublicationDate": PUBLICATION_DATE,
                "retrievalDate": RETRIEVAL_DATE,
                "footprintAreaSqft": round(row["area"], 2),
                "parcelIntersectionAreaSqft": round(row["intersection_area"], 2),
                "parcelCoverageRatio": round(row["coverage"], 6),
                "representativePoint": {"longitude": round(row["rep_lon"], 7), "latitude": round(row["rep_lat"], 7)},
                "relationToLargestFootprint": row["relation"],
                "separationFromLargestFeet": round(row["separation"], 2),
                "parcelEdgeClearanceFeet": round(row["edge_clearance"], 2),
                "parcelCandidates": row["candidate_apns"],
                "ambiguityState": "STACKED_OR_COMMON_PARCEL" if row["ambiguous"] else "UNAMBIGUOUS_REPRESENTATIVE_POINT_ASSIGNMENT",
                "role": row["role"],
                "accessoryStructureCandidate": row["accessory"],
                "observationCurrentnessState": "OBSERVATIONAL_STALE",
                "composedCurrentnessState": composed,
                "sourceGeometrySha256": row["geometry_sha"],
                "evidenceReference": f"private-source:SANGIS_BUILDING_OUTLINES_2017#line-{row['source_line']}",
            })
        summary_rows.append({
            "jurisdiction": "CITY_OF_LA_MESA",
            "apn": apn,
            "observedFootprintCount": len(rows),
            "totalObservedFootprintAreaSqft": round(sum(row["area"] for row in rows), 2),
            "largestFootprintAreaSqft": round(max((row["area"] for row in rows), default=0), 2),
            "secondaryFootprintCount": max(0, len(rows) - 1),
            "stackedOrAmbiguousCount": sum(row["ambiguous"] for row in rows),
            "noFootprintState": "NO_FOOTPRINT_OBSERVED_IN_SOURCE" if not rows else None,
            "accessoryStructureCandidate": any(row["accessory"] for row in rows),
            "accessoryStructureCandidateCount": sum(row["accessory"] for row in rows),
            "observationalCurrentnessState": composed,
            "assessorState": assessor_state,
            "permitChangeState": permit_state or "PERMIT_EVIDENCE_NOT_IN_BOUNDED_COHORT",
            "geometryDate": OBSERVATION_DATE,
            "sourceAuthority": "OBSERVATIONAL_GEOMETRY",
            "qualifier": "Footprints are observational, not legal dwelling or use evidence; current existence requires confirmation.",
        })

    obs_content_sha = write_gzip_rows(output / "structure-observations.ndjson.gz", observation_rows)
    summaries_content_sha = write_gzip_rows(output / "parcel-structure-summaries.ndjson.gz", summary_rows)
    summary_by_apn = {row["apn"]: row for row in summary_rows}

    population = {
        "schemaVersion": VERSION,
        "denominator": 17391,
        "observationsAssignedToParcels": len(observation_rows),
        "uniqueSourceOutlinesAssigned": len(assigned_outline_ids),
        "outlineFeaturesMatchingMultipleApns": sum(v for k, v in outline_assignment_counts.items() if k > 1),
        "noFootprint": sum(row["observedFootprintCount"] == 0 for row in summary_rows),
        "oneFootprint": sum(row["observedFootprintCount"] == 1 for row in summary_rows),
        "multipleFootprints": sum(row["observedFootprintCount"] > 1 for row in summary_rows),
        "stackedOrAmbiguous": sum(row["stackedOrAmbiguousCount"] > 0 for row in summary_rows),
        "accessoryStructureCandidate": sum(row["accessoryStructureCandidate"] for row in summary_rows),
        "currentnessStates": dict(sorted(Counter(row["observationalCurrentnessState"] for row in summary_rows).items())),
        "caution": "Counts describe observational outline coverage and must not be read as dwelling coverage.",
    }
    write_json(output / "population-metrics.json", population)

    matrix = Counter()
    for row in summary_rows:
        count_state = "NO_FOOTPRINT" if row["observedFootprintCount"] == 0 else ("ONE_FOOTPRINT" if row["observedFootprintCount"] == 1 else "MULTIPLE_FOOTPRINTS")
        ambiguity = "STACKED_OR_AMBIGUOUS" if row["stackedOrAmbiguousCount"] else "UNAMBIGUOUS"
        matrix[f"{row['assessorState']}::{count_state}::{ambiguity}"] += 1
    write_json(output / "assessor-footprint-matrix.json", {
        "schemaVersion": VERSION,
        "cells": [{"combination": key, "count": value} for key, value in sorted(matrix.items())],
        "highlighted": {
            "recordedSingleFamilyLikelyOneFootprint": matrix["RECORDED_SINGLE_FAMILY_LIKELY::ONE_FOOTPRINT::UNAMBIGUOUS"],
            "recordedSingleFamilyLikelyMultipleFootprints": matrix["RECORDED_SINGLE_FAMILY_LIKELY::MULTIPLE_FOOTPRINTS::UNAMBIGUOUS"],
            "recordedMultifamilyLikelyOneFootprint": matrix["RECORDED_MULTIFAMILY_LIKELY::ONE_FOOTPRINT::UNAMBIGUOUS"],
            "recordedMultifamilyLikelyMultipleFootprints": matrix["RECORDED_MULTIFAMILY_LIKELY::MULTIPLE_FOOTPRINTS::UNAMBIGUOUS"],
            "condoStackedGeometry": sum(v for k, v in matrix.items() if k.startswith("RECORDED_CONDO::") and k.endswith("STACKED_OR_AMBIGUOUS")),
            "unknownNoFootprint": sum(v for k, v in matrix.items() if k.startswith("RECORDED_TYPE_UNKNOWN::NO_FOOTPRINT")),
        },
        "interpretation": "Geometry can tailor questions, but it does not establish use, dwelling count, or current legal configuration.",
    })

    sensitivity = []
    scenarios = [
        ("selected", DEFAULT_THRESHOLDS),
        ("ratio_conservative", {**DEFAULT_THRESHOLDS, "maximumSecondaryToPrimaryRatio": 0.30}),
        ("ratio_permissive", {**DEFAULT_THRESHOLDS, "maximumSecondaryToPrimaryRatio": 0.60}),
        ("area_conservative", {**DEFAULT_THRESHOLDS, "minimumSecondaryAreaSqft": 200.0, "maximumSecondaryAreaSqft": 1000.0}),
        ("area_permissive", {**DEFAULT_THRESHOLDS, "minimumSecondaryAreaSqft": 80.0, "maximumSecondaryAreaSqft": 1500.0}),
        ("separation_conservative", {**DEFAULT_THRESHOLDS, "minimumSeparationFeet": 6.0}),
        ("separation_permissive", {**DEFAULT_THRESHOLDS, "minimumSeparationFeet": 1.0}),
        ("edge_1ft", {**DEFAULT_THRESHOLDS, "minimumParcelEdgeClearanceFeet": 1.0}),
        ("edge_3ft", {**DEFAULT_THRESHOLDS, "minimumParcelEdgeClearanceFeet": 3.0}),
    ]
    for name, thresholds in scenarios:
        sensitivity.append({"scenario": name, "parcelCandidateCount": candidate_count(groups, thresholds), "thresholds": thresholds})
    write_json(output / "candidate-threshold-sensitivity.json", {
        "schemaVersion": VERSION,
        "selectedPolicy": DEFAULT_THRESHOLDS,
        "scenarios": sensitivity,
        "selectionRationale": "The edge threshold remains zero because mapped parcel distance is not a legal setback test. Area, ratio, coverage, and three-foot detached separation bound the observational hint.",
    })

    case_keys = {
        "bruceCourt": "4685100900",
        "finaledAdu": "4641801100",
        "activeDevelopment": "4944102400",
        "condoCommonAddress": "4640203301",
        "missingFootprint": "4640202200",
        "secondaryStructurePreview": "4635801000",
    }
    case_results = {}
    for key, apn in case_keys.items():
        row = summary_by_apn[apn]
        case_results[key] = {
            **row,
            "safeConclusion": {
                "bruceCourt": "Recorded single-family preselection remains usable with confirmation. The 2017 outline is stale observational support; it establishes neither current as-built configuration nor an accessory structure.",
                "finaledAdu": "A finaled detached-ADU record postdates the outline source. The old observations are stale for current configuration and cannot locate or size the later structure.",
                "activeDevelopment": "Active development postdates the outline source. Old geometry is stale/insufficient and the current configuration remains unresolved.",
                "condoCommonAddress": "Shared physical geometry is common-parcel evidence only. It cannot be assigned to an individual condo unit or produce an accessory candidate.",
                "missingFootprint": "No outline was observed in the source. This does not establish vacancy, absence of a building, or absence of a dwelling.",
                "secondaryStructurePreview": "Recorded single-family context and two unambiguous old outlines support a question only: Older mapping shows a detached secondary structure. Is that structure still there?",
            }[key],
        }
    write_json(output / "case-results.json", {"schemaVersion": VERSION, "cases": case_results})

    candidate_summaries = [row for row in summary_rows if row["accessoryStructureCandidate"]]
    question_safe = [row for row in candidate_summaries if row["observationalCurrentnessState"] not in {"LATER_CHANGE_OBSERVED", "CURRENTNESS_UNKNOWN"}]
    write_json(output / "accessory-candidate-uplift.json", {
        "schemaVersion": VERSION,
        "candidateParcels": len(candidate_summaries),
        "questionTailoringEligibleWithConfirmation": len(question_safe),
        "recordedSingleFamilyLikelyCandidates": sum(row["assessorState"] == "RECORDED_SINGLE_FAMILY_LIKELY" for row in candidate_summaries),
        "suppressedForLaterChangeOrUnknownCurrentness": len(candidate_summaries) - len(question_safe),
        "example": {
            "apn": "4635801000",
            "address": "6795 COLORADO AVE",
            "geometryDate": OBSERVATION_DATE,
            "prompt": "Older mapping shows a detached secondary structure. Is that structure still there?",
            "answers": ["Yes", "No", "Not sure"],
            "limitations": "The hint does not classify use, prove current existence, or remove homeowner confirmation.",
        },
    })

    cohort_rows = []
    for permit_row in permits:
        apn = permit_row["apn"]
        summary = summary_by_apn[apn]
        classification = classifications[apn]
        categories = set(permit_row["categories"])
        categories.add("NO_FOOTPRINT" if summary["observedFootprintCount"] == 0 else ("ONE_FOOTPRINT" if summary["observedFootprintCount"] == 1 else "MULTIPLE_FOOTPRINTS"))
        categories.add(summary["assessorState"])
        if summary["accessoryStructureCandidate"]:
            categories.add("ACCESSORY_STRUCTURE_CANDIDATE")
        cohort_rows.append({
            "apn": apn,
            "address": permit_row.get("address"),
            "categories": sorted(categories),
            "baseZone": classification.get("selected_zone"),
            "mappedOverlays": classification.get("mapped_overlay_signature", ""),
            "observedFootprintCount": summary["observedFootprintCount"],
            "stackedOrAmbiguousCount": summary["stackedOrAmbiguousCount"],
            "accessoryStructureCandidate": summary["accessoryStructureCandidate"],
            "currentnessState": summary["observationalCurrentnessState"],
            "safeForQuestionTailoring": summary["accessoryStructureCandidate"] and summary["observationalCurrentnessState"] not in {"LATER_CHANGE_OBSERVED", "CURRENTNESS_UNKNOWN"},
        })
    write_json(output / "cohort-results.json", {
        "schemaVersion": VERSION,
        "size": len(cohort_rows),
        "rows": cohort_rows,
        "coverage": dict(sorted(Counter(category for row in cohort_rows for category in row["categories"]).items())),
    })

    source_receipt = {
        "schemaVersion": VERSION,
        "source": {
            "name": "SanGIS BUILDING_OUTLINES",
            "url": "https://gis.sangis.org/maps/rest/services/Public/Basemap/MapServer/5036",
            "layer": 5036,
            "authority": "OBSERVATIONAL_GEOMETRY",
            "imageryVintage": "Spring 2017 EagleView/Pictometry imagery",
            "sourcePublicationDate": PUBLICATION_DATE,
            "retrievalDate": RETRIEVAL_DATE,
        },
        "capture": {
            "preflightCount": 30994,
            "retainedCaptureCount": len(outlines),
            "preflightToCaptureDrift": 5,
            "transactionalConsistency": "NOT_GUARANTEED",
            "immutableSnapshotRule": "The retained 30,999-feature capture is immutable; Packet 75 made no live source request.",
            "sourceContentSha256": source_content_hash.hexdigest(),
            "compressedFileSha256": file_sha(args.building_snapshot),
            "normalizedGeometrySha256": normalized_hash.hexdigest(),
        },
        "geometryValidity": {
            "inputCount": 30999,
            "invalidBeforeNormalization": invalid_before,
            "repairApplied": repaired,
            "invalidOrEmptyAfterNormalization": invalid_after,
            "validNormalized": len(outlines),
            "areaCrs": "EPSG:2230 US survey feet",
        },
        "license": {
            "internalAnalysis": "Allowed only within current access rights and terms.",
            "publicRedisplay": "Raw footprints and full derived geometry are not authorized for public redistribution.",
            "packetOutput": "Bounded derived observations only; no raw polygon coordinates are committed.",
        },
    }
    write_json(output / "source-receipt.json", source_receipt)

    write_json(output / "structure-observation-schema.json", {
        "schemaVersion": "jurisdiction-neutral-structure-observation-v0",
        "authority": "OBSERVATIONAL_GEOMETRY",
        "requiredFields": ["jurisdiction", "apn", "observationId", "sourceId", "geometryDate", "footprintAreaSqft", "parcelIntersectionAreaSqft", "parcelCoverageRatio", "representativePoint", "relationToLargestFootprint", "ambiguityState", "observationCurrentnessState", "evidenceReference"],
        "roles": ["PRIMARY_FOOTPRINT_CANDIDATE", "SECONDARY_FOOTPRINT_CANDIDATE", "AMBIGUOUS_FOOTPRINT", "STACKED_PARCEL_FOOTPRINT"],
        "currentnessStates": ["OBSERVATIONAL_STALE", "CURRENTNESS_PARTIAL", "LATER_CHANGE_OBSERVED", "NO_LATER_CHANGE_KNOWN", "CURRENTNESS_UNKNOWN"],
        "legalUseField": "PROHIBITED",
        "geometryStorage": "Private source geometry remains referenced by content hash and source line; the bounded committed observation contains a representative point and measurements, not polygons.",
    })

    write_json(output / "doctrine.json", {
        "sourceAuthority": "OBSERVATIONAL_GEOMETRY",
        "allowedUses": ["observed structure presence", "footprint count", "approximate footprint area", "detached-secondary-structure candidate", "geometry-change comparison", "preliminary screening", "question tailoring"],
        "prohibitedInferences": ["legal structure status", "occupancy", "dwelling count", "permitted use", "garage classification", "ADU classification", "current as-built geometry", "compliance"],
        "noFootprint": {"state": "NO_FOOTPRINT_OBSERVED_IN_SOURCE", "notEquivalentTo": ["vacant", "no building", "no dwelling"], "possibleReasons": ["source omission", "later construction", "geometry issue", "stacked parcel behavior"]},
        "multipleFootprints": "May represent a primary and accessory structure, multifamily complex, detached ancillary buildings, commercial buildings, stacked artifacts, or parcel overlap. No use is assigned without corroboration.",
        "questionReduction": "An observational hint may tailor a question but never suppress homeowner confirmation or establish use/current existence.",
        "approvedLanguage": ["Older mapping shows a detached secondary structure on the parcel.", "Is that structure still there?", "Older mapping may no longer reflect the current property configuration."],
        "permitInteraction": {"finaledAduOrAdditionAfter2017": "LATER_CHANGE_OBSERVED", "issuedOrInProgress": "LATER_CHANGE_OBSERVED", "noPermitFound": "NO_LATER_CHANGE_KNOWN is a bounded absence-of-found-change state, never proof of current configuration"},
        "assessorInteraction": "Preserve recorded assessor state and observational footprint state separately. Neither overrides the other; conflicts remain explicit.",
    })

    write_json(output / "runtime-composition-design.json", {
        "futureFlow": ["parcel identity", "zoning/rules", "assessor facts", "permit facts when authorized", "structure observations", "homeowner answers", "currentness/conflict resolution", "V4 feasibility"],
        "privatePreviewIntegration": "NOT_INTEGRATED_RIGHTS_UNRESOLVED",
        "bruceBehavior": "Keep the existing recorded-property confirmation; footprint commentary adds no useful signal.",
        "secondaryCandidateBehavior": {"copy": "Older mapping shows a detached secondary structure. Is that structure still there?", "answers": ["Yes", "No", "Not sure"], "sourceDateVisible": True},
        "currentnessConflictBehavior": "Older mapping may no longer reflect the current property configuration.",
        "rawGeometryInUi": False,
        "publicIndexing": False,
        "permitProductionIntegration": False,
    })

    write_json(output / "storage-design.json", {
        "migrationApplied": False,
        "tables": {
            "structure_observation": ["jurisdiction", "apn", "observation_id", "source_id", "source_receipt_id", "geometry_date", "derived_measurements", "ambiguity_state", "currentness_state", "evidence_reference"],
            "geometry_source_receipt": ["source_id", "authority", "source_url", "observation_date", "publication_date", "retrieval_date", "source_checksum", "normalized_checksum", "rights_state"],
            "structure_currentness": ["jurisdiction", "apn", "state", "assessor_evidence_ref", "permit_evidence_ref", "computed_at"],
            "observation_conflict": ["jurisdiction", "apn", "conflict_type", "evidence_refs", "resolution_state"],
        },
        "jurisdictionNeutral": True,
        "sanDiegoReview": "Schema is reusable because jurisdiction, authority, dates, ambiguity, and evidence are explicit. No San Diego activation or behavior change is made.",
    })

    write_json(output / "use-matrix.json", {
        "pathwaySelection": "GENERALLY_NO_UNLESS_COMBINED_WITH_STRONGER_RECORDED_OR_PERMIT_FACTS",
        "preliminaryScreening": "YES_WITH_OBSERVATIONAL_QUALIFIER",
        "questionTailoring": "YES_WITH_HOMEOWNER_CONFIRMATION",
        "compliance": "NO",
        "currentLegalUnitCount": "NO",
    })

    write_json(output / "decision.json", {
        "decision": "LA_MESA_BUILDING_CURRENTNESS_LAYER_READY",
        "nextStep": "LA_MESA_PROPERTY_INTELLIGENCE_COMPOSITION",
        "basis": ["All canonical parcels receive a bounded structure summary.", "Observation and legal/permit truth remain separate.", "Later-change evidence suppresses stale geometry claims.", "Rights boundaries are explicit and raw polygons are not committed or exposed."],
        "limitations": ["2017 geometry is stale observational evidence.", "Permit currentness is limited to the sealed Packet 74 cohort.", "Public raw/full derived geometry redisplay remains prohibited pending rights clearance.", "No production or private-preview runtime integration occurred."],
    })

    readme = f"""# La Mesa building currentness v0\n\nPacket 75 models the immutable Spring 2017 SanGIS/SANDAG building-outline snapshot as `OBSERVATIONAL_GEOMETRY`. It joins outlines to the {len(canonical_apns):,} canonical Packet 64 APNs, composes bounded Packet 73 assessor and Packet 74 permit states, and emits jurisdiction-neutral records and summaries.\n\nThe artifact never equates footprints with dwellings, legal status, occupancy, or permitted use. A secondary candidate is an observational prompt only. `NO_FOOTPRINT_OBSERVED_IN_SOURCE` does not mean vacant. `NO_LATER_CHANGE_KNOWN` does not prove the old geometry is current.\n\n## Rights boundary\n\nThe raw outline snapshot is not copied here. SanGIS/SANDAG restrictions on resale, repackaging, repurposing, and automatic redistribution remain unresolved for production reuse. This folder contains bounded derived facts for internal analysis. Raw or full derived polygons must not be publicly redistributed. No runtime integration was made.\n\n## Reproduction\n\nThe build requires the sealed private source files and accepts them as explicit arguments:\n\n```text\npython3 scripts/la-mesa-building-currentness-v0/build.py \\\n  --building-snapshot /private/path/la-mesa-building-outlines.ndjson.gz \\\n  --parcel-geometries /private/path/trulot-p64-lm-parcels.geojsonl\npython3 data/la-mesa-building-currentness-v0/validate.py\n```\n\nSource content SHA-256: `{SOURCE_CONTENT_SHA}`.\nObservation rows content SHA-256: `{obs_content_sha}`.\nParcel summaries content SHA-256: `{summaries_content_sha}`.\n"""
    (output / "README.md").write_text(readme)

    manifest = {}
    for path in sorted(output.iterdir()):
        if path.name == "artifact-integrity.json" or not path.is_file():
            continue
        manifest[path.name] = {"bytes": path.stat().st_size, "sha256": file_sha(path)}
    write_json(output / "artifact-integrity.json", {"schemaVersion": VERSION, "algorithm": "sha256", "files": manifest})
    print(json.dumps({"population": population, "observationContentSha256": obs_content_sha, "summaryContentSha256": summaries_content_sha}, indent=2))


if __name__ == "__main__":
    main()

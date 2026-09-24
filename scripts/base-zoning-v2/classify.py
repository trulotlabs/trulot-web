"""Classify deterministic parcel/base-zone mappings from immutable intersections.

Usage: python3 scripts/base-zoning-v2/classify.py INTERSECTIONS_GZ NEW_OUTPUT_DIR
"""
import csv
import gzip
import hashlib
import json
import pathlib
import statistics
import sys


METHOD_VERSION = "base-zoning-city-sd-v2-area-coverage-v1"
FULL_MIN_PERCENT = 99.99
FULL_MAX_PERCENT = 100.01
SLIVER_MAX_PERCENT = 0.01
SLIVER_MAX_AREA_SQFT = 10.0
FIELDS = (
    "parcelAcquisitionId", "parcelSourceObjectId", "apn", "parcelId",
    "geometrySha256", "parcelAreaSqFt", "zoningAcquisitionId",
    "zoningSourceObjectId", "zoneCode", "sourceGeometryState",
    "intersectedAreaSqFt",
)
STATES = ("SINGLE_ZONE", "MULTI_ZONE", "BOUNDARY_SLIVER", "UNMAPPED", "INDETERMINATE")


def sha(path):
    with pathlib.Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def percentile(values, quantile):
    if not values:
        return None
    ordered = sorted(values)
    index = (len(ordered) - 1) * quantile
    low = int(index)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (index - low)


def distribution(values):
    return {
        "min": min(values) if values else None,
        "p01": percentile(values, 0.01),
        "p05": percentile(values, 0.05),
        "p25": percentile(values, 0.25),
        "median": statistics.median(values) if values else None,
        "p75": percentile(values, 0.75),
        "p90": percentile(values, 0.90),
        "p95": percentile(values, 0.95),
        "p99": percentile(values, 0.99),
        "max": max(values) if values else None,
    }


def classify_parcel(parcel, intersections):
    area = float(parcel["parcelAreaSqFt"])
    by_zone = {}
    for item in intersections:
        zone = by_zone.setdefault(item["zoneCode"], {"intersectedAreaSqFt": 0.0, "features": []})
        intersection_area = float(item["intersectedAreaSqFt"])
        zone["intersectedAreaSqFt"] += intersection_area
        zone["features"].append({
            "sourceObjectId": int(item["zoningSourceObjectId"]),
            "sourceGeometryState": item["sourceGeometryState"],
            "intersectedAreaSqFt": intersection_area,
        })
    evidence = []
    for code, item in by_zone.items():
        item["features"].sort(key=lambda value: value["sourceObjectId"])
        evidence.append({
            "zoneCode": code,
            "intersectedAreaSqFt": item["intersectedAreaSqFt"],
            "parcelCoveragePercent": 100.0 * item["intersectedAreaSqFt"] / area,
            "features": item["features"],
        })
    evidence.sort(key=lambda item: (-item["intersectedAreaSqFt"], item["zoneCode"]))
    total_area = sum(item["intersectedAreaSqFt"] for item in evidence)
    total_percent = 100.0 * total_area / area
    repaired = len({feature["sourceObjectId"] for item in evidence for feature in item["features"]
                    if feature["sourceGeometryState"] == "EXPLICIT_MAKE_VALID"})
    secondary_area = sum(item["intersectedAreaSqFt"] for item in evidence[1:])
    secondary_percent = 100.0 * secondary_area / area
    if not evidence:
        state = "UNMAPPED"
    elif total_percent < FULL_MIN_PERCENT or total_percent > FULL_MAX_PERCENT:
        state = "INDETERMINATE"
    elif len(evidence) == 1:
        state = "SINGLE_ZONE"
    elif secondary_percent <= SLIVER_MAX_PERCENT and secondary_area <= SLIVER_MAX_AREA_SQFT:
        state = "BOUNDARY_SLIVER"
    else:
        state = "MULTI_ZONE"
    return {
        "parcelAcquisitionId": parcel["parcelAcquisitionId"],
        "parcelSourceObjectId": int(parcel["parcelSourceObjectId"]),
        "apn": parcel["apn"],
        "parcelId": int(parcel["parcelId"]),
        "geometrySha256": parcel["geometrySha256"],
        "parcelAreaSqFt": area,
        "zoningAcquisitionId": intersections[0]["zoningAcquisitionId"] if intersections else None,
        "mappingMethodVersion": METHOD_VERSION,
        "mappingState": state,
        "dominantZoneCode": evidence[0]["zoneCode"] if evidence else None,
        "dominantCoveragePercent": evidence[0]["parcelCoveragePercent"] if evidence else None,
        "secondaryCoveragePercent": secondary_percent,
        "totalCoveredPercent": total_percent,
        "uncoveredPercent": max(0.0, 100.0 - total_percent),
        "distinctZoneCount": len(evidence),
        "repairedSourceFeatureCount": repaired,
        "zoneEvidence": evidence,
    }


def records(path):
    with gzip.open(path, "rt", newline="") as stream:
        reader = csv.reader(stream, delimiter="\t")
        current_key = None
        parcel = None
        intersections = []
        for values in reader:
            if len(values) != len(FIELDS):
                raise ValueError("Unexpected intersection row width")
            item = dict(zip(FIELDS, (None if value == "\\N" else value for value in values)))
            key = (item["parcelAcquisitionId"], item["parcelSourceObjectId"])
            if current_key is not None and key != current_key:
                yield classify_parcel(parcel, intersections)
                intersections = []
            if key != current_key:
                current_key = key
                parcel = item
            if item["zoningSourceObjectId"] is not None:
                intersections.append(item)
        if current_key is not None:
            yield classify_parcel(parcel, intersections)


def compact_record(record):
    return {
        "parcelAcquisitionId": record["parcelAcquisitionId"],
        "parcelSourceObjectId": record["parcelSourceObjectId"],
        "apn": record["apn"],
        "mappingState": record["mappingState"],
        "dominantZoneCode": record["dominantZoneCode"],
        "distinctZoneCount": record["distinctZoneCount"],
        "dominantCoveragePercent": record["dominantCoveragePercent"],
        "secondaryCoveragePercent": record["secondaryCoveragePercent"],
        "totalCoveredPercent": record["totalCoveredPercent"],
        "repairedSourceFeatureCount": record["repairedSourceFeatureCount"],
        "zoneEvidence": record["zoneEvidence"],
    }


def run(input_path, output_dir):
    input_path = pathlib.Path(input_path).resolve()
    output = pathlib.Path(output_dir).resolve()
    output.mkdir(exist_ok=False)
    output_path = output / "parcel-base-zoning-map.ndjson.gz"
    state_counts = {state: 0 for state in STATES}
    zone_counts = {}
    zone_count_histogram = {}
    primary = []
    secondary = []
    secondary_area = []
    multi_primary = []
    multi_secondary = []
    multi_secondary_area = []
    repaired_parcels = 0
    geometry_groups = {}
    golden = {}
    historical_apns = {"5491013900", "5441922100", "5480802400", "3502900301", "5490330700", "5442250200", "5432020900", "5490231300"}
    historical = {}
    fingerprint = hashlib.sha256()
    count = 0
    with output_path.open("xb") as binary:
        with gzip.GzipFile(filename="", mode="wb", fileobj=binary, mtime=0) as zipped:
            for record in records(input_path):
                count += 1
                state_counts[record["mappingState"]] += 1
                zone_count_histogram[str(record["distinctZoneCount"])] = zone_count_histogram.get(str(record["distinctZoneCount"]), 0) + 1
                for zone in record["zoneEvidence"]:
                    zone_counts[zone["zoneCode"]] = zone_counts.get(zone["zoneCode"], 0) + 1
                if record["dominantCoveragePercent"] is not None:
                    primary.append(record["dominantCoveragePercent"])
                    secondary.append(record["secondaryCoveragePercent"])
                    secondary_area.append(sum(zone["intersectedAreaSqFt"] for zone in record["zoneEvidence"][1:]))
                if record["distinctZoneCount"] > 1:
                    multi_primary.append(record["dominantCoveragePercent"])
                    multi_secondary.append(record["secondaryCoveragePercent"])
                    multi_secondary_area.append(sum(zone["intersectedAreaSqFt"] for zone in record["zoneEvidence"][1:]))
                if record["repairedSourceFeatureCount"]:
                    repaired_parcels += 1
                geometry_groups.setdefault(record["geometrySha256"], []).append(compact_record(record))
                golden.setdefault(record["mappingState"], compact_record(record))
                if record["repairedSourceFeatureCount"]:
                    golden.setdefault("ZONING_POLYGON_ANOMALY", compact_record(record))
                if record["apn"] in historical_apns:
                    historical[record["apn"]] = compact_record(record)
                encoded = (json.dumps(record, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode()
                fingerprint.update(encoded)
                zipped.write(encoded)
    stacked_groups = []
    inconsistent_stacks = []
    for geometry_hash, members in geometry_groups.items():
        if len(members) <= 1:
            continue
        signatures = {json.dumps({key: member[key] for key in ("mappingState", "dominantZoneCode", "distinctZoneCount", "zoneEvidence")},
                                 sort_keys=True, separators=(",", ":")) for member in members}
        if len(signatures) != 1:
            inconsistent_stacks.append(geometry_hash)
        if not stacked_groups:
            stacked_groups.append({"geometrySha256": geometry_hash, "members": members})
    if stacked_groups:
        golden["STACKED_GROUP"] = stacked_groups[0]
    if count != 393733:
        raise ValueError(f"Expected 393733 parcel records, received {count}")
    report = {
        "mappingMethodVersion": METHOD_VERSION,
        "input": {"filename": input_path.name, "sha256": sha(input_path)},
        "thresholds": {
            "effectivelyFullCoveragePercent": [FULL_MIN_PERCENT, FULL_MAX_PERCENT],
            "boundarySliverAllSecondaryMaxPercent": SLIVER_MAX_PERCENT,
            "boundarySliverAllSecondaryMaxAreaSqFt": SLIVER_MAX_AREA_SQFT,
            "rationale": "Conservative joint threshold selected after full valid-source distribution analysis; both limits must pass.",
        },
        "parcelCount": count,
        "mappingStateCounts": state_counts,
        "distinctZoneCountHistogram": dict(sorted(zone_count_histogram.items(), key=lambda item: int(item[0]))),
        "zoneParcelCounts": dict(sorted(zone_counts.items())),
        "allIntersectedParcels": {
            "primaryCoveragePercent": distribution(primary),
            "allSecondaryCoveragePercent": distribution(secondary),
            "allSecondaryAreaSqFt": distribution(secondary_area),
        },
        "multipleZoneParcels": {
            "count": len(multi_primary),
            "primaryCoveragePercent": distribution(multi_primary),
            "allSecondaryCoveragePercent": distribution(multi_secondary),
            "allSecondaryAreaSqFt": distribution(multi_secondary_area),
        },
        "repairedSourceFeatureParcelCount": repaired_parcels,
        "stacked": {
            "physicalGeometryGroupCount": sum(1 for members in geometry_groups.values() if len(members) > 1),
            "apnCount": sum(len(members) for members in geometry_groups.values() if len(members) > 1),
            "inconsistentGroupCount": len(inconsistent_stacks),
            "inconsistentGeometrySha256": inconsistent_stacks,
        },
        "mappingFingerprintSha256": fingerprint.hexdigest(),
        "output": {"filename": output_path.name, "sha256": sha(output_path), "byteSize": output_path.stat().st_size},
        "goldenCandidates": golden,
        "historicalCandidates": dict(sorted(historical.items())),
    }
    (output / "mapping-report.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps({key: report[key] for key in ("parcelCount", "mappingStateCounts", "mappingFingerprintSha256", "output")}, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    run(*sys.argv[1:])

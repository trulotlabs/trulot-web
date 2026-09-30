"""Validate an immutable zoning acquisition without repairing source geometry.

Usage: python3 scripts/base-zoning-v2/validate.py ACQUISITION_DIR NEW_OUTPUT_DIR
"""
import collections
import gzip
import hashlib
import io
import json
import pathlib
import sys

import shapely
from shapely.geometry import shape

ROOT = pathlib.Path(__file__).resolve().parents[2]
ITEM = "e99981214e6348de8ddc3674f799c75d"


def normalize_zone_code(value):
    """Canonicalize only source formatting; never infer or repair a code."""
    if not isinstance(value, str):
        return None
    normalized = value.strip().upper()
    return normalized or None


def sha(path):
    with pathlib.Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def normalized_hash(geometry):
    return hashlib.sha256(shapely.normalize(geometry).wkb).hexdigest()


def validate(acquisition_dir, output_dir):
    acquisition_dir = pathlib.Path(acquisition_dir).resolve()
    output = pathlib.Path(output_dir).resolve()
    if ROOT == output or ROOT in output.parents:
        raise ValueError("Validation population must remain outside Git")
    output.mkdir(exist_ok=False)
    acquisition = json.loads((acquisition_dir / "acquisition.json").read_text())
    receipt = acquisition["receipt"]
    artifact = acquisition_dir / receipt["artifact"]["filename"]
    if receipt["sourceItemId"] != ITEM or receipt["datasetId"] != "base_zoning_city_sd_v2":
        raise ValueError("Unexpected zoning acquisition identity")
    if sha(artifact) != receipt["artifact"]["sha256"] or artifact.stat().st_size != receipt["artifact"]["byteSize"]:
        raise ValueError("Immutable zoning artifact mismatch")
    payload = json.loads(artifact.read_text())
    if payload.get("type") != "FeatureCollection" or not isinstance(payload.get("features"), list):
        raise ValueError("Expected a GeoJSON FeatureCollection")
    if len(payload["features"]) != receipt["sourceFeatureCount"]:
        raise ValueError("Advertised/acquired feature count mismatch")

    counts = collections.Counter()
    geometry_types = collections.Counter()
    reasons = collections.Counter()
    zones = collections.defaultdict(lambda: {"sourceFeatures": 0, "acceptedFeatures": 0, "rejectedFeatures": 0,
                                              "sourceShapeAreaSqFt": 0.0, "sourceDescription": None})
    seen_ids = set()
    identity_hash = hashlib.sha256()
    accepted_file = output / "accepted.ndjson.gz"
    rejected_file = output / "rejected.ndjson.gz"
    accepted_binary = accepted_file.open("xb")
    rejected_binary = rejected_file.open("xb")
    accepted_gzip = gzip.GzipFile(filename="", mode="wb", fileobj=accepted_binary, mtime=0)
    rejected_gzip = gzip.GzipFile(filename="", mode="wb", fileobj=rejected_binary, mtime=0)
    with io.TextIOWrapper(accepted_gzip) as accepted, io.TextIOWrapper(rejected_gzip) as rejected:
        for index, feature in enumerate(payload["features"]):
            counts["parsed"] += 1
            errors = []
            if feature.get("type") != "Feature" or not isinstance(feature.get("properties"), dict):
                errors.append("MALFORMED_FEATURE")
                properties = {}
            else:
                properties = feature["properties"]
            object_id = properties.get("OBJECTID")
            zone = properties.get("ZONE_NAME")
            normalized_zone = normalize_zone_code(zone)
            if not isinstance(object_id, int) or object_id <= 0:
                errors.append("INVALID_OBJECT_ID")
            elif object_id in seen_ids:
                errors.append("DUPLICATE_OBJECT_ID")
            else:
                seen_ids.add(object_id)
            if not isinstance(zone, str) or not zone.strip() or zone != zone.strip():
                errors.append("NULL_OR_MALFORMED_ZONE_CODE")
            else:
                zones[zone]["sourceFeatures"] += 1
                source_area = properties.get("Shape_Area")
                if isinstance(source_area, (int, float)) and source_area >= 0:
                    zones[zone]["sourceShapeAreaSqFt"] += source_area
                else:
                    errors.append("INVALID_SOURCE_SHAPE_AREA")
            geometry = None
            try:
                geometry = shape(feature.get("geometry"))
                geometry_types[geometry.geom_type] += 1
                if geometry.geom_type not in {"Polygon", "MultiPolygon"}:
                    errors.append("NON_POLYGON_GEOMETRY")
                if geometry.is_empty:
                    errors.append("EMPTY_GEOMETRY")
                if not geometry.is_valid:
                    errors.append("INVALID_GEOMETRY:" + shapely.is_valid_reason(geometry))
            except Exception as error:
                errors.append("GEOMETRY_PARSE_ERROR:" + type(error).__name__)
            entry = {
                "index": index,
                "sourceObjectId": object_id,
                "zoneCode": zone,
                "rawZoneCode": zone,
                "normalizedZoneCode": normalized_zone,
                "implementationDate": properties.get("IMP_DATE"),
                "ordinanceNumber": properties.get("ORDNUM"),
                "sourceShapeLength": properties.get("Shape_Length"),
                "sourceShapeAreaSqFt": properties.get("Shape_Area"),
                "geometryType": geometry.geom_type if geometry is not None else None,
                "geometrySha256": normalized_hash(geometry) if geometry is not None else None,
                "bounds": list(geometry.bounds) if geometry is not None else None,
                "reasons": errors,
            }
            identity_hash.update((str(object_id) + ":" + str(zone) + ":" + str(entry["geometrySha256"]) + "\n").encode())
            if errors:
                counts["rejected"] += 1
                for reason in errors:
                    reasons[reason.split(":", 1)[0]] += 1
                if isinstance(zone, str) and zone in zones:
                    zones[zone]["rejectedFeatures"] += 1
                rejected.write(json.dumps(entry, separators=(",", ":")) + "\n")
            else:
                counts["accepted"] += 1
                zones[zone]["acceptedFeatures"] += 1
                accepted.write(json.dumps(entry, separators=(",", ":")) + "\n")
    accepted_binary.close()
    rejected_binary.close()

    if counts["parsed"] != counts["accepted"] + counts["rejected"] or len(seen_ids) != counts["parsed"]:
        raise ValueError("Unexplained feature loss or object-ID conflict")
    inventory = [{"rawZoneCode": code, "normalizedZoneCode": normalize_zone_code(code), "zoneCode": code, **value}
                 for code, value in sorted(zones.items())]
    normalization_changes = sum(row["rawZoneCode"] != row["normalizedZoneCode"] for row in inventory)
    report = {
        "decision": "SOURCE_VALIDATED_WITH_EXPLICIT_QUARANTINE" if counts["rejected"] else "SOURCE_VALIDATED",
        "acquisitionId": receipt["acquisitionId"],
        "artifactSha256": receipt["artifact"]["sha256"],
        "counts": dict(counts),
        "distinctObjectIds": len(seen_ids),
        "distinctZoneCodes": len(inventory),
        "zoneCodeNormalization": {
            "methodVersion": "city-sd-base-zone-trim-uppercase-v1",
            "rule": "Trim outer whitespace and uppercase. Reject null/blank/malformed values; never guess a code.",
            "changedObservedCodes": normalization_changes,
            "unknownOrMalformedFeatures": reasons.get("NULL_OR_MALFORMED_ZONE_CODE", 0),
        },
        "geometryTypes": dict(sorted(geometry_types.items())),
        "rejectionReasons": dict(sorted(reasons.items())),
        "sourceOrderIdentityFingerprint": identity_hash.hexdigest(),
        "outputs": {
            accepted_file.name: {"sha256": sha(accepted_file), "byteSize": accepted_file.stat().st_size},
            rejected_file.name: {"sha256": sha(rejected_file), "byteSize": rejected_file.stat().st_size},
        },
        "tool": "Python " + sys.version.split()[0] + "; Shapely " + shapely.__version__ + "; GEOS " + shapely.geos_version_string,
        "validatedArtifactAcquiredAt": receipt["acquiredAt"],
        "geometryPolicy": "No geometry repair. Invalid source polygons are quarantined; their envelopes scope INDETERMINATE parcels.",
        "zoneInventory": inventory,
    }
    (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    (output / "executed-validate.py").write_bytes(pathlib.Path(__file__).read_bytes())
    print(json.dumps({key: report[key] for key in ("decision", "counts", "distinctZoneCodes", "geometryTypes", "rejectionReasons", "sourceOrderIdentityFingerprint")}, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    validate(*sys.argv[1:])

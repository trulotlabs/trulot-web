"""LEFT-join immutable Parcel Serving V2 rows to Base Zoning V2 mappings.

Usage: python3 scripts/zoning-serving-v2/integrate.py PARCEL_EXPORT ZONING_MAP_GZ NEW_OUTPUT_DIR
"""
import csv
import gzip
import hashlib
import json
import pathlib
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
METHOD = "parcel-intelligence-serving-v2-left-join-v1"
PARCEL_FIELDS = ("acquisition_id", "source_object_id", "apn_norm", "parcel_id", "address", "situs_components",
                 "situs_zip", "situs_juris", "geom", "centroid", "point_on_surface", "centroid_within",
                 "approximate_geometry_area_sqft", "taxable_acreage", "geometry_sha256", "native_crs", "artifact_crs")
EXPECTED_STATES = {"SINGLE_ZONE": 317604, "MULTI_ZONE": 73064, "BOUNDARY_SLIVER": 1097, "UNMAPPED": 327, "INDETERMINATE": 1641}
EXPECTED_ZONING_MAP_SHA256 = "e90e223b3b06017b95e191aee8ec1de918dbb45abf836c4f209ae1c345cbf088"
EXPECTED_PARCEL_APN_FINGERPRINT = "93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25"
ZONING_ACQUISITION_ID = "zoning-city-sd-20260924T201131Z"
csv.field_size_limit(sys.maxsize)


def sha(path):
    with pathlib.Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def parcel_rows(path):
    with gzip.open(path, "rt", newline="") as stream:
        for values in csv.reader(stream, delimiter="\t"):
            if len(values) != len(PARCEL_FIELDS):
                raise ValueError("Unexpected Parcel Serving export row width")
            row = dict(zip(PARCEL_FIELDS, (None if value == "\\N" else value for value in values)))
            for key in ("source_object_id", "parcel_id"):
                row[key] = int(row[key])
            for key in ("approximate_geometry_area_sqft", "taxable_acreage"):
                row[key] = None if row[key] is None else float(row[key])
            row["centroid_within"] = row["centroid_within"] == "t"
            for key in ("situs_components", "geom", "centroid", "point_on_surface"):
                row[key] = json.loads(row[key])
            yield row


def zoning_rows(path):
    with gzip.open(path, "rt") as stream:
        for line in stream:
            yield json.loads(line)


def compact_zoning(row):
    return {key: row[key] for key in ("mappingState", "dominantZoneCode", "dominantCoveragePercent", "secondaryCoveragePercent",
                                      "totalCoveredPercent", "uncoveredPercent", "distinctZoneCount", "repairedSourceFeatureCount", "zoneEvidence")}


def run(parcel_export, zoning_map, output_dir):
    parcel_export = pathlib.Path(parcel_export).resolve()
    zoning_map = pathlib.Path(zoning_map).resolve()
    output = pathlib.Path(output_dir).resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError("Full integrated serving output must remain outside Git")
    output.mkdir(exist_ok=False)
    if sha(zoning_map) != EXPECTED_ZONING_MAP_SHA256:
        raise ValueError("Base Zoning V2 map identity changed")
    parcel_receipt = json.loads((parcel_export.parent / "export.json").read_text())
    if parcel_receipt["packet8ApnSetFingerprint"] != EXPECTED_PARCEL_APN_FINGERPRINT:
        raise ValueError("Parcel Serving V2 APN identity changed")
    parcel_iterator = parcel_rows(parcel_export)
    zoning_iterator = zoning_rows(zoning_map)
    output_path = output / "parcel-intelligence-serving-v2.ndjson.gz"
    state_counts = {state: 0 for state in EXPECTED_STATES}
    apn_fingerprint = hashlib.sha256()
    integrated_fingerprint = hashlib.sha256()
    split_fingerprint = hashlib.sha256()
    zone_counts = {}
    seen_apns = set()
    geometry_groups = {}
    golden_apns = set()
    packet10_golden = json.loads((ROOT / "data/base-zoning-v2/golden-fixture.json").read_text())
    for value in packet10_golden["cases"].values():
        golden_apns.add(value["apn"])
    for key in ("multiPolygonParcel", "zoningPolygonAnomaly", "historicallyKnownParcel"):
        value = packet10_golden["specialCases"][key]
        golden_apns.add(value.get("apn", value.get("mapping", {} ).get("apn")))
    stack_apns = [item["apn"] for item in packet10_golden["specialCases"]["stackedGroup"]["members"]]
    golden_apns.update(stack_apns)
    golden_apns.update({"5470501600", "6782511200"})
    golden = {}
    started = time.monotonic()
    count = 0
    with output_path.open("xb") as binary:
        with gzip.GzipFile(filename="", mode="wb", fileobj=binary, mtime=0) as zipped:
            for parcel, zoning in zip(parcel_iterator, zoning_iterator, strict=True):
                count += 1
                if (parcel["acquisition_id"] != zoning["parcelAcquisitionId"] or
                    parcel["source_object_id"] != zoning["parcelSourceObjectId"] or parcel["apn_norm"] != zoning["apn"]):
                    raise ValueError("Parcel/zoning identity join mismatch")
                if parcel["apn_norm"] in seen_apns:
                    raise ValueError("Duplicate integrated APN")
                seen_apns.add(parcel["apn_norm"])
                zoning["zoningAcquisitionId"] = ZONING_ACQUISITION_ID
                record = {
                    "schemaVersion": 1,
                    "integrationMethodVersion": METHOD,
                    "apn": parcel["apn_norm"],
                    "parcel": parcel,
                    "baseZoning": zoning,
                    "provenanceReferences": {
                        "parcel": "data/parcel-serving-v2/report.json#provenance",
                        "baseZoning": "data/base-zoning-v2/acquisition.json#receipt",
                        "mapping": "data/base-zoning-v2/mapping-report.json",
                    },
                }
                encoded = (json.dumps(record, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode()
                zipped.write(encoded)
                integrated_fingerprint.update(encoded)
                apn_fingerprint.update((parcel["apn_norm"] + "\n").encode())
                state = zoning["mappingState"]
                state_counts[state] += 1
                for evidence in zoning["zoneEvidence"]:
                    zone_counts[evidence["zoneCode"]] = zone_counts.get(evidence["zoneCode"], 0) + 1
                if state in {"MULTI_ZONE", "BOUNDARY_SLIVER"}:
                    split_fingerprint.update((json.dumps({"apn": parcel["apn_norm"], "zoning": compact_zoning(zoning)}, sort_keys=True, separators=(",", ":")) + "\n").encode())
                    ordered = sorted(zoning["zoneEvidence"], key=lambda item: (-item["intersectedAreaSqFt"], item["zoneCode"]))
                    if zoning["zoneEvidence"] != ordered:
                        raise ValueError("Nondeterministic zone ordering")
                signature = json.dumps(compact_zoning(zoning), sort_keys=True, separators=(",", ":"))
                group = geometry_groups.setdefault(parcel["geometry_sha256"], {"count": 0, "signature": signature, "consistent": True})
                group["count"] += 1
                group["consistent"] = group["consistent"] and group["signature"] == signature
                if parcel["apn_norm"] in golden_apns:
                    golden[parcel["apn_norm"]] = record
    if count != 393733 or len(seen_apns) != count or state_counts != EXPECTED_STATES:
        raise ValueError("Integrated population reconciliation failed")
    if apn_fingerprint.hexdigest() != EXPECTED_PARCEL_APN_FINGERPRINT:
        raise ValueError("Integrated APN set differs from Parcel Serving V2")
    stacks = [group for group in geometry_groups.values() if group["count"] > 1]
    if len(stacks) != 5446 or sum(group["count"] for group in stacks) != 126239 or not all(group["consistent"] for group in stacks):
        raise ValueError("Stacked parcel preservation failed")
    report = {
        "decision": "ZONING_SERVING_INTEGRATION_REHEARSAL_PASS",
        "integrationMethodVersion": METHOD,
        "join": {"type": "LEFT from Parcel Serving V2", "keys": ["parcel_acquisition_id", "parcel_source_object_id", "apn"],
                 "matched": count, "missingParcelRows": 0, "missingZoningRows": 0, "duplicateApns": 0},
        "parcelCount": count,
        "zoningStateCounts": state_counts,
        "zoneParcelCounts": dict(sorted(zone_counts.items())),
        "stacked": {"physicalGeometryGroupCount": len(stacks), "apnCount": sum(group["count"] for group in stacks), "inconsistentGroupCount": 0},
        "packet8ApnSetFingerprint": apn_fingerprint.hexdigest(),
        "packet8FullRowFingerprint": parcel_receipt["packet8FullRowFingerprint"],
        "packet10MappingFingerprint": "313aa7ad46747bb97499a113842ac848de8f7357134e0558210692a1913a8ccf",
        "splitAndSliverFingerprint": split_fingerprint.hexdigest(),
        "integratedFingerprint": integrated_fingerprint.hexdigest(),
        "inputs": {"parcelExportSha256": parcel_receipt["compressedSha256"], "zoningMapSha256": sha(zoning_map)},
        "output": {"filename": output_path.name, "sha256": sha(output_path), "byteSize": output_path.stat().st_size},
        "durationSeconds": round(time.monotonic() - started, 3),
    }
    (output / "report.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    (output / "golden.json").write_text(json.dumps({"apns": golden, "stackedApns": stack_apns}, indent=2, sort_keys=True) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    run(*sys.argv[1:])

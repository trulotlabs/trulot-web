"""Assemble compact Packet 11 evidence and actual integrated adapter fixtures.

Usage: assemble-evidence.py PARCEL_EXPORT_DIR INTEGRATED1 INTEGRATED2 QUERY_DIR NEW_OUTPUT_DIR
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def read(directory, filename):
    return json.loads((pathlib.Path(directory) / filename).read_text())


def write(output, filename, value):
    (output / filename).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def zoning_row(record):
    zoning = record["baseZoning"]
    keys = ("parcelAcquisitionId", "parcelSourceObjectId", "apn", "mappingState", "dominantZoneCode",
            "distinctZoneCount", "dominantCoveragePercent", "secondaryCoveragePercent", "totalCoveredPercent",
            "repairedSourceFeatureCount", "zoneEvidence")
    return {key: zoning[key] for key in keys}


def adapter_case(record, parcel_receipt, zoning_receipt):
    return {
        "apn": record["apn"],
        "parcelResponse": {"rows": [record["parcel"]], "quarantinedCount": 0, "receipt": parcel_receipt},
        "zoningResponse": {"row": zoning_row(record), "receipt": zoning_receipt},
        "expected": {
            "mappingState": record["baseZoning"]["mappingState"],
            "zoneCodes": [item["zoneCode"] for item in record["baseZoning"]["zoneEvidence"]],
            "coveragePercentages": [item["parcelCoveragePercent"] for item in record["baseZoning"]["zoneEvidence"]],
            "sourceFeatureIds": [[feature["sourceObjectId"] for feature in item["features"]] for item in record["baseZoning"]["zoneEvidence"]],
        },
    }


def run(parcel_dir, first_dir, second_dir, query_dir, output_dir):
    output = pathlib.Path(output_dir)
    output.mkdir(parents=True, exist_ok=False)
    parcel_export = read(parcel_dir, "export.json")
    first = read(first_dir, "report.json")
    second = read(second_dir, "report.json")
    golden = read(first_dir, "golden.json")
    query = read(query_dir, "query-rehearsal.json")
    deterministic_keys = ("integrationMethodVersion", "join", "parcelCount", "zoningStateCounts", "zoneParcelCounts", "stacked",
                          "packet8ApnSetFingerprint", "packet8FullRowFingerprint", "packet10MappingFingerprint",
                          "splitAndSliverFingerprint", "integratedFingerprint", "inputs", "output")
    if any(first[key] != second[key] for key in deterministic_keys):
        raise ValueError("Integrated rebuilds differ")
    write(output, "report.json", {key: first[key] for key in deterministic_keys})
    write(output, "repeatability.json", {
        "decision": "EXACT_MATCH",
        "runDurationsSeconds": [first["durationSeconds"], second["durationSeconds"]],
        "identical": {key: first[key] == second[key] for key in deterministic_keys},
    })
    write(output, "input-identities.json", {
        "parcelBaseAccepted": 1088430,
        "parcelServing": {"rows": parcel_export["parcelCount"], "apnSetFingerprint": parcel_export["packet8ApnSetFingerprint"],
                          "fullRowFingerprint": parcel_export["packet8FullRowFingerprint"], "exportSha256": parcel_export["compressedSha256"]},
        "baseZoning": {"mappingFingerprint": first["packet10MappingFingerprint"], "mappingArtifactSha256": first["inputs"]["zoningMapSha256"]},
    })
    parcel_receipt = read(ROOT / "data/parcel-serving-v2", "report.json")["provenance"]
    zoning_receipt = read(ROOT / "data/base-zoning-v2", "golden-fixture.json")["receipt"]
    by_apn = golden["apns"]
    cases = {
        "singleZone": adapter_case(by_apn["5470501600"], parcel_receipt, zoning_receipt),
        "multiZone": adapter_case(by_apn["6271001600"], parcel_receipt, zoning_receipt),
        "boundarySliver": adapter_case(by_apn["2748323700"], parcel_receipt, zoning_receipt),
        "unmapped": adapter_case(by_apn["7600360300"], parcel_receipt, zoning_receipt),
        "indeterminate": adapter_case(by_apn["4236300300"], parcel_receipt, zoning_receipt),
        "nullAddress": adapter_case(by_apn["6782511200"], parcel_receipt, zoning_receipt),
        "taxableAcreageNull": adapter_case(by_apn["5470501600"], parcel_receipt, zoning_receipt),
        "historicalKnown": adapter_case(by_apn["5490330700"], parcel_receipt, zoning_receipt),
        "explicitGeometryDerivative": adapter_case(by_apn["5810934600"], parcel_receipt, zoning_receipt),
        "multiPolygonParcel": adapter_case(by_apn["2392600700"], parcel_receipt, zoning_receipt),
    }
    stacked = [adapter_case(by_apn[apn], parcel_receipt, zoning_receipt) for apn in golden["stackedApns"]]
    write(output, "golden-fixture.json", {"cases": cases, "stacked": stacked,
        "notFound": read(ROOT / "data/parcel-serving-v2", "adapter-fixtures.json")["notFound"]})
    write(output, "query-rehearsal.json", query)
    write(output, "provenance.json", {
        "parcel": parcel_receipt,
        "baseZoning": zoning_receipt,
        "integration": {"methodVersion": first["integrationMethodVersion"], "integratedFingerprint": first["integratedFingerprint"],
                        "parcelReference": "data/parcel-serving-v2/report.json#provenance",
                        "zoningReference": "data/base-zoning-v2/acquisition.json#receipt",
                        "mappingReference": "data/base-zoning-v2/mapping-report.json"},
        "flattenedLastUpdated": None,
    })
    write(output, "runtime-migration-boundary.json", {
        "packet11RuntimeWiring": False,
        "futureSteps": ["add a separately reviewed integrated V2 data-access path", "shadow-read before rendering",
                        "preserve /parcel/san-diego/[slug] behavior", "preserve existing permit and overlay paths",
                        "render raw zoning evidence without standards", "retain legacy fallback during bounded validation",
                        "prevent legacy capacity or eligibility logic from entering zoning truth"],
        "nextDependency": {"name": "Zoning Standards V2", "requires": ["authoritative municipal code and development regulations",
            "versioned section citations", "zone-code-to-rule applicability", "effective-date and amendment lineage",
            "separate treatment of overlays and programs"], "implementedHere": False},
    })


if __name__ == "__main__":
    if len(sys.argv) != 6:
        raise SystemExit(__doc__)
    run(*sys.argv[1:])

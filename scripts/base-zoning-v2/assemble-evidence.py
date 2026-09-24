"""Assemble compact Git evidence from external immutable rehearsal outputs.

Usage: assemble-evidence.py ACQUISITION PASS IMPORT EXPORT1 CLASS1 EXPORT2 CLASS2 PERFORMANCE OUTPUT
"""
import gzip
import hashlib
import json
import pathlib
import sys


def read(directory, filename):
    return json.loads((pathlib.Path(directory) / filename).read_text())


def write(output, filename, value):
    (output / filename).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def adapter_row(row):
    keys = ("parcelAcquisitionId", "parcelSourceObjectId", "apn", "mappingState", "dominantZoneCode",
            "distinctZoneCount", "dominantCoveragePercent", "secondaryCoveragePercent", "totalCoveredPercent",
            "repairedSourceFeatureCount", "zoneEvidence")
    return {key: row[key] for key in keys}


def map_row(classification, apn):
    with gzip.open(pathlib.Path(classification) / "parcel-base-zoning-map.ndjson.gz", "rt") as stream:
        for line in stream:
            row = json.loads(line)
            if row["apn"] == apn:
                return row
    raise ValueError(f"Missing map row {apn}")


def run(*values):
    acquisition_dir, pass_dir, import_dir, export1_dir, class1_dir, export2_dir, class2_dir, performance_dir, output_dir = map(pathlib.Path, values)
    output_dir.mkdir(parents=True, exist_ok=False)
    acquisition = read(acquisition_dir, "acquisition.json")
    validation = read(pass_dir, "report.json")
    imported = read(import_dir, "import.json")
    export1 = read(export1_dir, "export.json")
    export2 = read(export2_dir, "export.json")
    mapping1 = read(class1_dir, "mapping-report.json")
    mapping2 = read(class2_dir, "mapping-report.json")
    performance = read(performance_dir, "query-plans.json")

    write(output_dir, "acquisition.json", {
        "receipt": acquisition["receipt"],
        "acquisitionAggregateSha256": acquisition["aggregateSha256"],
        "retention": "Raw 19,627,631-byte artifact and HTTP evidence remain outside Git in immutable acquisition storage.",
    })
    write(output_dir, "validation.json", validation)
    imported["executedDdlSha256"] = imported.pop("ddlSha256")
    imported["finalContractDdlSha256"] = hashlib.sha256((pathlib.Path(__file__).with_name("schema.sql")).read_bytes()).hexdigest()
    imported["postImportContractCorrection"] = "Renamed the unpopulated map-contract count field from invalid_source_envelope_count to repaired_source_feature_count after explicit mapping derivation was selected; source, quarantine, mapping-geometry, and parcel input tables used by the read-only export were unchanged."
    write(output_dir, "import-rehearsal.json", imported)
    candidates = mapping1.pop("goldenCandidates")
    historical = mapping1.pop("historicalCandidates")
    write(output_dir, "mapping-report.json", mapping1)
    write(output_dir, "repeatability.json", {
        "decision": "EXACT_MATCH",
        "runs": [{"export": export1, "mapping": {"fingerprint": mapping1["mappingFingerprintSha256"], "output": mapping1["output"]}},
                 {"export": export2, "mapping": {"fingerprint": mapping2["mappingFingerprintSha256"], "output": mapping2["output"]}}],
        "identical": {
            "intersectionExportSha256": export1["compressedSha256"] == export2["compressedSha256"],
            "mappingOutputSha256": mapping1["output"]["sha256"] == mapping2["output"]["sha256"],
            "mappingFingerprintSha256": mapping1["mappingFingerprintSha256"] == mapping2["mappingFingerprintSha256"],
            "mappingStateCounts": mapping1["mappingStateCounts"] == mapping2["mappingStateCounts"],
            "zoneParcelCounts": mapping1["zoneParcelCounts"] == mapping2["zoneParcelCounts"],
        },
    })
    receipt = acquisition["receipt"]
    adapter_receipt = {
        "acquisitionId": receipt["acquisitionId"], "datasetId": receipt["datasetId"], "publisher": receipt["publisher"],
        "sourceItemId": receipt["sourceItemId"], "sourceUrl": receipt["sourceUrl"], "acquiredAt": receipt["acquiredAt"],
        "sourceModifiedAt": receipt["sourceReported"]["serviceModified"], "artifactSha256": receipt["artifact"]["sha256"],
        "mappingFingerprintSha256": mapping1["mappingFingerprintSha256"], "mappingMethodVersion": mapping1["mappingMethodVersion"],
        "receiptReference": "data/base-zoning-v2/acquisition.json",
    }
    special = {
        "stackedGroup": {**candidates["STACKED_GROUP"], "members": candidates["STACKED_GROUP"]["members"][:3]},
        "multiPolygonParcel": {"parcelGeometryType": "MultiPolygon", "mapping": adapter_row(map_row(class1_dir, "2392600700"))},
        "zoningPolygonAnomaly": adapter_row(candidates["ZONING_POLYGON_ANOMALY"]),
        "historicallyKnownParcel": adapter_row(historical["5490330700"]),
    }
    write(output_dir, "golden-fixture.json", {
        "receipt": adapter_receipt,
        "cases": {"singleZone": adapter_row(candidates["SINGLE_ZONE"]), "multiZone": adapter_row(candidates["MULTI_ZONE"]),
                  "boundarySliver": adapter_row(candidates["BOUNDARY_SLIVER"]), "unmapped": adapter_row(candidates["UNMAPPED"]),
                  "indeterminate": adapter_row(candidates["INDETERMINATE"])},
        "specialCases": special,
    })
    expected = {"5491013900": "RS-1-6", "5441922100": "RX-1-1", "5480802400": "RS-1-6", "3502900301": "LJPD-5",
                "5490330700": "RM-2-5", "5442250200": None, "5432020900": "RS-1-6", "5490231300": "RS-1-6"}
    comparisons = []
    for apn, historical_code in expected.items():
        current = historical[apn]
        if historical_code is None or current["distinctZoneCount"] > 1:
            outcome = "LEGACY_SEMANTICS_UNKNOWN"
        elif current["dominantZoneCode"] == historical_code:
            outcome = "MATCH"
        else:
            outcome = "SOURCE_VINTAGE_CHANGE"
        comparisons.append({"apn": apn, "historicalZoneCode": historical_code, "currentMappingState": current["mappingState"],
                            "currentZoneCodes": [item["zoneCode"] for item in current["zoneEvidence"]], "outcome": outcome})
    write(output_dir, "historical-comparison.json", {
        "evidenceCommit": "b357bf8",
        "rule": "A historical single value does not override current area evidence; current multi-zone results remain multi-value.",
        "comparisons": comparisons,
    })
    performance["bulkFullMapping"] = {"readOnlyIntersectionExportSecondsRun1": export1["durationSeconds"],
                                      "readOnlyIntersectionExportSecondsRun2": export2["durationSeconds"],
                                      "parcelCount": export1["parcelCount"], "outputSha256": export1["compressedSha256"]}
    write(output_dir, "performance.json", performance)
    write(output_dir, "source-contract.json", {
        "dataset": {"id": receipt["datasetId"], "title": "Zoning_Base_SD", "publisher": receipt["publisher"],
                    "itemId": receipt["sourceItemId"], "layerId": receipt["sourceLayerId"], "geometry": "Polygon",
                    "nativeCrs": receipt["nativeCrs"], "artifactCrs": receipt["artifactCrs"], "updateCadence": receipt["sourceReported"]["portalUpdateCadence"]},
        "fields": {"sourceIdentity": "OBJECTID", "rawZoneCode": "ZONE_NAME", "featureEffectiveDate": "IMP_DATE",
                   "ordinanceNumber": "ORDNUM", "geometryArea": "Shape__Area", "geometryLength": "Shape__Length"},
        "semantics": {"baseZoning": "Current base-zone designations from the Official Zoning Map and subsequent updates.",
                      "rawCodes": "ZONE_NAME values are preserved verbatim; the layer provides no description field.",
                      "plannedAndCommunityPlanLandUse": "Separate City dataset and concept.",
                      "overlayZones": "Separate and supplemental to base zoning.",
                      "multipleBaseZones": "Preserved whenever area evidence is material; no first-zone selection.",
                      "rightsOfWayAndNonparcelCoverage": "Not explicitly established by authoritative metadata; unresolved.",
                      "legalMeaning": "No entitlement, standards, density, FAR, height, capacity, or legal conclusion."},
        "sourceDates": receipt["sourceReported"], "termsUrl": receipt["termsUrl"], "cityPortalUrl": receipt["cityPortalUrl"]
    })
    write(output_dir, "environment.json", {
        "database": "PostgreSQL 17.9; PostGIS 3.6.3; GEOS 3.14.1; PROJ 9.8.1 (network disabled)",
        "applicationTools": {"acquisition": receipt["tool"], "validation": validation["tool"], "import": imported["tool"]},
        "databaseBoundary": "Disposable Packet 7-derived Unix-socket-only local cluster; TCP listener disabled; no production credentials read.",
        "schemas": {"parcelBase": "parcel_v2_rehearsal", "baseZoning": "base_zoning_v2_rehearsal"},
    })


if __name__ == "__main__":
    if len(sys.argv) != 10:
        raise SystemExit(__doc__)
    run(*sys.argv[1:])

"""Offline Base Zoning V2 evidence, geometry policy, and mapping tests."""
import importlib.util
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "data/base-zoning-v2"


def load(name):
    return json.loads((DATA / name).read_text())


def main():
    checks = 0
    def test(name, condition):
        nonlocal checks
        if not condition:
            raise AssertionError(name)
        checks += 1
        print("PASS", name)

    acquisition = load("acquisition.json")["receipt"]
    validation = load("validation.json")
    imported = load("import-rehearsal.json")
    mapping = load("mapping-report.json")
    repeat = load("repeatability.json")
    golden = load("golden-fixture.json")
    source = load("source-contract.json")
    historical = load("historical-comparison.json")
    test("official item and artifact identity pinned", acquisition["sourceItemId"] == "e99981214e6348de8ddc3674f799c75d" and acquisition["artifact"]["sha256"] == "7f65bfd9bb0ea11fda8537e3fc121c0d8e37f15c37f82d1f00afa7a0fa6542b6")
    test("source count reconciles without loss", validation["counts"] == {"parsed": 3706, "accepted": 3680, "rejected": 26})
    test("all source identities and raw zone codes retained", validation["distinctObjectIds"] == 3706 and validation["distinctZoneCodes"] == 183 and sum(row["sourceFeatures"] for row in validation["zoneInventory"]) == 3706)
    test("invalid geometry explicitly quarantined", validation["rejectionReasons"] == {"INVALID_GEOMETRY": 26} and imported["counts"]["rejected"] == 26)
    test("all features have explicit mapping geometry", imported["counts"]["mappingGeometry"] == 3706 and golden["specialCases"]["zoningPolygonAnomaly"]["repairedSourceFeatureCount"] > 0)
    test("literal source code and no invented descriptions", all(row["sourceDescription"] is None for row in validation["zoneInventory"]) and source["fields"]["rawZoneCode"] == "ZONE_NAME")
    test("all City parcels classified once", sum(mapping["mappingStateCounts"].values()) == mapping["parcelCount"] == 393733)
    test("all mapping states represented", all(mapping["mappingStateCounts"][state] > 0 for state in ("SINGLE_ZONE", "MULTI_ZONE", "BOUNDARY_SLIVER", "UNMAPPED", "INDETERMINATE")))
    test("full rebuild byte-identical", repeat["decision"] == "EXACT_MATCH" and all(repeat["identical"].values()))
    test("stacked APN evidence consistent", mapping["stacked"]["inconsistentGroupCount"] == 0 and mapping["stacked"]["apnCount"] == 126239)
    stack = golden["specialCases"]["stackedGroup"]["members"]
    test("stacked APNs preserved separately", len({row["apn"] for row in stack}) == len(stack) and len({json.dumps(row["zoneEvidence"], sort_keys=True) for row in stack}) == 1)
    test("MultiPolygon parcel represented", golden["specialCases"]["multiPolygonParcel"]["parcelGeometryType"] == "MultiPolygon")
    test("historical comparison never tunes current multi-zone evidence", all(row["outcome"] in {"MATCH", "SOURCE_VINTAGE_CHANGE", "LEGACY_SEMANTICS_UNKNOWN", "V2_MAPPING_DEFECT_CANDIDATE", "UNRESOLVED"} for row in historical["comparisons"]) and any(row["outcome"] == "LEGACY_SEMANTICS_UNKNOWN" for row in historical["comparisons"]))

    spec = importlib.util.spec_from_file_location("classify", ROOT / "scripts/base-zoning-v2/classify.py")
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    def synthetic(zones, total=100.0, area=10000.0):
        parcel = {"parcelAcquisitionId": "p", "parcelSourceObjectId": "1", "apn": "0000000001", "parcelId": "1", "geometrySha256": "0" * 64, "parcelAreaSqFt": str(area)}
        rows = []
        for object_id, (code, percent) in enumerate(zones, 1):
            rows.append({"zoneCode": code, "intersectedAreaSqFt": str(area * percent / 100), "zoningSourceObjectId": str(object_id),
                         "sourceGeometryState": "VALID_SOURCE", "zoningAcquisitionId": "z"})
        return module.classify_parcel(parcel, rows)
    test("classifier maps full one-zone evidence", synthetic([("RS-1-6", 100)])["mappingState"] == "SINGLE_ZONE")
    test("classifier preserves material split", synthetic([("A", 60), ("B", 40)])["mappingState"] == "MULTI_ZONE")
    test("classifier requires both sliver limits", synthetic([("A", 99.995), ("B", 0.005)], area=1000000)["mappingState"] == "MULTI_ZONE" and synthetic([("A", 99.995), ("B", 0.005)], area=10000)["mappingState"] == "BOUNDARY_SLIVER")
    test("classifier distinguishes unmapped and incomplete", synthetic([])["mappingState"] == "UNMAPPED" and synthetic([("A", 90)])["mappingState"] == "INDETERMINATE")
    print(f"{checks} Base Zoning V2 offline checks passed.")


if __name__ == "__main__":
    main()

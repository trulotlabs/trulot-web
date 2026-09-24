"""Offline Packet 11 integrated population, fidelity, and boundary checks."""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "data/zoning-serving-v2"


def load(name):
    return json.loads((DATA / name).read_text())


def main():
    report = load("report.json")
    repeat = load("repeatability.json")
    identities = load("input-identities.json")
    provenance = load("provenance.json")
    golden = load("golden-fixture.json")
    boundary = load("runtime-migration-boundary.json")
    packet10 = json.loads((ROOT / "data/base-zoning-v2/mapping-report.json").read_text())
    checks = 0
    def test(name, condition):
        nonlocal checks
        if not condition:
            raise AssertionError(name)
        checks += 1
        print("PASS", name)

    expected = {"SINGLE_ZONE": 317604, "MULTI_ZONE": 73064, "BOUNDARY_SLIVER": 1097, "UNMAPPED": 327, "INDETERMINATE": 1641}
    test("all 393733 Parcel Serving rows preserved", report["parcelCount"] == 393733 and report["join"]["matched"] == 393733)
    test("LEFT join loses no parcel and creates no duplicate", report["join"]["missingParcelRows"] == report["join"]["missingZoningRows"] == report["join"]["duplicateApns"] == 0)
    test("all zoning states exactly reconcile", report["zoningStateCounts"] == expected and sum(expected.values()) == 393733)
    test("Parcel Base and Serving identities pinned", identities["parcelBaseAccepted"] == 1088430 and report["packet8ApnSetFingerprint"] == "93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25" and report["packet8FullRowFingerprint"] == "a30e506477248e46a66416821b8d12f58cec07e60a065860af5c0d595062006f")
    test("Base Zoning mapping identity pinned", report["packet10MappingFingerprint"] == packet10["mappingFingerprintSha256"] == "313aa7ad46747bb97499a113842ac848de8f7357134e0558210692a1913a8ccf")
    test("every zone parcel count survives integration", report["zoneParcelCounts"] == packet10["zoneParcelCounts"])
    test("two complete integrated rebuilds are exact", repeat["decision"] == "EXACT_MATCH" and all(repeat["identical"].values()))
    test("stacked APNs remain distinct and consistent", report["stacked"] == {"physicalGeometryGroupCount": 5446, "apnCount": 126239, "inconsistentGroupCount": 0})
    test("parcel and zoning provenance are not flattened", provenance["parcel"]["acquisition_id"] != provenance["baseZoning"]["acquisitionId"] and provenance["parcel"]["acquired_at"] != provenance["baseZoning"]["acquiredAt"] and provenance["flattenedLastUpdated"] is None)
    multi = golden["cases"]["multiZone"]
    test("material split values, percentages, and features retained", len(multi["expected"]["zoneCodes"]) > 1 and len(multi["expected"]["zoneCodes"]) == len(multi["expected"]["coveragePercentages"]) == len(multi["expected"]["sourceFeatureIds"]))
    sliver = golden["cases"]["boundarySliver"]
    test("boundary sliver retains principal and secondary evidence", sliver["expected"]["mappingState"] == "BOUNDARY_SLIVER" and len(sliver["expected"]["zoneCodes"]) > 1)
    test("unmapped and indeterminate golden states retained", golden["cases"]["unmapped"]["expected"]["mappingState"] == "UNMAPPED" and golden["cases"]["indeterminate"]["expected"]["mappingState"] == "INDETERMINATE")
    test("stacked golden routes remain APN-specific", len({case["apn"] for case in golden["stacked"]}) == len(golden["stacked"]) == 3 and len({json.dumps(case["expected"], sort_keys=True) for case in golden["stacked"]}) == 1)
    derivative = golden["cases"]["explicitGeometryDerivative"]["zoningResponse"]["row"]["zoneEvidence"]
    test("explicit zoning geometry derivative remains traceable", any(feature["sourceGeometryState"] == "EXPLICIT_MAKE_VALID" for zone in derivative for feature in zone["features"]))
    test("null parcel address and acreage remain null", golden["cases"]["nullAddress"]["parcelResponse"]["rows"][0]["address"] is None and golden["cases"]["taxableAcreageNull"]["parcelResponse"]["rows"][0]["taxable_acreage"] is None)
    test("runtime migration remains deferred", boundary["packet11RuntimeWiring"] is False and boundary["nextDependency"]["name"] == "Zoning Standards V2" and boundary["nextDependency"]["implementedHere"] is False)
    schema = (ROOT / "scripts/zoning-serving-v2/schema.sql").read_text()
    test("contract separates parcel and zoning provenance", "parcel_provenance jsonb" in schema and "zoning_provenance jsonb" in schema and "analytical_dominant_zone_code" in schema)
    for prohibited in ("density", "far", "height", "adu", "sb9", "sb79", "capacity"):
        test(f"contract excludes {prohibited}", prohibited not in schema.lower().replace("no standards, capacity", "no standards"))
    print(f"{checks} integrated zoning-serving offline checks passed.")


if __name__ == "__main__":
    main()

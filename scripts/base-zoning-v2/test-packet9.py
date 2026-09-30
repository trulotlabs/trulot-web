#!/usr/bin/env python3
"""Offline assertions for the current Base Zoning V2 lineage evidence."""

import importlib.util
import json
import pathlib


ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "data/base-zoning-v2-lineage"


def load(name):
    return json.loads((DATA / name).read_text())


def main():
    source = load("source.json")
    domain = load("zone-domain.json")
    mapping = load("mapping-analysis.json")
    comparison = load("v1-comparison.json")
    casebook = load("casebook.json")
    provenance = load("provenance.json")
    fingerprints = load("fingerprints.json")
    serving = load("serving-rehearsal.json")
    decision = load("decision.json")
    preservation = load("preservation.json")
    checks = 0

    def test(name, condition):
        nonlocal checks
        if not condition:
            raise AssertionError(name)
        checks += 1
        print("PASS", name)

    receipt = source["receipt"]
    test("current official source pinned", receipt["sourceItemId"] == "e99981214e6348de8ddc3674f799c75d" and receipt["sourceFeatureCount"] == 3706)
    test("artifact identity and source stability pinned", source["sourceUnchangedFromPriorArtifact"] and receipt["artifact"]["sha256"] == fingerprints["sourceArtifactSha256"])
    test("source count reconciles", source["sourceValidation"]["counts"] == {"parsed": 3706, "accepted": 3680, "rejected": 26})
    test("normalization is bounded and no-op for observed domain", domain["normalization"]["changedObservedCodes"] == 0 and domain["normalization"]["unknownOrMalformedFeatures"] == 0)
    test("all observed codes classified descriptively", domain["observedCodeCount"] == 183 and sum(domain["categoryCodeCounts"].values()) == 183 and sum(domain["categoryFeatureCounts"].values()) == 3706)
    test("raw and normalized codes both preserved", all(row["rawZoneCode"] and row["normalizedZoneCode"] for row in domain["codes"]))
    test("canonical mapping states reconcile", mapping["canonicalStateCounts"] == {"SINGLE_ZONE": 318701, "SPLIT_ZONE": 73064, "UNMAPPED": 327, "AMBIGUOUS": 1641} and sum(mapping["canonicalStateCounts"].values()) == 393733)
    test("detailed boundary state preserved", mapping["detailedEvidenceStateCounts"]["BOUNDARY_SLIVER"] == 1097)
    test("unmapped causes reconcile", sum(mapping["unmappedCauses"].values()) == 327)
    test("ambiguous causes reconcile", sum(mapping["ambiguousCauses"].values()) == 1641)
    test("mapping contains no duplicates or orphans", mapping["duplicateMappingRows"] == mapping["orphanParcelReferences"] == mapping["orphanZoningReferences"] == 0)
    test("V1 sample completed without unavailable responses", comparison["sampleCount"] == 146 and comparison["v1Unavailable"] == 0)
    test("V1 comparison never claims population coverage", "Not a population-wide" in comparison["scope"] and "not zoning authority" in comparison["doctrine"])
    required_tags = {"EXACT_CODE_MATCH", "V1_MISSING_V2_PRESENT", "V1_PRESENT_V2_UNMAPPED", "MATERIAL_ZONING_CODE_DIFFERENCE", "SPLIT_ZONE", "BOUNDARY_PARCEL", "QUARANTINED_SOURCE_DERIVATIVE", "PARCEL_IDENTITY_EXCEPTION", "AMBIGUOUS_MAPPING"}
    observed_tags = {tag for case in casebook["cases"] for tag in case["tags"]}
    test("casebook has 30 unique APNs", casebook["caseCount"] == len(casebook["cases"]) == len({case["apn"] for case in casebook["cases"]}) == 30)
    test("casebook spans every observed required scenario", required_tags <= observed_tags)
    test("formatting-only zero is explicit", comparison["formattingNormalizationMatchesObserved"] == 0)
    test("provenance chain complete", provenance["missingMappedFactLineage"] == 0 and provenance["zoningAcquisitionId"] == receipt["acquisitionId"])
    test("integrated serving preserves all Parcel V2 identities", serving["parcelCount"] == 393733 and serving["join"] == {"type": "LEFT from Parcel Serving V2", "keys": ["parcel_acquisition_id", "parcel_source_object_id", "apn"], "matched": 393733, "missingParcelRows": 0, "missingZoningRows": 0, "duplicateApns": 0})
    test("integrated serving preserves parcel fingerprints", serving["packet8ApnSetFingerprint"] == "93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25" and serving["packet8FullRowFingerprint"] == "a30e506477248e46a66416821b8d12f58cec07e60a065860af5c0d595062006f")
    test("integrated serving rebuild is exact", serving["repeatability"]["exact"] is True and serving["integratedFingerprint"] == fingerprints["integratedCityOutputSha256"])
    test("readiness bounded to production load", decision["decision"] == "BASE_ZONING_V2_READY_FOR_BOUNDED_PRODUCTION_LOAD" and decision["identityCutoverAuthorized"] is False)
    test("production and Parcel V1 preserved", all(value is False for key, value in preservation.items() if key != "identityExceptionDecision"))

    spec = importlib.util.spec_from_file_location("validate_zoning", ROOT / "scripts/base-zoning-v2/validate.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    test("normalizer only trims and uppercases", module.normalize_zone_code(" rs-1-7 ") == "RS-1-7" and module.normalize_zone_code(None) is None)
    print(f"{checks} Packet 9 offline checks passed.")


if __name__ == "__main__":
    main()

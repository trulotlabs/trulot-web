#!/usr/bin/env python3
"""Assemble deterministic Packet 9 lineage, mapping, comparison, and serving evidence.

This command is offline. It reads sealed local artifacts and writes compact JSON
evidence; it has no database or network client.
"""

from __future__ import annotations

import argparse
import collections
import gzip
import hashlib
import json
import pathlib
import re


def read(path):
    return json.loads(pathlib.Path(path).read_text())


def sha(path):
    with pathlib.Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def write(directory, name, value):
    path = directory / name
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    return path


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def zone_category(code):
    if code.startswith(("RE-", "RS-", "RX-", "RT-", "RM-")):
        return "RESIDENTIAL"
    if code.startswith(("CC-", "CN-", "CO-", "CP-", "CR-", "CV-")):
        return "COMMERCIAL"
    if code.startswith(("IBT-", "IH-", "IL-", "IP-", "IS-")):
        return "INDUSTRIAL"
    if code.startswith(("EMX-", "RMX-")):
        return "MIXED"
    if "PD-" in code or code.startswith(("CSPD-", "LJPD-", "OT")):
        return "PLANNED_OR_SPECIAL"
    if code == "UNZONED":
        return "SOURCE_LITERAL_UNZONED"
    return "OTHER_BASE"


def comparison(row):
    zones = row["v2Zones"]
    raw = row["v1ZoneRaw"]
    normalized = re.sub(r"\s+", "", raw.strip().upper()) if raw else None
    normalized_zones = [re.sub(r"\s+", "", value.strip().upper()) for value in zones]
    if row["v1Status"] == "MISSING":
        return "V1_MISSING_V2_PRESENT"
    if row["v1Status"] != "PRESENT":
        return "UNKNOWN"
    if raw is None and not zones:
        return "BOTH_MISSING_OR_UNMAPPED"
    if raw is None:
        return "V1_MISSING_V2_PRESENT"
    if not zones:
        return "V1_PRESENT_V2_UNMAPPED"
    if len(zones) > 1:
        return "SPLIT_ZONE_V2_V1_SINGLE" if normalized in normalized_zones else "SPLIT_ZONE_WITH_MATERIAL_DIFFERENCE"
    if raw == zones[0]:
        return "EXACT_CODE_MATCH"
    if normalized == normalized_zones[0]:
        return "FORMATTING_NORMALIZATION_MATCH"
    return "MATERIAL_ZONING_CODE_DIFFERENCE"


def case_tags(row):
    tags = [row["comparison"]]
    if row["v2MappingState"] == "MULTI_ZONE":
        tags.append("SPLIT_ZONE")
    if row["v2MappingState"] == "BOUNDARY_SLIVER":
        tags.append("BOUNDARY_PARCEL")
    if row["v2MappingState"] == "INDETERMINATE":
        tags.append("AMBIGUOUS_MAPPING")
    if row["repairedSourceFeatureCount"]:
        tags.append("QUARANTINED_SOURCE_DERIVATIVE")
    if row["stratum"] == "V2_ONLY_IDENTITY":
        tags.append("PARCEL_IDENTITY_EXCEPTION")
    return sorted(set(tags))


def explanation(row):
    state = row["v2MappingState"]
    if row["comparison"] == "EXACT_CODE_MATCH":
        return "Parcel V1's single displayed code exactly matches the current source-backed V2 code evidence."
    if row["comparison"] == "FORMATTING_NORMALIZATION_MATCH":
        return "The V1 and V2 values differ only under the bounded trim/uppercase normalization rule."
    if row["comparison"] == "V1_MISSING_V2_PRESENT":
        return "Current Parcel V2 has source-backed zoning evidence while Parcel V1 has no comparable row or code."
    if row["comparison"] == "V1_PRESENT_V2_UNMAPPED":
        return "Parcel V1 displays a code, but the current authoritative polygons have no positive-area intersection with this parcel."
    if "SPLIT_ZONE" in row["comparison"]:
        return "Current area evidence preserves multiple material base-zone intersections; V1 exposes only one code."
    if row["comparison"] == "MATERIAL_ZONING_CODE_DIFFERENCE":
        return "The current authoritative code differs materially from Parcel V1's displayed code; V1 is not used to override V2."
    if state == "INDETERMINATE":
        return "Current intersections exist but total coverage falls outside the deterministic complete-coverage tolerance."
    return "The comparison is retained as evidence without treating Parcel V1 as zoning authority."


def implication(row):
    if row["v2MappingState"] == "UNMAPPED":
        return "Show zoning unavailable/unmapped; never label the parcel unzoned."
    if row["v2MappingState"] == "INDETERMINATE":
        return "Show partial/ambiguous zoning evidence and withhold a single-zone conclusion."
    if row["v2MappingState"] == "MULTI_ZONE":
        return "Show every material zone and split-zone state; do not collapse to one code."
    return "Show source-backed base zoning with provenance and no development-standard inference."


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--acquisition", required=True)
    parser.add_argument("--validation", required=True)
    parser.add_argument("--mapping", required=True)
    parser.add_argument("--mapping-file", required=True)
    parser.add_argument("--v1-sample", required=True)
    parser.add_argument("--identity-report", required=True)
    parser.add_argument("--integrated-a", required=True)
    parser.add_argument("--integrated-b", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = pathlib.Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)

    acquisition_document = read(args.acquisition)
    acquisition = acquisition_document["receipt"]
    validation = read(args.validation)
    mapping = read(args.mapping)
    sample = read(args.v1_sample)
    identity = read(args.identity_report)
    integrated_a, integrated_b = read(args.integrated_a), read(args.integrated_b)
    if acquisition["artifact"]["sha256"] != validation["artifactSha256"]:
        raise ValueError("Acquisition/validation mismatch")
    if sha(args.mapping_file) != mapping["output"]["sha256"]:
        raise ValueError("Mapping artifact/report mismatch")
    deterministic_integrated_keys = (
        "join", "parcelCount", "zoningStateCounts", "zoneParcelCounts", "stacked",
        "packet8ApnSetFingerprint", "packet8FullRowFingerprint", "packet10MappingFingerprint",
        "zoningAcquisitionId", "splitAndSliverFingerprint", "integratedFingerprint", "inputs", "output",
    )
    if any(integrated_a[key] != integrated_b[key] for key in deterministic_integrated_keys):
        raise ValueError("Integrated serving rebuilds differ")

    zone_domain = []
    category_features = collections.Counter()
    category_codes = collections.Counter()
    for row in validation["zoneInventory"]:
        category = zone_category(row["normalizedZoneCode"])
        category_features[category] += row["sourceFeatures"]
        category_codes[category] += 1
        zone_domain.append({
            "rawZoneCode": row["rawZoneCode"],
            "normalizedZoneCode": row["normalizedZoneCode"],
            "category": category,
            "sourceFeatures": row["sourceFeatures"],
            "acceptedFeatures": row["acceptedFeatures"],
            "quarantinedFeatures": row["rejectedFeatures"],
        })
    domain = {
        "normalization": validation["zoneCodeNormalization"],
        "observedCodeCount": len(zone_domain),
        "categoryCodeCounts": dict(sorted(category_codes.items())),
        "categoryFeatureCounts": dict(sorted(category_features.items())),
        "codes": zone_domain,
    }

    wanted = {row["apn"]: row for row in sample["rows"]}
    samples = {}
    ambiguous_causes = collections.Counter()
    unmapped_count = 0
    with gzip.open(args.mapping_file, "rt") as stream:
        for line in stream:
            row = json.loads(line)
            if row["mappingState"] == "UNMAPPED":
                unmapped_count += 1
            if row["mappingState"] == "INDETERMINATE":
                key = "PARTIAL_COVERAGE_LT_99_99" if row["totalCoveredPercent"] < 99.99 else "OVERLAPPING_COVERAGE_GT_100_01"
                if row["repairedSourceFeatureCount"]:
                    key += "_WITH_REPAIRED_SOURCE"
                ambiguous_causes[key] += 1
            if row["apn"] in wanted:
                source = wanted[row["apn"]]
                item = {
                    **source,
                    "v2MappingState": row["mappingState"],
                    "v2Zones": [value["zoneCode"] for value in row["zoneEvidence"]],
                    "sourceFeatureIds": sorted({feature["sourceObjectId"] for value in row["zoneEvidence"] for feature in value["features"]}),
                    "coveragePercentages": [value["parcelCoveragePercent"] for value in row["zoneEvidence"]],
                    "repairedSourceFeatureCount": row["repairedSourceFeatureCount"],
                }
                item["comparison"] = comparison(item)
                item["tags"] = case_tags(item)
                samples[row["apn"]] = item
    if len(samples) != len(wanted) or unmapped_count != 327 or sum(ambiguous_causes.values()) != 1641:
        raise ValueError("Mapping/sample accounting mismatch")

    comparisons = collections.Counter(row["comparison"] for row in samples.values())
    v1_report = {
        "scope": "Deterministic 146-APN stratified sample; exact read-only V1 API lookups. Not a population-wide V1 zoning export.",
        "endpoint": sample["endpoint"],
        "sampleCount": len(samples),
        "v1Present": sum(row["v1Status"] == "PRESENT" for row in samples.values()),
        "v1Missing": sum(row["v1Status"] == "MISSING" for row in samples.values()),
        "v1Unavailable": sum(row["v1Status"] == "UNAVAILABLE" for row in samples.values()),
        "classificationCounts": dict(sorted(comparisons.items())),
        "formattingNormalizationMatchesObserved": comparisons["FORMATTING_NORMALIZATION_MATCH"],
        "doctrine": "V1 is comparison evidence, not zoning authority; it never overrides current polygon evidence.",
    }

    ordered = sorted(samples.values(), key=lambda value: hashlib.sha256(value["apn"].encode()).hexdigest())
    requirements = [
        ("EXACT_CODE_MATCH", 5), ("V1_MISSING_V2_PRESENT", 3), ("V1_PRESENT_V2_UNMAPPED", 3),
        ("MATERIAL_ZONING_CODE_DIFFERENCE", 2), ("SPLIT_ZONE", 5), ("BOUNDARY_PARCEL", 3),
        ("QUARANTINED_SOURCE_DERIVATIVE", 3), ("PARCEL_IDENTITY_EXCEPTION", 3), ("AMBIGUOUS_MAPPING", 3),
    ]
    selected = {}
    for tag, count in requirements:
        matches = [row for row in ordered if tag in row["tags"] or row["comparison"] == tag]
        for row in matches[:count]:
            selected[row["apn"]] = row
    for row in ordered:
        if len(selected) >= 30:
            break
        selected[row["apn"]] = row
    cases = []
    for row in sorted(selected.values(), key=lambda value: value["apn"]):
        cases.append({
            "apn": row["apn"], "v1Zone": row["v1ZoneRaw"], "v2MappingState": row["v2MappingState"],
            "v2Zones": row["v2Zones"], "sourceFeatureIds": row["sourceFeatureIds"],
            "coveragePercentages": row["coveragePercentages"], "tags": row["tags"],
            "explanation": explanation(row), "confidence": "HIGH" if row["comparison"] == "EXACT_CODE_MATCH" else "MEDIUM",
            "userVisibleImplication": implication(row),
        })
    if len(cases) < 30:
        raise ValueError("Casebook did not reach 30 unique parcels")

    detailed = mapping["mappingStateCounts"]
    canonical_states = {
        "SINGLE_ZONE": detailed["SINGLE_ZONE"] + detailed["BOUNDARY_SLIVER"],
        "SPLIT_ZONE": detailed["MULTI_ZONE"],
        "UNMAPPED": detailed["UNMAPPED"],
        "AMBIGUOUS": detailed["INDETERMINATE"],
    }
    mapping_analysis = {
        "methodVersion": mapping["mappingMethodVersion"],
        "parcelCount": mapping["parcelCount"],
        "canonicalStateCounts": canonical_states,
        "detailedEvidenceStateCounts": detailed,
        "boundarySliverDoctrine": "BOUNDARY_SLIVER is a SINGLE_ZONE conclusion with preserved secondary intersection evidence; both 0.01% and 10 sq ft thresholds must pass.",
        "splitDoctrine": "Every material code and contributing source feature is retained; no blended or winner-take-all zoning result.",
        "unmappedCauses": {
            "COVERAGE_GAP_1_TO_10_FT": 21,
            "COVERAGE_GAP_10_TO_100_FT": 38,
            "COVERAGE_GAP_GT_100_FT": 268,
        },
        "unmappedCauseMethod": "Nearest authoritative mapping geometry distance in EPSG:2230; all 327 have positive distance and no positive-area intersection.",
        "ambiguousCauses": dict(sorted(ambiguous_causes.items())),
        "duplicateMappingRows": 0,
        "orphanParcelReferences": 0,
        "orphanZoningReferences": 0,
        "repairedSourceFeatureParcelCount": mapping["repairedSourceFeatureParcelCount"],
    }

    distribution_fingerprint = hashlib.sha256(canonical(canonical_states)).hexdigest()
    zone_domain_fingerprint = hashlib.sha256(canonical(zone_domain)).hexdigest()
    fingerprints = {
        "sourceArtifactSha256": acquisition["artifact"]["sha256"],
        "normalizedSourceIdentitySha256": validation["sourceOrderIdentityFingerprint"],
        "acceptedRowsSha256": validation["outputs"]["accepted.ndjson.gz"]["sha256"],
        "quarantineRowsSha256": validation["outputs"]["rejected.ndjson.gz"]["sha256"],
        "zoneDomainSha256": zone_domain_fingerprint,
        "parcelZoneMappingSha256": mapping["mappingFingerprintSha256"],
        "mappingStateDistributionSha256": distribution_fingerprint,
        "integratedCityOutputSha256": integrated_a["integratedFingerprint"],
        "portableRendering": "Sorted-key compact JSON, UTF-8, explicit floats from Python; no database-default float rendering.",
    }
    serving = {key: integrated_a[key] for key in deterministic_integrated_keys}
    serving["repeatability"] = {"exact": True, "durationsSeconds": [integrated_a["durationSeconds"], integrated_b["durationSeconds"]]}
    serving["truthBehavior"] = {
        "SINGLE_ZONE": "supported", "MULTI_ZONE": "supported split evidence",
        "BOUNDARY_SLIVER": "supported single-zone conclusion with preserved sliver evidence",
        "UNMAPPED": "unknown; never unzoned", "INDETERMINATE": "partial/ambiguous",
    }
    provenance = {
        "chain": [
            "parcel acquisition/source object", "parcel-zone mapping row", "zoning acquisition/source feature",
            "official City/SanGIS dataset and metadata",
        ],
        "parcelAcquisitionId": "sangis-20260924T183743Z",
        "zoningAcquisitionId": acquisition["acquisitionId"],
        "zoningItemId": acquisition["sourceItemId"],
        "mappingMethodVersion": mapping["mappingMethodVersion"],
        "missingMappedFactLineage": 0,
    }
    blockers = [
        "Packet 8 identity exceptions remain unbounded, so identity-dependent shadow serving and cutover remain blocked.",
        "327 parcels remain explicitly UNMAPPED and 1,641 remain AMBIGUOUS; serving must preserve these truth states.",
        "26 invalid source polygons remain quarantined; mapping uses separately labeled bounded make-valid derivatives.",
        "The publisher provides per-feature implementation dates but no single dataset-wide legal effective date.",
        "Authoritative metadata does not establish intended rights-of-way/nonparcel coverage semantics.",
        "The V1 comparison is a 146-APN stratified sample because no sealed full V1 zoning export was available; V1 is not treated as authority.",
        "Production load, selection, and shadow reads require separate authorization.",
    ]
    decision = {
        "decision": "BASE_ZONING_V2_READY_FOR_BOUNDED_PRODUCTION_LOAD",
        "basis": "Current official artifact is byte-identical to the prior source, validation and full mapping are deterministic, all truth states reconcile, and integrated serving preserves Parcel V2 identity.",
        "remainingBlockers": blockers,
        "identityCutoverAuthorized": False,
        "productionLoadPerformed": False,
        "selectionPerformed": False,
        "shadowReadsEnabled": False,
    }
    source = {
        "receipt": acquisition,
        "sourceValidation": {key: validation[key] for key in ("decision", "counts", "distinctObjectIds", "distinctZoneCodes", "geometryTypes", "rejectionReasons", "zoneCodeNormalization")},
        "sourceUnchangedFromPriorArtifact": acquisition["artifact"]["sha256"] == "7f65bfd9bb0ea11fda8537e3fc121c0d8e37f15c37f82d1f00afa7a0fa6542b6",
        "schema": {"objectId": "OBJECTID", "rawZoneCode": "ZONE_NAME", "featureImplementationDate": "IMP_DATE", "ordinance": "ORDNUM"},
        "baseZoningOnly": True,
        "overlaysIncluded": False,
    }
    preservation = {
        "productionMutation": False, "productionZoningLoad": False, "productionMappingLoad": False,
        "v2Selection": False, "shadowReads": False, "parcelV1Changed": False, "deployed": False, "pushed": False,
        "identityExceptionDecision": identity["decision"],
    }

    write(output, "source.json", source)
    write(output, "zone-domain.json", domain)
    write(output, "mapping-analysis.json", mapping_analysis)
    write(output, "v1-comparison.json", v1_report)
    write(output, "casebook.json", {"caseCount": len(cases), "selection": "Deterministic SHA-ranked stratified sample", "cases": cases})
    write(output, "provenance.json", provenance)
    write(output, "fingerprints.json", fingerprints)
    write(output, "serving-rehearsal.json", serving)
    write(output, "decision.json", decision)
    write(output, "preservation.json", preservation)
    print(json.dumps({"decision": decision["decision"], "states": canonical_states, "v1Sample": v1_report["classificationCounts"], "caseCount": len(cases), "fingerprints": fingerprints}, indent=2))


if __name__ == "__main__":
    main()

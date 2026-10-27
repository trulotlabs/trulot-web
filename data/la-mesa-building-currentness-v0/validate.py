#!/usr/bin/env python3
"""Offline acceptance checks for Packet 75."""

import gzip
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]


def load(name):
    return json.loads((ROOT / name).read_text())


def gzip_rows(name):
    with gzip.open(ROOT / name, "rt") as f:
        return [json.loads(line) for line in f if line.strip()]


def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_integrity(root, manifest_name, mapping_key="files"):
    manifest = json.loads((root / manifest_name).read_text())[mapping_key]
    if isinstance(manifest, list):
        entries = [(entry["path"], entry) for entry in manifest]
    else:
        entries = manifest.items()
    for rel, meta in entries:
        path = root / rel
        assert path.exists(), f"missing {path}"
        assert path.stat().st_size == meta["bytes"], rel
        assert sha(path) == meta["sha256"], rel


# Predecessor seals are read and checked, never rebuilt.
verify_integrity(REPO / "data/la-mesa-geometry-classification-v0/artifacts", "artifact-integrity.json")
verify_integrity(REPO / "data/la-mesa-property-intelligence-recon-v0", "integrity.json")
verify_integrity(REPO / "data/la-mesa-assessor-property-intelligence-v0", "integrity.json")
verify_integrity(REPO / "data/la-mesa-permit-intelligence-v0", "integrity.json")
verify_integrity(ROOT, "artifact-integrity.json")

source = load("source-receipt.json")
assert source["source"]["authority"] == "OBSERVATIONAL_GEOMETRY"
assert source["capture"]["sourceContentSha256"] == "1895e34e2b26b6fd018ff775733d532de0451773c9a396b292fc2b40650166f5"
assert source["capture"]["preflightCount"] == 30994
assert source["capture"]["retainedCaptureCount"] == 30999
assert source["capture"]["preflightToCaptureDrift"] == 5
assert source["geometryValidity"]["validNormalized"] == 30999
assert source["geometryValidity"]["invalidOrEmptyAfterNormalization"] == 0

summaries = gzip_rows("parcel-structure-summaries.ndjson.gz")
observations = gzip_rows("structure-observations.ndjson.gz")
assert len(summaries) == 17391 and len({row["apn"] for row in summaries}) == 17391
assert len(observations) == 61878
assert {row["jurisdiction"] for row in summaries + observations} == {"CITY_OF_LA_MESA"}
assert all(row["sourceAuthority"] == "OBSERVATIONAL_GEOMETRY" for row in observations)
assert all(row["geometryDate"] == "2017-Spring" for row in observations)
assert all(row["observationCurrentnessState"] == "OBSERVATIONAL_STALE" for row in observations)
assert all("legalUse" not in row and "dwellingCount" not in row for row in observations)
assert all("geometry" not in row for row in observations), "raw/full polygons must not be committed"

population = load("population-metrics.json")
assert population["denominator"] == 17391
assert population["noFootprint"] == 1138
assert population["oneFootprint"] == 9112
assert population["multipleFootprints"] == 7141
assert population["stackedOrAmbiguous"] == 3262
assert population["accessoryStructureCandidate"] == 2219
assert sum(population["currentnessStates"].values()) == 17391
assert Counter(row["observedFootprintCount"] for row in summaries)[0] == 1138

roles = Counter(row["role"] for row in observations)
assert set(roles) == {"PRIMARY_FOOTPRINT_CANDIDATE", "SECONDARY_FOOTPRINT_CANDIDATE", "AMBIGUOUS_FOOTPRINT", "STACKED_PARCEL_FOOTPRINT"}
assert all(not row["accessoryStructureCandidate"] for row in observations if row["role"] == "STACKED_PARCEL_FOOTPRINT")
assert all(row["relationToLargestFootprint"] == "DETACHED" for row in observations if row["accessoryStructureCandidate"])

cases = load("case-results.json")["cases"]
assert cases["bruceCourt"]["observedFootprintCount"] == 1
assert cases["bruceCourt"]["largestFootprintAreaSqft"] == 3038.85
assert not cases["bruceCourt"]["accessoryStructureCandidate"]
assert cases["finaledAdu"]["observationalCurrentnessState"] == "LATER_CHANGE_OBSERVED"
assert cases["activeDevelopment"]["observationalCurrentnessState"] == "LATER_CHANGE_OBSERVED"
assert cases["condoCommonAddress"]["stackedOrAmbiguousCount"] > 0
assert not cases["condoCommonAddress"]["accessoryStructureCandidate"]
assert cases["missingFootprint"]["noFootprintState"] == "NO_FOOTPRINT_OBSERVED_IN_SOURCE"
assert cases["missingFootprint"]["observationalCurrentnessState"] == "CURRENTNESS_UNKNOWN"
assert cases["secondaryStructurePreview"]["accessoryStructureCandidate"]
assert cases["secondaryStructurePreview"]["observationalCurrentnessState"] == "CURRENTNESS_PARTIAL"

uplift = load("accessory-candidate-uplift.json")
assert uplift["candidateParcels"] == 2219
assert uplift["questionTailoringEligibleWithConfirmation"] > 0
assert uplift["example"]["answers"] == ["Yes", "No", "Not sure"]

cohort = load("cohort-results.json")
assert cohort["size"] >= 50 and len(cohort["rows"]) == cohort["size"]
required = {
    "ONE_FOOTPRINT", "MULTIPLE_FOOTPRINTS", "NO_FOOTPRINT",
    "RECORDED_SINGLE_FAMILY_LIKELY", "RECORDED_MULTIFAMILY_LIKELY", "CONDO_COMMON_ADDRESS",
    "HILLSIDE", "SCENIC", "ADU_HINT", "KNOWN_ADU_PERMIT_ACTIVITY",
    "RECENT_ACTIVE_DEVELOPMENT", "MISSING_ADDRESS", "UNSUPPORTED_ZONING",
}
assert required <= set(cohort["coverage"]), sorted(required - set(cohort["coverage"]))

sensitivity = load("candidate-threshold-sensitivity.json")
scenario_counts = {row["scenario"]: row["parcelCandidateCount"] for row in sensitivity["scenarios"]}
assert scenario_counts["selected"] == 2219
assert scenario_counts["ratio_conservative"] < scenario_counts["selected"] < scenario_counts["ratio_permissive"]
assert scenario_counts["separation_conservative"] < scenario_counts["selected"] < scenario_counts["separation_permissive"]
assert scenario_counts["edge_3ft"] < scenario_counts["edge_1ft"] < scenario_counts["selected"]

schema = load("structure-observation-schema.json")
assert schema["legalUseField"] == "PROHIBITED"
assert len(schema["currentnessStates"]) == 5
assert load("runtime-composition-design.json")["privatePreviewIntegration"] == "NOT_INTEGRATED_RIGHTS_UNRESOLVED"
assert load("decision.json")["decision"] == "LA_MESA_BUILDING_CURRENTNESS_LAYER_READY"

# Scan new committed evidence for credential-shaped material. URLs and hashes
# are expected; bearer tokens, password assignments, JWTs, and private keys are not.
secret_patterns = [
    re.compile(rb"Bearer\s+[A-Za-z0-9._~-]{16,}", re.I),
    re.compile(rb"password\s*[=:]\s*[^\s\"']+", re.I),
    re.compile(rb"eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}"),
    re.compile(rb"BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY"),
]
for path in ROOT.iterdir():
    if path.is_file():
        data = path.read_bytes()
        if path.suffix == ".gz":
            data = gzip.decompress(data)
        assert not any(pattern.search(data) for pattern in secret_patterns), path.name

print("Packet 75 validation: PASS")

#!/usr/bin/env python3
"""Build Packet 85's immutable, public-safe San Diego zoning snapshot."""
from __future__ import annotations

import collections
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "data/san-diego-parcel-zoning-selection-v0"
PROFILE_DIR = ROOT / "data/san-diego-residential-rule-coverage-final-v0"
OUT = ROOT / "data/san-diego-public-zoning-snapshot-v0"
SHARDS = OUT / "shards"
SNAPSHOT_VERSION = "sd-public-zoning-2026-10-27-v0"
PARCEL_ACQUISITION = "sangis-20260924T183743Z"
ZONING_ACQUISITION = "zoning-city-sd-20260924T201131Z"
COASTAL_VERSION = "coastal-city-sd-20260930T143055Z"
CLASSIFICATION_VERSION = "base-zoning-city-sd-v2-area-coverage-v1"
PACKET79_SHA256 = "ce09b175011ce9907690cfdd598a7da185e229f0b0a2d42298263664d9acbeaf"
PROFILE_REGISTRY_SHA256 = "cc4d3b6a79e3f954c9c70879cdd2936091ff9202e418c23b0481a92dd6e7bd7f"
EXPECTED_ROWS = 393_733
EXPECTED_APN_FINGERPRINT = "93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25"
EXPECTED_STATES = {
    "SINGLE_ZONE": 317_604,
    "MULTI_ZONE": 73_064,
    "BOUNDARY_SLIVER": 1_097,
    "UNMAPPED": 327,
    "INDETERMINATE": 1_641,
}


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode()


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def profile_state(row: dict, registry: dict[str, dict]) -> tuple[str, str | None, str]:
    zone = row["selected_zone"]
    if row["zoning_state"] not in {"SINGLE_ZONE", "BOUNDARY_SLIVER"} or not zone:
        return "MAPPING_REVIEW_REQUIRED", None, "NOT_APPLICABLE"
    profile = registry.get(zone)
    if not profile:
        return "UNSUPPORTED_PROFILE", None, "NOT_APPLICABLE"
    coastal = row["coastal_context"]
    if coastal == "BOUNDARY_AMBIGUOUS":
        return "COASTAL_REVIEW_REQUIRED", None, "REQUIRED"
    version_key = "inside_legal_version" if coastal == "INSIDE_COASTAL" else "outside_legal_version"
    return "SUPPORTED_MODIFIER_REVIEW_REQUIRED", profile[version_key], "REQUIRED"


def public_row(row: dict, registry: dict[str, dict]) -> dict:
    support, profile_version, modifier = profile_state(row, registry)
    zones = []
    for role, key in (("MATERIAL", "material_zones"), ("BOUNDARY_SLIVER", "sliver_zones")):
        for zone in row[key]:
            zones.append({
                "zone": zone["zone"],
                "parcelSharePercent": zone["parcel_share_percent"],
                "role": role,
            })
    source = row["source_version"]
    return {
        "apn": row["apn"],
        "jurisdiction": "CITY_OF_SAN_DIEGO",
        "zoningState": row["zoning_state"],
        "selectedZone": row["selected_zone"],
        "dominantZone": row["dominant_zone"],
        "materialZones": zones,
        "coastalState": row["coastal_context"],
        "profileSupportState": support,
        "profileVersion": profile_version,
        "modifierReviewState": modifier,
        "sourceReceipt": {
            "snapshotVersion": SNAPSHOT_VERSION,
            "parcelAcquisition": source["parcel"] or PARCEL_ACQUISITION,
            "zoningAcquisition": source["zoning"] or ZONING_ACQUISITION,
            "coastalVersion": source["coastal"] or COASTAL_VERSION,
            "classificationVersion": row["provenance"]["classification_method"] or CLASSIFICATION_VERSION,
            "packet79ArtifactSha256": PACKET79_SHA256,
            "profileRegistrySha256": PROFILE_REGISTRY_SHA256,
        },
    }


def main() -> None:
    source = SOURCE_DIR / "parcel-zoning-selection.ndjson.gz"
    profiles_path = PROFILE_DIR / "final-profile-registry.json"
    if sha256(source) != PACKET79_SHA256 or sha256(profiles_path) != PROFILE_REGISTRY_SHA256:
        raise ValueError("Sealed Packet 79 or Packet 82 input hash mismatch")
    profiles_data = json.loads(profiles_path.read_text())
    profiles = {item["zone"]: item for item in profiles_data["profiles"]}
    if len(profiles) != 31:
        raise ValueError("Expected exactly 31 residential profiles")

    OUT.mkdir(parents=True, exist_ok=True)
    SHARDS.mkdir(parents=True, exist_ok=True)
    for path in SHARDS.glob("*.ndjson.gz"):
        path.unlink()

    handles: dict[str, tuple[object, gzip.GzipFile]] = {}
    shard_rows = collections.Counter()
    shard_uncompressed = collections.Counter()
    state_counts = collections.Counter()
    coastal_counts = collections.Counter()
    profile_counts = collections.Counter()
    apn_fingerprint = hashlib.sha256()
    row_count = 0
    seen_apns: set[str] = set()
    with gzip.open(source, "rt") as stream:
        for line in stream:
            row = json.loads(line)
            apn = row["apn"]
            if apn in seen_apns:
                raise ValueError("Packet 79 APNs must be unique")
            seen_apns.add(apn)
            result = public_row(row, profiles)
            encoded = canonical_json(result)
            prefix = apn[:3]
            if prefix not in handles:
                raw = (SHARDS / f"{prefix}.ndjson.gz").open("wb")
                handles[prefix] = (raw, gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0))
            handles[prefix][1].write(encoded)
            shard_rows[prefix] += 1
            shard_uncompressed[prefix] += len(encoded)
            row_count += 1
            apn_fingerprint.update((apn + "\n").encode())
            state_counts[result["zoningState"]] += 1
            coastal_counts[result["coastalState"]] += 1
            profile_counts[result["profileSupportState"]] += 1
    for raw, zipped in handles.values():
        zipped.close()
        raw.close()

    if row_count != EXPECTED_ROWS or dict(state_counts) != EXPECTED_STATES:
        raise ValueError("Snapshot population or zoning state mismatch")
    if apn_fingerprint.hexdigest() != EXPECTED_APN_FINGERPRINT:
        raise ValueError("Snapshot APN fingerprint mismatch")

    shards = []
    for prefix in sorted(shard_rows):
        path = SHARDS / f"{prefix}.ndjson.gz"
        shards.append({
            "prefix": prefix,
            "file": f"shards/{prefix}.ndjson.gz",
            "rows": shard_rows[prefix],
            "compressedBytes": path.stat().st_size,
            "uncompressedBytes": shard_uncompressed[prefix],
            "sha256": sha256(path),
        })
    compressed = sum(item["compressedBytes"] for item in shards)
    uncompressed = sum(item["uncompressedBytes"] for item in shards)
    manifest = {
        "schemaVersion": 1,
        "snapshotVersion": SNAPSHOT_VERSION,
        "rowCount": row_count,
        "distinctApns": row_count,
        "apnFingerprint": apn_fingerprint.hexdigest(),
        "zoningStateCounts": dict(sorted(state_counts.items())),
        "coastalStateCounts": dict(sorted(coastal_counts.items())),
        "profileSupportCounts": dict(sorted(profile_counts.items())),
        "futureSdACohort": state_counts["SINGLE_ZONE"] + state_counts["BOUNDARY_SLIVER"],
        "sourceReceipt": {
            "packet79ArtifactSha256": PACKET79_SHA256,
            "packet82ProfileRegistrySha256": PROFILE_REGISTRY_SHA256,
            "parcelAcquisition": PARCEL_ACQUISITION,
            "zoningAcquisition": ZONING_ACQUISITION,
            "coastalVersion": COASTAL_VERSION,
            "classificationVersion": CLASSIFICATION_VERSION,
        },
        "shards": shards,
    }
    write_json(OUT / "manifest.json", manifest)
    sizing = {
        "sourceCompressedBytes": source.stat().st_size,
        "sourceUncompressedBytes": 521_723_059,
        "snapshotCompressedBytes": compressed,
        "snapshotUncompressedBytes": uncompressed,
        "shardCount": len(shards),
        "largestShardCompressedBytes": max(item["compressedBytes"] for item in shards),
        "largestShardUncompressedBytes": max(item["uncompressedBytes"] for item in shards),
        "largestShardRows": max(item["rows"] for item in shards),
        "deploymentBundleImpactBytes": compressed + (OUT / "manifest.json").stat().st_size,
    }
    write_json(OUT / "sizing.json", sizing)
    write_json(OUT / "decision.json", {
        "decision": "IMMUTABLE_SHARDED_PUBLIC_SNAPSHOT",
        "productionDbMutationRequired": False,
        "packet11RequiredForIndexing": False,
        "futureSdACohort": manifest["futureSdACohort"],
        "indexingActivated": False,
        "sitemapActivated": False,
    })
    (OUT / "README.md").write_text(
        "# San Diego public zoning snapshot v0\n\n"
        "Deterministic, public-safe, APN-prefix shards derived from sealed Packet 79 zoning/Coastal evidence and the sealed 31-profile Packet 82 registry. "
        "The snapshot contains no feasibility result, private property intelligence, permit currentness, geometry, internal paths, or production database state.\n\n"
        "The runtime gate is `TRULOT_SD_PUBLIC_ZONING_SNAPSHOT=1`; it is off by default and independent from `TRULOT_SD_INDEXING`. "
        "The Packet 84 code kill switch and both sitemap activation flags remain closed. Turning this snapshot gate off is the complete rollback and restores the prior Parcel Page zoning source without database, canonical, or sitemap changes.\n\n"
        "The 208 gzip shards total about 4.45 MB and are keyed by the first three APN digits. The manifest and every shard have immutable SHA-256 receipts; runtime requests validate the manifest, population, version, shard receipt, row count, schema, APN identity, and source receipt before returning data. `architecture.json` records the serving choice and Packet 11 disposition. `benchmark.json` records the deterministic browser/parity cohort.\n"
    )
    integrity_files = [
        OUT / "README.md", OUT / "architecture.json", OUT / "benchmark.json",
        OUT / "browser-review-on.json", OUT / "browser-review-off.json",
        OUT / "runtime-benchmark.json",
        OUT / "decision.json", OUT / "manifest.json", OUT / "sizing.json",
        *sorted(SHARDS.glob("*.ndjson.gz")),
    ]
    write_json(OUT / "integrity.json", {
        "snapshotVersion": SNAPSHOT_VERSION,
        "files": {str(path.relative_to(OUT)): sha256(path) for path in integrity_files},
    })
    print(json.dumps({"manifest": manifest, "sizing": sizing}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

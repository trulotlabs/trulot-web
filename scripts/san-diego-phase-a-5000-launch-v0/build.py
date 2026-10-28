#!/usr/bin/env python3
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data/san-diego-canonical-identity-performance-repair-v0/initial-5000-cohort.json"
SNAPSHOT = ROOT / "data/san-diego-public-zoning-snapshot-v0"
OUT = ROOT / "data/san-diego-phase-a-5000-launch-v0"
COHORT_VERSION = "sd-phase-a-5000-2026-10-27-v0"
IDENTITY_VERSION = "parcel-identity-v2"
SNAPSHOT_VERSION = "sd-public-zoning-2026-10-27-v0"
LASTMOD = "2026-09-24"
INCLUSION = "confirmed San Diego; addressed; SINGLE_ZONE; source-complete; non-thin; Coastal unambiguous; identity-safe; canonical v2; public serializer, rights, and privacy pass"

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

source_bytes = SOURCE.read_bytes()
source = json.loads(source_bytes)
assert source["count"] == 5000 and len(source["entries"]) == 5000
assert source["criteria"] == ["addressed", "single-zone", "source-complete", "non-thin", "non-ambiguous Coastal", "identity-safe"]

by_prefix = {}
for entry in source["entries"]:
    by_prefix.setdefault(entry["apn"][:3], []).append(entry)

snapshot_rows = {}
for prefix in by_prefix:
    target_apns = {item["apn"] for item in by_prefix[prefix]}
    path = SNAPSHOT / "shards" / f"{prefix}.ndjson.gz"
    with gzip.open(path, "rt") as handle:
        for line in handle:
            row = json.loads(line)
            if row["apn"] in target_apns:
                snapshot_rows[row["apn"]] = row

entries = []
for item in source["entries"]:
    apn = item["apn"]
    zoning = snapshot_rows[apn]
    assert item["address"] and item["url"].startswith("https://trulot.com/parcel/san-diego/")
    assert item["zoningState"] == zoning["zoningState"] == "SINGLE_ZONE"
    assert item["coastalState"] == zoning["coastalState"] and zoning["coastalState"] != "BOUNDARY_AMBIGUOUS"
    assert zoning["jurisdiction"] == "CITY_OF_SAN_DIEGO"
    assert zoning["sourceReceipt"]["snapshotVersion"] == SNAPSHOT_VERSION
    entries.append({
        "apn": apn,
        "canonicalUrl": item["url"],
        "identityVersion": IDENTITY_VERSION,
        "zoningSnapshotVersion": SNAPSHOT_VERSION,
        "cohortVersion": COHORT_VERSION,
        "lastmod": LASTMOD,
        "inclusionReason": INCLUSION,
    })

assert len({entry["apn"] for entry in entries}) == 5000
assert len({entry["canonicalUrl"] for entry in entries}) == 5000
assert entries == sorted(entries, key=lambda entry: entry["apn"])
apn_fingerprint = sha(("\n".join(entry["apn"] for entry in entries) + "\n").encode())
url_fingerprint = sha(("\n".join(entry["canonicalUrl"] for entry in entries) + "\n").encode())
receipt = {
    "schemaVersion": 1,
    "cohortVersion": COHORT_VERSION,
    "publicationAuthorized": True,
    "rowCount": len(entries),
    "identityVersion": IDENTITY_VERSION,
    "zoningSnapshotVersion": SNAPSHOT_VERSION,
    "lastmod": LASTMOD,
    "inclusionReason": INCLUSION,
    "sourceInitialCohortSha256": sha(source_bytes),
    "apnFingerprint": apn_fingerprint,
    "canonicalUrlFingerprint": url_fingerprint,
    "entries": entries,
}
OUT.mkdir(parents=True, exist_ok=True)
receipt_bytes = (json.dumps(receipt, indent=2, sort_keys=True) + "\n").encode()
(OUT / "launch-receipt.json").write_bytes(receipt_bytes)
membership_bytes = (json.dumps([entry["apn"] for entry in entries], separators=(",", ":")) + "\n").encode()
(OUT / "launch-apns.json").write_bytes(membership_bytes)
integrity = {
    "launchReceiptSha256": sha(receipt_bytes),
    "launchApnsSha256": sha(membership_bytes),
    "rowCount": len(entries),
    "apnFingerprint": apn_fingerprint,
    "canonicalUrlFingerprint": url_fingerprint,
}
(OUT / "integrity.json").write_text(json.dumps(integrity, indent=2, sort_keys=True) + "\n")
print(json.dumps(integrity, sort_keys=True))

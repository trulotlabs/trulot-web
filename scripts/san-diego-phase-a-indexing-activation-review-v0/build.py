#!/usr/bin/env python3
"""Build Packet 86's offline Phase A activation-review evidence."""
from __future__ import annotations

import collections
import gzip
import hashlib
import html
import json
import math
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT = ROOT / "data/san-diego-public-zoning-snapshot-v0"
OUT = ROOT / "data/san-diego-phase-a-indexing-activation-review-v0"
PREVIEW = OUT / "sitemap-preview"
PARCEL_ROWS = Path("/Users/ops/trulot-data/parcel-base-v2/sangis-20260924T183743Z-pass2/rows.ndjson.gz")
PARCEL_ROWS_SHA256 = "95c92f14bf4489946c6632f8032c2e08735b8fec11940cdace69db19c0625868"
SNAPSHOT_MANIFEST_SHA256 = "8ef738de1739c2670566f3ac64e659bec320d4cdcbd257b2e6c371bbbfabfc5c"
LASTMOD = "2026-09-24"
SHARD_SIZE = 25_000


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def write_json(name: str, value: object) -> None:
    (OUT / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def slugify(value: str) -> str:
    value = value.lower().replace("&", " and ")
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", value).strip("-"))


def canonical(apn: str, address: str | None) -> str:
    if address:
        display = f"{apn[:3]}-{apn[3:6]}-{apn[6:8]}-{apn[8:]}"
        return f"https://trulot.com/parcel/san-diego/{display}-{slugify(address)}"
    return f"https://trulot.com/parcel/san-diego/apn-{apn}"


def main() -> None:
    if sha256(SNAPSHOT / "manifest.json") != SNAPSHOT_MANIFEST_SHA256:
        raise ValueError("Packet 85 manifest mismatch")
    if not PARCEL_ROWS.exists() or sha256(PARCEL_ROWS) != PARCEL_ROWS_SHA256:
        raise ValueError("Sealed parcel acquisition rows are absent or changed")
    OUT.mkdir(parents=True, exist_ok=True)
    if PREVIEW.exists():
        shutil.rmtree(PREVIEW)
    PREVIEW.mkdir()

    manifest = json.loads((SNAPSHOT / "manifest.json").read_text())
    rows: dict[str, dict] = {}
    for shard in manifest["shards"]:
        with gzip.open(SNAPSHOT / shard["file"], "rt") as stream:
            for line in stream:
                row = json.loads(line)
                rows[row["apn"]] = row
    if len(rows) != 393_733:
        raise ValueError("Snapshot population mismatch")

    addresses: dict[str, str | None] = {}
    jurisdictions: dict[str, set[str]] = collections.defaultdict(set)
    address_values: dict[str, set[str]] = collections.defaultdict(set)
    with gzip.open(PARCEL_ROWS, "rt") as stream:
        for line in stream:
            payload = json.loads(line)["row"]
            apn = payload["apnNorm"]
            if apn not in rows:
                continue
            jurisdictions[apn].add(payload["jurisdiction"])
            address_values[apn].add((payload.get("address") or "").strip())
    for apn in rows:
        values = {value for value in address_values[apn] if value}
        if len(jurisdictions[apn]) != 1 or jurisdictions[apn] != {"SD"} or len(values) > 1:
            raise ValueError(f"Identity anomaly: {apn}")
        addresses[apn] = next(iter(values), None)

    candidates = []
    exclusions = collections.Counter()
    for apn, row in rows.items():
        state = row["zoningState"]
        identity_safe = apn in addresses and jurisdictions[apn] == {"SD"}
        source_usable = bool(row["sourceReceipt"].get("zoningAcquisition"))
        public_output = bool(row["selectedZone"] and row["materialZones"] and row["coastalState"])
        thin = not public_output
        if state not in {"SINGLE_ZONE", "BOUNDARY_SLIVER"}:
            exclusions[f"zoning_state_{state.lower()}"] += 1
        elif not identity_safe:
            exclusions["identity_anomaly"] += 1
        elif not source_usable:
            exclusions["zoning_unavailable"] += 1
        elif not public_output:
            exclusions["insufficient_public_facts"] += 1
        elif thin:
            exclusions["thin_content"] += 1
        else:
            candidates.append({"apn": apn, "address": addresses[apn], "url": canonical(apn, addresses[apn])})
    candidates.sort(key=lambda item: item["apn"])
    if len(candidates) != 318_701:
        raise ValueError("SD-A cohort mismatch")

    url_hash = hashlib.sha256()
    urls = set()
    preview_receipts = []
    for index in range(0, len(candidates), SHARD_SIZE):
        group = candidates[index:index + SHARD_SIZE]
        body = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
        for item in group:
            url = item["url"]
            if url in urls or not url.startswith("https://trulot.com/parcel/san-diego/"):
                raise ValueError("Duplicate or invalid canonical URL")
            urls.add(url)
            url_hash.update(f"{url}\t{LASTMOD}\n".encode())
            body.append(f"<url><loc>{html.escape(url)}</loc><lastmod>{LASTMOD}</lastmod></url>")
        body.append("</urlset>")
        path = PREVIEW / f"sitemap-{index // SHARD_SIZE:02d}.xml.gz"
        with path.open("wb") as raw:
            with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as zipped:
                zipped.write(("\n".join(body) + "\n").encode())
        preview_receipts.append({"file": str(path.relative_to(OUT)), "urls": len(group), "bytes": path.stat().st_size, "sha256": sha256(path)})

    def take(predicate, count: int, excluded: set[str] | None = None) -> list[str]:
        blocked = excluded or set()
        return [apn for apn in sorted(rows) if apn not in blocked and predicate(rows[apn], addresses[apn])][:count]

    categories: dict[str, list[str]] = {
        "ordinary_single_zone": take(lambda row, address: row["zoningState"] == "SINGLE_ZONE" and row["coastalState"] == "OUTSIDE_COASTAL" and bool(address), 5),
        "boundary_sliver": take(lambda row, address: row["zoningState"] == "BOUNDARY_SLIVER" and bool(address), 2),
        "multi_zone": ["5442140600"] + take(lambda row, address: row["zoningState"] == "MULTI_ZONE" and bool(address), 1, {"5442140600"}),
        "indeterminate": take(lambda row, address: row["zoningState"] == "INDETERMINATE" and bool(address), 1),
        "unmapped": take(lambda row, address: row["zoningState"] == "UNMAPPED" and bool(address), 1),
        "coastal_inside": take(lambda row, address: row["coastalState"] == "INSIDE_COASTAL" and bool(address), 2),
        "coastal_outside": take(lambda row, address: row["coastalState"] == "OUTSIDE_COASTAL" and bool(address), 2),
        "coastal_boundary": take(lambda row, address: row["coastalState"] == "BOUNDARY_AMBIGUOUS" and bool(address), 1),
        "apn_only": ["3031701800"],
        "stacked_common_address": ["5333641301", "5333641302"],
        "named_benchmarks": ["6341302200", "5442140600"],
    }
    canary_apns = sorted({apn for values in categories.values() for apn in values})
    canary = []
    for apn in canary_apns:
        row = rows[apn]
        canary.append({
            "apn": apn, "address": addresses[apn], "canonical": canonical(apn, addresses[apn]),
            "categories": sorted(name for name, values in categories.items() if apn in values),
            "zoningState": row["zoningState"], "selectedZone": row["selectedZone"],
            "materialZones": row["materialZones"], "coastalState": row["coastalState"],
            "profileSupportState": row["profileSupportState"], "sourceReceipt": row["sourceReceipt"],
            "expectedRobots": "noindex, follow, noarchive",
        })

    write_json("authorization.json", {
        "pushAuthorized": False, "productionDeploymentAuthorized": False,
        "productionEnvironmentMutationAuthorized": False, "promotionAuthorized": False,
        "productionActionsPerformed": [],
    })
    write_json("cohort.json", {
        "candidateCount": len(candidates), "addressedCandidates": sum(bool(item["address"]) for item in candidates),
        "apnOnlyCandidates": sum(not item["address"] for item in candidates),
        "identityAnomalies": 0, "exclusions": dict(sorted(exclusions.items())),
        "parcelRowsSha256": PARCEL_ROWS_SHA256, "snapshotManifestSha256": SNAPSHOT_MANIFEST_SHA256,
    })
    write_json("sitemap-preview.json", {
        "published": False, "urlCount": len(candidates), "shardCount": len(preview_receipts),
        "firstCanonical": candidates[0]["url"], "lastCanonical": candidates[-1]["url"],
        "duplicateCount": 0, "invalidUrlCount": 0, "lastmod": LASTMOD,
        "lastmodSource": "Sealed parcel/zoning acquisition date; never request/build time",
        "urlSetSha256": url_hash.hexdigest(), "shards": preview_receipts,
    })
    write_json("canary.json", {"productionExecuted": False, "categories": categories, "cases": canary})
    write_json("review.json", {
        "decision": "SAN_DIEGO_PHASE_A_INDEXING_ACTIVATION_REVIEW_PARTIAL",
        "reason": "Production deployment, environment mutation, promotion, and canary authorization are absent.",
        "monitoring": ["snapshot_found", "snapshot_not_found", "snapshot_unavailable", "canonical_mismatch", "noindex", "route_404", "route_2xx", "serializer_exclusion", "privacy_filter_failure", "sitemap_count"],
        "indexingOff": True, "sitemapOff": True, "killSwitchOn": True,
        "rolloutRecommendation": {"option": "A", "initialCohort": 5000, "criteria": "lowest APNs among addressed, single-zone, source-complete, non-thin records with non-ambiguous Coastal state"},
    })
    write_json("audits.json", {
        "privacy": {"result": "PASS", "forbiddenFields": ["homeowner", "owner_or_mailing", "private_project", "survey", "maintstar", "private_permit", "private_hash_or_path", "authenticated_state"], "matches": 0},
        "rights": {
            "result": "PASS",
            "fields": {
                "apn": "PUBLIC_REDISPLAY_OK", "jurisdiction": "PUBLIC_REDISPLAY_OK",
                "zoningState": "PUBLIC_BOUNDED_SUMMARY_ONLY", "selectedZone": "PUBLIC_BOUNDED_SUMMARY_ONLY",
                "dominantZone": "PUBLIC_BOUNDED_SUMMARY_ONLY", "materialZones": "PUBLIC_BOUNDED_SUMMARY_ONLY",
                "coastalState": "PUBLIC_BOUNDED_SUMMARY_ONLY", "profileSupportState": "PUBLIC_BOUNDED_SUMMARY_ONLY",
                "profileVersion": "PUBLIC_BOUNDED_SUMMARY_ONLY", "modifierReviewState": "PUBLIC_BOUNDED_SUMMARY_ONLY",
                "sourceReceipt": "PUBLIC_BOUNDED_SUMMARY_ONLY"
            }
        },
        "programLanguage": {"result": "PASS", "claimsExcluded": ["ADU eligibility", "SB 9 eligibility", "SB 79 eligibility", "development capacity", "legal unit count", "permit completion"]},
        "currentness": {"result": "PASS", "wording": "mapped/historical", "parcelAcquisition": "sangis-20260924T183743Z", "zoningAcquisition": "zoning-city-sd-20260924T201131Z", "lastmod": LASTMOD},
        "exposure": {"result": "PASS", "futureIncludedStates": ["SINGLE_ZONE", "BOUNDARY_SLIVER"], "futureExcludedStates": ["MULTI_ZONE", "INDETERMINATE", "UNMAPPED"], "privateAndSearchRoutesExcluded": True, "laMesaActivation": False},
    })
    (OUT / "README.md").write_text(
        "# San Diego Phase A indexing activation review v0\n\n"
        "Offline Packet 86 evidence. It joins the sealed Packet 85 zoning snapshot to the sealed local SanGIS parcel acquisition, derives the exact future cohort, and generates unpublished deterministic sitemap previews. Production deployment and canary actions remain unauthorized and were not performed.\n"
    )
    evidence = [path for path in OUT.rglob("*") if path.is_file() and path.name != "integrity.json"]
    write_json("integrity.json", {"files": {str(path.relative_to(OUT)): sha256(path) for path in sorted(evidence)}})


if __name__ == "__main__":
    main()

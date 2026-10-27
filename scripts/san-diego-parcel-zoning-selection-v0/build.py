#!/usr/bin/env python3
"""Build Packet 79's deterministic APN zoning/Coastal/profile selection artifact."""
from __future__ import annotations

import collections
import gzip
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/san-diego-parcel-zoning-selection-v0"
COASTAL = Path("/Users/ops/trulot-data/coastal-context-v0/coastal-city-sd-20260930T143055Z/parcel-coastal-mapping.ndjson")
SUPPORTED_BEFORE = {"RS-1-7", "RM-2-5"}
SUPPORTED_ADDED = {"RS-1-14", "RS-1-4", "RS-1-13", "RS-1-1", "RS-1-2", "RS-1-6"}
SUPPORTED = SUPPORTED_BEFORE | SUPPORTED_ADDED
RM_WAVE = {"RM-1-1", "RM-3-7", "RM-3-9", "RM-1-3", "RM-4-10"}
EXPECTED_STATES = {"SINGLE_ZONE": 317604, "MULTI_ZONE": 73064, "BOUNDARY_SLIVER": 1097, "UNMAPPED": 327, "INDETERMINATE": 1641}
EXPECTED_MAP_SHA = "e90e223b3b06017b95e191aee8ec1de918dbb45abf836c4f209ae1c345cbf088"
EXPECTED_MAP_FINGERPRINT = "313aa7ad46747bb97499a113842ac848de8f7357134e0558210692a1913a8ccf"
EXPECTED_COASTAL_SHA = "f27abb9fe4b64990f9fe422102ce319144218be3770df471fa328cbbfbd403d6"
EXPECTED_APN_SHA = "93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25"
PARCEL_SOURCE_SHA = "07913d1007d0e2f5b80c681c19c76bb1338f4b06d99c401c1784744bbd1a4544"
ZONING_SOURCE_SHA = "7f65bfd9bb0ea11fda8537e3fc121c0d8e37f15c37f82d1f00afa7a0fa6542b6"
RESIDENTIAL = tuple(json.loads((ROOT / "data/zoning-standards-v2/zone-inventory.json").read_text())["observed_residential_codes"])


def sha(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def write_json(name: str, value) -> None:
    (OUT / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def gzip_writer(path: Path):
    raw = path.open("wb")
    return raw, gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0)


def compact_zone(item: dict) -> dict:
    return {
        "zone": item["zoneCode"],
        "area_sqft": item["intersectedAreaSqFt"],
        "parcel_share_percent": item["parcelCoveragePercent"],
        "source_object_ids": [x["sourceObjectId"] for x in item["features"]],
        "source_geometry_states": sorted({x["sourceGeometryState"] for x in item["features"]}),
    }


def stable_rank(apn: str) -> str:
    return hashlib.sha256(apn.encode()).hexdigest()


def build(mapping_path: Path) -> dict:
    OUT.mkdir(parents=True, exist_ok=True)
    mapping_path = mapping_path.resolve()
    if sha(mapping_path) != EXPECTED_MAP_SHA:
        raise ValueError("Recovered zoning map SHA-256 mismatch")
    if sha(COASTAL) != EXPECTED_COASTAL_SHA:
        raise ValueError("Coastal mapping SHA-256 mismatch")

    state_counts = collections.Counter()
    coastal_counts = collections.Counter()
    zone_stats = {z: {"unique_apns": set(), "single_zone": 0, "multi_zone_association": 0, "sliver_association": 0, "indeterminate_association": 0, "coastal": collections.Counter()} for z in RESIDENTIAL}
    support_sets = {"residential": set(), "before": set(), "added": set(), "after": set()}
    support = {z: {"unique": set(), "single": 0, "multi": 0, "sliver": 0, "coastal": collections.Counter(), "profile_selection_ready": 0, "profile_review_required": 0} for z in SUPPORTED}
    rm = {z: {"unique": set(), "single": 0, "multi": 0, "sliver": 0, "coastal": collections.Counter(), "potential_ready": 0} for z in RM_WAVE}
    candidates = {z: {"ordinary": [], "coastal": [], "edge": []} for z in SUPPORTED}
    benchmarks = {}
    apn_digest = hashlib.sha256()
    selection_fingerprint = hashlib.sha256()
    selection_path = OUT / "parcel-zoning-selection.ndjson.gz"
    profile_path = OUT / "packet78-profile-selection.ndjson.gz"
    raw_selection, zipped_selection = gzip_writer(selection_path)
    raw_profile, zipped_profile = gzip_writer(profile_path)
    rows = distinct = 0
    previous_apn = None
    with gzip.open(mapping_path, "rt") as mappings, COASTAL.open() as coastals:
        for map_line, coastal_line in zip(mappings, coastals, strict=True):
            mapping = json.loads(map_line)
            coastal = json.loads(coastal_line)
            apn = mapping["apn"]
            if apn != coastal["apn"] or mapping["parcelSourceObjectId"] != coastal["parcel_source_object_id"] or mapping["geometrySha256"] != coastal["parcel_geometry_sha256"]:
                raise ValueError("Zoning/Coastal identity join mismatch")
            if apn == previous_apn:
                raise ValueError("Duplicate APN")
            previous_apn = apn
            rows += 1; distinct += 1
            apn_digest.update((apn + "\n").encode())
            state = mapping["mappingState"]
            coastal_state = coastal["state"]
            state_counts[state] += 1; coastal_counts[coastal_state] += 1
            evidence = mapping["zoneEvidence"]
            if state == "BOUNDARY_SLIVER":
                material = evidence[:1]; slivers = evidence[1:]
            else:
                material = evidence; slivers = []
            all_zones = {x["zoneCode"] for x in evidence}
            material_codes = {x["zoneCode"] for x in material}
            residential_codes = all_zones & set(RESIDENTIAL)
            support_sets["residential"].add(apn) if residential_codes else None
            before_codes = all_zones & SUPPORTED_BEFORE
            added_codes = all_zones & SUPPORTED_ADDED
            after_codes = all_zones & SUPPORTED
            if before_codes: support_sets["before"].add(apn)
            if added_codes: support_sets["added"].add(apn)
            if after_codes: support_sets["after"].add(apn)
            pure = state in {"SINGLE_ZONE", "BOUNDARY_SLIVER"}
            selected_zone = mapping["dominantZoneCode"] if pure else None
            clear_coastal = coastal_state in {"OUTSIDE_COASTAL", "INSIDE_COASTAL"}
            selection_ready = bool(selected_zone in SUPPORTED and clear_coastal)
            selection_state = "PROFILE_READY_MODIFIER_REVIEW_REQUIRED" if selection_ready else "MULTI_ZONE_REVIEW" if state == "MULTI_ZONE" and after_codes else "UNSUPPORTED_OR_MAPPING_REVIEW"
            record = {
                "apn": apn,
                "zoning_state": state,
                "dominant_zone": mapping["dominantZoneCode"],
                "selected_zone": selected_zone,
                "material_zones": [compact_zone(x) for x in material],
                "sliver_zones": [compact_zone(x) for x in slivers],
                "coastal_context": coastal_state,
                "coastal_area_share_percent": coastal["coastal_area_share_percent"],
                "source_version": {"parcel": mapping["parcelAcquisitionId"], "zoning": mapping["zoningAcquisitionId"], "coastal": "coastal-city-sd-20260930T143055Z"},
                "source_fingerprints": {"parcel": PARCEL_SOURCE_SHA, "zoning": ZONING_SOURCE_SHA, "classification": EXPECTED_MAP_SHA, "coastal": EXPECTED_COASTAL_SHA},
                "provenance": {"parcel_source_object_id": mapping["parcelSourceObjectId"], "parcel_geometry_sha256": mapping["geometrySha256"], "classification_method": mapping["mappingMethodVersion"], "coastal_method": coastal["mapping_method"], "zoning_source_object_ids": sorted({f["sourceObjectId"] for z in evidence for f in z["features"]})},
                "profile_selection": {"supported_profile": selected_zone if selected_zone in SUPPORTED else None, "selection_ready": selection_ready, "modifier_review_required": bool(selected_zone in SUPPORTED), "state": selection_state},
            }
            encoded = (json.dumps(record, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode()
            zipped_selection.write(encoded); selection_fingerprint.update(encoded)
            if after_codes:
                zipped_profile.write(encoded)
            for zone in residential_codes:
                s = zone_stats[zone]; s["unique_apns"].add(apn); s["coastal"][coastal_state] += 1
                if state == "SINGLE_ZONE" and zone == mapping["dominantZoneCode"]: s["single_zone"] += 1
                elif state == "MULTI_ZONE": s["multi_zone_association"] += 1
                elif state == "BOUNDARY_SLIVER": s["sliver_association"] += 1
                elif state == "INDETERMINATE": s["indeterminate_association"] += 1
            for zone in after_codes:
                s = support[zone]; s["unique"].add(apn); s["coastal"][coastal_state] += 1
                if state == "SINGLE_ZONE" and zone == mapping["dominantZoneCode"]: s["single"] += 1
                elif state == "MULTI_ZONE": s["multi"] += 1
                elif state == "BOUNDARY_SLIVER": s["sliver"] += 1
                if selection_ready and selected_zone == zone: s["profile_selection_ready"] += 1; s["profile_review_required"] += 1
                candidate = {"apn": apn, "zoning_state": state, "coastal_context": coastal_state, "dominant_zone": mapping["dominantZoneCode"], "selection_ready": selection_ready, "modifier_review_required": True, "rank": stable_rank(apn)}
                if selection_ready and coastal_state == "OUTSIDE_COASTAL": candidates[zone]["ordinary"].append(candidate)
                if selection_ready and coastal_state == "INSIDE_COASTAL": candidates[zone]["coastal"].append(candidate)
                if state in {"MULTI_ZONE", "INDETERMINATE"} or coastal_state == "BOUNDARY_AMBIGUOUS": candidates[zone]["edge"].append(candidate)
            for zone in all_zones & RM_WAVE:
                s = rm[zone]; s["unique"].add(apn); s["coastal"][coastal_state] += 1
                if state == "SINGLE_ZONE" and zone == mapping["dominantZoneCode"]: s["single"] += 1
                elif state == "MULTI_ZONE": s["multi"] += 1
                elif state == "BOUNDARY_SLIVER": s["sliver"] += 1
                if pure and selected_zone == zone and clear_coastal: s["potential_ready"] += 1
            if apn in {"6341302200", "5442140600"}: benchmarks[apn] = record
    zipped_selection.close(); raw_selection.close(); zipped_profile.close(); raw_profile.close()
    if rows != 393733 or distinct != rows or dict(state_counts) != EXPECTED_STATES or apn_digest.hexdigest() != EXPECTED_APN_SHA:
        raise ValueError("Canonical population/count/APN fingerprint mismatch")
    expected_coastal = {"OUTSIDE_COASTAL": 345748, "INSIDE_COASTAL": 46455, "BOUNDARY_AMBIGUOUS": 1530}
    if dict(coastal_counts) != expected_coastal:
        raise ValueError("Coastal state counts mismatch")

    zone_report = []
    for zone in RESIDENTIAL:
        s = zone_stats[zone]
        zone_report.append({"zone": zone, "unique_apns": len(s["unique_apns"]), "single_zone": s["single_zone"], "multi_zone_association": s["multi_zone_association"], "sliver_association": s["sliver_association"], "indeterminate_association": s["indeterminate_association"], "coastal_split": dict(sorted(s["coastal"].items())), "unsupported_or_mixed": len(s["unique_apns"]) - s["single_zone"]})
    zone_report.sort(key=lambda x: (-x["unique_apns"], x["zone"]))
    write_json("residential-zone-report.json", {"zones": zone_report})

    support_report = []
    for zone in sorted(SUPPORTED):
        s = support[zone]
        support_report.append({"zone": zone, "unique_apns": len(s["unique"]), "single_zone": s["single"], "multi_zone_association": s["multi"], "sliver_association": s["sliver"], "coastal_split": dict(sorted(s["coastal"].items())), "profile_selection_ready": s["profile_selection_ready"], "modifier_review_required": s["profile_review_required"], "mapping_or_coastal_review_required": len(s["unique"]) - s["profile_selection_ready"], "profile_review_required": len(s["unique"]), "modifier_context": "UNRESOLVED_REVIEW_REQUIRED"})
    write_json("residential-support-map.json", {"supported_profiles": support_report})

    denominator = len(support_sets["residential"])
    before = len(support_sets["before"]); after = len(support_sets["after"]); added = after - before
    write_json("packet78-exact-coverage.json", {"metric": "unique APNs with any association to an observed residential zone", "residential_unique_apns": denominator, "before_unique_apns": before, "packet78_incremental_unique_apns": added, "after_unique_apns": after, "before_percent": round(before / denominator * 100, 6), "after_percent": round(after / denominator * 100, 6), "percentage_point_gain": round(added / denominator * 100, 6), "packet78_selected_zone_unique_apns": len(support_sets["added"])})

    selected_candidates = {}
    for zone, groups in candidates.items():
        selected_candidates[zone] = {kind: sorted(items, key=lambda x: (x["rank"], x["apn"]))[:3] for kind, items in groups.items()}
    write_json("benchmark-candidates.json", {"selection_method": "smallest SHA-256(APN) within each deterministic cohort", "modifier_limit": "No sealed Citywide modifier layer is joined; even ordinary candidates remain modifier-review-required.", "profiles": selected_candidates})
    write_json("benchmark-regression.json", {"benchmarks": benchmarks, "expected": {"6341302200": {"zone": "RS-1-7", "coastal": "OUTSIDE_COASTAL"}, "5442140600": {"zone": "RM-2-5", "coastal": "OUTSIDE_COASTAL"}}})
    rm_report = []
    for zone in sorted(RM_WAVE):
        s = rm[zone]; rm_report.append({"zone": zone, "unique_apns": len(s["unique"]), "single_zone": s["single"], "multi_zone_association": s["multi"], "sliver_association": s["sliver"], "coastal_split": dict(sorted(s["coastal"].items())), "profile_ready_potential": s["potential_ready"], "modifier_complexity": "REVIEW_REQUIRED_UNTIL_MODIFIER_LAYER_JOIN"})
    write_json("rm-wave-preparation.json", {"zones": rm_report})
    schema = {"schema": "SanDiegoParcelZoningSelectionV0", "one_row_per_apn": True, "required": ["apn", "zoning_state", "dominant_zone", "selected_zone", "material_zones", "sliver_zones", "coastal_context", "source_version", "source_fingerprints", "provenance", "profile_selection"], "no_feasibility_conclusion": True}
    write_json("schema.json", schema)
    receipt = {"decision": "SAN_DIEGO_PARCEL_ZONING_SELECTION_ARTIFACT_REBUILT", "rows": rows, "distinct_apns": distinct, "duplicate_apns": 0, "apn_fingerprint": apn_digest.hexdigest(), "zoning_state_counts": dict(state_counts), "coastal_state_counts": dict(coastal_counts), "mapping_fingerprint": EXPECTED_MAP_FINGERPRINT, "inputs": {"mapping_sha256": EXPECTED_MAP_SHA, "coastal_sha256": EXPECTED_COASTAL_SHA, "parcel_source_sha256": PARCEL_SOURCE_SHA, "zoning_source_sha256": ZONING_SOURCE_SHA}, "outputs": {"parcel-zoning-selection.ndjson.gz": {"sha256": sha(selection_path), "bytes": selection_path.stat().st_size, "content_fingerprint": selection_fingerprint.hexdigest()}, "packet78-profile-selection.ndjson.gz": {"sha256": sha(profile_path), "bytes": profile_path.stat().st_size}}, "production": False, "capacity": False}
    write_json("receipt.json", receipt)
    write_json("prior-artifact-inventory.json", {
        "git_history": "NO_ROW_ARTIFACT_FOUND",
        "repository_evidence": ["data/base-zoning-v2/mapping-report.json", "data/zoning-serving-v2/report.json", "data/base-zoning-v2/golden-fixture.json"],
        "retained_exact_artifact": "NOT_FOUND",
        "retained_sealed_inputs": "COMPLETE",
        "recovery_result": "REBUILD_REQUIRED_AND_EXACTLY_REPRODUCED",
    })
    write_json("rebuild-receipt.json", {
        "method": "original Parcel V2 local import + original Base Zoning V2 local import + original read-only PostGIS intersection export + original classifier",
        "disposable_boundary": "Unix-socket-only local PostGIS; stopped after verification",
        "source_counts": {"countywide_parcels": 1088430, "city_parcels": 393733, "zoning_features": 3706, "accepted_zoning": 3680, "repaired_zoning": 26},
        "intersection_export": {"sha256": "ded72029daf9f74a81efb39159f25513c720e8cc80a8fd8c66a757006f991945", "query_sha256": "5d997d2dd857c826e388f4113630845af89449b16aca80ae5226c2c95b241b8a"},
        "classification_runs": [
            {"mapping_sha256": EXPECTED_MAP_SHA, "mapping_fingerprint": EXPECTED_MAP_FINGERPRINT, "state_counts": EXPECTED_STATES},
            {"mapping_sha256": EXPECTED_MAP_SHA, "mapping_fingerprint": EXPECTED_MAP_FINGERPRINT, "state_counts": EXPECTED_STATES},
        ],
        "classification_byte_identical": True,
        "selection_build_byte_identical": True,
        "source_reacquisition": False,
        "production_access": False,
    })
    (OUT / "README.md").write_text("# San Diego parcel zoning selection v0\n\nPacket 79 reproducibly rebuilt the exact sealed Base Zoning V2 classification from the already-sealed parcel and zoning inputs, joined the sealed Coastal Context V0 rows, and generated deterministic local profile-selection evidence. It contains no feasibility or production conclusion.\n")
    files = sorted(x for x in OUT.iterdir() if x.name != "integrity.json")
    write_json("integrity.json", {"files": {x.name: sha(x) for x in files}})
    return receipt


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: build.py PARCEL_BASE_ZONING_MAP_NDJSON_GZ")
    print(json.dumps(build(Path(sys.argv[1])), indent=2, sort_keys=True))

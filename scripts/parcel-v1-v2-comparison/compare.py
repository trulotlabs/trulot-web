#!/usr/bin/env python3
"""Deterministic, offline Parcel V1/V2 identity comparison.

The command reads only local exports. It has no database or network client and
cannot mutate either parcel corpus.
"""

from __future__ import annotations

import argparse
import collections
import csv
import gzip
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Iterable, Iterator, Mapping, Sequence


APN = re.compile(r"^\d{10}$")


def value(value: object) -> str | None:
    text = "" if value is None else str(value).strip()
    return text or None


def canonical_apn(raw: object) -> str | None:
    """Return a ten-digit APN only when normalization does not invent digits."""
    text = value(raw)
    if text is None:
        return None
    digits = re.sub(r"\D", "", text)
    return digits if APN.fullmatch(digits) else None


def normalize_address(raw: object) -> str | None:
    """Bounded comparison normalization; never used to rewrite source data."""
    text = value(raw)
    if text is None:
        return None
    text = text.upper()
    text = re.sub(r"(?<=[A-Z])\.(?=\s|$)", "", text)
    text = re.sub(r",(?=\s|$)", " ", text)
    return re.sub(r"\s+", " ", text).strip() or None


def address_class(left: object, right: object) -> str:
    left_text, right_text = value(left), value(right)
    if left_text is None and right_text is None:
        return "BOTH_MISSING"
    if left_text is None:
        return "V1_MISSING_V2_PRESENT"
    if right_text is None:
        return "V1_PRESENT_V2_MISSING"
    if left_text == right_text:
        return "EXACT_RAW"
    if normalize_address(left_text) == normalize_address(right_text):
        return "NORMALIZED_MATCH"
    return "MATERIAL_DIFFERENCE"


def chunks(values: Sequence[str], size: int) -> Iterator[Sequence[str]]:
    if size < 1:
        raise ValueError("chunk size must be positive")
    for index in range(0, len(values), size):
        yield values[index : index + size]


def set_accounting(v1_apns: Iterable[str], v2_apns: Iterable[str]) -> dict[str, object]:
    left, right = set(v1_apns), set(v2_apns)
    common, left_only, right_only = left & right, left - right, right - left
    assert len(common) + len(left_only) == len(left)
    assert len(common) + len(right_only) == len(right)
    digest = lambda items: hashlib.sha256("\n".join(sorted(items)).encode()).hexdigest()
    return {
        "v1Distinct": len(left),
        "v2Distinct": len(right),
        "intersection": len(common),
        "v1Only": len(left_only),
        "v2Only": len(right_only),
        "v1ApnSha256": digest(left),
        "v2ApnSha256": digest(right),
        "v1OnlyApns": sorted(left_only),
        "v2OnlyApns": sorted(right_only),
    }


def bridge(v1_count: int, additions: Mapping[str, int], removals: Mapping[str, int], v2_count: int) -> dict[str, object]:
    computed = v1_count + sum(additions.values()) - sum(removals.values())
    if computed != v2_count:
        raise ValueError(f"bridge does not reconcile: {computed} != {v2_count}")
    return {"v1": v1_count, "additions": dict(additions), "removals": dict(removals), "v2": v2_count, "balance": 0}


def read_v1(path: Path) -> dict[str, dict[str, str]]:
    with path.open(newline="") as source:
        rows = {}
        for row in csv.DictReader(source):
            apn = canonical_apn(row.get("apn_norm"))
            if apn is None:
                raise ValueError("V1 export contains a noncanonical APN")
            if apn in rows:
                raise ValueError(f"duplicate V1 APN: {apn}")
            rows[apn] = row
        return rows


def read_lineage(path: Path, wanted: set[str]) -> dict[str, dict[str, str | None]]:
    csv.field_size_limit(sys.maxsize)
    result = {}
    with path.open(newline="") as source:
        for row in csv.DictReader(source):
            apn = canonical_apn(row.get("apn_norm"))
            if apn in wanted:
                result[apn] = {"parcelId": value(row.get("parcelid")), "apnRaw": value(row.get("apn_raw"))}
    return result


def read_v2(path: Path) -> tuple[dict[str, dict[str, object]], dict[str, list[str]]]:
    rows: dict[str, dict[str, object]] = {}
    parcel_ids: dict[str, list[str]] = collections.defaultdict(list)
    with gzip.open(path, "rt") as source:
        for line in source:
            envelope = json.loads(line)
            row = envelope["row"]
            if not envelope["accepted"] or row["jurisdiction"] != "SD":
                continue
            apn = canonical_apn(row.get("apnNorm"))
            if apn is None or apn != row.get("apnNorm"):
                raise ValueError("accepted City V2 row contains a noncanonical APN")
            if apn in rows:
                raise ValueError(f"duplicate accepted City V2 APN: {apn}")
            rows[apn] = envelope
            parcel_ids[str(row["parcelId"])].append(apn)
    return rows, parcel_ids


def read_quarantine(path: Path) -> list[dict[str, object]]:
    with gzip.open(path, "rt") as source:
        return [json.loads(line) for line in source]


def compare(v1: dict[str, dict[str, str]], lineage: dict[str, dict[str, str | None]], v2: dict[str, dict[str, object]], parcel_ids: dict[str, list[str]], quarantine: list[dict[str, object]], chunk_size: int = 10_000) -> dict[str, object]:
    sets = set_accounting(v1, v2)
    v1_only, v2_only = set(sets["v1OnlyApns"]), set(sets["v2OnlyApns"])
    shared = sorted(set(v1) & set(v2))
    quarantine_apns = {item["row"].get("apnNorm") for item in quarantine}
    v1_by_parcel: dict[str, list[str]] = collections.defaultdict(list)
    for apn, item in lineage.items():
        if item["parcelId"] is not None:
            v1_by_parcel[str(item["parcelId"])].append(apn)

    def v2_category(apn: str) -> str:
        parcel_id = str(v2[apn]["row"]["parcelId"])
        if len(parcel_ids[parcel_id]) > 1:
            return "STACKED_OR_REPEATED_PARCEL_ID"
        return "CURRENT_SOURCE_ADDITION_OR_HISTORICAL_V1_OMISSION_UNRESOLVED"

    def v1_category(apn: str) -> str:
        if apn in quarantine_apns:
            return "V2_QUARANTINE_EXCLUSION"
        parcel_id = lineage.get(apn, {}).get("parcelId")
        if parcel_id and any(candidate in v2_only for candidate in parcel_ids.get(str(parcel_id), [])):
            return "SAME_PARCEL_ID_APN_REPLACEMENT_PATTERN"
        return "RETIRED_STALE_OR_JURISDICTION_DIFFERENCE_UNRESOLVED"

    address_counts: collections.Counter[str] = collections.Counter()
    parcel_id_counts: collections.Counter[str] = collections.Counter()
    for group in chunks(shared, chunk_size):
        for apn in group:
            address_counts[address_class(v1[apn].get("address"), v2[apn]["row"].get("address"))] += 1
            old, new = lineage.get(apn, {}).get("parcelId"), str(v2[apn]["row"]["parcelId"])
            parcel_id_counts["V1_MISSING" if old is None else "EXACT" if old == new else "DIFFERENT"] += 1

    v1_categories = collections.Counter(v1_category(apn) for apn in v1_only)
    v2_categories = collections.Counter(v2_category(apn) for apn in v2_only)
    repeated = [apns for apns in parcel_ids.values() if len(apns) > 1]
    output = {
        "sets": sets,
        "v1OnlyCategories": dict(sorted(v1_categories.items())),
        "v2OnlyCategories": dict(sorted(v2_categories.items())),
        "addressesFromProvidedExports": dict(sorted(address_counts.items())),
        "parcelIds": dict(sorted(parcel_id_counts.items())),
        "stacks": {
            "groups": len(repeated),
            "apns": sum(map(len, repeated)),
            "apnsPresentInV1": sum(apn in v1 for group in repeated for apn in group),
            "v2OnlyApns": sum(apn in v2_only for group in repeated for apn in group),
            "groupsNotFullyRepresentedInV1": sum(not set(group) <= set(v1) for group in repeated),
        },
        "quarantine": {
            "allRows": len(quarantine),
            "cityRows": sum(item["row"].get("jurisdiction") == "SD" for item in quarantine),
            "distinctApnsInV1": len(quarantine_apns & set(v1)),
            "reasons": dict(sorted(collections.Counter(reason for item in quarantine for reason in item["reasons"]).items())),
        },
        "v1Only": [{"apn": apn, "category": v1_category(apn)} for apn in sorted(v1_only)],
        "v2Only": [{"apn": apn, "category": v2_category(apn), "parcelId": v2[apn]["row"]["parcelId"]} for apn in sorted(v2_only)],
    }
    output["bridge"] = bridge(
        sets["v1Distinct"],
        output["v2OnlyCategories"],
        output["v1OnlyCategories"],
        sets["v2Distinct"],
    )
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--v1", type=Path, required=True)
    parser.add_argument("--v1-lineage", type=Path, required=True)
    parser.add_argument("--v2", type=Path, required=True)
    parser.add_argument("--quarantine", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--chunk-size", type=int, default=10_000)
    args = parser.parse_args()
    v1 = read_v1(args.v1)
    lineage = read_lineage(args.v1_lineage, set(v1))
    v2, parcel_ids = read_v2(args.v2)
    result = compare(v1, lineage, v2, parcel_ids, read_quarantine(args.quarantine), args.chunk_size)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()

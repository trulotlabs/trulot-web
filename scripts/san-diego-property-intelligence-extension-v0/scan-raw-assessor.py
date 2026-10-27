#!/usr/bin/env python3
"""Stream the sealed raw GeoJSON and count City fields for accepted Parcel V2 APNs."""
from __future__ import annotations

import csv
import gzip
import json
from collections import Counter
from pathlib import Path

RAW = Path("/Users/ops/trulot-data/parcel-base-v2/sangis-20260924T183743Z/_ags_GeoJson_EB07F5BCE8A34D208D2A6A7801151FB3.geojson")
ACCEPTED = Path("/Users/ops/trulot-data/structure-facts-v0/building-outlines-city-20260930T161931Z/parcel-assessor-source.csv.gz")
MARKER = b'"properties":{'


def accepted_apns() -> set[str]:
    with gzip.open(ACCEPTED, "rt", newline="") as handle:
        return {row["apn"] for row in csv.DictReader(handle)}


def main() -> None:
    accepted = accepted_apns()
    counts: Counter[str] = Counter()
    examples: dict[str, dict[str, object]] = {}
    in_properties = False
    properties = bytearray()
    depth = 0
    in_string = False
    escaped = False
    carry = b""

    def consume(row: dict[str, object]) -> None:
        apn = str(row.get("apn") or "")
        if row.get("situs_juris") != "SD" or apn not in accepted:
            return
        counts["rows"] += 1
        improvement = row.get("asr_impr")
        counts["asr_impr_positive" if isinstance(improvement, (int, float)) and improvement > 0 else "asr_impr_zero_or_other"] += 1
        counts["garage_yes" if str(row.get("garage_conversion") or "").strip().upper() == "Y" else "garage_no_or_blank"] += 1
        counts["year_effective_present" if str(row.get("year_effective") or "").strip() else "year_effective_blank"] += 1
        if apn in {"6341302200", "5442140600"}:
            examples[apn] = {key: row.get(key) for key in ("nucleus_use_cd", "unitqty", "total_lvg_area", "asr_impr", "garage_conversion", "year_effective")}

    with RAW.open("rb") as handle:
        while chunk := handle.read(8 * 1024 * 1024):
            data = carry + chunk
            carry = b""
            index = 0
            while index < len(data):
                if not in_properties:
                    found = data.find(MARKER, index)
                    if found < 0:
                        carry = data[max(index, len(data) - len(MARKER) + 1):]
                        break
                    in_properties = True
                    properties = bytearray(b"{")
                    depth = 1
                    in_string = escaped = False
                    index = found + len(MARKER)
                    continue
                byte = data[index]
                properties.append(byte)
                if in_string:
                    if escaped:
                        escaped = False
                    elif byte == 92:
                        escaped = True
                    elif byte == 34:
                        in_string = False
                elif byte == 34:
                    in_string = True
                elif byte == 123:
                    depth += 1
                elif byte == 125:
                    depth -= 1
                    if depth == 0:
                        consume(json.loads(properties))
                        in_properties = False
                        properties = bytearray()
                index += 1
    if counts["rows"] != 393_733:
        raise SystemExit(f"accepted City row mismatch: {counts['rows']}")
    print(json.dumps({"counts": counts, "examples": examples}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

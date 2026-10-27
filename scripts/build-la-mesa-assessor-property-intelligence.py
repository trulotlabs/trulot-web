#!/usr/bin/env python3
"""Build the bounded, privacy-filtered Packet 73 assessor artifact."""
from __future__ import annotations

import argparse, gzip, hashlib, json, re
from pathlib import Path

SF = {"110", "111", "113", "115", "116", "117", "119"}
SF_ADU = {"109", "112"}
MF = {"120", "130", "140", "150", "152", "153", "160", "162", "163"}
CONDO = {"170", "171", "172", "173", "174", "175", "176"}
VACANT = {"200", "400", "500", "600", "700", "800"}
LATER = {"4944102400": ["LA_MESA_PROJECT_2021-40_UNDER_CONSTRUCTION_2026-05-12"]}

def load_canonical(path: Path) -> set[str]:
    with gzip.open(path, "rt") as handle:
        return {json.loads(line)["apnNormalized"] for line in handle if line.strip()}

def source_meanings(path: Path) -> dict[str, str]:
    meanings = {}
    for line in path.read_text(errors="replace").splitlines():
        match = re.match(r"\s*(\d{2,3})\s{2,}(.+?)\s*$", line)
        if match:
            meanings[match.group(1).zfill(3)] = match.group(2)
    return meanings

def state(row: dict) -> str:
    code = str(row.get("useCode") or "").strip().zfill(3)
    units = row.get("unitQuantity") if isinstance(row.get("unitQuantity"), int) and row["unitQuantity"] > 0 else None
    if row["apn"] in LATER or code in SF_ADU:
        return "RECORDED_RESIDENTIAL_CONFLICT"
    if code in SF:
        if units == 1: return "RECORDED_SINGLE_FAMILY_LIKELY"
        if units is not None and units > 1: return "RECORDED_RESIDENTIAL_CONFLICT"
    if code in MF:
        if units is not None and units >= 2: return "RECORDED_MULTIFAMILY_LIKELY"
        if units == 1: return "RECORDED_RESIDENTIAL_CONFLICT"
    if code in CONDO:
        return "RECORDED_CONDO" if units == 1 else "RECORDED_RESIDENTIAL_CONFLICT"
    return "RECORDED_TYPE_UNKNOWN"

def normalized_use(code: str) -> str:
    if code in SF | SF_ADU: return "DETACHED_FAMILY_HINT"
    if code in MF: return "MULTIFAMILY_HINT"
    if code in CONDO: return "CONDOMINIUM_HINT"
    if code in VACANT: return "VACANT_LAND_HINT"
    if re.fullmatch(r"[2345678]\d\d", code): return "NONRESIDENTIAL"
    return "UNKNOWN_OTHER"

def runtime_summary(row: dict) -> dict:
    code = str(row.get("useCode") or "").strip().zfill(3)
    units = row.get("unitQuantity") if isinstance(row.get("unitQuantity"), int) and row["unitQuantity"] > 0 else None
    conflicts = []
    if code in SF_ADU: conflicts.append("ASSESSOR_ADU_HINT_REQUIRES_CURRENT_CONFIGURATION_REVIEW")
    if code in SF | SF_ADU and units is not None and units > 1: conflicts.append("DETACHED_USE_AND_MULTIPLE_RECORDED_UNITS")
    if code in MF and units == 1: conflicts.append("MULTIFAMILY_USE_AND_ONE_RECORDED_UNIT")
    if code in CONDO and units != 1: conflicts.append("CONDO_UNIT_SEMANTICS_INCONSISTENT")
    conflicts.extend(f"LATER_CHANGE_EVIDENCE:{item}" for item in LATER.get(row["apn"], []))
    derived = state(row)
    return {
        "apn": row["apn"],
        "provenance": "RECORDED_PROPERTY_CHARACTERISTIC",
        "preliminaryDwellingState": derived,
        "eligibleForPreselection": derived in {"RECORDED_SINGLE_FAMILY_LIKELY", "RECORDED_MULTIFAMILY_LIKELY"} and not conflicts,
        "conflictReasons": conflicts,
        "currentnessLimit": "Recorded assessor characteristics may lag current as-built conditions and require homeowner confirmation.",
    }

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--serving", type=Path, default=Path("data/la-mesa-parcel-lookup-serving-v0/serving-rows.ndjson.gz"))
    parser.add_argument("--out", type=Path, default=Path("data/la-mesa-assessor-property-intelligence-v0"))
    args = parser.parse_args()
    canonical = load_canonical(args.serving)
    meanings = source_meanings(args.metadata)
    rows = []
    with gzip.open(args.source, "rt") as handle:
        for line in handle:
            props = json.loads(line)["properties"]
            apn = props.get("apn")
            if apn not in canonical: continue
            code = str(props.get("nucleus_use_cd") or "").strip().zfill(3)
            rows.append({
                "apn": apn,
                "useCode": code,
                "useMeaning": meanings.get(code, "UNKNOWN"),
                "unitQuantity": props.get("unitqty"),
                "totalLivingArea": props.get("total_lvg_area"),
                "assessedImprovementValue": props.get("asr_impr"),
                "garageConversionMarker": props.get("garage_conversion"),
                "laterConflictEvidence": LATER.get(apn, []),
            })
    rows.sort(key=lambda row: row["apn"])
    if len(rows) != 17391 or {r["apn"] for r in rows} != canonical:
        raise SystemExit("canonical assessor join mismatch")
    args.out.mkdir(parents=True, exist_ok=True)
    target = args.out / "property-characteristics.ndjson.gz"
    with gzip.GzipFile(filename="", mode="wb", fileobj=target.open("wb"), mtime=0) as output:
        for row in rows: output.write((json.dumps(runtime_summary(row), separators=(",", ":"), sort_keys=True) + "\n").encode())
    observed_codes = sorted({row["useCode"] for row in rows})
    mapping = [{
        "originalCode": code,
        "sourceMeaning": meanings.get(code, "UNKNOWN"),
        "normalizedClass": normalized_use(code),
        "assessorAduHint": code in SF_ADU,
    } for code in observed_codes]
    (args.out / "use-code-mapping.json").write_text(json.dumps({
        "schemaVersion": "assessor-use-code-mapping-v0",
        "source": "SanGIS NUCLEUS_USE_CD domain metadata from sealed 2026-09-24 acquisition",
        "mappings": mapping,
    }, indent=2, sort_keys=True) + "\n")
    counts = {}
    for row in rows: counts[state(row)] = counts.get(state(row), 0) + 1
    eligible = counts.get("RECORDED_SINGLE_FAMILY_LIKELY", 0) + counts.get("RECORDED_MULTIFAMILY_LIKELY", 0)
    report = {
        "schemaVersion": "la-mesa-assessor-property-intelligence-v0",
        "denominator": len(rows),
        "states": counts,
        "eligibleForPreselection": eligible,
        "notEligibleForPreselection": len(rows) - eligible,
        "questionReduction": {
            "confirmationFlow": eligible + counts.get("RECORDED_CONDO", 0),
            "blankQuestion": counts.get("RECORDED_RESIDENTIAL_CONFLICT", 0) + counts.get("RECORDED_TYPE_UNKNOWN", 0),
            "note": "Condo records receive a bounded confirmation but remain ineligible for automatic pathway preselection.",
        },
        "packet72Comparison": {
            "expected": {"single":10633,"multifamily":1454,"condo":3370,"conflictOrWeak":187,"unknownOrNonresidential":1747},
            "note": "Packet 73 conservatively treats 350 assessor SFR-with-ADU/granny-flat hints as conflicts rather than ordinary multifamily use. The 316 formerly strong multi-unit matches move to conflict; the 34 formerly weak cases were already non-preselectable. One inconsistent condo and one sealed later-change fixture move from Packet 72 unknown to conflict.",
        },
        "canonicalApnFingerprint": hashlib.sha256(("\n".join(sorted(canonical)) + "\n").encode()).hexdigest(),
        "artifactSha256": hashlib.sha256(target.read_bytes()).hexdigest(),
    }
    (args.out / "coverage.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    (args.out / "README.md").write_text("""# La Mesa assessor property intelligence v0\n\nPacket 73 runtime derivation built locally from the sealed 2026-09-24 SanGIS/ARCC parcel acquisition. The committed artifact retains only APN, bounded derived state, eligibility, currentness language, and non-public conflict codes. Raw assessor characteristics, owner name, mailing address, owner occupancy, geometry, and `YEAR_EFFECTIVE` are not repackaged.\n\nThe generic builder structures the six approved recorded fact types before derivation. Runtime states remain recorded characteristics and hints, never legal/current as-built truth. Strong single-family and multifamily states may only shorten the private-preview intake to a homeowner confirmation; condo records get confirmation without automatic pathway selection. `coverage.json` records the complete 17,391-APN partition and the deliberate conservative difference from Packet 72.\n""")
    sealed_names = ["README.md", "browser-qa.json", "coverage.json", "packet-74-handoff.json", "property-characteristics.ndjson.gz", "use-code-mapping.json"]
    integrity = {name: {"bytes": (args.out / name).stat().st_size, "sha256": hashlib.sha256((args.out / name).read_bytes()).hexdigest()} for name in sealed_names}
    (args.out / "integrity.json").write_text(json.dumps({"schemaVersion": "la-mesa-assessor-property-intelligence-integrity-v0", "files": integrity}, indent=2, sort_keys=True) + "\n")

if __name__ == "__main__": main()

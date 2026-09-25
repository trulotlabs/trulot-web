#!/usr/bin/env python3
"""Build the sealed production-serving standards bundle from reviewed evidence.

This is an offline build/review tool. It may read the complete authority corpus,
but its generated runtime files contain no local paths or source documents.
"""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_VERSION = "verified-residential-standards-runtime/v1"
RELEASE_VERSION = "verified-residential-standards-v2-2026-09-24"
EXPECTED_COUNT = 213


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def runtime_normalize(value):
    # JSON.parse/JSON.stringify does not retain Python's 100.0 versus 100
    # distinction. Normalize integral floats only for the outer bundle seal;
    # every approved record also retains and verifies its original canonical
    # string and review hash below.
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, list):
        return [runtime_normalize(item) for item in value]
    if isinstance(value, dict):
        return {key: runtime_normalize(item) for key, item in value.items()}
    return value


def runtime_digest(value):
    return digest(runtime_normalize(value))


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read(path):
    return json.loads(path.read_text())


def build(source_paths_file):
    prior = load_module("verified_prior_gate", ROOT / "scripts/residential-standards-review/gate.py")
    high = load_module("verified_high_gate", ROOT / "scripts/high-value-residential-review/consumer.py")
    source_paths = read(source_paths_file)
    prior_bundle = prior.load()
    high_bundle = high.load()
    errors = prior.verify_source_files(prior_bundle, source_paths)
    errors.extend(high.validate(high_bundle, source_paths))
    if errors:
        raise ValueError("evidence validation failed: " + ", ".join(sorted(set(errors))))

    baseline = prior_bundle["residential_standards_v2_integration_safe"]
    promoted = high_bundle["proposed-safe-subset"]["new_display_safe_records"]
    approved_ids = high_bundle["decision"]["approved_new_rule_ids"]
    preserved_ids = high_bundle["proposed-safe-subset"]["preserved_baseline_ids"]
    if preserved_ids != [record["rule_id"] for record in baseline]:
        raise ValueError("baseline membership changed")
    if sorted(approved_ids) != sorted(record["rule_id"] for record in promoted):
        raise ValueError("Packet 17 membership changed")

    raw_by_id = {record["rule_id"]: record for record in read(ROOT / "data/zoning-standards-v2/rules.json")}
    entries = []
    for record in baseline:
        entries.append({
            "ruleId": record["rule_id"],
            "zoneCode": record["zone_code"],
            "sealedOrigin": "BASELINE_97",
            "sealedRecordCanonical": canonical(record),
            "sealedRecordSha256": digest(record),
            "sourceRecord": raw_by_id[record["rule_id"]],
        })
    for record in promoted:
        entries.append({
            "ruleId": record["rule_id"],
            "zoneCode": record["zone_code"],
            "sealedOrigin": "PACKET_17_116",
            "sealedRecordCanonical": canonical(record),
            "sealedRecordSha256": digest(record),
        })
    entries.sort(key=lambda item: item["ruleId"])
    ids = [entry["ruleId"] for entry in entries]
    if len(entries) != EXPECTED_COUNT or len(set(ids)) != EXPECTED_COUNT:
        raise ValueError("compiled membership is not the exact 213-record set")

    authority = high_bundle["authority-observation"]
    source_manifest = {
        source_id: {
            key: source[key]
            for key in ("sha256", "url", "acquired_at", "publisher")
            if key in source
        }
        for source_id, source in sorted(authority["sources"].items())
    }
    review_identity = {
        "baselineReviewSealSha256": hashlib.sha256(
            (ROOT / "data/residential-standards-review/integrity.json").read_bytes()
        ).hexdigest(),
        "packet17ReviewSealSha256": hashlib.sha256(
            (ROOT / "data/high-value-residential-review/integrity.json").read_bytes()
        ).hexdigest(),
        "packet17DecisionSha256": digest(high_bundle["decision"]),
        "approvedBaselineCount": len(baseline),
        "approvedPacket17Count": len(promoted),
    }
    source = read(ROOT / "data/zoning-standards-v2/sources.json")["sources"]["residential"]
    bundle = {
        "schemaVersion": SCHEMA_VERSION,
        "releaseVersion": RELEASE_VERSION,
        "ruleSetVersion": "sd-residential-2026-09-24-research-v1",
        "recordCount": EXPECTED_COUNT,
        "recordIds": ids,
        "recordIdsFingerprint": digest(ids),
        "sourceEvidenceManifest": source_manifest,
        "sourceEvidenceManifestFingerprint": digest(source_manifest),
        "reviewDecisionIdentity": review_identity,
        "shared": {"authorityMetadata": authority, "source": source},
        "records": entries,
    }
    bundle_sha = runtime_digest(bundle)
    receipt = {
        "schemaVersion": "verified-residential-standards-runtime-receipt/v1",
        "releaseVersion": RELEASE_VERSION,
        "bundleCanonicalSha256": bundle_sha,
        "recordCount": EXPECTED_COUNT,
        "recordIdsFingerprint": bundle["recordIdsFingerprint"],
        "sourceEvidenceManifestFingerprint": bundle["sourceEvidenceManifestFingerprint"],
        "reviewDecisionIdentity": review_identity,
    }
    seal = """// Generated by scripts/verified-standards-runtime/build.py. Do not edit.\n""" + \
        f"export const VERIFIED_STANDARDS_SCHEMA_VERSION = {json.dumps(SCHEMA_VERSION)} as const;\n" + \
        f"export const VERIFIED_STANDARDS_RELEASE_VERSION = {json.dumps(RELEASE_VERSION)} as const;\n" + \
        f"export const VERIFIED_STANDARDS_RECORD_COUNT = {EXPECTED_COUNT} as const;\n" + \
        f"export const VERIFIED_STANDARDS_RECORD_IDS_SHA256 = {json.dumps(bundle['recordIdsFingerprint'])} as const;\n" + \
        f"export const VERIFIED_STANDARDS_SOURCE_MANIFEST_SHA256 = {json.dumps(bundle['sourceEvidenceManifestFingerprint'])} as const;\n" + \
        f"export const VERIFIED_STANDARDS_BUNDLE_SHA256 = {json.dumps(bundle_sha)} as const;\n"
    return canonical(bundle) + "\n", json.dumps(receipt, indent=2, sort_keys=True) + "\n", seal


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-paths", required=True, type=Path)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "data/runtime")
    parser.add_argument("--seal-output", type=Path, default=ROOT / "lib/verified-standards-runtime-seal.ts")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    bundle, receipt, seal = build(args.source_paths)
    outputs = {
        args.output_dir / "verified-residential-standards-v2.json": bundle,
        args.output_dir / "verified-residential-standards-v2.receipt.json": receipt,
        args.seal_output: seal,
    }
    if args.check:
        changed = [str(path.relative_to(ROOT)) for path, content in outputs.items()
                   if not path.is_file() or path.read_text() != content]
        if changed:
            print("generated runtime artifacts differ: " + ", ".join(changed), file=sys.stderr)
            return 1
    else:
        for path, content in outputs.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
    print(f"PASS compiled {EXPECTED_COUNT} records; bundle={json.loads(receipt)['bundleCanonicalSha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATA = ROOT / "data/inside-coastal-rs-standards-v0"
OUTSIDE = ROOT / "data/rs-base-standards-v0"


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def load(path):
    return json.loads(Path(path).read_text())


builder = module("inside_coastal_builder", HERE / "build.py")
runtime = module("inside_coastal_runtime", ROOT / "scripts/parcel-rs-standards-runtime-v0/resolver.py")


class InsideCoastalRSStandardsV0Tests(unittest.TestCase):
    def test_authoritative_legal_chain(self):
        chain = load(DATA / "legal-version-chain.json")
        self.assertEqual(chain["controlling_inside_coastal_version"], "O-21836_AS_CERTIFIED_LCP-6-SAN-24-0038-3_AND_ACCEPTED_BY_O-22117_PLUS_O-21934_AS_CERTIFIED_LCP-6-SAN-25-0037-1")
        self.assertEqual(chain["commission_conditional_certification"], "2026-02-05")
        self.assertEqual(chain["inside_coastal_effective"], "2026-09-10")
        excluded = {row["ordinance"] for row in chain["excluded_later_or_uncertified"]}
        self.assertEqual(excluded, {"O-22109"})
        self.assertEqual(chain["o21934_certified_effective"], "2025-09-21")

    def test_acquired_source_hashes(self):
        sources = load(DATA / "sources.json")
        base = Path(sources["acquisition_path"])
        filenames = {
            "adopted_updates": "adopted-updates.html",
            "residential_division_4": "Ch13Art01Division04-current.pdf",
            "o21836": "O-21836.pdf", "ccc_2024_ldc": "CCC-2024-LDC-update-report.pdf",
            "o22117": "O-22117.pdf", "o21934": "O-21934.pdf", "o22109": "O-22109.pdf",
            "ccc_o21934_report": "CCC-O21934-de-minimis-report.pdf",
            "ccc_o21934_minutes": "CCC-September-2025-minutes.pdf",
        }
        for key, name in filenames.items():
            self.assertTrue((base / name).is_file(), name)
            self.assertEqual(hashlib.sha256((base / name).read_bytes()).hexdigest(), sources["sources"][key]["sha256"])

    def test_all_fourteen_zones_and_343_rules(self):
        rules = load(DATA / "standards.json")
        self.assertEqual(len(rules), 343)
        counts = {f"RS-1-{number}": 0 for number in range(1, 15)}
        for rule in rules:
            counts[rule["zone_code"]] += 1
        self.assertEqual(counts, {**{f"RS-1-{n}": 24 for n in range(1, 8)}, **{f"RS-1-{n}": 25 for n in range(8, 15)}})

    def test_o21934_footnote_7_repeal_and_o22109_exclusion(self):
        rules = load(DATA / "standards.json")
        rs12 = [r for r in rules if r["zone_code"] == "RS-1-2"]
        self.assertEqual(len(rs12), 24)
        self.assertTrue(all("131-04D:7" not in r["unresolved_dependencies"] for r in rs12))
        self.assertEqual(sum("131.0443(i)" in r["unresolved_dependencies"] for r in rules), 0)
        self.assertEqual(load(DATA / "validation.json")["o22109_conditions_removed"], 56)

    def test_cell_comparison_is_complete(self):
        comparison = load(DATA / "comparison.json")
        self.assertEqual(comparison["total_cells_compared"], 343)
        self.assertEqual(comparison["counts"], {
            "VALUE_SAME": 343, "VALUE_CHANGED": 0, "CONDITIONAL_DIFFERENCE": 56,
            "PROVENANCE_ONLY_DIFFERENCE": 280, "UNRESOLVED": 7,
        })
        self.assertEqual(len(comparison["rows"]), 343)

    def test_footnotes_preserved_and_orphan_8_remains_unknown(self):
        footnotes = load(DATA / "footnotes.json")
        self.assertNotIn("131-04D:7", footnotes)
        self.assertEqual(footnotes["131-04D:8"]["state"], "MISSING_IN_SOURCE")
        self.assertIsNone(footnotes["131-04D:8"]["text"])
        self.assertEqual(load(DATA / "validation.json")["orphan_footnote_8_rules"], 7)

    def test_version_selection_interval_and_refusals(self):
        case = copy.deepcopy(load(DATA / "fixtures.json")["cases"][0]["input"])
        for date in ["2026-09-10", "2026-09-30"]:
            case["as_of"] = date
            self.assertEqual(runtime.resolve(case)["standards"]["resolution_state"], "RESOLVED")
        for date in ["2026-09-09", "2026-10-01"]:
            case["as_of"] = date
            self.assertEqual(runtime.resolve(case)["standards"]["resolution_state"], "APPLICABILITY_UNRESOLVED")
        case["as_of"] = "2026-09-30"
        case["coastal_context"] = "unknown"
        case["coastal_context_state"] = "BOUNDARY_AMBIGUOUS"
        self.assertEqual(runtime.resolve(case)["standards"]["resolution_state"], "APPLICABILITY_UNRESOLVED")
        case["coastal_context_state"] = "SOURCE_UNAVAILABLE"
        self.assertEqual(runtime.resolve(case)["standards"]["resolution_state"], "SOURCE_UNAVAILABLE")

    def test_eight_real_parcel_scenarios(self):
        results = {row["name"]: row["result"] for row in load(DATA / "fixture-results.json")["results"]}
        self.assertEqual(set(results), {
            "inside-coastal-rs-1-7", "outside-coastal-rs-1-7", "inside-coastal-rs-1-4",
            "coastal-boundary-rs", "split-zone-inside-coastal", "non-rs-inside-coastal",
            "ambiguous-zoning-coastal", "unmapped-zoning-inside-coastal",
        })
        self.assertEqual(results["inside-coastal-rs-1-7"]["standards"]["resolution_state"], "RESOLVED")
        self.assertEqual(results["outside-coastal-rs-1-7"]["standards"]["resolution_state"], "RESOLVED")
        self.assertEqual(results["inside-coastal-rs-1-4"]["standards"]["resolution_state"], "RESOLVED")
        self.assertEqual(results["coastal-boundary-rs"]["standards"]["resolution_state"], "APPLICABILITY_UNRESOLVED")
        self.assertEqual(results["split-zone-inside-coastal"]["standards"]["resolution_state"], "RESOLVED")
        self.assertEqual(results["non-rs-inside-coastal"]["standards"]["resolution_state"], "NOT_APPLICABLE")
        self.assertEqual(results["ambiguous-zoning-coastal"]["standards"]["resolution_state"], "APPLICABILITY_UNRESOLVED")
        self.assertEqual(results["unmapped-zoning-inside-coastal"]["standards"]["resolution_state"], "MAPPING_UNRESOLVED")

    def test_provenance_complete(self):
        rules = load(DATA / "standards.json")
        source_keys = set(load(DATA / "sources.json")["sources"])
        for rule in rules:
            self.assertEqual(rule["jurisdiction_variant"], "INSIDE_COASTAL")
            self.assertEqual(rule["effective_from"], "2026-09-10")
            self.assertTrue(rule["legal_basis"])
            self.assertEqual(set(rule["legal_basis"]["source_keys"]), source_keys)
            body = {key: value for key, value in rule.items() if key != "provenance_sha256"}
            self.assertEqual(rule["provenance_sha256"], builder.fingerprint(body))
        self.assertEqual(load(DATA / "decision.json")["supported_values_without_provenance"], 0)

    def test_deterministic_rebuild(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory)
            builder.build(DATA, destination)
            for name in builder.STATIC + builder.GENERATED:
                self.assertEqual((DATA / name).read_bytes(), (destination / name).read_bytes(), name)

    def test_containment_and_decision(self):
        decision = load(DATA / "decision.json")
        self.assertEqual(decision["decision"], "INSIDE_COASTAL_RS_STANDARDS_V0_READY")
        for key in ["production_runtime_wiring", "parcel_compliance_evaluated", "development_capacity_calculated", "parcel_v1_modified", "production_access"]:
            self.assertFalse(decision[key])


if __name__ == "__main__":
    unittest.main(verbosity=2)

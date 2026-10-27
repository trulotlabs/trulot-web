#!/usr/bin/env python3
import gzip
import hashlib
import json
import unittest
from pathlib import Path

from build import EXISTING, MATERIAL_KEYS, OUT, SELECTED, build

ROOT = Path(__file__).resolve().parents[2]


class Packet78Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build()

    def test_inventory_and_ranking_cover_every_observed_residential_zone(self):
        inv = self.outputs["residential-zone-inventory.json"]
        self.assertEqual(inv["residential_zone_count"], 31)
        self.assertEqual({z["zone_code"] for z in inv["zones"]}, set(json.loads((ROOT / "data/zoning-standards-v2/zone-inventory.json").read_text())["observed_residential_codes"]))
        self.assertEqual(len(self.outputs["coverage-ranking.json"]["ranking"]), 31)

    def test_six_selected_rs_profiles_reuse_one_schema(self):
        artifact = self.outputs["rule-profiles.json"]
        self.assertEqual(tuple(artifact["selected_zones"]), SELECTED)
        self.assertEqual(len(artifact["profiles"]), 6)
        self.assertEqual({p["family_schema"] for p in artifact["profiles"]}, {"RS_TABLE_131_04D_GENERIC_V1"})
        self.assertFalse(artifact["family_schemas"]["RS_TABLE_131_04D_GENERIC_V1"]["bespoke_evaluator_per_zone"])

    def test_dual_versions_and_source_fingerprints_are_complete(self):
        for profile in self.outputs["rule-profiles.json"]["profiles"]:
            self.assertEqual({c["coastal_context"] for c in profile["contexts"]}, {"OUTSIDE_COASTAL", "INSIDE_COASTAL"})
            for context in profile["contexts"]:
                self.assertEqual(len(context["source_fingerprint"]), 64)
                self.assertTrue(context["ordinance_components"])
                self.assertGreaterEqual(len(context["rules"]), 24)
                for rule in context["rules"]:
                    self.assertEqual(len(rule["source_fingerprint"]), 64)

    def test_material_rows_and_footnotes_are_present(self):
        for profile in self.outputs["rule-profiles.json"]["profiles"]:
            for context in profile["contexts"]:
                keys = {r["rule_family"] for r in context["rules"]}
                self.assertTrue(MATERIAL_KEYS - {"lot_coverage_max"} <= keys)
                for rule in context["rules"]:
                    for fid in rule["footnote_ids"]:
                        self.assertIn(fid, self.outputs["footnotes.json"]["used_footnotes"])

    def test_formula_taxonomy_and_fail_closed_states(self):
        allowed = {"DIRECT", "FORMULA", "CONDITIONAL", "NOT_SPECIFIED", "MODIFIER_DEPENDENT", "UNRESOLVED"}
        records = [r for p in self.outputs["rule-profiles.json"]["profiles"] for c in p["contexts"] for r in c["rules"]]
        self.assertTrue(records)
        self.assertTrue({r["representation"] for r in records} <= allowed)
        self.assertTrue(any(r["representation"] == "CONDITIONAL" for r in records))
        self.assertTrue(any(r["representation"] == "UNRESOLVED" for r in records))
        for r in records:
            if r["representation"] in {"CONDITIONAL", "UNRESOLVED", "MODIFIER_DEPENDENT"}:
                self.assertEqual(r["public_evaluation_state"], "RULE_FACT_ONLY_REVIEW_REQUIRED")
        formulas = self.outputs["family-schema.json"]["formulas"]
        self.assertEqual(formulas["rear_shallow"]["expression"], "max(5, 0.10 * code_lot_depth_ft)")
        self.assertEqual(formulas["rear_deep"]["expression"], "max(table_rear_setback_ft, 0.10 * code_lot_depth_ft)")
        self.assertEqual(self.outputs["family-schema.json"]["missing_fact_policy"], "UNRESOLVED_REVIEW_REQUIRED")

    def test_coverage_is_exact_about_associations_and_missing_population(self):
        c = self.outputs["coverage.json"]
        self.assertEqual(c["before_supported_associations"], 165454)
        self.assertEqual(c["packet_78_additional_supported_associations"], 78483)
        self.assertEqual(c["after_supported_associations"], 243937)
        self.assertIsNone(c["supported_single_zone_residential_population"])
        self.assertIn("not unique parcels", c["metric_basis"])

    def test_selection_is_bounded_and_does_not_claim_citywide_completion(self):
        with gzip.open(OUT / "profile-selection-sample.ndjson.gz", "rt") as stream:
            rows = [json.loads(line) for line in stream]
        self.assertEqual(len(rows), 3)
        self.assertTrue(all(r["readiness"] == "SUPPORTED_PROFILE_REVIEW_REQUIRED" for r in rows))
        self.assertEqual(self.outputs["golden-verification.json"]["state"], "BOUNDED_SAMPLE_ONLY")
        self.assertTrue(self.outputs["golden-verification.json"]["unrepresented_selected_zones"])

    def test_negative_boundaries(self):
        zones = set(self.outputs["rule-profiles.json"]["selected_zones"])
        self.assertNotIn("UNKNOWN", zones)
        self.assertNotIn("RT-1-2", zones)
        self.assertNotIn("RX-1-1", zones)
        self.assertNotEqual(self.outputs["rule-profiles.json"]["profiles"][0]["contexts"][0]["rule_set_version"], self.outputs["rule-profiles.json"]["profiles"][0]["contexts"][1]["rule_set_version"])

    def test_v4_and_existing_benchmark_compatibility(self):
        compat = self.outputs["compatibility.json"]
        self.assertTrue(compat["generic_family_schema"])
        self.assertEqual(set(compat["existing_benchmark_replay"]), {"6341302200", "5442140600"})
        self.assertFalse(compat["property_intelligence_dependency"])
        self.assertFalse(compat["production"])
        self.assertFalse(compat["ui"])
        self.assertFalse(compat["capacity"])

    def test_integrity_and_determinism(self):
        first = build()
        second = build()
        self.assertEqual(first, second)
        integrity = self.outputs["integrity.json"]
        for name, expected in integrity["files"].items():
            self.assertEqual(hashlib.sha256((OUT / name).read_bytes()).hexdigest(), expected)

    def test_partial_decision_is_honest_and_useful(self):
        decision = self.outputs["decision.json"]
        self.assertEqual(decision["decision"], "SAN_DIEGO_RESIDENTIAL_RULE_EXPANSION_PARTIAL")
        self.assertTrue(decision["useful_sealed_work"])
        self.assertTrue(decision["packet_11_frozen"])
        self.assertFalse(decision["production_access"])


if __name__ == "__main__":
    unittest.main(verbosity=2)

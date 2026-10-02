#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

from build import OUTPUT, build_outputs
from resolver import predicate_state, rear_base, select_far_band, select_version


class Packet58Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()

    def test_shared_schema_generic_extension_and_rm_compatibility(self):
        schema = self.outputs["schema.json"]
        self.assertIn("RS_PROFILE_SCHEMA_EXTENSION_REQUIRED", schema["compatibility_decision"])
        pattern = schema["properties"]["zone_code"]["pattern"]
        self.assertTrue(re.fullmatch(pattern, "RS-1-7"))
        self.assertTrue(re.fullmatch(pattern, "RM-2-5"))
        rm = json.loads((Path("data/rm-rule-profile-v0/rm-2-5-base-rules.json")).read_text())["rules"][0]
        for field in schema["required"]:
            self.assertIn(field, rm)
        self.assertEqual(schema["layer_separation"], json.loads(Path("data/rm-rule-profile-v0/schema.json").read_text())["layer_separation"])

    def test_version_selection_isolates_coastal_and_history(self):
        profiles = self.outputs["version-profiles.json"]["profiles"]
        self.assertEqual(select_version(profiles, "2026-10-02", "OUTSIDE_COASTAL")["profile_id"], "RS17_OUTSIDE_COASTAL_2026_07_15")
        inside = select_version(profiles, "2026-10-02", "INSIDE_COASTAL")
        self.assertEqual(inside["profile_id"], "RS17_INSIDE_COASTAL_2026_09_10")
        self.assertFalse(inside["fire_section_131_0443_i"])
        self.assertTrue(select_version(profiles, "2026-07-15", "OUTSIDE_COASTAL")["fire_section_131_0443_i"])
        self.assertEqual(select_version(profiles, "2026-07-14", "OUTSIDE_COASTAL")["profile_id"], "RS17_OUTSIDE_COASTAL_2025_04_24")

    def test_exact_base_cells_and_provenance(self):
        rules = {r["rule_id"]: r for r in self.outputs["rs-1-7-base-rules.json"]["rules"]}
        expected = {"RS17_MIN_LOT_AREA": "5000", "RS17_MIN_LOT_WIDTH": "50", "RS17_MIN_CORNER_WIDTH": "55", "RS17_MIN_LOT_DEPTH": "95", "RS17_MIN_STREET_FRONTAGE": "50", "RS17_FRONT_SETBACK": "15", "RS17_INTERIOR_SIDE_SETBACK": "4", "RS17_STREET_SIDE_SETBACK": "5", "RS17_REAR_SETBACK": "13"}
        self.assertEqual({k: rules[k]["base_value"] for k in expected}, expected)
        self.assertEqual(rules["RS17_STRUCTURE_HEIGHT"]["base_value"], {"setback_line_ft": "24", "overall_ft": "30"})
        self.assertIsNone(rules["RS17_FAR"]["base_value"])
        for record in rules.values():
            self.assertEqual(record["table_locator"]["table"], "131-04D")
            self.assertTrue(record["source_provenance"])

    def test_definition_layer_has_required_terms(self):
        terms = self.outputs["definitions.json"]["definitions"]
        for term in ("lot", "premises", "lot_area", "lot_width", "lot_depth", "street_frontage", "front_property_line", "side_property_line", "street_side_property_line", "rear_property_line", "structure_edge", "structure_height", "far"):
            self.assertIn(term, terms)
            self.assertTrue(terms[term]["source"].startswith("SDMC"))

    def test_footnote_unknown_does_not_become_false(self):
        fn1 = self.outputs["footnotes.json"]["footnotes"][0]
        self.assertEqual(predicate_state(fn1["trigger_predicates"], {}), "unknown")
        self.assertEqual(predicate_state(fn1["trigger_predicates"], {fn1["trigger_predicates"][0]: False}), "false")
        self.assertEqual(predicate_state(fn1["trigger_predicates"], {p: True for p in fn1["trigger_predicates"]}), "true")

    def test_setback_branch_structures(self):
        p = self.outputs["setbacks.json"]["profiles"]
        self.assertEqual(p["front"]["base_ft"], "15")
        self.assertEqual(rear_base("13", "95"), "9.50")
        self.assertEqual(rear_base("13", "120"), "13")
        self.assertEqual(rear_base("13", "235.02"), "23.5020")
        self.assertEqual(p["interior_side"]["branches"][1]["combined_min_ft"], "8")
        self.assertEqual(p["street_side"]["not_applicable_state"], "NOT_APPLICABLE")
        self.assertNotEqual(p["street_side"]["not_applicable_state"], 0)

    def test_height_branch_is_not_flattened(self):
        h = self.outputs["height.json"]
        self.assertEqual(h["raw_cell"], "(4) 24/30")
        self.assertEqual(h["branches"][0]["maximum_ft"], "24")
        self.assertEqual(h["branches"][1]["maximum_ft"], "30")
        self.assertIn("lower of existing or proposed grade", h["measurement"]["plumb_line"])

    def test_far_bands_and_hillside_formula(self):
        self.assertEqual(select_far_band("3000"), "0.70")
        self.assertEqual(select_far_band("5000"), "0.60")
        self.assertEqual(select_far_band("5001"), "0.59")
        self.assertEqual(select_far_band("22096.320"), "0.45")
        far = self.outputs["far.json"]
        self.assertEqual(len(far["ordinary_branch"]["bands"]), 18)
        self.assertEqual(far["steep_hillside_branch"]["result_type"], "MAXIMUM_GFA_FORMULA_NOT_SINGLE_FAR_RATIO")

    def test_fire_and_slope_fail_closed(self):
        fire = self.outputs["fire-doctrine.json"]["doctrine"]
        self.assertEqual(fire["mapped_fire_hazard"], "CONTEXT_ONLY")
        self.assertEqual(fire["missing_determination"], "UNKNOWN_NOT_FALSE")
        self.assertIn("UNRESOLVED", self.outputs["slope-dependency.json"]["unresolved_outcome"])

    def test_density_and_coverage_do_not_overclaim(self):
        density = self.outputs["density.json"]
        self.assertFalse(density["development_capacity_calculated"])
        self.assertIn("not final development capacity", density["doctrine"])
        coverage = self.outputs["lot-coverage.json"]["branches"]
        self.assertEqual(coverage[0]["maximum_percent"], "50")
        self.assertEqual(coverage[1]["value"], "NOT_SPECIFIED")
        self.assertEqual(coverage[2]["value"], "UNRESOLVED")

    def test_replay_preserves_prior_results(self):
        replay = self.outputs["apn-6341302200-replay.json"]
        results = replay["results"]
        self.assertEqual([results[k]["state"] for k in ("minimum_lot_area", "minimum_lot_width", "minimum_lot_depth", "minimum_frontage")], ["SATISFIED"] * 4)
        self.assertEqual([results[k]["state"] for k in ("front_setback", "rear_setback", "interior_side_setback")], ["CONDITIONAL"] * 3)
        self.assertEqual(results["street_side_setback"]["state"], "NOT_APPLICABLE")
        self.assertFalse(replay["whole_project_compliance"])
        self.assertFalse(replay["development_capacity"])

    def test_public_page_consistency_and_family_extension(self):
        public = self.outputs["public-page-consistency.json"]
        self.assertEqual(public["profile_supply"], "EXACT_MATCH")
        self.assertFalse(public["truth_semantics_changed"])
        self.assertFalse(public["ui_wired"])
        family = self.outputs["family-extension.json"]
        self.assertEqual(family["decision"], "RS_ZONE_FAMILY_EXTENSION_READY")
        self.assertEqual(len(family["zones"]), 14)
        self.assertFalse(family["schema_change_required"])

    def test_invariants_and_decisions(self):
        invariants = self.outputs["invariants.json"]["invariants"]
        for invariant in ("UNKNOWN_IS_NOT_FALSE", "NOT_APPLICABLE_IS_NOT_ZERO", "DENSITY_IS_NOT_CAPACITY", "FIRE_CONTEXT_IS_NOT_PROJECT_DETERMINATION", "NO_UNSUPPORTED_HEIGHT_OR_FAR_CONCLUSION"):
            self.assertIn(invariant, invariants)
        decision = self.outputs["decision.json"]
        self.assertEqual(decision["readiness"], "RS_RULE_PROFILE_V0_READY")
        self.assertEqual(decision["architecture"], "FEASIBILITY_ARCHITECTURE_READY_FOR_BOUNDED_PRODUCT_CONTRACT")

    def test_integrity_and_deterministic_committed_outputs(self):
        self.assertEqual(build_outputs(), build_outputs())
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)

    def test_no_private_production_or_secret_material(self):
        serialized = json.dumps(self.outputs)
        self.assertNotIn("/Users/", serialized)
        self.assertNotRegex(serialized, r"(?i)password|service_role|postgresql://")
        self.assertFalse(self.outputs["contract.json"]["production"])
        self.assertFalse(self.outputs["contract.json"]["ui"])
        self.assertFalse(self.outputs["contract.json"]["capacity"])


if __name__ == "__main__":
    unittest.main(verbosity=2)

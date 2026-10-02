#!/usr/bin/env python3
from __future__ import annotations

import json
import unittest
from pathlib import Path

from build import OUTPUT, build_outputs
from resolver import apply_footnote, apply_modifier, proportional_setback, select_unit_band, select_version


class Packet51Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()

    def test_schema_is_generic_and_layered(self):
        schema = self.outputs["schema.json"]
        for key in ("zone_code", "legal_version", "coastal_applicability_profile", "rule_family", "base_value", "unit", "comparator", "applicability_predicates", "footnotes", "exceptions", "measurement_definition", "program_modifiers", "source_provenance", "derivation_class", "unresolved_dependencies"):
            self.assertIn(key, schema["required"])
        self.assertNotIn("RM-2-5", json.dumps(schema))
        self.assertEqual(len(schema["layer_separation"]), 5)

    def test_historical_version_selection_excludes_later_law(self):
        profiles = self.outputs["version-profiles.json"]["profiles"]
        selected = select_version(profiles, on_date="2024-01-29", coastal_context="OUTSIDE_COASTAL")
        self.assertEqual(selected["profile_id"], "RM25_2023_05_06_OUTSIDE_COASTAL")
        self.assertEqual(selected["far_definition_status"].split(";")[0], "PRE_O21836_TEXT")
        self.assertNotEqual(select_version(profiles, on_date="2026-10-02", coastal_context="OUTSIDE_COASTAL")["profile_id"], selected["profile_id"])

    def test_table_reconstruction_and_footnotes(self):
        rules = {r["rule_id"]: r for r in self.outputs["rm-2-5-base-rules.json"]["rules"]}
        expected = {"RM25_MIN_LOT_AREA": "6000", "RM25_MIN_LOT_WIDTH": "50", "RM25_MIN_CORNER_WIDTH": "55", "RM25_MIN_LOT_DEPTH": "90", "RM25_HEIGHT": "40"}
        self.assertEqual({k: rules[k]["base_value"] for k in expected}, expected)
        self.assertEqual(rules["RM25_HEIGHT"]["footnotes"], ["FN18", "FN37"])
        self.assertIsNone(rules["RM25_LOT_COVERAGE"]["base_value"])
        self.assertEqual([rules[key]["base_value"] for key in ("RM25_FAR_1_2", "RM25_FAR_3_7", "RM25_FAR_8_PLUS")], ["1.35", "1.35", "1.35"])

    def test_footnote_branches_fail_closed(self):
        height = next(r for r in self.outputs["rm-2-5-base-rules.json"]["rules"] if r["rule_id"] == "RM25_HEIGHT")
        fn37 = next(f for f in self.outputs["footnotes.json"]["footnotes"] if f["footnote_id"] == "FN37")
        self.assertEqual(apply_footnote(height, fn37, {"IN_COASTAL_HEIGHT_LIMIT_OVERLAY": True, "IN_PENINSULA_COMMUNITY_PLAN": True})["value"], "30")
        self.assertEqual(apply_footnote(height, fn37, {"IN_COASTAL_HEIGHT_LIMIT_OVERLAY": False, "IN_PENINSULA_COMMUNITY_PLAN": None})["state"], "unknown")
        self.assertEqual(apply_footnote(height, fn37, {"IN_COASTAL_HEIGHT_LIMIT_OVERLAY": False, "IN_PENINSULA_COMMUNITY_PLAN": False})["value"], "40")

    def test_height_definition_is_complete_and_no_numeric_shortcut(self):
        h = self.outputs["height-definition.json"]
        self.assertIn("lower of existing or proposed grade", h["plumb_line"]["rule"])
        self.assertIn("Highest point", h["overall"]["high_point"])
        self.assertEqual(h["per_structure"]["predicate"], "STRUCTURE_SEPARATION_AT_LEAST_6_FT")
        replay = self.outputs["packet-50-replay.json"]["height"]
        self.assertIsNone(replay["comparison"])
        self.assertFalse(replay["plan_label_is_code_measurement"])

    def test_far_definition_application_and_current_are_separate(self):
        f = self.outputs["far-definition.json"]
        self.assertEqual(f["application_profile_2024_01_29"]["version"], "PRE_O21836")
        self.assertEqual(f["current_profile_2026_07_15"]["version"], "CURRENT_COMPILED_7_2026")
        self.assertTrue(f["application_profile_2024_01_29"]["multiple_building_aggregation"])
        self.assertIn("cannot satisfy", f["plan_label_policy"])

    def test_unit_bands_remain_distinct(self):
        bands = self.outputs["unit-bands.json"]["bands"]
        self.assertEqual([select_unit_band(bands, n)["band_id"] for n in (1, 3, 8)], ["RM25_FAR_1_2", "RM25_FAR_3_7", "RM25_FAR_8_PLUS"])
        self.assertEqual({b["far_maximum"] for b in bands}, {"1.35"})
        self.assertTrue(self.outputs["unit-bands.json"]["selection_still_required"])

    def test_setback_formulas(self):
        self.assertEqual(proportional_setback(premises_width_ft="80", fraction="0.10", floor_ft="5"), "8.00")
        self.assertEqual(proportional_setback(premises_width_ft="45", fraction="0.10", floor_ft="5"), "5")
        self.assertEqual(self.outputs["setbacks.json"]["profiles"]["rear"]["base_min_ft"], "15")

    def test_modifier_contract_requires_predicates(self):
        modifier = {"operation": "ADDITIVE", "operand": "0.25", "predicates": ["QUALIFIES"]}
        self.assertEqual(apply_modifier("1.35", modifier, {"QUALIFIES": None})["state"], "unknown")
        self.assertEqual(apply_modifier("1.35", modifier, {"QUALIFIES": False})["value"], "1.35")
        self.assertEqual(apply_modifier("1.35", modifier, {"QUALIFIES": True})["value"], "1.60")

    def test_adu_interactions_do_not_invent_bonus(self):
        adu = self.outputs["rm-2-5-adu-interactions.json"]
        self.assertEqual(adu["height"]["operation"], "UNCHANGED")
        self.assertEqual(adu["far"]["maximum_far"]["operation"], "UNCHANGED")
        self.assertFalse(adu["packet_50_context"]["annotation_proves_eligibility"])
        self.assertEqual({m["operation"] for m in adu["modifiers"]}, {"UNCHANGED"})
        for modifier in adu["modifiers"]:
            self.assertTrue(modifier["predicates"])
            self.assertTrue(modifier["provenance"])
            self.assertEqual(modifier["effective_from"], "2023-05-06")

    def test_evidence_contract_and_truth_vocab(self):
        evidence = self.outputs["evidence-requirements.json"]["families"]
        self.assertIn("legal_premises_identity", evidence["FAR"]["required"])
        self.assertIn("existing_grade_surface", evidence["STRUCTURE_HEIGHT"]["required"])
        truth = self.outputs["truth-state-integration.json"]
        self.assertFalse(truth["new_categories_added"])
        self.assertIn("unknown", truth["allowed_fact_states"])

    def test_packet50_replay_is_precise_and_unresolved(self):
        replay = self.outputs["packet-50-replay.json"]
        self.assertEqual(replay["height"]["state"], "HEIGHT_RULE_EVALUATION_UNRESOLVED")
        self.assertEqual(replay["far"]["state"], "FAR_RULE_EVALUATION_UNRESOLVED")
        self.assertEqual(replay["far"]["plan_inputs"]["nearest_hundredth"], "1.11")
        self.assertFalse(replay["whole_project_compliance"])
        self.assertFalse(replay["development_capacity"])

    def test_invariants_and_decisions(self):
        invariants = self.outputs["invariants.json"]["invariants"]
        self.assertIn("UNKNOWN_EVIDENCE_CANNOT_BECOME_FALSE", invariants)
        self.assertIn("DISTINCT_LEGAL_TABLE_CELLS_REMAIN_DISTINCT_RECORDS", invariants)
        self.assertEqual(self.outputs["decision.json"]["readiness"], "RM_RULE_PROFILE_V0_READY")
        self.assertEqual(self.outputs["decision.json"]["next"], "NEXT_FEASIBILITY_STEP: close Packet 50 FAR evidence")

    def test_deterministic_rebuild_and_committed_artifacts(self):
        self.assertEqual(build_outputs(), build_outputs())
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)

    def test_no_private_or_production_material(self):
        serialized = json.dumps(self.outputs)
        self.assertNotIn("/Users/", serialized)
        self.assertNotRegex(serialized, r"(?i)password|service_role|postgresql://")
        self.assertFalse(self.outputs["contract.json"]["production"])
        self.assertFalse(self.outputs["contract.json"]["private_plan_publication"])


if __name__ == "__main__":
    unittest.main(verbosity=2)

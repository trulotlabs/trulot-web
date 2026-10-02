#!/usr/bin/env python3
from __future__ import annotations

import json
import unittest

from build import OUTPUT, build_outputs
from resolver import PRODUCT_STATES, map_state, overall_state, render


class Packet59Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()

    def test_scope_classifies_outputs_and_excludes_capacity(self):
        scope = self.outputs["scope.json"]["classifications"]
        self.assertIn("supported_lot_area_width_depth_frontage_comparisons", scope["PRODUCT_READY"])
        self.assertIn("setback_requirements", scope["PRODUCT_READY_CONDITIONAL"])
        self.assertIn("development_capacity", scope["OUTSIDE_V0_SCOPE"])

    def test_product_vocabulary_is_small_and_no_likely(self):
        states = self.outputs["states.json"]
        self.assertEqual({item["state"] for item in states["product_states"]}, PRODUCT_STATES)
        self.assertFalse(states["ambiguous_likely_state_allowed"])
        self.assertNotIn("LIKELY", json.dumps(states))

    def test_internal_state_mapping(self):
        self.assertEqual(map_state("RULE_REQUIREMENT_SATISFIED"), "MEETS_BASE_RULE")
        self.assertEqual(map_state("SETBACK_REQUIREMENT_CONDITIONAL"), "CONDITIONAL")
        self.assertEqual(map_state("HEIGHT_RULE_EVALUATION_UNRESOLVED"), "NEEDS_EVIDENCE")
        self.assertEqual(map_state("STREET_SIDE_SETBACK_NOT_APPLICABLE"), "NOT_APPLICABLE")
        with self.assertRaises(ValueError):
            map_state("UNCONTROLLED_NEW_STATE")

    def test_overall_summary_is_conservative(self):
        self.assertEqual(overall_state(["MEETS_BASE_RULE", "NOT_APPLICABLE"]), "BASE_PARCEL_RULES_EVALUATED")
        self.assertEqual(overall_state(["MEETS_BASE_RULE", "NEEDS_EVIDENCE"]), "PARTIAL_EVALUATION")
        self.assertEqual(overall_state(["NEEDS_EVIDENCE"]), "MORE_EVIDENCE_NEEDED")
        prohibited = self.outputs["overall-state.json"]["prohibited_top_level_labels"]
        self.assertIn("Buildable", prohibited)

    def test_rule_card_separates_rule_fact_project_and_existing(self):
        layers = self.outputs["rule-card-contract.json"]["layers"]
        for layer in ("PARCEL_RULE", "PARCEL_FACT", "COMPARISON", "PROJECT_COMPARISON", "EXISTING_STRUCTURE_COMPLIANCE"):
            self.assertIn(layer, layers)
        self.assertFalse(self.outputs["rule-card-contract.json"]["internal_adapter_names_exposed"])

    def test_blockers_have_codes_plain_copy_and_actions(self):
        blockers = self.outputs["evidence-blockers.json"]["blockers"]
        by_code = {item["code"]: item for item in blockers}
        for code in ("CURRENT_SURVEY_STRUCTURE_GEOMETRY", "CODE_HEIGHT_ANALYSIS", "CODE_GFA_AND_PREMISES_AREA", "PARCEL_SLOPE_EVIDENCE"):
            self.assertIn(code, by_code)
            self.assertTrue(by_code[code]["copy"].startswith("TruLot"))
            self.assertEqual(by_code[code]["action"], "SEE_EVIDENCE_NEEDED")

    def test_deterministic_copy_and_missing_values_fail(self):
        text = render("MEETS_BASE_RULE", {"requirement": "50 ft minimum", "rule_name": "lot-width"})
        self.assertEqual(text, "Meets the 50 ft minimum base lot-width rule.")
        self.assertEqual(render("NOT_APPLICABLE", {}), "This rule does not apply to this parcel.")
        with self.assertRaises(ValueError):
            render("MEETS_BASE_RULE", {"rule_name": "width"})
        self.assertFalse(self.outputs["renderer-contract.json"]["free_form_conclusion_generation"])

    def test_program_geography_does_not_imply_eligibility(self):
        programs = self.outputs["program-overlay-states.json"]
        self.assertIn("not proof of program eligibility", programs["doctrine"])
        for item in programs["programs"]:
            self.assertIn("not evaluated", item["eligibility_copy"])

    def test_height_far_coverage_and_setback_contracts(self):
        c = self.outputs["rule-family-contracts.json"]
        self.assertIn("24 ft", c["height"]["rs"])
        self.assertIn("30 ft", c["height"]["rs"])
        self.assertFalse(c["far"]["diagnostic_ranges_legal"])
        self.assertEqual(c["lot_coverage"]["not_specified_copy"], "No numeric base-zone lot-coverage standard identified.")
        self.assertIn("Requires compatible geometry", c["setbacks"]["existing_or_project_compliance"])

    def test_schema_accepts_replays(self):
        schema = self.outputs["schema.json"]
        required = schema["required"]
        card_required = schema["definitions"]["ruleResult"]["required"]
        for name in ("rs-6341302200-replay.json", "rm-5442140600-public-replay.json", "private-prj-1111087-replay.json", "blocked-height-far-replay.json"):
            payload = self.outputs[name]
            for field in required:
                self.assertIn(field, payload, f"{name}:{field}")
            for result in payload["rule_results"]:
                for field in card_required:
                    self.assertIn(field, result, f"{name}:{field}")
                self.assertIn(result["result_state"], PRODUCT_STATES)

    def test_rs_replay_preserves_prior_results(self):
        replay = self.outputs["rs-6341302200-replay.json"]
        states = {card["card_id"]: card["result_state"] for card in replay["rule_results"]}
        for card_id in ("RS17_AREA", "RS17_WIDTH", "RS17_DEPTH", "RS17_FRONTAGE"):
            self.assertEqual(states[card_id], "MEETS_BASE_RULE")
        for card_id in ("RS17_FRONT", "RS17_REAR", "RS17_SIDE"):
            self.assertEqual(states[card_id], "CONDITIONAL")
        self.assertEqual(states["RS17_STREET_SIDE"], "NOT_APPLICABLE")
        self.assertEqual(states["RS17_EXISTING"], "NEEDS_EVIDENCE")

    def test_rm_replay_is_public_only(self):
        replay = self.outputs["rm-5442140600-public-replay.json"]
        self.assertEqual(replay["privacy"], "PUBLIC")
        self.assertFalse(replay["private_plan_facts_present"])
        serialized = json.dumps(replay)
        for private_value in ("PRJ-1111087", "ADU_HOME_DENSITY_BONUS", "5 ft 11-1/2 in", "22219.6"):
            self.assertNotIn(private_value, serialized)
        self.assertIn("1.35", serialized)
        self.assertIn("40 ft", serialized)

    def test_private_replay_is_never_public_cache_or_index(self):
        replay = self.outputs["private-prj-1111087-replay.json"]
        self.assertEqual(replay["privacy"], "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX")
        self.assertFalse(replay["public_cache"])
        self.assertFalse(replay["public_index"])
        self.assertEqual(replay["rule_results"][0]["scope"], "PROJECT_COMPARISON")
        self.assertIn("named proposed building dimension", replay["rule_results"][0]["answer"])
        self.assertIn("not proven issued", replay["plan_status"].lower().replace("_", " "))

    def test_height_far_blocked_replay_does_not_claim_compliance(self):
        replay = self.outputs["blocked-height-far-replay.json"]
        self.assertEqual({c["result_state"] for c in replay["rule_results"]}, {"NEEDS_EVIDENCE"})
        self.assertFalse(replay["whole_project_compliance"])
        self.assertIn("grade and top-elevation", replay["rule_results"][0]["answer"])
        self.assertIn("gross-floor-area", replay["rule_results"][1]["answer"])

    def test_not_applicable_is_not_zero(self):
        result = next(c for c in self.outputs["rs-6341302200-replay.json"]["rule_results"] if c["card_id"] == "RS17_STREET_SIDE")
        self.assertEqual(result["result_state"], "NOT_APPLICABLE")
        self.assertEqual(result["fact"], "No street-side property line")
        self.assertNotIn("0 ft", result["answer"])

    def test_no_prohibited_claim_leaks_into_product_answers(self):
        deny = [text.lower() for text in self.outputs["prohibited-statements.json"]["denylist"]]
        for name in ("rs-6341302200-replay.json", "rm-5442140600-public-replay.json", "private-prj-1111087-replay.json", "blocked-height-far-replay.json"):
            for result in self.outputs[name]["rule_results"]:
                answer = result["answer"].lower()
                for claim in deny:
                    self.assertNotIn(claim, answer, f"{name}: {claim}")

    def test_public_private_boundary_and_indexing(self):
        boundary = self.outputs["public-private-boundary.json"]
        self.assertIn("No private fact", boundary["hard_invariant"])
        indexing = self.outputs["indexing-doctrine.json"]
        self.assertIn("private project-plan facts", indexing["public_not_indexable"])
        self.assertIn("PRIVATE_NO_PUBLIC_CACHE_OR_INDEX", indexing["cache_rule"])

    def test_decisions(self):
        decision = self.outputs["decision.json"]
        self.assertEqual(decision["readiness"], "BOUNDED_FEASIBILITY_PRODUCT_CONTRACT_READY")
        self.assertEqual(decision["next"], "NEXT_FEASIBILITY_STEP: implement bounded feasibility preview")
        self.assertFalse(decision["ui_implemented"])
        self.assertFalse(decision["production_wired"])
        self.assertFalse(decision["capacity_calculated"])

    def test_deterministic_rebuild_and_committed_outputs(self):
        self.assertEqual(build_outputs(), build_outputs())
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)

    def test_no_secret_path_or_production_material(self):
        serialized = json.dumps(self.outputs)
        self.assertNotIn("/Users/", serialized)
        self.assertNotRegex(serialized, r"(?i)password|service_role|postgresql://")
        self.assertFalse(self.outputs["provenance.json"]["production_access"])


if __name__ == "__main__":
    unittest.main(verbosity=2)

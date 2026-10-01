#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import subprocess
import sys
import unittest
from decimal import Decimal
from pathlib import Path

from build import OUTPUT, ROOT, build_outputs, plan_envelope
from resolver import compare_plan_setback, reconcile_zone, select_setback_requirement, validate_plan_fact_envelope


class ApprovedPlanSetbackBenchmarkV0Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()
        cls.result = cls.outputs["benchmark-result.json"]

    def test_01_private_plan_zoning_does_not_override_public(self):
        conflict = reconcile_zone("RM-2-5", "RS-1-7")
        self.assertEqual(conflict["selected_zone"], "RM-2-5")
        self.assertEqual(conflict["state"], "CONFLICT")
        self.assertFalse(conflict["private_plan_overrode_public_zone"])

    def test_02_plan_fact_is_not_existing_parcel_fact(self):
        envelope = copy.deepcopy(plan_envelope())
        envelope["subject"] = "EXISTING_PARCEL_FACT"
        with self.assertRaisesRegex(ValueError, "PRIVATE_PLAN_FACT_MUST_REMAIN_PROPOSED"):
            validate_plan_fact_envelope(envelope)

    def test_03_submittal_is_not_approval(self):
        self.assertEqual(self.result["plan_status"], "FOURTH_CD_SUBMITTAL_NOT_PROVEN_ISSUED")
        self.assertEqual(self.result["conclusion_scope"], "PROPOSED_PLAN_RULE_VALIDATION")
        self.assertIn("APPROVED_COMPLIANCE", self.result["forbidden_conclusions"])

    def test_04_four_foot_label_requires_family(self):
        unresolved = select_setback_requirement(subject="PROPOSED_PROJECT_FACT", family=None, multistory=True, adjacent_residential=True, outside_coastal=True, application_profile="OUTSIDE_COASTAL_O-21618_EFFECTIVE_2023-05-06", fire_override_applies_to_profile=False, greater_fire_setback_ft=None)
        self.assertEqual(unresolved["state"], "PLAN_SETBACK_VALIDATION_UNRESOLVED")
        self.assertIn("family_resolved", unresolved["failed_gates"])

    def test_05_adu_rule_conditions_select_exact_branch(self):
        requirement = self.result["requirement"]
        self.assertEqual(requirement["state"], "SETBACK_REQUIREMENT_RESOLVED")
        self.assertEqual(requirement["selected_branch"], "MULTISTORY_ADU_ADJACENT_TO_RESIDENTIALLY_ZONED_PREMISES")
        self.assertEqual(requirement["required_ft"], "4")

    def test_06_coastal_sda_fire_versions_are_explicit(self):
        profile = self.outputs["public-rule-profile.json"]
        public, rules = profile["public_profile"], profile["rule_profile"]
        self.assertEqual(public["coastal"]["state"], "OUTSIDE_COASTAL")
        self.assertEqual(public["sda"]["state"], "INSIDE_SDA")
        self.assertEqual(public["fire"]["state"], "CITY_VHFHSZ_INTERSECTION_SUPPORTED")
        self.assertEqual(rules["application_version"]["selected_profile"], "OUTSIDE_COASTAL_O-21618_EFFECTIVE_2023-05-06")

    def test_07_fire_override_fails_closed_when_applicable(self):
        unresolved = select_setback_requirement(subject="PROPOSED_PROJECT_FACT", family="INTERIOR_SIDE_SETBACK", multistory=True, adjacent_residential=True, outside_coastal=True, application_profile="OUTSIDE_COASTAL_O-21618_EFFECTIVE_2023-05-06", fire_override_applies_to_profile=True, greater_fire_setback_ft=None)
        self.assertEqual(unresolved["state"], "PLAN_SETBACK_VALIDATION_UNRESOLVED")
        self.assertEqual(compare_plan_setback(proposed_ft=Decimal("5.958333333333333333333333333"), requirement=unresolved)["state"], "PLAN_RULE_EVALUATION_UNRESOLVED")

    def test_08_public_private_provenance_is_separate(self):
        provenance = self.outputs["provenance.json"]
        self.assertTrue(provenance["public"])
        self.assertTrue(provenance["private"])
        self.assertTrue(all("source_ref" not in item for item in provenance["public"]))
        self.assertTrue(all(item["privacy"] == "PRIVATE_VALIDATION_EVIDENCE" for item in provenance["private"]))

    def test_09_no_private_plan_leakage(self):
        serialized = json.dumps(self.outputs)
        self.assertNotIn("/Users/", serialized)
        self.assertNotRegex(serialized, r"(?i)\\.(pdf|tiff?|dwg)")
        tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.splitlines()
        self.assertFalse([p for p in tracked if Path(p).suffix.lower() in {".pdf", ".tif", ".tiff", ".dwg"} and "docs/" not in p])

    def test_10_proposed_plan_conclusion_is_bounded(self):
        self.assertEqual(self.result["comparison"]["state"], "PLAN_RULE_REQUIREMENT_SATISFIED")
        self.assertFalse(self.result["height_evaluated"])
        self.assertFalse(self.result["far_evaluated"])
        self.assertFalse(self.result["capacity_calculated"])
        self.assertFalse(self.result["production_wired"])

    def test_11_shared_evaluator_compatibility(self):
        compatibility = self.outputs["evaluator-compatibility.json"]
        self.assertFalse(compatibility["architectural_fork_required"])
        self.assertTrue(compatibility["parity"])
        self.assertEqual(compatibility["shared_numeric_result"], "RULE_REQUIREMENT_SATISFIED")

    def test_12_deterministic_rebuild_and_committed_artifacts(self):
        self.assertEqual(build_outputs(), build_outputs())
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)


if __name__ == "__main__":
    unittest.main(verbosity=2)

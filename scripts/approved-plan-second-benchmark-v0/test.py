#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import subprocess
import sys
import unittest
from decimal import Decimal
from pathlib import Path

from build import OUTPUT, ROOT, build_outputs, plan_envelope, selected_corpus_project
from resolver import compare_plan_rule, select_wall_permit_requirement

sys.path.insert(0, str(ROOT / "scripts"))
from project_evidence_adapter_v0 import validate_project_evidence_envelope  # noqa: E402


class ApprovedPlanSecondBenchmarkV0Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()
        cls.result = cls.outputs["benchmark-result.json"]

    def test_01_preferred_project_selected_from_golden_corpus(self):
        project = selected_corpus_project()
        self.assertEqual(project["project_id"], "PRJ-1140985")
        self.assertEqual(project["plan_status"], "CITY_ISSUED_2025-11-25")
        self.assertNotEqual(project["project_id"], "PRJ-1111087")

    def test_02_generic_adapter_accepts_second_project(self):
        envelope = plan_envelope()
        validate_project_evidence_envelope(
            envelope,
            expected_project_id="PRJ-1140985",
            expected_apn="5442140600",
            allowed_project_statuses={"CITY_ISSUED_2025-11-25"},
        )

    def test_03_adapter_has_no_packet_42_project_constants(self):
        adapter = (ROOT / "scripts" / "project_evidence_adapter_v0.py").read_text()
        self.assertNotIn("PRJ-1111087", adapter)
        self.assertNotIn("5442140600", adapter)
        self.assertNotIn("FOURTH_CD", adapter)

    def test_04_private_plan_fact_cannot_become_existing_truth(self):
        envelope = copy.deepcopy(plan_envelope())
        envelope["subject"] = "EXISTING_PARCEL_FACT"
        with self.assertRaisesRegex(ValueError, "PRIVATE_PLAN_FACT_MUST_REMAIN_PROPOSED"):
            validate_project_evidence_envelope(
                envelope,
                expected_project_id="PRJ-1140985",
                expected_apn="5442140600",
                allowed_project_statuses={"CITY_ISSUED_2025-11-25"},
            )

    def test_05_branch_invariant_rule_selection(self):
        requirement = self.result["requirement"]
        self.assertEqual(requirement["state"], "WALL_PERMIT_TRIGGER_REQUIREMENT_RESOLVED")
        self.assertEqual(requirement["selected_branch"], "BRANCH_INVARIANT_FENCE_OR_RETAINING_WALL")
        self.assertEqual(requirement["required_ft"], "7")

    def test_06_subtype_is_required_when_it_changes_result(self):
        unresolved = select_wall_permit_requirement(
            subject="PROPOSED_PROJECT_FACT", jurisdiction="CITY_OF_SAN_DIEGO",
            outside_coastal=True, direct_dimension=True, scale_derived=False,
            wall_scope="SITE_OR_RETAINING_WALL", proposed_max_height_ft=Decimal("5"),
            application_profile="OUTSIDE_COASTAL_TABLE_142_03A_EFFECTIVE_2024-10-05",
        )
        self.assertEqual(unresolved["state"], "SECOND_BENCHMARK_RULE_SELECTION_UNRESOLVED")
        self.assertEqual(compare_plan_rule(proposed_max_height_ft=Decimal("5"), requirement=unresolved)["state"], "PLAN_RULE_EVALUATION_UNRESOLVED")

    def test_07_direct_height_comparison_and_status_scope(self):
        self.assertEqual(self.result["selected_plan_fact"]["maximum_height_ft"], "9.25")
        self.assertEqual(self.result["comparison"]["state"], "PLAN_RULE_REQUIREMENT_SATISFIED")
        self.assertEqual(self.result["conclusion_scope"], "ISSUED_PLAN_RULE_VALIDATION")
        self.assertFalse(self.result["issued_status_evidence"]["as_built_proof"])

    def test_08_public_rule_profile_is_independent(self):
        profile = self.outputs["public-rule-profile.json"]
        public, rule = profile["public_profile"], profile["rule_profile"]
        self.assertEqual(public["parcel_identity"]["apn"], "5442140600")
        self.assertEqual(public["zoning"]["authoritative_zone"], "RM-2-5")
        self.assertEqual(public["coastal"]["state"], "OUTSIDE_COASTAL")
        self.assertFalse(public["private_plan_used_to_select_public_truth"])
        self.assertEqual(rule["authority"]["section"], "SDMC Table 142-03A, Fence Regulations Applicability")

    def test_09_city_issuance_is_not_specific_rule_corroboration(self):
        corroboration = self.result["city_review_corroboration"]
        self.assertEqual(corroboration["state"], "NO_RELEVANT_RULE_SPECIFIC_REVIEW_EVIDENCE")
        self.assertFalse(corroboration["issuance_treated_as_rule_interpretation_proof"])

    def test_10_public_private_provenance_and_no_leakage(self):
        provenance = self.outputs["provenance.json"]
        self.assertTrue(all("source_ref" not in item for item in provenance["public"]))
        self.assertTrue(all(item["privacy"] == "PRIVATE_VALIDATION_EVIDENCE" for item in provenance["private"]))
        serialized = json.dumps(self.outputs)
        private_serialized = json.dumps({
            "envelope": self.outputs["plan-fact-envelope.json"],
            "private_provenance": provenance["private"],
        })
        self.assertNotIn("/Users/", serialized)
        self.assertNotRegex(private_serialized, r"(?i)\.(pdf|tiff?|dwg)")
        tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.splitlines()
        self.assertFalse([path for path in tracked if Path(path).suffix.lower() in {".pdf", ".tif", ".tiff", ".dwg"} and "docs/" not in path])

    def test_11_transferability_and_containment(self):
        transfer = self.outputs["transferability.json"]
        self.assertEqual(transfer["decision"], "APPROVED_PLAN_BENCHMARK_TRANSFERABILITY_SUPPORTED")
        self.assertFalse(transfer["adapter_project_constants"])
        self.assertFalse(transfer["architectural_fork_required"])
        self.assertFalse(self.result["capacity_calculated"])
        self.assertFalse(self.result["production_wired"])
        self.assertIn("AS_BUILT_COMPLIANCE", self.result["forbidden_conclusions"])

    def test_12_multi_project_corpus_and_next_step(self):
        decision = self.outputs["decision.json"]
        self.assertEqual(decision["corpus_status"], "MULTI_PROJECT_BENCHMARK_CORPUS_ESTABLISHED")
        self.assertEqual(decision["next"], "NEXT_FEASIBILITY_STEP: height/FAR golden evaluation")

    def test_13_deterministic_rebuild_and_committed_artifacts(self):
        self.assertEqual(build_outputs(), build_outputs())
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)


if __name__ == "__main__":
    unittest.main(verbosity=2)

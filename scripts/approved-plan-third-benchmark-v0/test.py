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
from resolver import compare_plan_rule, select_driveway_requirement

sys.path.insert(0, str(ROOT / "scripts"))
from project_evidence_adapter_v0 import validate_project_evidence_envelope  # noqa: E402


class ApprovedPlanThirdBenchmarkV0Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()
        cls.result = cls.outputs["benchmark-result.json"]

    def test_01_distinct_preferred_project_selected(self):
        project = selected_corpus_project()
        self.assertEqual(project["project_id"], "PRJ-1110168")
        self.assertNotIn(project["project_id"], {"PRJ-1111087", "PRJ-1140985"})

    def test_02_generic_adapter_accepts_third_project(self):
        envelope = plan_envelope()
        validate_project_evidence_envelope(
            envelope, expected_project_id="PRJ-1110168", expected_apn="5442140600",
            allowed_project_statuses={"REFERENCE_SHEETS_EMBEDDED; DIRECT_APPROVAL_STATUS_NOT_INDEPENDENTLY_VERIFIED"},
        )
        adapter = (ROOT / "scripts/project_evidence_adapter_v0.py").read_text()
        for constant in ("PRJ-1110168", "5442140600", "C001"):
            self.assertNotIn(constant, adapter)

    def test_03_private_plan_fact_remains_proposed(self):
        envelope = copy.deepcopy(plan_envelope())
        envelope["subject"] = "EXISTING_PARCEL_FACT"
        with self.assertRaisesRegex(ValueError, "PRIVATE_PLAN_FACT_MUST_REMAIN_PROPOSED"):
            validate_project_evidence_envelope(
                envelope, expected_project_id="PRJ-1110168", expected_apn="5442140600",
                allowed_project_statuses={envelope["project_status"]},
            )

    def test_04_direct_driveway_fact_and_status_scope(self):
        fact = self.result["selected_plan_fact"]
        self.assertEqual((fact["value"], fact["unit"]), ("20", "ft"))
        self.assertEqual(fact["direct_or_derived"], "DIRECT_LABELED")
        self.assertFalse(fact["scale_derived"])
        self.assertEqual(self.result["conclusion_scope"], "PROPOSED_PLAN_RULE_VALIDATION")

    def test_05_every_rule_predicate_is_sealed(self):
        predicates = self.outputs["predicate-resolution.json"]
        self.assertEqual(predicates["state"], "ALL_SELECTED_RULE_PREDICATES_RESOLVED")
        self.assertTrue(all(predicates["predicates"].values()))
        self.assertEqual(predicates["unresolved_predicates"], [])

    def test_06_rule_selection_fails_closed(self):
        unresolved = select_driveway_requirement(
            subject="PROPOSED_PROJECT_FACT", jurisdiction="CITY_OF_SAN_DIEGO",
            lot_width_gt_50=True, use_category="UNRESOLVED", outside_parking_impact_overlay=True,
            direct_dimension=True, scale_derived=False,
            application_profile="RESIDENTIAL_TABLE_142_05M_UNCHANGED_ACROSS_2024_APPLICATION_AND_2025_PLAN",
        )
        self.assertEqual(unresolved["state"], "THIRD_BENCHMARK_RULE_SELECTION_UNRESOLVED")
        self.assertEqual(compare_plan_rule(proposed_width_ft=Decimal("20"), requirement=unresolved)["state"], "PLAN_RULE_EVALUATION_UNRESOLVED")

    def test_07_bounded_range_comparison(self):
        requirement = self.result["requirement"]
        self.assertEqual((requirement["minimum_ft"], requirement["maximum_ft"]), ("12", "25"))
        self.assertEqual(self.result["comparison"]["state"], "PLAN_RULE_REQUIREMENT_SATISFIED")
        self.assertEqual(len(self.result["comparison"]["comparisons"]), 2)

    def test_08_public_rule_is_independent(self):
        profile = self.outputs["public-rule-profile.json"]
        public, rule = profile["public_profile"], profile["rule_profile"]
        self.assertEqual(public["parcel_identity"]["apn"], "5442140600")
        self.assertEqual(public["parking_impact_overlay"]["feature_count"], 0)
        self.assertEqual(public["lot_width"]["state"], "GREATER_THAN_50_FT_RESOLVED")
        self.assertFalse(public["private_plan_used_to_select_public_truth"])
        self.assertEqual(rule["authority"]["section"], "SDMC 142.0560(j)(1), Table 142-05M")

    def test_09_no_rule_specific_reviewer_claim(self):
        city = self.result["city_review_corroboration"]
        self.assertEqual(city["state"], "NO_RELEVANT_RULE_SPECIFIC_REVIEW_EVIDENCE")
        self.assertFalse(city["silence_treated_as_approval"])
        self.assertFalse(city["plan_standard_drawing_callout_treated_as_legal_authority"])

    def test_10_public_private_separation_and_no_source_leakage(self):
        provenance = self.outputs["provenance.json"]
        self.assertTrue(all(item["privacy"] == "PUBLIC_AUTHORITY" for item in provenance["public"]))
        self.assertTrue(all(item["privacy"] == "PRIVATE_VALIDATION_EVIDENCE" for item in provenance["private"]))
        serialized = json.dumps(self.outputs)
        private_serialized = json.dumps({
            "envelope": self.outputs["plan-fact-envelope.json"],
            "private_provenance": provenance["private"],
        })
        self.assertNotIn("/Users/", serialized)
        self.assertNotRegex(private_serialized, r"(?i)\.(pdf|tiff?|dwg)")
        tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.splitlines()
        self.assertFalse([p for p in tracked if Path(p).suffix.lower() in {".pdf", ".tif", ".tiff", ".dwg"} and "docs/" not in p])

    def test_11_reusable_model_has_no_project_constants(self):
        serialized = json.dumps(self.outputs["reusable-model.json"])
        for constant in ("PRJ-1110168", "5442140600", "C001"):
            self.assertNotIn(constant, serialized)

    def test_12_transferability_and_corpus_decisions(self):
        self.assertEqual(self.outputs["transferability.json"]["decision"], "THREE_PROJECT_TRANSFERABILITY_SUPPORTED")
        self.assertEqual(self.outputs["decision.json"]["corpus_status"], "THREE_PROJECT_BENCHMARK_CORPUS_ESTABLISHED")
        self.assertEqual(self.outputs["decision.json"]["next"], "NEXT_FEASIBILITY_STEP: current-structure compliance geometry")
        self.assertFalse(self.result["capacity_calculated"])
        self.assertFalse(self.result["production_wired"])

    def test_13_deterministic_rebuild_and_committed_artifacts(self):
        self.assertEqual(build_outputs(), build_outputs())
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)


if __name__ == "__main__":
    unittest.main(verbosity=2)

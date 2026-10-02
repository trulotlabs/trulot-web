#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import unittest
from decimal import Decimal
from pathlib import Path

from build import OUTPUT, ROOT, build_outputs, candidates
from resolver import EXCLUDED_PRIMARY_APNS, eligible, fingerprint, select_candidate

sys.path.insert(0, str(ROOT / "scripts"))
from dimensional_rule_evaluator_v0 import compare_values  # noqa: E402


class Packet57Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()

    def test_01_all_bounded_candidates_inventory_required_fields(self):
        required = {"project_name", "address", "apn", "jurisdiction", "project_type", "plan_set_status", "plan_date", "base_zone_if_known", "coastal_context", "direct_site_dimensions_available", "setbacks_available", "height_available", "grading_available", "civil_or_row_available", "permit_or_review_evidence_available", "privacy_classification"}
        for candidate in candidates():
            self.assertFalse(required - set(candidate), candidate["project_id"])

    def test_02_excluded_primary_parcels_never_qualify(self):
        for candidate in candidates():
            if candidate["apn"] in EXCLUDED_PRIMARY_APNS:
                passed, reasons = eligible(candidate)
                self.assertFalse(passed)
                self.assertIn("EXCLUDED_PRIMARY_PARCEL", reasons)

    def test_03_different_address_candidates_are_weak(self):
        unused = [item for item in candidates() if item["apn"] not in EXCLUDED_PRIMARY_APNS]
        self.assertEqual({item["project_id"] for item in unused}, {"3927-UTAH-ROW-PROPOSAL", "4324-MEADE-ROW-PROPOSAL"})
        for candidate in unused:
            passed, reasons = eligible(candidate)
            self.assertFalse(passed)
            self.assertIn("NO_PLAN_SET", reasons)
            self.assertIn("PARCEL_IDENTITY_UNRESOLVED", reasons)
            self.assertIn("NO_DIRECT_PLAN_DIMENSION", reasons)
            self.assertIn("NO_SEALED_RULE_CANDIDATE", reasons)

    def test_04_no_subject_parcel_research_reopened(self):
        serialized = json.dumps(self.outputs)
        self.assertNotIn("6341302200", serialized)
        self.assertNotIn("1456 27TH", serialized)

    def test_05_no_subjective_score(self):
        inventory = self.outputs["candidate-inventory.json"]
        self.assertFalse(inventory["numeric_score_used"])
        self.assertTrue(all("score" not in candidate for candidate in inventory["candidates"]))

    def test_06_selection_fails_closed(self):
        selection = select_candidate(candidates())
        self.assertEqual(selection["state"], "FOURTH_BENCHMARK_PROJECT_NOT_AVAILABLE")
        self.assertIsNone(selection["selected_project_id"])
        self.assertFalse(any(item["eligible"] for item in selection["candidate_dispositions"]))

    def test_07_no_rule_or_comparison_for_weak_project(self):
        rules = self.outputs["rule-selection.json"]
        self.assertEqual(rules["selected_rule_family"], "SELECTED_RULE_FAMILY: NONE")
        self.assertEqual(rules["predicate_resolution"], "FOURTH_BENCHMARK_RULE_SELECTION_UNRESOLVED")
        self.assertIsNone(rules["authoritative_rule"])
        self.assertIsNone(rules["bounded_plan_fact"])
        self.assertEqual(rules["comparison"]["state"], "PLAN_RULE_EVALUATION_UNRESOLVED")
        self.assertFalse(rules["comparison"]["performed"])

    def test_08_generic_adapter_remains_reusable_and_unchanged(self):
        adapter = (ROOT / "scripts/project_evidence_adapter_v0.py").read_text()
        self.assertIn("def validate_project_evidence_envelope", adapter)
        for project_id in [item["project_id"] for item in candidates()]:
            self.assertNotIn(project_id, adapter)

    def test_09_shared_evaluator_available_but_not_used_to_force_result(self):
        synthetic = compare_values(measured=Decimal("4"), required=Decimal("4"), unit="ft", operator="MIN", expression="synthetic_contract_check")
        self.assertEqual(synthetic.state, "RULE_REQUIREMENT_SATISFIED")
        self.assertFalse(self.outputs["rule-selection.json"]["comparison"]["performed"])

    def test_10_privacy_and_provenance(self):
        provenance = self.outputs["provenance.json"]
        self.assertTrue(provenance["source_hashes_reverified"])
        self.assertFalse(provenance["private_source_paths_published"])
        self.assertFalse(provenance["private_plan_published"])
        serialized = json.dumps(self.outputs)
        self.assertNotIn("/Users/", serialized)
        self.assertNotRegex(serialized, r"(?i)\.(pdf|tiff?|dwg)")

    def test_11_decisions(self):
        decision = self.outputs["decision.json"]
        self.assertEqual(decision["project"], "FOURTH_BENCHMARK_PROJECT_NOT_AVAILABLE")
        self.assertTrue(decision["transferability"].startswith("FOUR_PROJECT_TRANSFERABILITY_NOT_SUPPORTED:"))
        self.assertEqual(decision["corpus"], "FOUR_PROJECT_BENCHMARK_CORPUS_NOT_ESTABLISHED")
        self.assertEqual(decision["architecture"], "BENCHMARK_EXPANSION_STILL_HIGH_VALUE")
        self.assertEqual(decision["next"], "NEXT_FEASIBILITY_STEP: fifth approved-plan benchmark")
        self.assertFalse(decision["capacity_calculated"])
        self.assertFalse(decision["whole_project_compliance_concluded"])

    def test_12_deterministic_artifacts_and_integrity(self):
        self.assertEqual(build_outputs(), build_outputs())
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)
        sealed = {name: value for name, value in self.outputs.items() if name != "integrity.json"}
        integrity = self.outputs["integrity.json"]
        self.assertEqual(integrity["artifacts"], {name: fingerprint(value) for name, value in sealed.items()})
        self.assertEqual(integrity["bundle_sha256"], fingerprint(sealed))


if __name__ == "__main__":
    unittest.main(verbosity=2)

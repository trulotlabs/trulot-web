#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import subprocess
import unittest
from pathlib import Path

from build import OUTPUT, ROOT, build_outputs, candidate_inventory
from resolver import canonical_json, classify_extraction, geometry_readiness, validate_candidate, validate_fact


class ApprovedPlanGoldenCorpusV0Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()

    def test_01_private_plan_files_are_not_in_git(self):
        paths = subprocess.run(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.splitlines()
        private_extensions = {".pdf", ".tif", ".tiff", ".dwg"}
        self.assertFalse([path for path in paths if Path(path).suffix.lower() in private_extensions])

    def test_02_unauthorized_source_is_rejected(self):
        candidate = copy.deepcopy(candidate_inventory()[0])
        candidate["privacy_classification"] = "UNAUTHORIZED_OR_UNCLEAR"
        with self.assertRaisesRegex(ValueError, "UNAUTHORIZED_OR_UNCLEAR_SOURCE"):
            validate_candidate(candidate)

    def test_03_direct_dimensions_are_preferred(self):
        self.assertEqual(classify_extraction("DIRECT_RECORDED_DIMENSION"), "GOLDEN_EVIDENCE")
        self.assertEqual(classify_extraction("DIRECT_LABELED_PLAN_DIMENSION"), "GOLDEN_EVIDENCE")

    def test_04_scale_and_pixel_methods_are_diagnostic(self):
        self.assertEqual(classify_extraction("SCALE_DERIVED_MEASUREMENT"), "DIAGNOSTIC_ONLY")
        self.assertEqual(classify_extraction("SCALE_DERIVED_MEASUREMENT", reproduction_integrity_validated=True), "DIAGNOSTIC_SCALE_DERIVED_VALIDATED")
        self.assertEqual(classify_extraction("IMAGE_PIXEL_ESTIMATE"), "DIAGNOSTIC_ONLY")

    def test_05_proposed_fact_cannot_be_existing_fact(self):
        fact = copy.deepcopy(self.outputs["pilot-extractions.json"]["projects"][0]["facts"][0])
        fact["subject"] = "EXISTING_PARCEL_FACT"
        with self.assertRaisesRegex(ValueError, "PROPOSED_FACT_MUST_NOT_BECOME_EXISTING_FACT"):
            validate_fact(fact)

    def test_06_every_golden_fact_has_sheet_provenance(self):
        for project in self.outputs["pilot-extractions.json"]["projects"]:
            for fact in project["facts"]:
                validate_fact(fact)
                self.assertTrue(fact["sheet_number"])
                self.assertTrue(fact["sheet_title"])
                self.assertRegex(fact["provenance"]["source_sha256"], r"^[0-9a-f]{64}$")

    def test_07_geometry_readiness_is_bounded(self):
        projects = {item["project_id"]: item for item in self.outputs["pilot-extractions.json"]["projects"]}
        self.assertEqual(geometry_readiness(projects["PRJ-1111087"]["geometry_gate"]), "COMPLIANCE_GEOMETRY_READY")
        self.assertEqual(geometry_readiness(projects["PRJ-1140985"]["geometry_gate"]), "COMPLIANCE_GEOMETRY_NOT_READY")
        self.assertEqual(projects["PRJ-1111087"]["geometry_gate"]["scope"], "PROPOSED_PROJECT_GEOMETRY_ONLY")

    def test_08_evaluator_compatibility_is_explicit(self):
        compatibility = self.outputs["evaluator-compatibility.json"]
        self.assertEqual(compatibility["overall"], "SHARED_FRAMEWORK_REUSABLE_PACKET_SPECIFIC_ADAPTER_REQUIRED")
        self.assertFalse(compatibility["architectural_change_to_shared_framework_required"])
        self.assertTrue(all(item["shared_numeric_gate_compatible"] for item in compatibility["assessments"]))
        self.assertFalse(any(item["current_adapter_compatible"] for item in compatibility["assessments"]))

    def test_09_no_public_fixture_leakage(self):
        public_fixture_roots = [ROOT / "app", ROOT / "lib", ROOT / "tests", ROOT / "data" / "parcel-page-v2-ui"]
        source_names = {
            "BUILDING_CONSTRUCTION_PLANS_051826 Red1.pdf",
            "639 67th Site Walls Issued Plans - 112525.PDF",
        }
        for base in public_fixture_roots:
            if not base.exists():
                continue
            for path in base.rglob("*"):
                if path.is_file():
                    self.assertNotIn(path.name, source_names)
        self.assertFalse(self.outputs["contract.json"]["public_truth_replacement"])

    def test_10_selection_is_small_authorized_and_deterministic(self):
        candidates = self.outputs["candidate-inventory.json"]["candidates"]
        selected = [item for item in candidates if item["selected"]]
        self.assertEqual(len(candidates), 5)
        self.assertEqual(len(selected), 3)
        self.assertTrue(all(item["privacy_classification"] == "PRIVATE_OPERATOR_OWNED_OR_AUTHORIZED" for item in selected))
        self.assertEqual(canonical_json(build_outputs()), canonical_json(build_outputs()))

    def test_11_every_requested_rule_family_has_a_case(self):
        expected = {"minimum lot area", "lot width", "lot depth", "frontage", "front setback", "rear setback", "interior side setback", "street-side applicability", "height", "FAR", "lot coverage"}
        actual = {item["rule_family"] for item in self.outputs["validation-cases.json"]["cases"]}
        self.assertEqual(actual, expected)

    def test_12_decision_and_containment(self):
        self.assertEqual(self.outputs["decision.json"]["decision"], "APPROVED_PLAN_GOLDEN_CORPUS_V0_READY")
        containment = self.outputs["evaluator-compatibility.json"]["containment"]
        self.assertEqual(containment, {"compliance_calculated": False, "capacity_calculated": False, "production_wired": False})

    def test_13_committed_artifacts_match_rebuild(self):
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)


if __name__ == "__main__":
    unittest.main(verbosity=2)

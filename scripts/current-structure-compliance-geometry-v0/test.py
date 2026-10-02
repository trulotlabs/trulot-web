#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import subprocess
import sys
import unittest
from pathlib import Path

from build import OUTPUT, ROOT, build_outputs, generic_envelope
from resolver import GEOMETRY_LEVELS, READY_GATES, assess_currentness, assess_readiness, fingerprint, validate_envelope


class Packet56Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()
        cls.e = cls.outputs["subject-evaluation.json"]

    def test_01_hierarchy_remains_distinct(self):
        self.assertEqual(tuple(self.outputs["geometry-hierarchy.json"]["ordered_levels"]), GEOMETRY_LEVELS)
        self.assertEqual(len(set(GEOMETRY_LEVELS)), 4)
        self.assertFalse(self.outputs["geometry-hierarchy.json"]["levels"][1]["supports_existing_compliance"])

    def test_02_every_readiness_gate_is_required(self):
        passing = {name: True for name in READY_GATES}
        self.assertEqual(assess_readiness(passing)["state"], "COMPLIANCE_GEOMETRY_READY")
        for name in READY_GATES:
            attacked = dict(passing); attacked[name] = False
            result = assess_readiness(attacked)
            self.assertEqual(result["state"], "COMPLIANCE_GEOMETRY_NOT_READY")
            self.assertIn(name, result["failed_gates"])

    def test_03_boundary_control_partial(self):
        boundary = self.e["boundary_control"]
        self.assertEqual(boundary["state"], "BOUNDARY_CONTROL_PARTIAL")
        self.assertTrue(boundary["recorded_legal_boundary"])
        self.assertFalse(boundary["modern_survey_controlled_geometry"])
        self.assertFalse(boundary["precision_adequate_for_setback_measurement"])

    def test_04_structure_control_partial(self):
        structure = self.e["structure_control"]
        self.assertEqual(structure["state"], "STRUCTURE_CONTROL_PARTIAL")
        for key in ("current_building_frame_location", "direct_dimension_to_boundary", "survey_tie", "approved_or_as_built_identity", "roof_eave_distinction"):
            self.assertFalse(structure[key])

    def test_05_currentness_fails_closed(self):
        self.assertEqual(assess_currentness(source_date=None, existing_or_as_built=True, later_change_reconciled=True, observational_only=False), "CURRENTNESS_UNRESOLVED")
        self.assertEqual(assess_currentness(source_date="2023", existing_or_as_built=False, later_change_reconciled=False, observational_only=True), "CURRENTNESS_PARTIAL")
        self.assertEqual(assess_currentness(source_date="2026-10-02", existing_or_as_built=True, later_change_reconciled=True, observational_only=False), "CURRENTNESS_SUPPORTED")

    def test_06_later_change_not_inferred_from_silence(self):
        later = self.e["later_change_reconciliation"]
        self.assertFalse(later["permit_silence_used_as_no_change_proof"])
        self.assertFalse(later["unresolved_change_excluded"])
        self.assertEqual(later["records"][0]["classification"], "NO_STATED_FOOTPRINT_EFFECT")

    def test_07_edge_semantics_are_specific(self):
        semantics = self.outputs["structure-edge-semantics.json"]
        self.assertFalse(semantics["generic_building_footprint_accepted"])
        edges = {item["type"]: item for item in semantics["edges"]}
        self.assertEqual(set(edges), {"BUILDING_FRAME", "WALL_FACE", "FOUNDATION_EDGE", "ROOF_OR_EAVE", "PROJECTION", "BALCONY_OR_DECK", "ACCESSORY_STRUCTURE", "RETAINING_WALL", "HARDSCAPE"})
        self.assertTrue(edges["BUILDING_FRAME"]["may_substitute_for_building_frame"])
        self.assertTrue(all(not item["may_substitute_for_building_frame"] for name, item in edges.items() if name != "BUILDING_FRAME"))

    def test_08_existing_vs_proposed_containment(self):
        levels = self.outputs["geometry-hierarchy.json"]["levels"]
        proposed = next(item for item in levels if item["level"] == "PROJECT_PLAN_STRUCTURE_GEOMETRY")
        self.assertFalse(proposed["supports_existing_compliance"])
        self.assertEqual(self.e["subject_status"]["state"], "OBSERVATIONAL_VISIBLE_STRUCTURE_ONLY")
        self.assertFalse(self.outputs["decision.json"]["existing_compliance_concluded"])

    def test_09_reusable_envelope_is_project_independent(self):
        envelope = generic_envelope()
        validate_envelope(envelope)
        serialized = json.dumps(envelope)
        for constant in ("6341302200", "1456 27TH", "PM 17383", "PMT-3276742"):
            self.assertNotIn(constant, serialized)
        attacked = copy.deepcopy(envelope); del attacked["structure_edge_type"]
        with self.assertRaisesRegex(ValueError, "GEOMETRY_ENVELOPE_MISSING_FIELDS"):
            validate_envelope(attacked)

    def test_10_truth_state_vocabulary(self):
        mappings = {item["output"]: item for item in self.outputs["truth-state-integration.json"]["mappings"]}
        self.assertEqual(mappings["direct survey dimension"]["DerivationClass"], "recorded")
        self.assertEqual(mappings["coordinate-derived distance from survey-controlled geometry"]["DerivationClass"], "deterministic_derived")
        self.assertEqual(mappings["imagery-only estimate"]["DerivationClass"], "inferred")
        self.assertEqual(mappings["unresolved currentness"]["FactState"], "unknown")
        self.assertFalse(self.outputs["truth-state-integration.json"]["numeric_confidence_score"])

    def test_11_subject_decisions(self):
        decision = self.outputs["decision.json"]
        self.assertTrue(decision["geometry"].startswith("COMPLIANCE_GEOMETRY_NOT_READY:"))
        self.assertEqual(decision["evaluator"], "CURRENT_STRUCTURE_SETBACK_EVALUATOR_COMPATIBLE")
        self.assertTrue(decision["golden_benchmark"].startswith("CURRENT_STRUCTURE_GOLDEN_BENCHMARK_BLOCKED:"))
        self.assertEqual(decision["next"], "NEXT_FEASIBILITY_STEP: acquire current survey-controlled geometry")
        self.assertFalse(decision["capacity_calculated"])
        self.assertFalse(decision["production_wired"])

    def test_12_existing_evaluators_have_compatible_gates(self):
        expected = {
            "front-setback-evaluator-v0/resolver.py": ("current_structure_geometry", "measurement_semantics", "projection_scope_resolved", "measured_ft"),
            "rear-setback-evaluator-v0/resolver.py": ("current_structure_geometry", "structure_classification", "measurement_semantics", "projection_scope_resolved", "measured_ft"),
            "interior-side-setback-evaluator-v0/resolver.py": ("current_structure_geometry", "structure_classification", "measurement_semantics", "projection_scope_resolved", "measured_ft"),
        }
        for path, terms in expected.items():
            text = (ROOT / "scripts" / path).read_text()
            for term in terms:
                self.assertIn(term, text, f"{path}:{term}")

    def test_13_project_adapter_preserves_proposed_subject(self):
        adapter = (ROOT / "scripts/project_evidence_adapter_v0.py").read_text()
        self.assertIn("PRIVATE_PLAN_FACT_MUST_REMAIN_PROPOSED", adapter)
        self.assertNotIn("6341302200", adapter)

    def test_14_bounded_inventory(self):
        sources = {item["source"] for item in self.e["evidence_inventory"]}
        self.assertIn("PM 17383 Parcel 1", sources)
        self.assertIn("2001 deed DOC 2001-0706032", sources)
        self.assertIn("2017 City/SANDAG building outlines", sources)
        self.assertIn("Spring 2023 SANDAG/Nearmap 9-inch imagery", sources)
        self.assertIn("PMT-3276742", sources)
        self.assertFalse(self.outputs["provenance.json"]["new_external_research"])

    def test_15_deterministic_build_and_committed_artifacts(self):
        self.assertEqual(build_outputs(), build_outputs())
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)

    def test_16_integrity_manifest(self):
        integrity = self.outputs["integrity.json"]
        sealed = {name: value for name, value in self.outputs.items() if name != "integrity.json"}
        self.assertEqual(integrity["artifacts"], {name: fingerprint(value) for name, value in sealed.items()})
        self.assertEqual(integrity["bundle_sha256"], fingerprint(sealed))


if __name__ == "__main__":
    unittest.main(verbosity=2)

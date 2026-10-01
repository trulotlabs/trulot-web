import copy
import json
from pathlib import Path
import subprocess
import unittest

from resolver import assess_compliance_geometry, canonical_bytes, classify_currentness, fingerprint, resolve

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "current-structure-geometry-v0"


class CurrentStructureGeometryV0Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.e = resolve()
        cls.outputs = {p.name: json.loads(p.read_text()) for p in OUT.glob("*.json")}

    def test_01_scope(self):
        self.assertEqual(self.e["apn"], "6341302200")
        self.assertEqual(self.outputs["contract.json"]["scope"]["new_rule_families_evaluated"], [])

    def test_02_2017_cannot_become_current(self):
        self.assertEqual(self.e["historical_outline_state"], "HISTORICAL_STRUCTURE_GEOMETRY_SUPPORTED")
        self.assertNotEqual(self.e["historical_outline_state"], self.e["evidence_state"])

    def test_03_imagery_is_observational(self):
        self.assertEqual(self.e["evidence_state"], "OBSERVATIONAL_STRUCTURE_GEOMETRY_SUPPORTED")
        self.assertIn("not survey", self.e["imagery"]["suitability"].lower())

    def test_04_imagery_not_building_frame(self):
        self.assertNotEqual(self.e["semantics"]["roof_outline"], self.e["semantics"]["outer_edge_of_building_frame"])

    def test_05_permit_absence_not_physical_absence(self):
        self.assertIn("not proof", self.e["permit_search"]["absence_doctrine"].lower())

    def test_06_living_area_not_footprint(self):
        self.assertIn("not footprint", self.e["semantics"]["assessor_living_area"].lower())

    def test_07_unit_count_not_structure_count(self):
        self.assertIn("not dwelling-unit count", self.e["structure_count_reconciliation"]["conclusion"].lower())

    def test_08_observational_geometry_fails_compliance(self):
        self.assertEqual(assess_compliance_geometry("OBSERVED_ROOF_OR_VISIBLE_STRUCTURE_OUTLINE", "SURVEY_CONTROLLED_LEGAL_BOUNDARY", "CURRENT_FIELD_VERIFIED_GEOMETRY", True), "COMPLIANCE_GEOMETRY_NOT_READY")

    def test_09_survey_controlled_frame_can_pass(self):
        self.assertEqual(assess_compliance_geometry("OUTER_EDGE_OF_BUILDING_FRAME", "SURVEY_CONTROLLED_LEGAL_BOUNDARY", "CURRENT_PROJECT_APPROVED_GEOMETRY", True), "COMPLIANCE_GEOMETRY_READY")

    def test_10_non_authoritative_fails(self):
        self.assertEqual(assess_compliance_geometry("OUTER_EDGE_OF_BUILDING_FRAME", "SURVEY_CONTROLLED_LEGAL_BOUNDARY", "CURRENT_PROJECT_APPROVED_GEOMETRY", False), "COMPLIANCE_GEOMETRY_NOT_READY")

    def test_11_currentness_bounded_to_2023(self):
        c = self.e["currentness"]
        self.assertEqual(c["current_as_observed"], "SPRING_2023")
        self.assertIsNone(c["current_through"])

    def test_12_missing_observation_unresolved(self):
        self.assertEqual(classify_currentness(None, "2026-10-01", True), "STRUCTURE_GEOMETRY_CURRENTNESS_UNRESOLVED")

    def test_13_exact_outlines(self):
        self.assertEqual([x["object_id"] for x in self.e["historical_outlines"]], [880632, 987216, 758904])

    def test_14_direct_outlines_visually_unchanged(self):
        self.assertEqual([x["change_class"] for x in self.e["historical_outlines"][:2]], ["VISUALLY_UNCHANGED", "VISUALLY_UNCHANGED"])

    def test_15_ambiguous_outline_retained(self):
        self.assertEqual(self.e["historical_outlines"][2]["change_class"], "AMBIGUOUS")

    def test_16_permit_result(self):
        records = self.e["permit_search"]["accela_exact_address"]["records"]
        self.assertEqual([x["record_id"] for x in records], ["PMT-3276742"])
        self.assertEqual(records[0]["possible_footprint_effect"], "NONE_STATED")

    def test_17_no_approved_plan(self):
        self.assertEqual(self.e["approved_plans"]["state"], "NO_RELEVANT_PUBLIC_APPROVED_PLAN_FOUND")

    def test_18_legal_registration_blocker(self):
        self.assertEqual(self.e["legal_lot_registration"]["state"], "AUTHORITATIVE_REGISTRATION_NOT_ACHIEVED")
        self.assertIn("not silently promoted", self.e["legal_lot_registration"]["finding"].lower())

    def test_19_setback_gate(self):
        self.assertEqual(self.e["setback_suitability"]["state"], "COMPLIANCE_GEOMETRY_NOT_READY")

    def test_20_coverage_gate(self):
        self.assertEqual(self.e["lot_coverage_suitability"]["state"], "LOT_COVERAGE_GEOMETRY_NOT_READY")
        self.assertFalse(self.e["lot_coverage_suitability"]["coverage_calculated"])

    def test_21_forbidden_conclusions(self):
        joined = " ".join(self.e["forbidden_conclusions"]).lower()
        for term in ["setback compliance", "lot coverage", "development capacity", "permit absence"]:
            self.assertIn(term, joined)

    def test_22_decision_and_next(self):
        self.assertEqual(self.e["decision"], "CURRENT_STRUCTURE_GEOMETRY_V0_READY")
        self.assertEqual(self.e["next_feasibility_source_target"], "survey-controlled building footprint")

    def test_23_fingerprint_recomputes(self):
        payload = copy.deepcopy(self.e)
        observed = payload.pop("fingerprint_sha256")
        self.assertEqual(observed, fingerprint(payload))

    def test_24_artifacts_match(self):
        self.assertEqual(self.outputs["evaluation.json"], self.e)
        self.assertEqual(self.outputs["decision.json"]["decision"], self.e["decision"])

    def test_25_deterministic_rebuild(self):
        before = {p.name: p.read_bytes() for p in OUT.glob("*.json")}
        subprocess.run(["python3", str(Path(__file__).with_name("build.py"))], cwd=ROOT, check=True)
        after = {p.name: p.read_bytes() for p in OUT.glob("*.json")}
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main(verbosity=2)

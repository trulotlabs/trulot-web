from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = ROOT / "data" / "survey-controlled-building-geometry-prep-v0"
HANDOFF = Path("/private/tmp/trulot-packet-40-input/records-index.txt")
sys.path.insert(0, str(HERE))
from resolver import assess_compliance_geometry, classify_document, records_index_text, resolve


class Packet40Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run([sys.executable, str(HERE / "build.py")], cwd=ROOT, check=True)
        cls.e = json.loads((OUT / "evaluation.json").read_text())
        cls.d = json.loads((OUT / "decision.json").read_text())

    def test_01_target(self):
        self.assertEqual((self.e["apn"], self.e["address"]), ("6341302200", "1456 27TH ST"))

    def test_02_public_index_result(self):
        self.assertIn("NO_PTS_RECORDS", self.e["public_search"]["permit_finder_apn"])

    def test_03_target_record_identified(self):
        target = self.e["likely_construction_record"]
        self.assertEqual(target["state"], "PLAUSIBLE_UNINDEXED_ARCHIVE_TARGET")
        self.assertEqual(target["date_window"], "2008-01-01/2012-12-31")

    def test_04_document_classification_high(self):
        self.assertEqual(classify_document("APPROVED_SITE_PLAN"), "HIGH_VALUE")

    def test_05_document_classification_medium(self):
        self.assertEqual(classify_document("PERMIT_CARD"), "MEDIUM_VALUE")

    def test_06_no_plan_rejected(self):
        self.assertEqual(classify_document("NO_PLAN_MEP"), "LOW_VALUE")
        low = next(r for r in self.e["records"] if r["record_id"] == "PMT-3276742")
        self.assertEqual(low["classification"], "LOW_VALUE")

    def test_07_all_gates_required(self):
        kwargs = dict(legal_boundary_tie=True, building_frame_location=True, offsets_sufficient=True, authoritative_identity=True, approval_status=True, dimensional_semantics=True)
        self.assertEqual(assess_compliance_geometry(**kwargs), "COMPLIANCE_GEOMETRY_READY")
        for key in kwargs:
            attacked = dict(kwargs); attacked[key] = False
            self.assertEqual(assess_compliance_geometry(**attacked), "COMPLIANCE_GEOMETRY_NOT_READY")

    def test_08_no_imagery_promotion(self):
        self.assertIn("aerial imagery", self.e["acceptance_contract"]["insufficient"])
        self.assertEqual(self.d["compliance_geometry_state"], "COMPLIANCE_GEOMETRY_NOT_READY")

    def test_09_floor_plan_rejected(self):
        self.assertIn("floor plan without site control", self.e["acceptance_contract"]["insufficient"])

    def test_10_plan_identity_required(self):
        self.assertIn("authoritative plan and project identity", self.e["acceptance_contract"]["required"])

    def test_11_boundary_tie_required(self):
        self.assertTrue(any("PM 17383" in item for item in self.e["acceptance_contract"]["required"]))

    def test_12_building_frame_required(self):
        self.assertTrue(any("building-frame" in item for item in self.e["acceptance_contract"]["required"]))

    def test_13_visit_decision(self):
        self.assertEqual(self.e["visit_decision"], "DSD_RECORDS_VISIT_JUSTIFIED")

    def test_14_access_restrictions(self):
        restrictions = self.e["access"]["restrictions"].lower()
        for term in ("copying", "tracing", "photography", "video", "permission"):
            self.assertIn(term, restrictions)

    def test_15_metadata_capture(self):
        joined = " ".join(self.e["capture_protocol"]).lower()
        for term in ("permit number", "sheet number", "approval", "design professional", "pm 17383", "dimensions", "copy permission"):
            self.assertIn(term, joined)

    def test_16_no_personal_payment_fields(self):
        text = records_index_text(self.e).lower()
        self.assertNotIn("owner name", text)
        self.assertNotIn("payment", text)

    def test_17_handoff_exists(self):
        self.assertTrue(HANDOFF.is_file())
        self.assertEqual(HANDOFF.read_text(), records_index_text(self.e))

    def test_18_no_calculations(self):
        self.assertFalse(self.d["setback_compliance_calculated"])
        self.assertFalse(self.d["lot_coverage_calculated"])
        self.assertFalse(self.d["capacity_calculated"])

    def test_19_next_step(self):
        self.assertEqual(self.e["next_step"], "NEXT_FEASIBILITY_STEP: DSD records review for survey-controlled building geometry")

    def test_20_decision(self):
        self.assertEqual(self.e["decision"], "SURVEY_CONTROLLED_BUILDING_GEOMETRY_PREP_READY")

    def test_21_deterministic_build(self):
        before = {p.name: p.read_bytes() for p in OUT.glob("*.json")}
        subprocess.run([sys.executable, str(HERE / "build.py")], cwd=ROOT, check=True)
        after = {p.name: p.read_bytes() for p in OUT.glob("*.json")}
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main(verbosity=2)

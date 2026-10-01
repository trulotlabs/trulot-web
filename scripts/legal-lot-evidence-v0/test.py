#!/usr/bin/env python3
from __future__ import annotations
import copy, json, unittest
from build import OUTPUT, build_outputs
from resolver import classify_dimension, legal_area_support, parse_recorded_references, resolve_fixture, resolve_frontage, assign_lot_line_role, canonical_json

class LegalLotEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs=build_outputs(); cls.fixtures=cls.outputs["fixtures.json"]["fixtures"]; cls.results=cls.outputs["fixture-results.json"]["results"]
    def test_01_apn_never_establishes_legal_lot(self):
        f=copy.deepcopy(self.fixtures[0]); f["assessor_evidence"]={"apn":"3506320400"}; f["recorded_map_references"]=[]; f["source_unavailable"]=None
        self.assertNotEqual(resolve_fixture(f)["legal_status_state"],"LEGAL_LOT_ESTABLISHED")
    def test_02_assessor_semantics_remain_separate(self):
        r=next(x for x in self.results if x["apn"]=="6341302200")
        self.assertEqual(r["legal_status_state"],"LEGAL_LOT_EVIDENCE_PARTIAL")
        self.assertTrue(all(a["classification"]!="LEGAL_LOT_AREA_SUPPORTED" for a in r["areas"]))
    def test_03_recorded_reference_parsing(self):
        self.assertEqual(parse_recorded_references("PM17383 PAR 2")["references"][0]["normalized"],"PM 17383")
        self.assertEqual(parse_recorded_references("TR 915 BLK 4*LOTS 7 THRU 9*")["references"][0]["normalized"],"MAP 00915")
    def test_04_ambiguous_reference_refused(self):
        self.assertEqual(parse_recorded_references("TR UNKNOWN PM 12")["state"],"AMBIGUOUS_REFERENCE")
    def test_05_area_separation(self):
        self.assertEqual(legal_area_support({"source_semantic":"ASSESSOR_DISPLAYED_ACREAGE","value":.51},True)["state"],"UNSUPPORTED")
        self.assertEqual(legal_area_support({"source_semantic":"RECORDED_MAP_AREA","value":22000,"unit":"sqft","artifact_sha256":"a","provenance":{}},False)["reason"],"MODIFICATION_CHAIN_UNRESOLVED")
    def test_06_dimension_semantics(self):
        self.assertEqual(classify_dimension("30 foot easement"),"EASEMENT_WIDTH")
        self.assertEqual(classify_dimension("100.00"),"UNKNOWN_DIMENSION")
        self.assertEqual(classify_dimension("100.00","lot_width"),"LOT_WIDTH_EXPLICIT")
    def test_07_lot_line_refusal(self):
        self.assertEqual(assign_lot_line_role({"nearest_street":"Main"})["state"],"REFUSED")
    def test_08_frontage_refusal(self):
        self.assertEqual(resolve_frontage({"street_adjacency":True})["state"],"REFUSED")
    def test_09_modification_chain_preserved(self):
        self.assertTrue(all(x["modification_chain"]["state"]=="UNRESOLVED" for x in self.results))
    def test_10_condo_stack_refusal(self):
        for apn in ("5891700512","5891700513","5333641301","5333641302"):
            r=next(x for x in self.results if x["apn"]==apn); self.assertFalse(r["land_dimensions_assigned_to_apn"])
    def test_11_source_unavailable_handling(self):
        self.assertEqual(sum(x["legal_status_state"]=="LEGAL_LOT_SOURCE_UNAVAILABLE" for x in self.results),22)
    def test_12_no_rule_unlock_without_artifact(self):
        self.assertTrue(all(x["minimum_lot_area_evaluation_state"]=="BLOCKED_BY_LEGAL_LOT_AREA_EVIDENCE" for x in self.results))
    def test_13_bounded_corpus_coverage(self):
        self.assertEqual(len(self.fixtures),25); self.assertTrue({"3506320400","6341302200","4304211000"}.issubset({x["apn"] for x in self.fixtures}))
    def test_14_exact_reconciliation(self):
        c=self.outputs["reconciliation.json"]["counts"]; self.assertEqual(c["assessor_map_found"],3); self.assertEqual(c["recorded_map_reference_found"],3); self.assertEqual(c["recorded_map_acquired"],0); self.assertEqual(c["LEGAL_LOT_EVIDENCE_PARTIAL"],3); self.assertEqual(c["LEGAL_LOT_SOURCE_UNAVAILABLE"],22)
    def test_15_no_compliance_or_capacity(self):
        encoded=canonical_json(self.outputs); self.assertNotIn('"parcel_compliance_evaluated":true',encoded); self.assertNotIn('"development_capacity_calculated":true',encoded)
    def test_16_deterministic_build(self):
        self.assertEqual(canonical_json(build_outputs()),canonical_json(build_outputs()))
    def test_17_committed_artifacts_match(self):
        for name,value in self.outputs.items(): self.assertEqual(json.loads((OUTPUT/name).read_text()),value,name)

if __name__=="__main__": unittest.main(verbosity=2)

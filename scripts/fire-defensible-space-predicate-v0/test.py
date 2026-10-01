#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import unittest

from build import OUTPUT, build_outputs, source_registry
from resolver import CONTRACT_VERSION, EXPECTED_APN, bridge_setback, evaluate_fire_buffer


class FireDefensibleSpacePredicateV0Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()
        cls.evaluation = cls.outputs["evaluation.json"]
        cls.sources = source_registry()
        cls.geography = cls.evaluation["geography"]

    def test_01_exact_scope(self):
        self.assertEqual(self.outputs["contract.json"]["scope"]["apns"], [EXPECTED_APN])
        self.assertEqual(self.outputs["contract.json"]["contract_version"], CONTRACT_VERSION)

    def test_02_four_fire_concepts_remain_separate(self):
        self.assertEqual(self.outputs["contract.json"]["concepts"], ["FIRE_HAZARD_GEOGRAPHY", "VEGETATION_BRUSH_MANAGEMENT_OBLIGATION", "DEVELOPMENT_SETBACK_OVERRIDE", "PROJECT_SPECIFIC_FIRE_DETERMINATION"])

    def test_03_city_vhfhsz_intersection_is_context(self):
        self.assertTrue(self.geography["city_vhfhsz_intersects"])
        self.assertEqual(self.geography["state_recommended_class"], "NonWildland")
        self.assertFalse(self.evaluation["geography_determines_greater_buffer"])

    def test_04_section_is_not_geographically_gated(self):
        doctrine = self.evaluation["legal_doctrine"]
        self.assertEqual(doctrine["scope"], "ALL_STRUCTURES_OUTSIDE_COASTAL_CURRENT_PROFILE")
        self.assertFalse(doctrine["geographic_gate"])

    def test_05_no_automatic_numeric_greater_setback(self):
        self.assertFalse(self.evaluation["automatic_numeric_rule"])
        self.assertEqual(self.evaluation["automatic_rule_state"], "FIRE_BUFFER_NOT_REQUIRED_BY_PUBLISHED_DETERMINISTIC_RULE")
        self.assertIsNone(self.evaluation["greater_buffer_ft"])

    def test_06_missing_project_determination_is_not_false(self):
        self.assertEqual(self.evaluation["state"], "FIRE_BUFFER_PROJECT_REVIEW_REQUIRED")
        self.assertIn("absence is not FALSE", self.evaluation["project_determination"]["absence_semantics"])

    def test_07_authoritative_project_record_can_support_value(self):
        result = evaluate_fire_buffer(apn=EXPECTED_APN, sources=self.sources, geography=self.geography, project_determination={"evidence_type": "FIRE_CODE_OFFICIAL_DETERMINATION", "record_id": "fixture-fire-1", "issued_by": "FIRE_CODE_OFFICIAL", "required_buffer_ft": 31.0})
        self.assertEqual(result["state"], "FIRE_BUFFER_REQUIREMENT_SUPPORTED")
        self.assertEqual(result["greater_buffer_ft"], 31.0)
        self.assertTrue(result["publication_contract"]["fire_branch_resolved"])
        self.assertFalse(result["publication_contract"]["final_project_setback_resolved"])

    def test_08_non_authoritative_or_non_numeric_record_fails_closed(self):
        result = evaluate_fire_buffer(apn=EXPECTED_APN, sources=self.sources, geography=self.geography, project_determination={"evidence_type": "GENERAL_GUIDANCE", "record_id": "x", "issued_by": "OWNER", "required_buffer_ft": None})
        self.assertEqual(result["state"], "FIRE_BUFFER_SOURCE_UNAVAILABLE")

    def test_09_source_unavailable_behavior(self):
        sources = copy.deepcopy(self.sources)
        sources["sdmc_131_0443_i"]["state"] = "SOURCE_UNAVAILABLE"
        result = evaluate_fire_buffer(apn=EXPECTED_APN, sources=sources, geography=self.geography)
        self.assertEqual(result["state"], "FIRE_BUFFER_SOURCE_UNAVAILABLE")
        self.assertIn("sdmc_131_0443_i", result["missing_sources"])

    def test_10_base_setback_is_reportable_with_caveat(self):
        publication = self.evaluation["publication_contract"]
        self.assertTrue(publication["base_setback_reportable"])
        self.assertFalse(publication["final_project_setback_resolved"])
        self.assertIn("specific project", publication["required_caveat"])

    def test_11_front_bridge_preserves_slope_and_fire_conditions(self):
        bridge = self.outputs["front-bridge.json"]
        self.assertEqual(bridge["base_zoning_setback_ft"], 15.0)
        self.assertIn("front_50_foot_slope_branch", bridge["other_unresolved_branches"])
        self.assertEqual(bridge["fire_branch"]["state"], "FIRE_BUFFER_PROJECT_REVIEW_REQUIRED")
        self.assertEqual(bridge["requirement_state"], "SETBACK_REQUIREMENT_CONDITIONAL")

    def test_12_rear_bridge_preserves_depth_value_and_fire_condition(self):
        bridge = self.outputs["rear-bridge.json"]
        self.assertEqual(bridge["base_zoning_setback_ft"], 23.502)
        self.assertEqual(bridge["fire_branch"]["state"], "FIRE_BUFFER_PROJECT_REVIEW_REQUIRED")
        self.assertEqual(bridge["requirement_state"], "SETBACK_REQUIREMENT_CONDITIONAL")

    def test_13_bridge_source_unavailable_fails_closed(self):
        unavailable = {"state": "FIRE_BUFFER_SOURCE_UNAVAILABLE", "automatic_numeric_rule": None, "greater_buffer_ft": None, "publication_contract": {}}
        bridge = bridge_setback(rule_family="rear_setback", base_value_ft=23.502, other_unresolved=[], fire_result=unavailable)
        self.assertEqual(bridge["requirement_state"], "SETBACK_REQUIREMENT_SOURCE_UNAVAILABLE")
        self.assertFalse(bridge["base_zoning_setback_reportable"])

    def test_14_product_avoids_forbidden_fire_claims(self):
        product = json.dumps(self.outputs["product-example.json"]).lower()
        self.assertNotIn("fire compliant", product)
        self.assertNotIn("fire safe", product)
        self.assertNotIn("no fire issue", product)
        self.assertFalse(self.outputs["product-example.json"]["ui_wired"])

    def test_15_gis_lookup_is_not_determinative(self):
        self.assertEqual(self.evaluation["gis_lookup_determination"], "FIRE_BUFFER_GIS_LOOKUP_NOT_DETERMINATIVE")

    def test_16_no_compliance_or_capacity(self):
        self.assertFalse(self.evaluation["structure_compliance_evaluated"])
        self.assertFalse(self.evaluation["capacity_calculated"])
        self.assertFalse(self.outputs["front-bridge.json"]["structure_compliance_evaluated"])
        self.assertFalse(self.outputs["rear-bridge.json"]["capacity_calculated"])

    def test_17_source_registry_has_authority_and_hashes(self):
        for source_id in ("sdmc_131_0443_i", "sd_fire_code_adoption", "sd_wui_code", "city_vhfhsz_map"):
            self.assertEqual(self.sources[source_id]["state"], "AVAILABLE")
            self.assertEqual(self.sources[source_id]["authority_rank"], 1)
        self.assertEqual(len(self.sources["sdmc_131_0443_i"]["sha256"]), 64)
        self.assertEqual(len(self.sources["city_vhfhsz_map"]["exact_apn_query_evidence_sha256"]), 64)

    def test_18_decision_and_next_move(self):
        decision = self.outputs["decision.json"]
        self.assertEqual(decision["decision"], "FIRE_DEFENSIBLE_SPACE_PREDICATE_V0_READY")
        self.assertEqual(decision["next_rule_evaluation_target"], "interior side setback")

    def test_19_deterministic_rebuild(self):
        self.assertEqual(build_outputs(), build_outputs())

    def test_20_committed_artifacts_match(self):
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)


if __name__ == "__main__":
    unittest.main(verbosity=2)

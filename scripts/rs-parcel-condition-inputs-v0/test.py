#!/usr/bin/env python3
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATA = ROOT / "data/rs-parcel-condition-inputs-v0"


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


resolver = module("condition_resolver", HERE / "resolver.py")
build = module("condition_build", HERE / "build.py")


def load(path): return json.loads(Path(path).read_text())


CONTRACT = load(DATA / "contract.json")
MATRIX = load(DATA / "dependency-matrix.json")
FIXTURES = load(DATA / "fixtures.json")["fixtures"]
RESULTS_FILE = load(DATA / "fixture-results.json")
RESULTS = {item["fixture_id"]: item for item in RESULTS_FILE["results"]}


class RSParcelConditionInputsV0Tests(unittest.TestCase):
    def test_every_packet12_standard_family_has_dependencies(self):
        rules = load(ROOT / "data/rs-base-standards-v0/standards.json")
        self.assertEqual({rule["standard_key"] for rule in rules}, {item["standard_family"] for item in MATRIX["families"]})
        self.assertEqual(MATRIX["family_count"], 25)
        self.assertEqual(sum(item["packet12_rule_count"] for item in MATRIX["families"]), 343)
        for item in MATRIX["families"]:
            self.assertTrue(item["required_parcel_facts"] or item.get("source_dependencies"))
            self.assertTrue(item["blocker"])
            self.assertIn(item["readiness"], CONTRACT["readiness_states"])

    def test_fact_contract_and_truth_states(self):
        required = set(CONTRACT["fact_contract"]["required_fields"])
        for result in RESULTS.values():
            for item in result["facts"] + result["geometry_diagnostics"]:
                self.assertFalse(required - set(item), item["fact_key"])
                self.assertIn(item["state"], CONTRACT["fact_contract"]["states"])
                self.assertIn(item["derivation_class"], CONTRACT["fact_contract"]["derivation_classes"])
                if item["state"] in {"unknown", "unavailable"}:
                    self.assertIsNone(item["value"])

    def test_twenty_or_more_real_parcel_fixtures(self):
        self.assertEqual(len(FIXTURES), 24)
        self.assertEqual(len({item["apn"] for item in FIXTURES}), 24)
        required_tags = {"ordinary_rs_1_7", "small_geometry", "large_geometry", "irregular_polygon", "multipolygon",
                         "stacked", "missing_situs", "split_zone", "boundary_sliver", "ambiguous_zoning", "unmapped",
                         "centroid_outside", "taxable_acreage", "taxable_acreage_missing"}
        observed = {tag for item in FIXTURES for tag in item["coverage_tags"]}
        self.assertFalse(required_tags - observed)
        for spec in FIXTURES:
            path = ROOT / spec["source_artifact"]
            self.assertTrue(path.exists())
            result = RESULTS[spec["id"]]
            self.assertEqual(result["parcel"]["apn"], spec["apn"])
            self.assertIn("evaluation_readiness", result)
            apn_fact = next(item for item in result["facts"] if item["fact_key"] == "parcel_apn")
            self.assertEqual(apn_fact["provenance"]["artifact_sha256"], hashlib.sha256(path.read_bytes()).hexdigest())

    def test_geometry_area_is_derived_and_not_legal_area(self):
        result = RESULTS["ordinary-taxable-null"]
        facts = {item["fact_key"]: item for item in result["facts"]}
        area = facts["approximate_geometry_area_sqft"]
        self.assertEqual(area["state"], "supported")
        self.assertEqual(area["derivation_class"], "DETERMINISTIC_DERIVED")
        self.assertGreater(area["value"], 0)
        legal = facts["legal_lot_area_sqft"]
        self.assertEqual(legal["state"], "unknown")
        self.assertIsNone(legal["value"])
        self.assertEqual(result["lot_area_readiness"]["legal_lot_area_equivalence"], "unresolved")
        self.assertIsNone(result["lot_area_readiness"]["compliance_conclusion"])

    def test_taxable_acreage_is_separate_and_null_is_unknown(self):
        present = {item["fact_key"]: item for item in RESULTS["missing-situs-taxable"]["facts"]}
        absent = {item["fact_key"]: item for item in RESULTS["ordinary-taxable-null"]["facts"]}
        self.assertEqual(present["taxable_acreage"]["state"], "supported")
        self.assertEqual(present["taxable_acreage"]["value"], 3.24)
        self.assertEqual(present["taxable_acreage"]["derivation_class"], "RECORDED")
        self.assertEqual(absent["taxable_acreage"]["state"], "unknown")
        self.assertIsNone(absent["taxable_acreage"]["value"])
        self.assertNotEqual(present["taxable_acreage"]["value"] * 43560,
                            present["approximate_geometry_area_sqft"]["value"])

    def test_width_and_depth_refuse_legal_promotion(self):
        for result in RESULTS.values():
            facts = {item["fact_key"]: item for item in result["facts"]}
            self.assertEqual(facts["legal_lot_width_ft"]["state"], "unknown")
            self.assertEqual(facts["legal_lot_depth_ft"]["state"], "unknown")
            self.assertIsNone(facts["legal_lot_width_ft"]["value"])
            self.assertIsNone(facts["legal_lot_depth_ft"]["value"])
            self.assertEqual(result["legal_measurement_findings"]["width"], "LEGAL_WIDTH_NOT_DERIVABLE_FROM_CURRENT_DATA")
            self.assertEqual(result["legal_measurement_findings"]["depth"], "LEGAL_DEPTH_NOT_DERIVABLE_FROM_CURRENT_DATA")
            for diagnostic in result["geometry_diagnostics"]:
                self.assertTrue(diagnostic["fact_key"].startswith("geometry_"))
                self.assertEqual(diagnostic["derivation_class"], "INFERRED")
                self.assertEqual(diagnostic["confidence"], "diagnostic_only")
                self.assertNotIn(diagnostic["fact_key"], CONTRACT["geometry_diagnostic_namespace"]["forbidden_promotions"])

    def test_candidate_geometry_methods_disagree(self):
        analysis = load(DATA / "diagnostic-analysis.json")
        self.assertGreaterEqual(analysis["evaluated_parcels"], 10)
        self.assertEqual(analysis["legal_width_conclusions"], 0)
        self.assertEqual(analysis["legal_depth_conclusions"], 0)
        self.assertTrue(any(item["minimum_method_delta_ft"] > 0 for item in analysis["comparisons"]))
        self.assertTrue(any(item["maximum_method_delta_ft"] > 0 for item in analysis["comparisons"]))

    def test_corner_and_frontage_refusal(self):
        for result in RESULTS.values():
            facts = {item["fact_key"]: item for item in result["facts"]}
            for key in ["corner_lot_status", "front_lot_line", "legal_street_frontage_length_ft", "street_curve_or_turnaround_status"]:
                self.assertEqual(facts[key]["state"], "unknown")
                self.assertIsNone(facts[key]["value"])
            self.assertEqual(result["legal_measurement_findings"]["corner_lot"], "UNKNOWN")
            self.assertEqual(result["legal_measurement_findings"]["frontage"], "UNKNOWN")

    def test_setback_height_far_and_hillside_readiness(self):
        by_family = {item["standard_family"]: item for item in MATRIX["families"]}
        for key in ["front_setback_min", "interior_side_setback_min", "street_side_setback_min", "rear_setback_min"]:
            self.assertEqual(by_family[key]["readiness"], "INPUT_MISSING")
            self.assertIn("structure_geometry", by_family[key]["required_parcel_facts"])
        self.assertEqual(by_family["structure_height_max"]["readiness"], "INPUT_MISSING")
        self.assertIn("angled_envelope_context", by_family["structure_height_max"]["required_parcel_facts"])
        self.assertEqual(by_family["floor_area_ratio_max"]["readiness"], "INPUT_MISSING")
        self.assertIn("gross_floor_area_sqft", by_family["floor_area_ratio_max"]["required_parcel_facts"])
        self.assertIn("steep_hillside_fraction", by_family["floor_area_ratio_max"]["required_parcel_facts"])
        inventory = {item["fact_key"]: item for item in RESULTS["boundary-sliver"]["facts"]}
        for key in ["slope_percent", "steep_hillside_fraction", "defensible_space_requirement", "structure_height_ft", "gross_floor_area_sqft"]:
            self.assertEqual(inventory[key]["state"], "unknown")

    def test_rs17_example_is_honest_about_bounded_evidence(self):
        result = load(DATA / "rs-1-7-example.json")
        facts = {item["fact_key"]: item for item in result["facts"]}
        self.assertEqual(result["parcel"]["apn"], "3506320400")
        self.assertEqual(result["standards_context"]["zones"], ["RS-1-7"])
        rule_inputs = {item["standard_key"]: item for item in result["known_rs_rule_inputs"][0]["rules"]}
        self.assertEqual(rule_inputs["lot_area_min"]["value"]["number"], 5000)
        self.assertEqual(rule_inputs["lot_width_min"]["value"]["number"], 50)
        self.assertEqual(rule_inputs["lot_depth_min"]["value"]["number"], 95)
        self.assertEqual(rule_inputs["structure_height_max"]["value"]["text"], "24/30")
        self.assertEqual(rule_inputs["floor_area_ratio_max"]["value"]["text"], "varies")
        self.assertEqual(facts["parcel_apn"]["state"], "supported")
        self.assertEqual(facts["approximate_geometry_area_sqft"]["state"], "unknown")
        self.assertTrue(result["lot_area_readiness"]["rs_minimum_lot_area_available"])
        self.assertFalse(result["lot_area_readiness"]["mechanical_comparison_possible"])
        self.assertFalse(result["compliance_evaluated"])
        self.assertFalse(result["capacity_calculated"])

    def test_mechanical_area_comparison_never_becomes_compliance(self):
        result = RESULTS["boundary-sliver"]
        self.assertTrue(result["lot_area_readiness"]["mechanical_comparison_possible"])
        self.assertEqual(result["lot_area_readiness"]["legal_lot_area_equivalence"], "unresolved")
        self.assertIsNone(result["lot_area_readiness"]["compliance_conclusion"])
        self.assertFalse(result["compliance_evaluated"])

    def test_readiness_decision(self):
        decision = load(DATA / "decision.json")
        self.assertEqual(decision["decision"], "RS_PARCEL_INPUTS_NOT_READY_FOR_COMPLIANCE")
        self.assertEqual(decision["compliance_conclusions"], 0)
        self.assertEqual(decision["capacity_calculations"], 0)
        self.assertFalse(decision["production_runtime_wiring"])
        self.assertEqual(decision["readiness_counts"].get("READY_FOR_DETERMINISTIC_EVALUATION", 0), 0)

    def test_future_source_priorities_are_ranked(self):
        priorities = load(DATA / "future-source-priorities.json")["priorities"]
        self.assertEqual([item["rank"] for item in priorities], list(range(1, len(priorities) + 1)))
        counts = [item["affected_packet12_rule_records_upper_bound"] for item in priorities]
        self.assertEqual(counts, sorted(counts, reverse=True))
        self.assertTrue(any("legal lot area" in item["would_unlock"] for item in priorities))
        self.assertTrue(all(item["would_unlock"] and item["reason"] for item in priorities))

    def test_fingerprint_and_full_rebuild(self):
        for result in RESULTS.values():
            body = {key: value for key, value in result.items() if key != "fingerprint_sha256"}
            self.assertEqual(result["fingerprint_sha256"], resolver.sha256_value(body))
        self.assertEqual(RESULTS_FILE["canonical_output_sha256"], resolver.sha256_value(RESULTS_FILE["results"]))
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory)
            build.build(DATA, destination)
            for name in build.GENERATED:
                self.assertEqual((DATA / name).read_bytes(), (destination / name).read_bytes(), name)


if __name__ == "__main__": unittest.main(verbosity=2)

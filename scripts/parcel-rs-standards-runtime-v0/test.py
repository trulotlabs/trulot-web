#!/usr/bin/env python3
import copy
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATA = ROOT / "data/parcel-rs-standards-runtime-v0"
RS_DATA = ROOT / "data/rs-base-standards-v0"


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


resolver = module("parcel_rs_runtime_resolver", HERE / "resolver.py")
build = module("parcel_rs_runtime_build", HERE / "build.py")


def load(path):
    return json.loads(Path(path).read_text())


FIXTURES = load(DATA / "fixtures.json")["cases"]
BY_NAME = {item["name"]: item for item in FIXTURES}
RESULTS = load(DATA / "fixture-results.json")
OUTPUTS = {item["name"]: item["result"] for item in RESULTS["results"]}
RS_SOURCES = load(RS_DATA / "sources.json")
SOURCE_HASHES = {value["sha256"] for value in RS_SOURCES["sources"].values() if value.get("sha256")}


class ParcelRSStandardsRuntimeV0Tests(unittest.TestCase):
    def test_fixture_count_and_real_packet9_evidence(self):
        self.assertEqual(len(FIXTURES), 13)
        casebook = load(ROOT / "data/base-zoning-v2-lineage/casebook.json")
        indexed = {item["apn"]: item for item in casebook["cases"]}
        golden = load(ROOT / "data/base-zoning-v2/golden-fixture.json")["cases"]
        golden_indexed = {item["apn"]: item for item in golden.values()}
        for fixture in FIXTURES:
            value = fixture["input"]
            origin = value["mapping_provenance"]["artifact_path"]
            source = indexed[value["apn"]] if origin.endswith("casebook.json") else golden_indexed[value["apn"]]
            source_state = source["v2MappingState"] if origin.endswith("casebook.json") else source["mappingState"]
            source_zones = source["v2Zones"] if origin.endswith("casebook.json") else [item["zoneCode"] for item in source["zoneEvidence"]]
            source_coverage = source["coveragePercentages"] if origin.endswith("casebook.json") else [item["parcelCoveragePercent"] for item in source["zoneEvidence"]]
            source_ids = [[value] for value in source["sourceFeatureIds"]] if origin.endswith("casebook.json") else [
                [feature["sourceObjectId"] for feature in item["features"]] for item in source["zoneEvidence"]]
            self.assertEqual(value["mapping_evidence_state"], source_state, fixture["name"])
            self.assertEqual([item["zone_code"] for item in value["zone_evidence"]], source_zones, fixture["name"])
            self.assertEqual([item["coverage_percent"] for item in value["zone_evidence"]], source_coverage, fixture["name"])
            self.assertEqual([item["source_feature_ids"] for item in value["zone_evidence"]], source_ids, fixture["name"])
            artifact = ROOT / origin
            self.assertEqual(value["mapping_provenance"]["artifact_sha256"], hashlib.sha256(artifact.read_bytes()).hexdigest())

    def test_required_fixture_scenarios(self):
        self.assertEqual(set(BY_NAME), {
            "single-zone-rs-1-7", "single-zone-another-rs", "boundary-sliver-rs-primary",
            "split-zone-rs-plus-rs", "split-zone-rs-plus-non-rs", "unmapped",
            "ambiguous-indeterminate", "single-zone-non-rs", "inside-coastal-rs",
            "unknown-coastal-rs", "unsupported-future-date", "rs-1-14-footnote-8-unknown",
            "unsupported-historical-date",
        })

    def test_all_fourteen_rs_zones_compatible(self):
        template = copy.deepcopy(BY_NAME["single-zone-rs-1-7"]["input"])
        for number in range(1, 15):
            zone = f"RS-1-{number}"
            template["zone_evidence"][0]["zone_code"] = zone
            result = resolver.resolve(template)
            self.assertEqual(result["standards"]["resolution_state"], "RESOLVED", zone)
            self.assertEqual(result["standards"]["zone_results"][0]["zone_code"], zone)
            self.assertGreater(len(result["standards"]["zone_results"][0]["rules"]), 0)

    def test_mapping_state_projection(self):
        self.assertEqual(OUTPUTS["single-zone-rs-1-7"]["base_zoning"]["mapping_state"], "SINGLE_ZONE")
        sliver = OUTPUTS["boundary-sliver-rs-primary"]
        self.assertEqual(sliver["base_zoning"]["mapping_state"], "SINGLE_ZONE")
        self.assertEqual(sliver["base_zoning"]["mapping_evidence_state"], "BOUNDARY_SLIVER")
        self.assertEqual(len(sliver["base_zoning"]["zone_evidence"]), 2)
        self.assertEqual([item["zone_code"] for item in sliver["standards"]["zone_results"]], ["RS-1-14"])
        split = OUTPUTS["split-zone-rs-plus-rs"]
        self.assertEqual(split["base_zoning"]["mapping_state"], "SPLIT_ZONE")
        self.assertEqual([item["zone_code"] for item in split["standards"]["zone_results"]], ["RS-1-3", "RS-1-6"])
        self.assertFalse(split["standards_blended"])
        self.assertEqual(OUTPUTS["unmapped"]["standards"]["resolution_state"], "MAPPING_UNRESOLVED")
        ambiguous = OUTPUTS["ambiguous-indeterminate"]
        self.assertEqual(ambiguous["base_zoning"]["mapping_state"], "AMBIGUOUS")
        self.assertEqual(len(ambiguous["base_zoning"]["zone_evidence"]), 2)
        self.assertEqual(ambiguous["standards"]["zone_results"], [])

    def test_split_rs_and_non_rs_remain_separate(self):
        result = OUTPUTS["split-zone-rs-plus-non-rs"]
        self.assertEqual(result["standards"]["state"], "partial")
        self.assertEqual(result["standards"]["resolution_state"], "PARTIAL_RS_RESOLUTION")
        zones = result["standards"]["zone_results"]
        self.assertEqual([(item["zone_code"], item["resolution_state"]) for item in zones], [
            ("RS-1-7", "RESOLVED"), ("OR-1-1", "UNSUPPORTED_BY_RS_V0")])
        self.assertTrue(zones[0]["rules"])
        self.assertEqual(zones[1]["rules"], [])
        self.assertFalse(result["standards_blended"])

    def test_non_rs_single_zone_not_applicable(self):
        result = OUTPUTS["single-zone-non-rs"]
        self.assertEqual(result["standards"]["state"], "not_applicable")
        self.assertEqual(result["standards"]["resolution_state"], "NOT_APPLICABLE")
        self.assertEqual(result["standards"]["zone_results"][0]["rules"], [])

    def test_coastal_refusal(self):
        for name in ["inside-coastal-rs", "unknown-coastal-rs"]:
            result = OUTPUTS[name]
            self.assertEqual(result["standards"]["resolution_state"], "APPLICABILITY_UNRESOLVED")
            self.assertEqual(result["standards"]["state"], "unknown")
            self.assertEqual(result["standards"]["zone_results"], [])

    def test_as_of_refusal(self):
        future = OUTPUTS["unsupported-future-date"]
        historical = OUTPUTS["unsupported-historical-date"]
        self.assertEqual(future["unresolved_reasons"][0]["code"], "FUTURE_SOURCE_REACQUISITION_REQUIRED")
        self.assertEqual(historical["unresolved_reasons"][0]["code"], "HISTORICAL_VERSION_UNAVAILABLE")
        self.assertEqual(future["standards"]["zone_results"], [])
        self.assertEqual(historical["standards"]["zone_results"], [])

    def test_rs_1_7_regression(self):
        result = OUTPUTS["single-zone-rs-1-7"]
        rules = {item["standard_key"]: item for item in result["standards"]["zone_results"][0]["rules"]}
        for key, number in [("lot_area_min", 5000), ("lot_width_min", 50), ("corner_lot_width_min", 55),
                            ("lot_depth_min", 95), ("front_setback_min", 15), ("interior_side_setback_min", 4),
                            ("street_side_setback_min", 5), ("rear_setback_min", 13), ("density_basis", 1)]:
            self.assertEqual(rules[key]["value"]["number"], number, key)
        self.assertEqual(rules["corner_lot_width_min"]["fact_state"], "CONDITIONAL")
        self.assertEqual(rules["structure_height_max"]["value"]["text"], "24/30")
        self.assertFalse(rules["structure_height_max"]["value"]["evaluated"])
        self.assertEqual(rules["floor_area_ratio_max"]["value"]["text"], "varies")
        self.assertFalse(result["parcel_compliance_evaluated"])
        self.assertFalse(result["development_capacity_calculated"])

    def test_conditionals_and_unknown_not_flattened(self):
        rs17_rules = OUTPUTS["single-zone-rs-1-7"]["standards"]["zone_results"][0]["rules"]
        for rule in rs17_rules:
            if rule["fact_state"] == "CONDITIONAL":
                self.assertTrue(rule["condition"] or rule["exceptions"] or rule["unresolved_dependencies"])
        footnote = OUTPUTS["rs-1-14-footnote-8-unknown"]
        unknown = [rule for rule in footnote["standards"]["zone_results"][0]["rules"] if "131-04D:8" in rule["exceptions"]]
        self.assertEqual(len(unknown), 1)
        self.assertEqual(unknown[0]["fact_state"], "UNKNOWN")
        self.assertIsNone(unknown[0]["value"].get("number"))
        self.assertTrue(any(item["code"] == "SOURCE_RULE_UNKNOWN" for item in footnote["unresolved_reasons"]))

    def test_truth_states_are_explicit(self):
        self.assertEqual(OUTPUTS["single-zone-rs-1-7"]["standards"]["state"], "supported")
        self.assertEqual(OUTPUTS["split-zone-rs-plus-non-rs"]["standards"]["state"], "partial")
        self.assertEqual(OUTPUTS["unmapped"]["standards"]["state"], "unknown")
        self.assertEqual(OUTPUTS["single-zone-non-rs"]["standards"]["state"], "not_applicable")
        self.assertEqual(OUTPUTS["inside-coastal-rs"]["standards"]["state"], "unknown")
        for output in OUTPUTS.values():
            self.assertIsInstance(output["parcel_compliance_evaluated"], bool)
            self.assertIsInstance(output["development_capacity_calculated"], bool)

    def test_source_unavailable_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            result = resolver.resolve(BY_NAME["single-zone-rs-1-7"]["input"], Path(directory))
        self.assertEqual(result["standards"]["state"], "unavailable")
        self.assertEqual(result["standards"]["source_state"], "source_unavailable")
        self.assertEqual(result["standards"]["resolution_state"], "SOURCE_UNAVAILABLE")
        self.assertEqual(result["standards"]["zone_results"], [])

    def test_provenance_complete_and_resolves(self):
        versions = load(RS_DATA / "versions.json")
        supported = 0
        for output in OUTPUTS.values():
            for zone in output["standards"]["zone_results"]:
                if zone["state"] != "supported":
                    continue
                self.assertEqual(zone["source_state"], "available")
                for rule in zone["rules"]:
                    supported += 1
                    self.assertEqual(rule["rule_set_version"], versions["rule_set_version"])
                    self.assertTrue(rule["source_document"])
                    self.assertTrue(rule["source_section"])
                    self.assertTrue(rule["source_table"])
                    self.assertIn(rule["source_evidence"]["source_sha256"], SOURCE_HASHES)
                    body = {key: value for key, value in rule.items() if key != "provenance_sha256"}
                    self.assertEqual(rule["provenance_sha256"], resolver.fingerprint(body))
        self.assertGreater(supported, 0)
        self.assertEqual(load(DATA / "decision.json")["supported_values_without_provenance"], 0)

    def test_fingerprint_and_rebuild_are_deterministic(self):
        for item in RESULTS["results"]:
            result = item["result"]
            body = {key: value for key, value in result.items() if key != "fingerprint_sha256"}
            self.assertEqual(result["fingerprint_sha256"], resolver.fingerprint(body))
            rerun = resolver.resolve(BY_NAME[item["name"]]["input"])
            self.assertEqual(resolver.canonical(result), resolver.canonical(rerun))
        self.assertEqual(RESULTS["canonical_output_sha256"], resolver.fingerprint(RESULTS["results"]))
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory)
            build.build(DATA, destination)
            for name in build.GENERATED:
                self.assertEqual((DATA / name).read_bytes(), (destination / name).read_bytes(), name)

    def test_decision_and_containment(self):
        decision = load(DATA / "decision.json")
        self.assertEqual(decision["decision"], "RS_STANDARDS_RUNTIME_V0_READY")
        self.assertFalse(decision["production_runtime_wiring"])
        self.assertFalse(decision["parcel_compliance_logic"])
        self.assertFalse(decision["capacity_logic"])
        self.assertEqual(set(OUTPUTS["single-zone-rs-1-7"]["explicit_exclusions"]), set(resolver.EXCLUSIONS))


if __name__ == "__main__":
    unittest.main(verbosity=2)

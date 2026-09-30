#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATA = ROOT / "data/structure-facts-v0"


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    loaded = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(loaded)
    return loaded


resolver = module("structure_resolver_test", HERE / "resolver.py")
builder = module("structure_builder_test", HERE / "build.py")


def load(name):
    return json.loads((DATA / name).read_text())


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


SCHEMA = load("schema.json")
SOURCES = load("sources.json")
LINKAGE = load("linkage.json")
COVERAGE = load("coverage.json")
FIXTURES = load("fixtures.json")
RESULTS_FILE = load("fixture-results.json")
RESULTS = {row["fixture_id"]: row for row in RESULTS_FILE["results"]}


class StructureFactsV0Tests(unittest.TestCase):
    def test_source_schema_and_artifact_hashes(self):
        acquisition = Path(SOURCES["acquisition_path"])
        self.assertTrue(acquisition.is_dir())
        for name in [
            "layer-metadata.json", "service-metadata.json", "object-ids.json", "chunk-manifest.json",
            "normalized-footprints.csv.gz", "parcel-assessor-source.csv.gz",
            "footprint-parcel-linkage.ndjson", "parcel-footprint-summary.ndjson",
            "sangis-parcel-data-dictionary-source.pdf", "city-sangis-field-semantics.pdf",
        ]:
            self.assertTrue((acquisition / name).is_file(), name)
        self.assertEqual(
            sha(acquisition / "sangis-parcel-data-dictionary-source.pdf"),
            SOURCES["official_semantic_evidence"]["sangis_dictionary"]["sha256"],
        )
        self.assertEqual(
            sha(acquisition / "city-sangis-field-semantics.pdf"),
            SOURCES["official_semantic_evidence"]["city_field_semantics"]["sha256"],
        )
        fields = SOURCES["sources"]["city_sandag_building_outlines"]["fields"]
        self.assertTrue({"OBJECTID", "outline_id", "bldgID", "Shape_Area", "GlobalID"} <= set(fields))
        self.assertEqual(SOURCES["sources"]["sangis_parcel_arcc_mpr_par"]["linkage"], "Exact ten-digit APN")

    def test_full_exact_apn_and_footprint_linkage_counts(self):
        assessor = LINKAGE["assessor_exact_apn"]
        self.assertEqual(assessor["source_records"], 393733)
        self.assertEqual(assessor["matched_parcel_v2_apns"], 393733)
        self.assertEqual(assessor["duplicate_apns"], 0)
        self.assertEqual(assessor["orphan_records"], 0)
        footprint = LINKAGE["historical_footprints"]
        self.assertEqual(sum(footprint["sourceLinkageStates"].values()), 386217)
        self.assertEqual(sum(footprint["parcelCoverageStates"].values()), 393733)
        self.assertEqual(footprint["sourceLinkageStates"], {
            "AMBIGUOUS_MULTI_PARCEL": 115836,
            "ORPHAN_NO_PARCEL": 1158,
            "SPATIAL_SINGLE_PARCEL": 234977,
            "STACKED_PARCEL_GROUP": 34246,
        })
        self.assertEqual(footprint["duplicateSourceIds"], {"globalId": 0, "objectId": 0, "outlineId": 0})
        self.assertTrue(LINKAGE["no_silent_winner"])
        self.assertEqual(LINKAGE["ambiguous_footprints_have_selected_apn"], 0)

    def test_structure_concepts_never_collapse(self):
        concepts = {row["key"]: row for row in load("concepts.json")["concepts"]}
        self.assertTrue(concepts["living_area"]["available"])
        self.assertFalse(concepts["gross_floor_area"]["available"])
        self.assertEqual(concepts["gross_floor_area"]["finding"], "FAR_NUMERATOR_NOT_YET_AVAILABLE")
        self.assertIn("gross_floor_area", concepts["living_area"]["not_equivalent_to"])
        self.assertIn("living_area", concepts["building_footprint_area"]["not_equivalent_to"])
        self.assertFalse(concepts["structure_height"]["available"])
        self.assertFalse(concepts["story_count"]["available"])

    def test_zero_null_failure_and_no_record_are_distinct(self):
        row = {"apn": "0000000000", "objectid": "1", "unitqty": "0", "total_lvg_area": "0"}
        summary = {"apn": row["apn"], "footprint_state": "NO_FOOTPRINT_RECORD", "direct_source_object_ids": [], "stack_group_source_object_ids": [], "ambiguous_source_object_ids": []}
        result = resolver.resolve_parcel(row, summary, {})
        facts = {fact["fact_key"]: fact for fact in result["facts"]}
        self.assertEqual(facts["assessor_dwelling_unit_count"]["fact_state"], "unknown")
        self.assertEqual(facts["assessor_dwelling_unit_count"]["state_reason"], "SOURCE_ZERO_UNRESOLVED")
        self.assertIsNone(facts["assessor_dwelling_unit_count"]["value"])
        self.assertEqual(facts["assessor_total_living_area_sq_ft"]["state_reason"], "SOURCE_ZERO_UNRESOLVED")
        self.assertIsNone(result["footprint_linkage"]["vacancy_conclusion"])
        capped = resolver.assessor_living_area_fact(row["apn"], 1, "99999")
        self.assertEqual(capped["state_reason"], "SOURCE_LIMIT_VALUE_UNRESOLVED")
        self.assertIsNone(capped["value"])
        no_record = resolver.resolve_parcel(None, {"apn": row["apn"]}, {})
        self.assertTrue(all(f["state_reason"] == "NO_SOURCE_RECORD" for f in no_record["facts"]))
        failed = resolver.resolve_parcel(row, summary, {}, source_available=False)
        self.assertTrue(all(f["source_state"] == "source_unavailable" for f in failed["facts"]))

    def test_schema_aligns_with_parcel_truth_vocabulary(self):
        source = (ROOT / "lib/parcel-truth.ts").read_text()
        for state in SCHEMA["fact_states"]:
            self.assertIn(f'"{state}"', source)
        for state in SCHEMA["source_states"]:
            self.assertIn(f'"{state}"', source)
        for derivation in SCHEMA["derivation_classes"]:
            self.assertIn(f'"{derivation}"', source)
        required = set(SCHEMA["fact_required_fields"])
        for result in RESULTS.values():
            for fact in result["parcel"]["facts"]:
                self.assertFalse(required - set(fact), fact["fact_key"])
                if fact["fact_state"] in {"unknown", "unavailable"}:
                    self.assertIsNone(fact["value"])

    def test_at_least_twenty_five_real_fixtures_cover_required_cases(self):
        self.assertEqual(FIXTURES["fixture_count"], 28)
        self.assertEqual(len({row["apn"] for row in FIXTURES["fixtures"]}), 28)
        tags = {tag for row in FIXTURES["fixtures"] for tag in row["coverage_tags"]}
        required = {
            "no_structure_record", "one_footprint", "multiple_footprints", "stack_condo", "rs_1_7",
            "inside_coastal_rs", "outside_coastal_rs", "unknown_coastal", "split_zone", "missing_address",
            "footprint_available", "area_semantically_unusable", "ambiguous_linkage",
        }
        self.assertFalse(required - tags)
        for row in RESULTS.values():
            self.assertEqual(row["fingerprint_sha256"], resolver.fingerprint({k: v for k, v in row.items() if k != "fingerprint_sha256"}))
            self.assertFalse(row["compliance_evaluated"])
            self.assertFalse(row["capacity_calculated"])

    def test_stack_and_ambiguous_records_are_not_promoted_to_apn_facts(self):
        for name in ["stack-a", "stack-b", "ambiguous-footprint-boundary", "ambiguous-footprint-missing-address"]:
            result = RESULTS[name]["parcel"]
            footprint_facts = [f for f in result["facts"] if f["fact_key"].startswith("historical_building_footprint")]
            self.assertEqual(footprint_facts, [])
            state = result["footprint_linkage"]["state"]
            self.assertTrue(state.startswith("STACKED_") or state == "AMBIGUOUS_ONLY")
        self.assertGreater(len(RESULTS["multiple-footprints"]["parcel"]["facts"]), 2)

    def test_packet14_readiness_integration(self):
        matrix = {row["rs_family"]: row for row in load("unlock-matrix.json")["rows"]}
        packet14 = {row["standard_family"]: row for row in json.loads((ROOT / "data/rs-parcel-condition-inputs-v0/dependency-matrix.json").read_text())["families"]}
        for family in ["structure_height_max", "floor_area_ratio_max", "lot_coverage_max", "building_spacing", "garage_regulations", "dwelling_unit_protection", "third_story_dimensions_max", "accessory_uses_structures"]:
            self.assertIn(family, packet14)
            self.assertIn(family, matrix)
        self.assertTrue(matrix["dwelling_unit_protection"]["available_now"])
        for family in ["structure_height_max", "floor_area_ratio_max", "lot_coverage_max", "building_spacing", "garage_regulations", "third_story_dimensions_max"]:
            self.assertFalse(matrix[family]["available_now"])

    def test_coverage_and_decision_are_bounded(self):
        self.assertEqual(COVERAGE["parcel_apns"], 393733)
        self.assertEqual(COVERAGE["assessor_dwelling_unit_count"], {"supported": 372314, "unknown": 21419})
        self.assertEqual(COVERAGE["assessor_total_living_area_sq_ft"], {"supported": 368171, "unknown": 25562})
        self.assertEqual(COVERAGE["parcels_with_supported_assessor_structure_fact"], 374090)
        self.assertEqual(COVERAGE["parcels_without_supported_assessor_structure_fact"], 19643)
        self.assertEqual(COVERAGE["vacancy_conclusions"], 0)
        decision = load("decision.json")
        self.assertEqual(decision["decision"], "STRUCTURE_FACTS_V0_READY_FOR_RULE_EVALUATION")
        self.assertEqual(decision["ready_rule_family"], "dwelling_unit_protection")
        self.assertEqual(decision["far_numerator"], "FAR_NUMERATOR_NOT_YET_AVAILABLE")
        for key in ["parcel_compliance_evaluated", "development_capacity_calculated", "production_runtime_wiring", "parcel_v1_modified"]:
            self.assertFalse(decision[key])

    def test_integrity_and_deterministic_rebuild(self):
        integrity = load("integrity.json")
        for name, digest in integrity["files"].items():
            self.assertEqual(sha(DATA / name), digest, name)
        self.assertEqual(RESULTS_FILE["canonical_output_sha256"], resolver.fingerprint(RESULTS_FILE["results"]))
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory) / "data"
            facts = Path(directory) / "parcel-structure-facts.ndjson.gz"
            builder.build(out, facts)
            for name in builder.GENERATED:
                self.assertEqual((DATA / name).read_bytes(), (out / name).read_bytes(), name)
            self.assertEqual(load("fingerprints.json")["structure_fact_outputs_sha256"], json.loads((out / "fingerprints.json").read_text())["structure_fact_outputs_sha256"])


if __name__ == "__main__":
    unittest.main(verbosity=2)

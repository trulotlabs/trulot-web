#!/usr/bin/env python3
from __future__ import annotations

import json
import unittest

from build import (COMPARISON_SCOPES, CONTEXT_STATES, EVIDENCE_TYPES, ELIGIBILITY_STATES,
                   ITEM_KINDS, OUTPUT, PROJECT_STATUS_CODES, REGULATORY_USE_STATES,
                   SECTIONS, TEMPLATES, VERIFICATION_STATES, build_outputs)
from resolver import CONTRACT_VERSION, map_state, overall_state, render

REPLAYS = ["public-rs-replay.json", "public-rm-replay.json", "private-project-replay.json", "blocked-project-replay.json"]


class Packet60DSemanticContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()

    def item(self, replay, item_id):
        return next(item for item in self.outputs[replay]["items"] if item["item_id"] == item_id)

    def test_contract_is_materially_versioned(self):
        self.assertEqual(CONTRACT_VERSION, "bounded-feasibility-product-contract-v2-2026-10-02-p60d")
        for name, value in self.outputs.items():
            self.assertEqual(value["properties"]["contract_version"]["const"] if name == "schema.json" else value["contract_version"], CONTRACT_VERSION)

    def test_closed_taxonomies_and_no_producer_semantics(self):
        schema = self.outputs["schema.json"]
        item = schema["definitions"]["item"]["properties"]
        self.assertEqual(item["item_kind"]["enum"], ITEM_KINDS)
        self.assertEqual(item["section"]["enum"], SECTIONS)
        self.assertEqual(item["comparison_scope"]["enum"], COMPARISON_SCOPES + [None])
        self.assertEqual(item["context_state"]["enum"], CONTEXT_STATES + [None])
        self.assertEqual(item["verification_state"]["enum"], VERIFICATION_STATES + [None])
        self.assertEqual(item["eligibility_state"]["enum"], ELIGIBILITY_STATES + [None])
        self.assertEqual(item["regulatory_use_state"]["enum"], REGULATORY_USE_STATES + [None])
        self.assertEqual(schema["definitions"]["projectContext"]["properties"]["status_code"]["enum"], PROJECT_STATUS_CODES)
        self.assertEqual(schema["definitions"]["evidenceEntry"]["properties"]["type"]["enum"], EVIDENCE_TYPES)
        self.assertNotIn("state_label", item)
        self.assertNotIn("summary_entries", item)

    def test_state_mapping_remains_conservative(self):
        self.assertEqual(map_state("RULE_REQUIREMENT_SATISFIED"), "MEETS_BASE_RULE")
        self.assertEqual(overall_state(["MEETS_BASE_RULE", "NEEDS_EVIDENCE"]), "PARTIAL_EVALUATION")
        with self.assertRaises(ValueError): map_state("UNCONTROLLED_NEW_STATE")

    def test_schema_shape_and_templates(self):
        schema = self.outputs["schema.json"]
        for name in REPLAYS:
            replay = self.outputs[name]
            self.assertEqual(set(replay), set(schema["required"]), name)
            for item in replay["items"]:
                self.assertEqual(set(item), set(schema["definitions"]["item"]["required"]))
                self.assertEqual(TEMPLATES[item["template_key"]].format(**item["template_values"]), item["answer"])
                self.assertTrue(item["evidence_entries"])
        self.assertEqual(render("NOT_APPLICABLE", {}), "This rule does not apply to this parcel.")

    def test_precision_context_and_failure_support(self):
        rear = self.item("public-rs-replay.json", "RS17_REAR")
        self.assertEqual(rear["precision"], {"exact_value": 23.502, "display_value": 23.5, "decimal_places": 1, "unit": "ft"})
        sda = self.item("public-rm-replay.json", "RM25_SDA")
        self.assertEqual((sda["mapped_observation"], sda["verification_state"], sda["eligibility_state"], sda["regulatory_use_state"]), (True, "PENDING", "NOT_EVALUATED", "NOT_USED_PENDING_VERIFICATION"))
        self.assertIn("DOES_NOT_MEET_BASE_RULE", self.outputs["summary-contract.json"]["groups"])

    def test_private_scope_and_project_status(self):
        private = self.outputs["private-project-replay.json"]
        self.assertEqual(private["project_context"]["status_code"], "SUBMITTAL_ISSUANCE_NOT_PROVEN")
        self.assertEqual(private["project_context"]["application_date"], "2024-01-29")
        self.assertEqual(private["items"][0]["comparison_scope"], "THIS_DIMENSION_ONLY")
        for name in ("private-project-replay.json", "blocked-project-replay.json"):
            self.assertEqual(self.outputs[name]["privacy"], "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX")
            self.assertIsNotNone(self.outputs[name]["project_context"])

    def test_public_private_boundary_and_dates(self):
        for name in ("public-rs-replay.json", "public-rm-replay.json"):
            replay = self.outputs[name]
            self.assertEqual(replay["privacy"], "PUBLIC")
            self.assertIsNone(replay["project_context"])
            self.assertNotRegex(json.dumps(replay), r"PRJ-|PRIVATE_AUTHORIZED|private plan|/Users/")
        mapping = [entry for item in self.outputs["public-rm-replay.json"]["items"] for entry in item["evidence_entries"] if entry["type"] in {"PUBLIC_MAPPING", "MAPPING_OBSERVATION"}]
        self.assertTrue(mapping and all(entry["source_date"] for entry in mapping))

    def test_language_decision_and_integrity(self):
        public_copy = json.dumps([self.outputs["public-rs-replay.json"], self.outputs["public-rm-replay.json"]])
        self.assertNotRegex(public_copy, r"(?i)not provided in this replay|raw acquisition|unit band")
        self.assertIn("applicable RS lot-area band and any steep-hillside rule", public_copy)
        self.assertEqual(self.outputs["decision.json"]["readiness"], "FEASIBILITY_CONTRACT_SEMANTICALLY_ENFORCED_AND_INTEGRATION_SAFE")
        self.assertEqual(self.outputs["decision.json"]["next"], "NEXT_FEASIBILITY_STEP: final external verification")
        self.assertEqual(build_outputs(), build_outputs())
        for name, value in self.outputs.items(): self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)

    def test_no_secret_or_production_material(self):
        serialized = json.dumps(self.outputs)
        self.assertNotIn("/Users/", serialized)
        self.assertNotRegex(serialized, r"(?i)password|service_role|postgresql://")
        self.assertFalse(self.outputs["provenance.json"]["production_access"])


if __name__ == "__main__":
    unittest.main(verbosity=2)

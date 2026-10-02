#!/usr/bin/env python3
from __future__ import annotations

import json
import unittest

from build import (
    COMPARISON_SCOPES,
    CONTEXT_STATES,
    EVIDENCE_TYPES,
    ITEM_KINDS,
    OUTPUT,
    SECTIONS,
    SUMMARY_GROUPS,
    TEMPLATES,
    build_outputs,
)
from resolver import CONTRACT_VERSION, PRODUCT_STATES, map_state, overall_state, render


REPLAYS = ["public-rs-replay.json", "public-rm-replay.json", "private-project-replay.json", "blocked-project-replay.json"]


class Packet59CorrectedContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()

    def item(self, replay: str, item_id: str):
        return next(item for item in self.outputs[replay]["items"] if item["item_id"] == item_id)

    def test_contract_is_materially_versioned(self):
        self.assertEqual(CONTRACT_VERSION, "bounded-feasibility-product-contract-v1-2026-10-02-p60c")
        for name, value in self.outputs.items():
            if name == "schema.json":
                self.assertEqual(value["properties"]["contract_version"]["const"], CONTRACT_VERSION)
            else:
                self.assertEqual(value["contract_version"], CONTRACT_VERSION)

    def test_taxonomies_are_closed(self):
        schema = self.outputs["schema.json"]
        item = schema["definitions"]["item"]["properties"]
        self.assertEqual(item["item_kind"]["enum"], ITEM_KINDS)
        self.assertEqual(item["section"]["enum"], SECTIONS)
        self.assertEqual(item["comparison_scope"]["enum"], COMPARISON_SCOPES + [None])
        self.assertEqual(item["context_state"]["enum"], CONTEXT_STATES + [None])
        self.assertEqual(schema["definitions"]["summaryEntry"]["properties"]["group"]["enum"], SUMMARY_GROUPS)
        self.assertEqual(schema["definitions"]["evidenceEntry"]["properties"]["type"]["enum"], EVIDENCE_TYPES)
        self.assertEqual(set(item["template_key"]["enum"]), set(TEMPLATES))

    def test_state_mapping_remains_conservative(self):
        self.assertEqual(map_state("RULE_REQUIREMENT_SATISFIED"), "MEETS_BASE_RULE")
        self.assertEqual(map_state("STREET_SIDE_SETBACK_NOT_APPLICABLE"), "NOT_APPLICABLE")
        self.assertEqual(overall_state(["MEETS_BASE_RULE", "NEEDS_EVIDENCE"]), "PARTIAL_EVALUATION")
        self.assertNotIn("LIKELY", json.dumps(self.outputs["states.json"]))
        with self.assertRaises(ValueError):
            map_state("UNCONTROLLED_NEW_STATE")

    def test_schema_required_fields_exist_in_every_replay(self):
        schema = self.outputs["schema.json"]
        top_required = schema["required"]
        item_required = schema["definitions"]["item"]["required"]
        for name in REPLAYS:
            replay = self.outputs[name]
            self.assertEqual(set(replay), set(top_required), name)
            for item in replay["items"]:
                self.assertEqual(set(item), set(item_required), f"{name}:{item['item_id']}")
                self.assertGreaterEqual(len(item["evidence_entries"]), 1)

    def test_templates_reproduce_every_stored_answer(self):
        for name in REPLAYS:
            for item in self.outputs[name]["items"]:
                template = TEMPLATES[item["template_key"]]
                self.assertEqual(template.format(**item["template_values"]), item["answer"])
        self.assertEqual(render("NOT_APPLICABLE", {}), "This rule does not apply to this parcel.")

    def test_rs_semantics_are_corrected(self):
        replay = self.outputs["public-rs-replay.json"]
        street = self.item("public-rs-replay.json", "RS17_STREET_SIDE")
        rear = self.item("public-rs-replay.json", "RS17_REAR")
        self.assertEqual(street["result_state"], "NOT_APPLICABLE")
        self.assertEqual(street["summary_entries"], [{"group": "NOT_APPLICABLE", "label": "Street-side setback"}])
        self.assertEqual(rear["base_requirement"], "13 ft")
        self.assertEqual(rear["derived_requirement"], "23.5 ft")
        self.assertEqual(rear["exact_calculation"], "235.02 ft lot depth × 10% = 23.502 ft")
        summary_groups = [entry["group"] for item in replay["items"] for entry in item["summary_entries"]]
        self.assertNotIn("MEETS_BASE_RULE", [entry["group"] for entry in street["summary_entries"]])
        self.assertIn("NOT_APPLICABLE", summary_groups)

    def test_rm_facts_contexts_and_rules_are_distinct(self):
        zone = self.item("public-rm-replay.json", "RM25_ZONE")
        sda = self.item("public-rm-replay.json", "RM25_SDA")
        fire = self.item("public-rm-replay.json", "RM25_FIRE")
        self.assertEqual((zone["item_kind"], zone["result_state"]), ("FACT", None))
        for context in (sda, fire):
            self.assertEqual(context["item_kind"], "CONTEXT")
            self.assertNotIn("MEETS_BASE_RULE", [entry["group"] for entry in context["summary_entries"]])
        self.assertEqual(sda["context_state"], "MAPPED_VERIFICATION_PENDING")
        self.assertEqual(sda["regulatory_use_state"], "Not used pending verification")
        self.assertEqual(self.item("public-rm-replay.json", "RM25_BASE_HEIGHT")["result_state"], "CONDITIONAL")
        self.assertEqual(self.item("public-rm-replay.json", "RM25_PROJECT_HEIGHT")["result_state"], "NOT_EVALUATED")

    def test_private_status_and_comparison_scope_are_payload_data(self):
        replay = self.outputs["private-project-replay.json"]
        project = replay["project_context"]
        self.assertEqual(project["project_id"], "PRJ-1111087")
        self.assertEqual(project["application_date"], "January 29, 2024")
        self.assertIn("Ordinance O-21618", project["code_profile"])
        self.assertEqual(replay["items"][0]["comparison_scope"], "THIS_DIMENSION_ONLY")
        self.assertEqual(replay["privacy"], "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX")

    def test_blocked_replay_separates_base_rules_and_project_comparisons(self):
        replay = self.outputs["blocked-project-replay.json"]
        base = [item for item in replay["items"] if item["item_kind"] == "RULE"]
        comparisons = [item for item in replay["items"] if item["item_kind"] == "COMPARISON"]
        self.assertEqual({item["result_state"] for item in base}, {"CONDITIONAL"})
        self.assertEqual({item["result_state"] for item in comparisons}, {"NEEDS_EVIDENCE"})
        self.assertTrue(all(item["blocker"] for item in comparisons))

    def test_public_private_boundary(self):
        for name in ("public-rs-replay.json", "public-rm-replay.json"):
            replay = self.outputs[name]
            self.assertEqual(replay["privacy"], "PUBLIC")
            self.assertIsNone(replay["project_context"])
            serialized = json.dumps(replay)
            for marker in ("PRJ-", "PRIVATE_AUTHORIZED_EVIDENCE", "source_sha256", "/Users/"):
                self.assertNotIn(marker, serialized)
        for name in ("private-project-replay.json", "blocked-project-replay.json"):
            self.assertIsNotNone(self.outputs[name]["project_context"])
            self.assertEqual(self.outputs[name]["privacy"], "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX")

    def test_no_prohibited_claims_or_empty_evidence(self):
        deny = [text.lower() for text in self.outputs["prohibited-statements.json"]["denylist"]]
        for name in REPLAYS:
            for item in self.outputs[name]["items"]:
                text = f"{item['answer']} {item['explanation']}".lower()
                for claim in deny:
                    self.assertNotIn(claim.lower(), text)
                self.assertTrue(all(entry["label"].strip() and entry["value"].strip() for entry in item["evidence_entries"]))

    def test_decision_and_scope(self):
        self.assertIn("development capacity", self.outputs["scope.json"]["classifications"]["OUTSIDE_V0_SCOPE"])
        self.assertEqual(self.outputs["decision.json"]["readiness"], "FEASIBILITY_RENDERER_GENERIC_AND_INTEGRATION_SAFE")
        self.assertEqual(self.outputs["decision.json"]["next"], "NEXT_FEASIBILITY_STEP: final independent product verification")
        self.assertFalse(self.outputs["decision.json"]["production_wired"])

    def test_deterministic_rebuild_and_committed_outputs(self):
        self.assertEqual(build_outputs(), build_outputs())
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)

    def test_no_secret_or_production_material(self):
        serialized = json.dumps(self.outputs)
        self.assertNotIn("/Users/", serialized)
        self.assertNotRegex(serialized, r"(?i)password|service_role|postgresql://")
        self.assertFalse(self.outputs["provenance.json"]["production_access"])


if __name__ == "__main__":
    unittest.main(verbosity=2)

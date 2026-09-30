#!/usr/bin/env python3
import importlib.util
import pathlib
import unittest


MODULE = pathlib.Path(__file__).with_name("compare.py")
spec = importlib.util.spec_from_file_location("parcel_compare", MODULE)
parcel_compare = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(parcel_compare)


class ComparisonTests(unittest.TestCase):
    def test_set_accounting_and_hashes(self):
        result = parcel_compare.set_accounting(["0000000001", "0000000002"], ["0000000002", "0000000003"])
        self.assertEqual((result["intersection"], result["v1Only"], result["v2Only"]), (1, 1, 1))
        self.assertEqual(result["v1OnlyApns"], ["0000000001"])

    def test_apn_normalization_is_bounded(self):
        self.assertEqual(parcel_compare.canonical_apn("123-456-78-90"), "1234567890")
        self.assertIsNone(parcel_compare.canonical_apn("123456789"))
        self.assertIsNone(parcel_compare.canonical_apn("12345678901"))

    def test_address_comparison(self):
        self.assertEqual(parcel_compare.address_class("1 Main St.", "1 MAIN ST"), "NORMALIZED_MATCH")
        self.assertEqual(parcel_compare.address_class(None, "1 MAIN ST"), "V1_MISSING_V2_PRESENT")
        self.assertEqual(parcel_compare.address_class("1 MAIN ST", None), "V1_PRESENT_V2_MISSING")
        self.assertEqual(parcel_compare.address_class("1 MAIN ST", "2 MAIN ST"), "MATERIAL_DIFFERENCE")

    def test_chunks_are_complete_and_stable(self):
        values = [str(index) for index in range(11)]
        self.assertEqual([item for group in parcel_compare.chunks(values, 3) for item in group], values)
        self.assertEqual(len(list(parcel_compare.chunks(values, 3))), 4)
        with self.assertRaises(ValueError):
            list(parcel_compare.chunks(values, 0))

    def test_case_categorization_and_exact_bridge(self):
        v1 = {"0000000001": {"address": "1 Main St"}, "0000000002": {"address": "2 Main St"}}
        lineage = {"0000000001": {"parcelId": "10"}, "0000000002": {"parcelId": "20"}}
        make = lambda apn, parcel_id, address=None: {"row": {"apnNorm": apn, "parcelId": parcel_id, "address": address}}
        v2 = {"0000000002": make("0000000002", 20, "2 MAIN ST"), "0000000003": make("0000000003", 30), "0000000004": make("0000000004", 30)}
        parcel_ids = {"20": ["0000000002"], "30": ["0000000003", "0000000004"]}
        quarantine = [{"row": {"apnNorm": "0000000001", "jurisdiction": "SD"}, "reasons": ["INVALID_GEOMETRY"]}]
        result = parcel_compare.compare(v1, lineage, v2, parcel_ids, quarantine, chunk_size=1)
        self.assertEqual(result["v2OnlyCategories"], {"STACKED_OR_REPEATED_PARCEL_ID": 2})
        self.assertEqual(result["v1OnlyCategories"], {"V2_QUARANTINE_EXCLUSION": 1})
        self.assertEqual(result["bridge"]["v2"], 3)
        self.assertEqual(result["bridge"]["balance"], 0)

    def test_bridge_rejects_unreconciled_counts(self):
        with self.assertRaises(ValueError):
            parcel_compare.bridge(10, {"added": 2}, {"removed": 1}, 12)


if __name__ == "__main__":
    unittest.main()

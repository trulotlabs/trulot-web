"""Offline strict-parser and original geometry rejection regressions."""
import copy
import importlib.util
import io
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('stream', ROOT / 'scripts/sangis-acquisition-stream.py')
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)


class StreamTests(unittest.TestCase):
    def parse(self, text):
        return list(s.features(io.StringIO(text)))

    def test_collection(self):
        self.assertEqual(self.parse('{"type":"FeatureCollection","features":[1,2]}'), [1, 2])

    def test_boundary(self):
        class Tiny(io.StringIO):
            def read(self, n=-1):
                return super().read(min(n, 2))
        self.assertEqual(list(s.features(Tiny('{"type":"FeatureCollection","features":[12345]}'))), [12345])

    def test_bad_json(self):
        cases = [
            '{"type":"FeatureCollection","features":[1',
            '{"type":"FeatureCollection","features":[]}garbage',
            '{"type":"FeatureCollection","type":"FeatureCollection","features":[]}',
            '{"type":"FeatureCollection","features":[],"features":[]}',
            '{"type":"FeatureCollection","features":[{"a":1,"a":2}]}',
            '{"type":"FeatureCollection","features":[NaN]}',
            '{"type":"Polygon","features":[]}',
            '{"type":"FeatureCollection"}',
            '{"type":"FeatureCollection","features":[],"fixtureOnly":true}',
            '{"type":"FeatureCollection","features":[],"crs":{"properties":{"name":"EPSG:2230"}}}',
        ]
        for text in cases:
            with self.subTest(text=text), self.assertRaises(ValueError):
                self.parse(text)

    def test_raw_geometry_not_repaired(self):
        fixture = json.loads((ROOT / 'data/parcel-base-v2/golden-fixture.json').read_text())
        feature = copy.deepcopy(fixture['featureCollection']['features'][0])
        self.assertNotIn('error', s.analyze(feature)['geometry'])
        feature['geometry']['coordinates'][0] = feature['geometry']['coordinates'][0][:-1]
        before = copy.deepcopy(feature)
        self.assertEqual(s.analyze(feature)['geometry']['error'], 'UNCLOSED_OR_SHORT_RING')
        self.assertEqual(feature, before)

    def test_null_and_z_rejected(self):
        fixture = json.loads((ROOT / 'data/parcel-base-v2/golden-fixture.json').read_text())
        feature = copy.deepcopy(fixture['featureCollection']['features'][0])
        for pt in feature['geometry']['coordinates'][0]:
            pt.append(0)
        self.assertIn('error', s.analyze(feature)['geometry'])
        feature['geometry'] = None
        self.assertIn('error', s.analyze(feature)['geometry'])

    def test_extra_fields_excluded(self):
        fixture = json.loads((ROOT / 'data/parcel-base-v2/golden-fixture.json').read_text())
        feature = copy.deepcopy(fixture['featureCollection']['features'][0])
        feature['properties']['bedrooms'] = '3'
        row = s.analyze(feature)
        self.assertNotIn('bedrooms', row['properties'])
        self.assertIn('bedrooms', row['extraFields'])

    def test_malformed_feature_cannot_be_skipped(self):
        with self.assertRaises(ValueError):
            s.analyze({'type': 'Feature', 'properties': None})


if __name__ == '__main__':
    unittest.main()

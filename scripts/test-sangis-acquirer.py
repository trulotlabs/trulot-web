"""Exercise the complete downloader with an in-memory public-service stub; no network."""
import contextlib
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('acquirer', pathlib.Path(__file__).with_name('acquire-sangis-parcels.py'))
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)


class AcquirerTests(unittest.TestCase):
    def test_urls_and_export_semantics(self):
        for bad in ['http://geo.sandag.org/a', 'https://example.com/a', 'https://user:secret@geo.sandag.org/a']:
            with self.assertRaises(ValueError):
                a.public_url(bad)
        params = a.export_parameters('test')
        self.assertEqual(params['syncModel'], 'none')
        self.assertEqual(params['replicaSR'], '4326')
        self.assertNotIn('returnZ', params)
        self.assertEqual(json.loads(params['layerQueries']), {'0': {'queryOption': 'all', 'useGeometry': False, 'includeRelated': False}})

    def run_export(self, changed=False):
        calls = []
        layer = {'id': 0, 'name': 'Parcels', 'serviceItemId': a.ITEM, 'extent': {'spatialReference': {'latestWkid': 2230}},
                 'geometryType': 'esriGeometryPolygon', 'editingInfo': {'lastEditDate': 1788361855582}, 'fields': []}
        item = {'id': a.ITEM, 'owner': 'SanGIS', 'url': a.BASE}
        xml = b'<metadata><dataIdInfo><idCitation><resTitle>PARCELS_ALL</resTitle></idCitation></dataIdInfo></metadata>'
        artifact = b'{"type":"FeatureCollection","features":[]}'
        status_calls = 0
        count_calls = 0

        def request(req, **kwargs):
            nonlocal status_calls, count_calls
            url = req.full_url if hasattr(req, 'full_url') else req
            calls.append(req)
            if '/query?' in url:
                if 'returnIdsOnly' in url:
                    body = {'objectIds': [1]}
                else:
                    count_calls += 1
                    body = {'count': 2 if changed and count_calls > 1 else 1}
            elif url.endswith('/createReplica'):
                self.assertEqual(req.data.decode().count('syncModel=none'), 1)
                body = {'statusUrl': 'https://geo.sandag.org/status/job'}
            elif '/status/job' in url:
                status_calls += 1
                body = {'status': 'ExportingData', 'resultUrl': ''} if status_calls == 1 else {'status': 'Completed', 'resultUrl': 'https://geo.sandag.org/output/test.geojson'}
            elif url.endswith('.geojson'):
                body = artifact
            elif url.endswith('/metadata'):
                body = xml
            elif url == a.PDF:
                body = b'%PDF-stub'
            elif '/content/items/' in url:
                body = item
            elif url.startswith(a.LAYER + '?'):
                body = layer
            else:
                body = {'capabilities': 'Query,Extract', 'supportsSyncModelNone': True}
            payload = body if isinstance(body, bytes) else json.dumps(body).encode()
            response = io.BytesIO(payload)
            response.headers = {'Content-Length': str(len(payload))}
            response.url = url
            return response

        with tempfile.TemporaryDirectory() as tmp:
            output = pathlib.Path(tmp) / 'test-acquisition'
            with patch.object(a.urllib.request, 'urlopen', request), patch.object(a.time, 'sleep'), patch.object(a.shutil, 'which', return_value=None), contextlib.redirect_stdout(io.StringIO()):
                if changed:
                    with self.assertRaisesRegex(ValueError, 'Source changed'):
                        a.acquire(str(output))
                    self.assertFalse((output / 'acquisition.json').exists())
                else:
                    a.acquire(str(output))
                    receipt = json.loads((output / 'acquisition.json').read_text())
                    self.assertEqual(receipt['receipt']['byteSize'], len(artifact))
                    self.assertIsNone(receipt['receipt']['sourceReported']['warehouseUpload']['value'])
                    self.assertEqual(receipt['receipt']['contentSha256'], a.digest(output / 'test.geojson'))
                    self.assertEqual(sum(hasattr(req, 'data') and req.data is not None for req in calls), 1)
                    self.assertEqual(status_calls, 2)
                    with self.assertRaises(FileExistsError):
                        a.acquire(str(output))

    def test_complete_stub_export_and_no_overwrite(self):
        self.run_export()

    def test_source_changes_fail_closed(self):
        self.run_export(changed=True)


if __name__ == '__main__':
    unittest.main()

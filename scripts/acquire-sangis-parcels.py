"""Public SanGIS complete export. No credentials, DB, edits, or synchronized replica.

Usage: python3 scripts/acquire-sangis-parcels.py NEW_ABSOLUTE_DIRECTORY
A fresh directory is mandatory. Failed/incomplete runs are retained and never reused.
Run verify-sangis-acquisition.mjs and two offline rehearsals before claiming success.
"""
import datetime as dt
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

BASE = 'https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer'
LAYER = BASE + '/0'
ITEM = '032a5dcf654c4ccbb18711ad8a0ee754'
PDF = 'https://gis.sangis.org/Documents/download/Layer_Update_Report.pdf'
TERMS = 'https://gis.sangis.org/sanportal/apps/storymaps/stories/d26146d84e834ff6bcd58e4e620a983a'
ROOT = pathlib.Path(__file__).resolve().parent.parent


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def public_url(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname not in ('geo.sandag.org', 'gis.sangis.org') or parsed.username or parsed.password:
        raise ValueError('Unexpected source/export URL')
    return url


def export_parameters(acquisition_id):
    return {'f': 'json', 'replicaName': acquisition_id, 'layers': '0',
            'layerQueries': json.dumps({'0': {'queryOption': 'all', 'useGeometry': False, 'includeRelated': False}}, separators=(',', ':')),
            'syncModel': 'none', 'dataFormat': 'geojson', 'replicaSR': '4326',
            'transportType': 'esriTransportTypeURL', 'returnAttachments': 'false', 'async': 'true'}


def acquire(destination):
    output = pathlib.Path(destination)
    if not output.is_absolute():
        raise ValueError('Absolute external directory required')
    output = output.resolve()
    if output == ROOT or ROOT in output.parents or not re.fullmatch(r'[A-Za-z0-9_-]+', output.name):
        raise ValueError('Use a new directory outside this repository with a simple acquisition ID')
    output.mkdir(parents=True, exist_ok=False)

    def write(name, value):
        with (output / name).open('x') as file:
            json.dump(value, file, indent=2)
            file.write('\n')

    def capture(name, url, parameters=None):
        # POST occurs exactly once: retry only idempotent GET metadata/status requests.
        attempts = 1 if parameters is not None else 3
        for attempt in range(attempts):
            try:
                req = urllib.request.Request(public_url(url), data=urllib.parse.urlencode(parameters).encode() if parameters is not None else None,
                                             headers={'User-Agent': 'TruLot-SanGIS-Acquisition/1.0'})
                with urllib.request.urlopen(req, timeout=120) as response:
                    public_url(response.url)
                    body = response.read()
                    headers = dict(response.headers)
                break
            except OSError:
                if attempt == attempts - 1:
                    raise
                time.sleep(2 ** attempt)
        with (output / name).open('xb') as file:
            file.write(body)
        write(name + '.http.json', {'url': url, 'capturedAt': now(), 'headers': headers})
        if name.endswith('.json'):
            value = json.loads(body)
            if 'error' in value:
                raise ValueError(value['error'])
            return value
        return body

    layer = capture('before-layer.json', LAYER + '?f=pjson')
    item = capture('before-item.json', 'https://geo.sandag.org/portal/sharing/rest/content/items/' + ITEM + '?f=pjson')
    service = capture('before-service.json', BASE + '?f=pjson')
    metadata = capture('before-metadata.xml', LAYER + '/metadata')
    xml = ET.fromstring(metadata)
    if not (layer['id'] == 0 and layer['name'] == 'Parcels' and layer['serviceItemId'] == ITEM and item['id'] == ITEM
            and item['owner'] == 'SanGIS' and item['url'] == BASE and xml.findtext('./dataIdInfo/idCitation/resTitle') == 'PARCELS_ALL'
            and layer['extent']['spatialReference']['latestWkid'] == 2230 and layer['geometryType'] == 'esriGeometryPolygon'
            and 'Extract' in service['capabilities'].split(',') and service['supportsSyncModelNone']):
        raise ValueError('Authoritative source identity or export support changed; stop')
    count = capture('before-count.json', LAYER + '/query?f=json&where=1%3D1&returnCountOnly=true')['count']
    ids = capture('source-objectids.json', LAYER + '/query?f=json&where=1%3D1&returnIdsOnly=true')['objectIds']
    if count <= 0 or len(ids) != count or len(set(ids)) != count:
        raise ValueError('Source ID inventory/count mismatch')
    capture('warehouse-layer-updates.pdf', PDF)
    warehouse = None
    if shutil.which('pdftotext'):
        text = subprocess.check_output(['pdftotext', '-layout', str(output / 'warehouse-layer-updates.pdf'), '-'], text=True)
        dates = [m.group(1) for line in text.splitlines() if (m := re.match(r'^\s*Parcels\s+.*?\s(\d{1,2}/\d{1,2}/\d{4})\s*$', line))]
        if len(dates) == 1:
            warehouse = dt.datetime.strptime(dates[0], '%m/%d/%Y').date().isoformat()
    parameters = export_parameters(output.name)
    request = {'acquisitionId': output.name, 'startedAt': now(), 'url': BASE + '/createReplica', 'method': 'POST', 'parameters': parameters}
    write('export-request.json', request)
    response = capture('export-response.json', request['url'], parameters)
    status_url = public_url(response['statusUrl'])
    for index in range(240):
        status = capture(f'export-status-{index:03d}.json', status_url + '?f=json')
        if any(word in status.get('status', '').lower() for word in ('fail', 'error')):
            raise ValueError('Source export failed: ' + str(status))
        artifact_url = status.get('resultUrl') or status.get('URL')
        if artifact_url:
            break
        time.sleep(15)
    else:
        raise TimeoutError('Source export did not complete; preserve job evidence, do not skip')
    public_url(artifact_url)
    filename = pathlib.PurePosixPath(urllib.parse.urlparse(artifact_url).path).name
    if not re.fullmatch(r'[A-Za-z0-9._-]+\.geojson', filename):
        raise ValueError('Unexpected export filename/type')
    size = 0
    with urllib.request.urlopen(artifact_url, timeout=120) as response, (output / filename).open('xb') as file:
        public_url(response.url)
        headers = dict(response.headers)
        while chunk := response.read(1024 * 1024):
            file.write(chunk)
            size += len(chunk)
    if size <= 0 or (headers.get('Content-Length') and size != int(headers['Content-Length'])):
        raise ValueError('Truncated export')
    download = {'path': filename, 'downloadUrl': artifact_url, 'byteSize': size, 'sha256': digest(output / filename), 'acquiredAt': now(), 'http': headers}
    write('download.json', download)
    after = capture('after-layer.json', LAYER + '?f=pjson')
    after_count = capture('after-count.json', LAYER + '/query?f=json&where=1%3D1&returnCountOnly=true')['count']
    if after_count != count or after['editingInfo'] != layer['editingInfo'] or after['fields'] != layer['fields']:
        raise ValueError('Source changed during export; snapshot cannot pass')
    currency = xml.findtext('./dataIdInfo/dataExt/tempEle/TempExtent/exTemp/TM_Instant/tmPosition')
    edit = layer.get('editingInfo', {}).get('lastEditDate')
    modified = dt.datetime.fromtimestamp(edit / 1000, dt.timezone.utc).isoformat() if edit is not None else None
    receipt = {'schemaVersion': 1, 'datasetId': 'parcel_base_sangis_v2', 'evidenceKind': 'acquired-source', 'publisher': 'SanGIS',
               'sourceUrl': LAYER, 'metadataUrl': LAYER + '/metadata', 'acquiredAt': download['acquiredAt'],
               'sourceReported': {'warehouseUpload': {'value': warehouse, 'evidenceUrl': PDF if warehouse else None},
                                  'serviceModified': {'value': modified, 'evidenceUrl': LAYER if modified else None},
                                  'currency': {'value': currency, 'basis': 'metadata-temporal-extent' if currency else 'unknown',
                                               'evidenceUrl': LAYER + '/metadata' if currency else None,
                                               'fieldLocator': 'metadata/dataIdInfo/dataExt/tempEle/TempExtent/exTemp/TM_Instant/tmPosition' if currency else None}},
               'metadataContentSha256': hashlib.sha256(metadata).hexdigest(), 'contentSha256': download['sha256'], 'byteSize': size,
               'originalFilename': filename, 'mediaType': 'application/geo+json', 'acquisitionMethod': 'public-service-export',
               'licenseUseNote': 'Captured before-item.json licenseInfo applies; derived products are not original SanGIS data. Terms: ' + TERMS,
               'operatorToolVersion': 'Python ' + sys.version.split()[0] + ' urllib; executed-acquire.py',
               'nativeSourceCrs': 'EPSG:2230', 'artifactCrs': 'EPSG:4326', 'request': {'outSR': 4326, 'returnZ': None, 'scope': 'countywide-snapshot'}}
    shutil.copyfile(__file__, output / 'executed-acquire.py')
    files = [{'path': f.name, 'byteSize': f.stat().st_size, 'sha256': digest(f)} for f in sorted(output.iterdir()) if f.is_file()]
    aggregate = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    write('acquisition.json', {'schemaVersion': 1, 'acquisitionId': output.name, 'artifactPathIdentifier': str(output), 'receipt': receipt,
                             'sourceFeatureCount': count, 'sourceItemId': ITEM, 'sourceLayerId': 0, 'exportRequest': request,
                             'exportResult': download, 'sourceStableAcrossExport': True, 'files': files, 'aggregateSha256': aggregate})
    for file in output.iterdir():
        file.chmod(0o444)
    print('Captured immutable artifact/receipt:', output, '— full offline verification still required.')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    acquire(sys.argv[1])

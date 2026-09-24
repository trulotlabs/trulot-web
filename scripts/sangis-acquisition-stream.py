"""Read an immutable GeoJSON stream and reuse Packet 5 geometry validation. No network/DB."""
import concurrent.futures
from collections import deque
import hashlib
import importlib.util
import json
import pathlib
import sys

import pyproj
import shapely
from shapely.geometry import shape
from pyproj import Transformer, network

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('packet5_geometry', ROOT / 'scripts/parcel-base-v2-geometry.py')
packet5 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packet5)
network.set_network_enabled(False)
CONTRACT = json.loads((ROOT / 'data/parcel-base-v2/import-contract.json').read_text())
FORWARD = Transformer.from_crs(4326, 2230, always_xy=True, allow_ballpark=False)
BACKWARD = Transformer.from_crs(2230, 4326, always_xy=True, allow_ballpark=False)


def unique_object(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            raise ValueError('Duplicate JSON key: ' + key)
        obj[key] = value
    return obj


class JsonStream:
    def __init__(self, file):
        self.file = file
        self.buffer = ''
        self.eof = False
        self.decoder = json.JSONDecoder(object_pairs_hook=unique_object,
                                        parse_constant=lambda s: (_ for _ in ()).throw(ValueError('Nonfinite JSON number')))

    def fill(self):
        more = self.file.read(262144)
        self.buffer += more
        self.eof = not more
        if len(self.buffer) > 128 * 1024 * 1024:
            raise ValueError('Single JSON value exceeds bounded parser limit')

    def peek(self):
        self.buffer = self.buffer.lstrip()
        while not self.buffer and not self.eof:
            self.fill()
            self.buffer = self.buffer.lstrip()
        return self.buffer[:1]

    def punctuation(self, value):
        if self.peek() != value:
            raise ValueError('Expected JSON punctuation ' + value)
        self.buffer = self.buffer[1:]

    def value(self):
        self.peek()
        while True:
            try:
                value, end = self.decoder.raw_decode(self.buffer)
                # Avoid decoding a numeric token split at a chunk boundary.
                if end == len(self.buffer) and not self.eof:
                    self.fill()
                    continue
                self.buffer = self.buffer[end:]
                return value
            except json.JSONDecodeError:
                if self.eof:
                    raise
                self.fill()


def features(file):
    """Strict top-level FeatureCollection parser; does not pass geometry through GDAL repair."""
    stream = JsonStream(file)
    stream.punctuation('{')
    headers = {}
    first = True
    seen_features = False
    while stream.peek() != '}':
        if not first:
            stream.punctuation(',')
        first = False
        key = stream.value()
        if not isinstance(key, str) or key in headers:
            raise ValueError('Invalid or duplicate collection key')
        stream.punctuation(':')
        if key == 'features':
            if seen_features:
                raise ValueError('Duplicate features array')
            seen_features = True
            stream.punctuation('[')
            first_feature = True
            while stream.peek() != ']':
                if not first_feature:
                    stream.punctuation(',')
                first_feature = False
                yield stream.value()
            stream.punctuation(']')
            headers[key] = 'streamed'
        else:
            headers[key] = stream.value()
    stream.punctuation('}')
    if stream.peek() or headers.get('type') != 'FeatureCollection' or not seen_features:
        raise ValueError('Not exactly one complete FeatureCollection')
    if headers.get('fixtureOnly') is True:
        raise ValueError('Synthetic fixture cannot establish a real acquisition')
    crs = headers.get('crs')
    if crs and crs.get('properties', {}).get('name') not in ('urn:ogc:def:crs:OGC:1.3:CRS84', 'urn:ogc:def:crs:EPSG::4326', 'EPSG:4326'):
        raise ValueError('Unexpected acquired CRS')


def dimensionality(coords):
    if not isinstance(coords, list) or not coords:
        return set()
    if isinstance(coords[0], (float, int)):
        return {len(coords)}
    return set().union(*(dimensionality(c) for c in coords))


def analyze(feature):
    if not isinstance(feature, dict) or feature.get('type') != 'Feature' or not isinstance(feature.get('properties'), dict):
        raise ValueError('Malformed source feature; acquisition rehearsal cannot silently skip it')
    raw = feature.get('geometry')
    stat = {'type': raw.get('type', 'unknown') if isinstance(raw, dict) else 'null',
            'dimensions': sorted(dimensionality(raw.get('coordinates'))) if isinstance(raw, dict) else [],
            'parts': 0, 'holes': 0, 'topologyInvalid': False, 'geometryHash': None}
    if isinstance(raw, dict) and raw.get('type') in ('Polygon', 'MultiPolygon'):
        polygons = [raw['coordinates']] if raw['type'] == 'Polygon' else raw['coordinates']
        stat['parts'] = len(polygons)
        stat['holes'] = sum(max(0, len(p) - 1) for p in polygons)
        try:
            geom = shape(raw)
            stat['topologyInvalid'] = not geom.is_valid or geom.is_empty
            if geom.is_valid and not geom.is_empty:
                # Canonical WKB is for stacked-analysis identity only; source coordinates are never altered.
                stat['geometryHash'] = hashlib.sha256(shapely.normalize(geom).wkb).hexdigest()
        except (ValueError, TypeError, shapely.errors.GEOSException):
            stat['topologyInvalid'] = True
    geometry = packet5.validate(raw, CONTRACT, FORWARD, BACKWARD)
    props = feature['properties']
    selected = {key: value for key, value in props.items() if key in CONTRACT['sourceFields']}
    return {'properties': selected, 'extraFields': sorted(set(props) - set(selected)),
            'geometry': geometry, 'geometryStats': stat}


def batch_analyze(batch):
    return [analyze(feature) for feature in batch]


def batches(iterator, size=500):
    batch = []
    for item in iterator:
        batch.append(item)
        if len(batch) == size:
            yield batch
            batch = []
    if batch:
        yield batch


def main():
    file_path = pathlib.Path(sys.argv[1]).resolve()
    toolchain = {'shapely': shapely.__version__, 'geos': shapely.geos_version_string,
                 'pyproj': pyproj.__version__, 'proj': pyproj.proj_version_str}
    if toolchain != CONTRACT['toolchain']:
        raise ValueError('Packet 5 geometry toolchain mismatch')
    print(json.dumps({'kind': 'header', 'toolchain': toolchain}), flush=True)
    count = 0
    with file_path.open(encoding='utf-8-sig') as source, concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        pending = deque()
        for batch in batches(features(source)):
            pending.append(pool.submit(batch_analyze, batch))
            if len(pending) >= 8:
                for row in pending.popleft().result():
                    print(json.dumps({'kind': 'row', **row}, separators=(',', ':'), allow_nan=False))
                    count += 1
        while pending:
            for row in pending.popleft().result():
                print(json.dumps({'kind': 'row', **row}, separators=(',', ':'), allow_nan=False))
                count += 1
    # Force construction of deterministic selected pipelines for provenance, including an empty file.
    FORWARD.transform(-117.15, 32.72)
    BACKWARD.transform(6300000, 1800000)
    print(json.dumps({'kind': 'end', 'parsed': count, 'transformation': {
        'inputCrs': 'EPSG:4326', 'measurementCrs': 'EPSG:2230', 'network': False,
        'forward': FORWARD.definition, 'backward': BACKWARD.definition,
        'forwardAccuracyMeters': FORWARD.accuracy, 'backwardAccuracyMeters': BACKWARD.accuracy}}), flush=True)


if __name__ == '__main__':
    main()

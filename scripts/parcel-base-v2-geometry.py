"""Offline geometry proof for <=100 synthetic features; not a source importer."""
import json
import math
import sys
import shapely
from shapely.geometry import shape
from shapely.ops import transform
import pyproj
from pyproj import Transformer, network

network.set_network_enabled(False)


def positions(value):
    if not isinstance(value, list) or not value:
        raise ValueError('INVALID_COORDINATES')
    if isinstance(value[0], (float, int)):
        if len(value) != 2 or not all(type(v) in (int, float) and math.isfinite(v) for v in value):
            raise ValueError('NONFINITE_OR_NON_2D_COORDINATES')
        yield value
    else:
        for child in value:
            yield from positions(child)


def validate(raw, contract, forward, backward):
    try:
        if raw is None:
            return {'error': 'NULL_GEOMETRY'}
        if not isinstance(raw, dict) or raw.get('type') not in ('Polygon', 'MultiPolygon'):
            return {'error': 'NONPOLYGON_GEOMETRY'}
        coords = list(positions(raw.get('coordinates')))
        lo_x, lo_y, hi_x, hi_y = contract['regionalSanityBounds']
        if not all(lo_x <= x <= hi_x and lo_y <= y <= hi_y for x, y in coords):
            return {'error': 'OUTSIDE_REGIONAL_SANITY_BOUNDS'}
        polygons = [raw['coordinates']] if raw['type'] == 'Polygon' else raw['coordinates']
        for polygon in polygons:
            for ring in polygon:
                if len(ring) < 4 or ring[0] != ring[-1]:
                    return {'error': 'UNCLOSED_OR_SHORT_RING'}
        geom = shape(raw)
        if geom.is_empty or not geom.is_valid or geom.area <= 0:
            return {'error': 'INVALID_GEOMETRY'}
        projected = transform(forward.transform, geom)
        if projected.is_empty or not projected.is_valid or not math.isfinite(projected.area) or projected.area <= 0:
            return {'error': 'INVALID_PROJECTED_GEOMETRY'}
        centroid = projected.centroid
        point = projected.representative_point()
        if not projected.covers(point):
            return {'error': 'REPRESENTATIVE_POINT_INCONSISTENT'}
        lon, lat = backward.transform(centroid.x, centroid.y)
        p_lon, p_lat = backward.transform(point.x, point.y)
        if not all(math.isfinite(v) for v in (lon, lat, p_lon, p_lat)):
            return {'error': 'INVALID_DERIVED_COORDINATES'}
        # Verify round-trip of derived coordinates; centroid may legitimately lie outside a concave/multipart parcel.
        cx, cy = forward.transform(lon, lat)
        if math.hypot(cx - centroid.x, cy - centroid.y) > 0.01:
            return {'error': 'CENTROID_TRANSFORM_INCONSISTENT'}
        return {'approxGeometryAreaSqFt': round(projected.area, 6),
                'centroid': [round(lon, 9), round(lat, 9)],
                'centroidWithin': bool(projected.covers(centroid)),
                'pointOnSurface': [round(p_lon, 9), round(p_lat, 9)]}
    except (ValueError, TypeError, KeyError, shapely.errors.GEOSException):
        return {'error': 'INVALID_GEOMETRY'}


def main():
    payload = json.load(sys.stdin)
    contract = payload['contract']
    assert len(payload['geometries']) <= 100
    forward = Transformer.from_crs(4326, 2230, always_xy=True, allow_ballpark=False)
    backward = Transformer.from_crs(2230, 4326, always_xy=True, allow_ballpark=False)
    results = [validate(g, contract, forward, backward) for g in payload['geometries']]
    print(json.dumps({'results': results,
                     'toolchain': {'shapely': shapely.__version__, 'geos': shapely.geos_version_string,
                                   'pyproj': pyproj.__version__, 'proj': pyproj.proj_version_str},
                     'transformation': {'input': 'EPSG:4326', 'measurement': 'EPSG:2230',
                                        'alwaysXY': True, 'networkEnabled': False,
                                        'forwardDefinition': forward.definition,
                                        'backwardDefinition': backward.definition}}, allow_nan=False))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Rebuild the full offline footprint normalization and Parcel V2 linkage.

Requires the bundled workspace geospatial libraries and the sealed Packet 6
Parcel V2 source artifacts. It performs no network or database access.
"""
import collections
import gzip
import hashlib
import json
import os
import pathlib

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio
import shapely
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon

SOURCE = pathlib.Path('/Users/ops/trulot-data/structure-facts-v0/building-outlines-city-20260930T161931Z')
ROOT = pathlib.Path(os.environ.get('TRULOT_STRUCTURE_FACTS_OUTPUT', str(SOURCE)))
ROOT.mkdir(parents=True, exist_ok=True)
PARCEL_SOURCE = pathlib.Path('/Users/ops/trulot-data/parcel-base-v2/sangis-20260924T183743Z/_ags_GeoJson_EB07F5BCE8A34D208D2A6A7801151FB3.geojson')
PASS2 = pathlib.Path('/Users/ops/trulot-data/parcel-base-v2/sangis-20260924T183743Z-pass2/rows.ndjson.gz')

def signed_area(ring):
    return sum((x2 - x1) * (y2 + y1) for (x1, y1), (x2, y2) in zip(ring, ring[1:]))

def polygonal(geom):
    if geom.geom_type in ('Polygon', 'MultiPolygon'):
        return geom
    if geom.geom_type == 'GeometryCollection':
        parts = [g for g in geom.geoms if g.geom_type in ('Polygon', 'MultiPolygon')]
        return shapely.union_all(parts) if parts else Polygon()
    return Polygon()

def esri_polygon(rings):
    # Esri JSON exterior rings are clockwise. Attach counter-clockwise holes to
    # the smallest containing exterior; preserve disjoint exteriors.
    shells, holes = [], []
    for ring in rings:
        if len(ring) < 4:
            continue
        p = Polygon(ring)
        if p.is_empty or p.area == 0:
            continue
        (shells if signed_area(ring) > 0 else holes).append((ring, p))
    # Some services reverse the convention. Select the orientation with the
    # larger total area as exteriors if the nominal shell set is empty.
    if not shells and holes:
        shells, holes = holes, []
    built = []
    assigned = collections.defaultdict(list)
    for hr, hp in holes:
        point = hp.representative_point()
        candidates = [(sp.area, i) for i, (_, sp) in enumerate(shells) if sp.covers(point)]
        if candidates:
            assigned[min(candidates)[1]].append(hr)
        else:
            shells.append((hr, hp))
    for i, (ring, _) in enumerate(shells):
        built.append(Polygon(ring, assigned.get(i, [])))
    geom = built[0] if len(built) == 1 else MultiPolygon(built)
    if not geom.is_valid:
        geom = polygonal(shapely.make_valid(geom))
    return geom

records, geoms = [], []
for p in sorted((SOURCE / 'chunks').glob('*.json.gz')):
    with gzip.open(p, 'rt') as handle:
        payload = json.load(handle)
    for feature in payload['features']:
        attrs = feature['attributes']
        geom = esri_polygon(feature['geometry']['rings'])
        normalized = shapely.normalize(geom)
        records.append({
            'objectid': int(attrs['OBJECTID']),
            'outline_id': attrs['outline_id'],
            'building_id': attrs['bldgID'],
            'global_id': attrs['GlobalID'].upper(),
            'source_area_sq_ft': attrs['Shape_Area'],
            'derived_footprint_area_sq_ft': geom.area,
            'geometry_sha256': hashlib.sha256(shapely.to_wkb(normalized, byte_order=1, output_dimension=2)).hexdigest(),
        })
        geoms.append(geom)

footprints = gpd.GeoDataFrame(pd.DataFrame(records), geometry=geoms, crs='EPSG:2230')
print('footprints', len(footprints), 'valid', int(footprints.is_valid.sum()), 'empty', int(footprints.is_empty.sum()), flush=True)
print('duplicate objectid', int(footprints.objectid.duplicated().sum()), 'globalid', int(footprints.global_id.duplicated().sum()), 'outline', int(footprints.outline_id.duplicated().sum()), flush=True)
pyogrio.write_dataframe(footprints, ROOT / 'normalized-footprints.gpkg', layer='footprints', driver='GPKG')
footprint_table = footprints.drop(columns='geometry').sort_values('objectid')
footprint_table.to_csv(ROOT / 'normalized-footprints.csv.gz', index=False,
                       compression={'method': 'gzip', 'mtime': 0}, float_format='%.9f')

accepted = {}
with gzip.open(PASS2, 'rt') as handle:
    for line in handle:
        row = json.loads(line)
        if row.get('accepted') and row['row'].get('jurisdiction') == 'SD':
            accepted[row['row']['apnNorm']] = row['geometryStats']['geometryHash']

parcel_columns = [
    'objectid', 'apn', 'situs_juris', 'situs_address', 'situs_street', 'situs_suffix', 'situs_suite',
    'asr_landuse', 'unitqty', 'nucleus_use_cd', 'year_effective', 'total_lvg_area', 'bedrooms', 'baths',
    'addition_area', 'garage_conversion', 'garage_stalls', 'carport_stalls', 'usable_sq_feet', 'sub_type', 'multi',
]
parcels = pyogrio.read_dataframe(PARCEL_SOURCE, columns=parcel_columns,
                                 where="situs_juris = 'SD'", use_arrow=False)
parcels = parcels[parcels.apn.isin(accepted)].copy()
if len(parcels) != 393733 or parcels.apn.nunique() != 393733:
    raise ValueError('accepted City APN mismatch')
assessor = parcels.drop(columns='geometry').sort_values(['apn', 'objectid'])
assessor.to_csv(ROOT / 'parcel-assessor-source.csv.gz', index=False,
                compression={'method': 'gzip', 'mtime': 0})
parcels['geometry_hash'] = parcels.apn.map(accepted)
parcels = parcels.to_crs(2230)
group_members = parcels.groupby('geometry_hash').apn.agg(lambda s: tuple(sorted(s))).to_dict()
physical = parcels.sort_values(['geometry_hash', 'apn']).drop_duplicates('geometry_hash').reset_index(drop=True)
print('apns', len(parcels), 'physical parcel groups', len(physical), 'stack groups', sum(len(v)>1 for v in group_members.values()), flush=True)

# Query positive-area intersection pairs. Touch-only candidates are excluded.
tree = shapely.STRtree(physical.geometry.values)
left, right = tree.query(footprints.geometry.values, predicate='intersects')
areas = shapely.area(shapely.intersection(footprints.geometry.values[left], physical.geometry.values[right]))
keep = areas > 0.01
left, right, areas = left[keep], right[keep], areas[keep]
order = np.lexsort((right, left))
left, right, areas = left[order], right[order], areas[order]

by_footprint = collections.defaultdict(list)
for fi, pi, area in zip(left.tolist(), right.tolist(), areas.tolist()):
    by_footprint[fi].append((pi, area))

link_rows = []
parcel_sources = collections.defaultdict(list)
stack_sources = collections.defaultdict(list)
ambiguous_sources = collections.defaultdict(list)
state_counts = collections.Counter()
for fi, row in footprints.iterrows():
    candidates = by_footprint.get(fi, [])
    if not candidates:
        state = 'ORPHAN_NO_PARCEL'
        members = ()
        hashes = ()
    elif len(candidates) > 1:
        state = 'AMBIGUOUS_MULTI_PARCEL'
        hashes = tuple(sorted(physical.iloc[pi].geometry_hash for pi, _ in candidates))
        members = tuple(sorted({apn for h in hashes for apn in group_members[h]}))
    else:
        pi, intersection_area = candidates[0]
        h = physical.iloc[pi].geometry_hash
        hashes = (h,)
        members = group_members[h]
        if len(members) > 1:
            state = 'STACKED_PARCEL_GROUP'
            for apn in members:
                stack_sources[apn].append(int(row.objectid))
        else:
            state = 'SPATIAL_SINGLE_PARCEL'
            parcel_sources[members[0]].append(int(row.objectid))
    state_counts[state] += 1
    if state == 'AMBIGUOUS_MULTI_PARCEL':
        for apn in members:
            ambiguous_sources[apn].append(int(row.objectid))
    link_rows.append({
        'source_object_id': int(row.objectid),
        'linkage_state': state,
        'parcel_geometry_hashes': list(hashes),
        'candidate_apns': list(members),
    })

parcel_state_counts = collections.Counter()
parcel_rows = []
stack_apns = {a for members in group_members.values() if len(members)>1 for a in members}
ambiguous_apns = {a for lr in link_rows if lr['linkage_state']=='AMBIGUOUS_MULTI_PARCEL' for a in lr['candidate_apns']}
for apn in sorted(accepted):
    ids = sorted(parcel_sources.get(apn, []))
    group_ids = sorted(stack_sources.get(apn, []))
    ambiguous_ids = sorted(ambiguous_sources.get(apn, []))
    if apn in stack_apns:
        state = 'STACKED_GROUP_WITH_FOOTPRINTS' if group_ids else 'STACKED_GROUP_WITHOUT_FOOTPRINTS'
    elif apn in ambiguous_apns and not ids:
        state = 'AMBIGUOUS_ONLY'
    elif len(ids) == 0:
        state = 'NO_FOOTPRINT_RECORD'
    elif len(ids) == 1:
        state = 'ONE_FOOTPRINT'
    else:
        state = 'MULTIPLE_FOOTPRINTS'
    parcel_state_counts[state] += 1
    parcel_rows.append({
        'apn': apn,
        'footprint_state': state,
        'direct_source_object_ids': ids,
        'stack_group_source_object_ids': group_ids,
        'ambiguous_source_object_ids': ambiguous_ids,
    })

def write_ndjson(path, rows):
    with path.open('w') as handle:
        for row in rows:
            handle.write(json.dumps(row, sort_keys=True, separators=(',', ':')) + '\n')

write_ndjson(ROOT / 'footprint-parcel-linkage.ndjson', sorted(link_rows, key=lambda r:r['source_object_id']))
write_ndjson(ROOT / 'parcel-footprint-summary.ndjson', parcel_rows)
report = {
    'sourceRecordCount': len(footprints),
    'parcelApnCount': len(accepted),
    'physicalParcelGroupCount': len(physical),
    'stackGroupCount': sum(len(v)>1 for v in group_members.values()),
    'stackApnCount': len(stack_apns),
    'sourceLinkageStates': dict(sorted(state_counts.items())),
    'parcelCoverageStates': dict(sorted(parcel_state_counts.items())),
    'duplicateSourceIds': {
        'objectId': int(footprints.objectid.duplicated().sum()),
        'globalId': int(footprints.global_id.duplicated().sum()),
        'outlineId': int(footprints.outline_id.duplicated().sum()),
    },
}
(ROOT / 'linkage-report.json').write_text(json.dumps(report, indent=2, sort_keys=True) + '\n')
print(json.dumps(report, indent=2, sort_keys=True))

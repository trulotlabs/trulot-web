#!/usr/bin/env python3
"""Rebuild the full City parcel-to-Coastal mapping from immutable artifacts."""
from __future__ import annotations
import argparse, gzip, hashlib, json, sys, time
from collections import Counter
from pathlib import Path
from shapely import normalize
from shapely.geometry import shape, mapping, Polygon, MultiPolygon, GeometryCollection
from shapely.ops import transform, unary_union
from shapely.validation import make_valid, explain_validity
from pyproj import Transformer

WGS_TO_2230=Transformer.from_crs(4326,2230,always_xy=True).transform
EPSILON_SQFT=0.000001

def canonical(v): return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False)
def polygonal(g):
    if g.is_empty:return g
    if isinstance(g,(Polygon,MultiPolygon)):return g
    if isinstance(g,GeometryCollection):
        parts=[x for x in g.geoms if isinstance(x,(Polygon,MultiPolygon)) and not x.is_empty]
        return unary_union(parts) if parts else Polygon()
    return Polygon()
def round_coords(v):
    if isinstance(v,(list,tuple)):return [round_coords(x) for x in v]
    return round(v,6) if isinstance(v,float) else v
def iter_features(path,chunk_size=4*1024*1024):
    dec=json.JSONDecoder()
    with Path(path).open(encoding='utf-8') as f:
        buf=''
        while '"features":[' not in buf:
            c=f.read(chunk_size)
            if not c: raise ValueError('features marker missing')
            buf+=c
        pos=buf.index('"features":[')+len('"features":[')
        while True:
            while True:
                while pos<len(buf) and buf[pos] in ' \r\n\t,':pos+=1
                if pos<len(buf):break
                c=f.read(chunk_size)
                if not c:return
                buf=c;pos=0
            if buf[pos]==']':return
            while True:
                try: obj,end=dec.raw_decode(buf,pos);break
                except json.JSONDecodeError:
                    c=f.read(chunk_size)
                    if not c:raise
                    if pos:buf=buf[pos:]+c;pos=0
                    else:buf+=c
            yield obj;pos=end
            if pos>8*1024*1024:buf=buf[pos:];pos=0

def run(args):
    accepted={}
    with gzip.open(args.accepted_rows,'rt') as stream:
        for line in stream:
            item=json.loads(line)
            if item['accepted'] and item['row']['jurisdiction']=='SD': accepted[item['row']['sourceObjectId']]=item['geometryStats']['geometryHash']
    if len(accepted)!=393733: raise ValueError(f'accepted City IDs: {len(accepted)}')
    source=json.loads(args.coastal_source.read_text()); source_rows=[];geoms=[];quarantine=[]
    for feat in sorted(source['features'],key=lambda x:x['properties']['OBJECTID_1']):
        p=feat['properties'];raw=shape(feat['geometry']);native=transform(WGS_TO_2230,raw);state='RAW_VALID' if native.is_valid else 'MAKE_VALID';norm=normalize(polygonal(native if native.is_valid else make_valid(native)))
        if norm.is_empty or not norm.is_valid:quarantine.append({'source_object_id':p['OBJECTID_1'],'reason':explain_validity(norm) if not norm.is_empty else 'EMPTY'});continue
        source_rows.append({'source_object_id':p['OBJECTID_1'],'zone_name':p['ZONENAME'],'source_zone_name':p['ZONE_NAME'],'implementation_date_epoch_ms':p['IMP_DATE'],'ordinance':p['ORDNUM'],'ordinance_pure':p['ORDNUMPURE'],'series_code':p['SERIES_CD'],'geometry_state':state,'source_geometry_type':feat['geometry']['type'],'normalized_geometry_type':norm.geom_type,'normalized_geometry':round_coords(mapping(norm)['coordinates'])});geoms.append(norm)
    coast=unary_union(geoms);counts=Counter();crossing=[];seen=set();mapping_hash=hashlib.sha256();streamed=city=dups=0;started=time.time()
    with args.output.open('w') as out:
      for feat in iter_features(args.parcels):
        streamed+=1;p=feat['properties'];oid=int(p['objectid'])
        if oid not in accepted:continue
        city+=1;apn=str(p.get('apn') or '').strip();dups+=apn in seen;seen.add(apn);raw=shape(feat['geometry']) if feat.get('geometry') else Polygon();raw_valid=raw.is_valid;g=polygonal(raw if raw_valid else make_valid(raw))
        if g.is_empty or not g.is_valid: state='APPLICABILITY_UNRESOLVED';area=inside=outside=None;source_ids=[];point_inside=None
        else:
            g=transform(WGS_TO_2230,g);area=g.area;inside=g.intersection(coast).area;outside=max(0.0,area-inside)
            state='OUTSIDE_COASTAL' if inside<=EPSILON_SQFT else 'INSIDE_COASTAL' if outside<=EPSILON_SQFT else 'BOUNDARY_AMBIGUOUS'
            source_ids=[] if inside<=EPSILON_SQFT else [r['source_object_id'] for r,z in zip(source_rows,geoms) if g.intersection(z).area>EPSILON_SQFT]
            point_inside=coast.covers(g.representative_point())
        row={'parcel_acquisition_id':'sangis-20260924T183743Z','parcel_source_object_id':oid,'parcel_id':int(p['parcelid']),'apn':apn,'parcel_geometry_sha256':accepted[oid],'raw_geometry_valid':raw_valid,'mapping_method':'coastal-overlay-union-positive-area-v1','state':state,'parcel_area_sqft':round(area,6) if area is not None else None,'coastal_area_sqft':round(inside,6) if inside is not None else None,'outside_area_sqft':round(outside,6) if outside is not None else None,'coastal_area_share_percent':round(100*inside/area,9) if area and inside is not None else None,'point_on_surface_inside':point_inside,'coastal_source_object_ids':sorted(source_ids)}
        line=canonical(row)+'\n';out.write(line);mapping_hash.update(line.encode());counts[state]+=1
        if state=='BOUNDARY_AMBIGUOUS':crossing.append(row)
        if city%50000==0:print(city,dict(counts),file=sys.stderr,flush=True)
    if city!=393733 or len(seen)!=393733 or dups:raise ValueError('City identity reconciliation failed')
    shares=sorted(x['coastal_area_share_percent'] for x in crossing)
    def q(frac):return shares[min(len(shares)-1,max(0,round((len(shares)-1)*frac)))] if shares else None
    state_dist=dict(sorted(counts.items()))
    summary={'source_feature_count':len(source_rows),'source_labels':dict(sorted(Counter(r['zone_name'] for r in source_rows).items())),'source_geometry_states':dict(sorted(Counter(r['geometry_state'] for r in source_rows).items())),'source_fingerprint_sha256':hashlib.sha256(canonical(source_rows).encode()).hexdigest(),'quarantine_count':len(quarantine),'quarantine':quarantine,'quarantine_fingerprint_sha256':hashlib.sha256(canonical(quarantine).encode()).hexdigest(),'county_parcels_streamed':streamed,'city_parcels':city,'unique_apns':len(seen),'duplicate_apns':dups,'states':state_dist,'state_distribution_sha256':hashlib.sha256(canonical(state_dist).encode()).hexdigest(),'parcel_mapping_sha256':mapping_hash.hexdigest(),'crossing_count':len(crossing),'crossing_share_percentiles':{'min':q(0),'p01':q(.01),'p10':q(.1),'p25':q(.25),'p50':q(.5),'p75':q(.75),'p90':q(.9),'p99':q(.99),'max':q(1)},'smallest_crossings':sorted(crossing,key=lambda r:r['coastal_area_share_percent'])[:10],'largest_crossings':sorted(crossing,key=lambda r:r['coastal_area_share_percent'],reverse=True)[:10],'closest_to_half_crossings':sorted(crossing,key=lambda r:abs(r['coastal_area_share_percent']-50))[:10],'duration_seconds':round(time.time()-started,3)}
    args.summary.write_text(json.dumps(summary,indent=2,sort_keys=True)+'\n');print(json.dumps(summary,indent=2,sort_keys=True))

def main():
    p=argparse.ArgumentParser();p.add_argument('--parcels',type=Path,required=True);p.add_argument('--accepted-rows',type=Path,required=True);p.add_argument('--coastal-source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--summary',type=Path,required=True);run(p.parse_args())
if __name__=='__main__':main()

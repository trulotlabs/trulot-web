"""Deterministic local-only sample. Usage: sample.py BOUNDARY NEW_JSON"""
import hashlib
import json
import pathlib
import sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/parcel-v2-postgis'))
from local import connection,sql
QUERY="""
WITH population AS MATERIALIZED (
 SELECT s.*,count(*) OVER(PARTITION BY parcel_id) stack_count,
 md5('trulot-packet9-v1:'||apn_norm) rank_hash
 FROM parcel_serving_rehearsal.parcel_serving_v2 s
), picks AS (
 (SELECT apn_norm,'hash_population_500' tag FROM population ORDER BY rank_hash,apn_norm LIMIT 500)
 UNION ALL (SELECT apn_norm,'ordinary' FROM population WHERE stack_count=1 ORDER BY rank_hash,apn_norm LIMIT 20)
 UNION ALL (SELECT apn_norm,'stacked' FROM population WHERE stack_count>1 ORDER BY rank_hash,apn_norm LIMIT 20)
 UNION ALL (SELECT apn_norm,'missing_address' FROM population WHERE address IS NULL ORDER BY rank_hash,apn_norm LIMIT 20)
 UNION ALL (SELECT apn_norm,'acreage_null' FROM population WHERE taxable_acreage IS NULL ORDER BY rank_hash,apn_norm LIMIT 20)
 UNION ALL (SELECT apn_norm,'acreage_populated' FROM population WHERE taxable_acreage IS NOT NULL ORDER BY rank_hash,apn_norm LIMIT 20)
 UNION ALL (SELECT apn_norm,'polygon' FROM population WHERE ST_GeometryType(geom)='ST_Polygon' ORDER BY rank_hash,apn_norm LIMIT 20)
 UNION ALL (SELECT apn_norm,'multipolygon' FROM population WHERE ST_GeometryType(geom)='ST_MultiPolygon' ORDER BY rank_hash,apn_norm LIMIT 20)
 UNION ALL (SELECT apn_norm,'centroid_outside' FROM population WHERE NOT centroid_within ORDER BY rank_hash,apn_norm LIMIT 20)
 UNION ALL (SELECT DISTINCT ON(left(trim(situs_zip),5)) apn_norm,'zip_representative' FROM population ORDER BY left(trim(situs_zip),5),rank_hash,apn_norm LIMIT 60)
 UNION ALL (SELECT apn_norm,'historical_example' FROM population WHERE apn_norm='5470501600')
 UNION ALL (SELECT apn_norm,'area_smallest' FROM population ORDER BY approximate_geometry_area_sqft,apn_norm LIMIT 10)
 UNION ALL (SELECT apn_norm,'area_largest' FROM population ORDER BY approximate_geometry_area_sqft DESC,apn_norm LIMIT 10)
 UNION ALL SELECT n.apn_norm,'quarantine_numeric_predecessor' FROM
 (SELECT DISTINCT replace(apn_raw,'-','') apn FROM parcel_v2_rehearsal.rejection WHERE reasons ? 'DUPLICATE_APN_OR_OBJECTID') q
 CROSS JOIN LATERAL (SELECT apn_norm FROM parcel_serving_rehearsal.parcel_serving_v2 WHERE apn_norm<q.apn ORDER BY apn_norm DESC LIMIT 1) n
 UNION ALL SELECT n.apn_norm,'quarantine_numeric_successor' FROM
 (SELECT DISTINCT replace(apn_raw,'-','') apn FROM parcel_v2_rehearsal.rejection WHERE reasons ? 'DUPLICATE_APN_OR_OBJECTID') q
 CROSS JOIN LATERAL (SELECT apn_norm FROM parcel_serving_rehearsal.parcel_serving_v2 WHERE apn_norm>q.apn ORDER BY apn_norm LIMIT 1) n
), tags AS (SELECT apn_norm,array_agg(DISTINCT tag ORDER BY tag) strata FROM picks GROUP BY apn_norm)
SELECT p.apn_norm,p.source_object_id,p.parcel_id,p.address,p.situs_zip,p.situs_juris,
p.situs_components,p.taxable_acreage,p.approximate_geometry_area_sqft,
ST_Y(centroid) lat,ST_X(centroid) lng,ST_Y(point_on_surface) pos_lat,ST_X(point_on_surface) pos_lng,
p.centroid_within,ST_GeometryType(geom) geometry_type,p.geometry_sha256,p.stack_count,t.strata
FROM population p JOIN tags t USING(apn_norm) ORDER BY p.apn_norm
"""
def run(boundary,target):
 args=connection(boundary)
 rows=json.loads(sql(args,'SELECT json_agg(t) FROM ('+QUERY+') t'))
 assert 500<=len(rows)<=1000 and len({r['apn_norm'] for r in rows})==len(rows)
 report=json.loads((ROOT/'data/parcel-serving-v2/report.json').read_text())
 out={'algorithm':'MD5(trulot-packet9-v1: + APN), APN tie-break; 500 population plus deterministic strata union; numeric quarantine neighbors are not geographic/lineage assertions.',
 'querySha256':hashlib.sha256(QUERY.encode()).hexdigest(),'servingFingerprint':report['fullRowFingerprint'],'rows':rows}
 with pathlib.Path(target).open('x') as f:json.dump(out,f,separators=(',',':'));f.write('\n')
 print('Selected',len(rows),'unique San Diego APNs')
if __name__=='__main__':run(*sys.argv[1:])

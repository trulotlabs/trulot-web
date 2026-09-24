"""Database-backed reconciliation, full-row rebuild fingerprint, and local query plans."""
import csv
import gzip
import hashlib
import json
import pathlib
import subprocess
import sys
from collections import Counter
from local import connection, sql, ENV

ROOT = pathlib.Path(__file__).resolve().parents[2]
TABLE = 'parcel_v2_rehearsal.parcel_base_sangis_v2'


def query(args, q):
    return json.loads(sql(args, "SELECT coalesce(json_agg(t),'[]'::json) FROM ("+q+") t"))


def distribution(args, key, where='true'):
    groups = query(args, f"SELECT n, count(*) AS groups FROM (SELECT {key},count(*) n FROM {TABLE} WHERE {where} GROUP BY {key}) g GROUP BY n ORDER BY n")
    return {'frequencies':{str(r['n']):r['groups'] for r in groups},
            'groups':sum(r['groups'] for r in groups),
            'repeatedGroups':sum(r['groups'] for r in groups if r['n']>1),
            'repeatedRows':sum(r['n']*r['groups'] for r in groups if r['n']>1)}


def run(boundary, pass_dir, run_dir):
    args = connection(boundary); run_dir=pathlib.Path(run_dir); pass_dir=pathlib.Path(pass_dir)
    imported=json.loads((run_dir/'import.json').read_text()); report=json.loads((pass_dir/'report.json').read_text())
    population=query(args,f"""SELECT count(*) accepted, count(DISTINCT apn_norm) distinct_apns, count(DISTINCT source_object_id) distinct_object_ids,
      count(DISTINCT parcel_id) distinct_parcel_ids, count(*) FILTER(WHERE address IS NULL) missing_situs,
      count(*) FILTER(WHERE situs_juris IS NULL) missing_jurisdiction,
      count(*) FILTER(WHERE geom IS NULL) null_geometry, count(*) FILTER(WHERE NOT ST_IsValid(geom)) invalid_geometry,
      count(*) FILTER(WHERE NOT centroid_within) centroid_outside,
      count(*) FILTER(WHERE apn_norm !~ '^[0-9]{{10}}$') malformed_apn FROM {TABLE}""")[0]
    assert population['accepted']==report['counts']['accepted']==imported['databaseRows']
    assert population['null_geometry']==population['invalid_geometry']==population['malformed_apn']==0
    assert population['distinct_apns']==population['distinct_object_ids']==population['accepted']
    assert population['missing_situs']==imported['counts']['missingSitus']
    assert population['centroid_outside']==imported['counts']['centroidOutside']
    jurisdictions=query(args,f'SELECT situs_juris AS code,count(*) AS rows FROM {TABLE} GROUP BY situs_juris ORDER BY situs_juris')
    assert {(r['code'] or 'unknown'):r['rows'] for r in jurisdictions}==imported['jurisdiction']
    geom=query(args,f'SELECT GeometryType(geom) AS type,count(*) AS rows FROM {TABLE} GROUP BY GeometryType(geom) ORDER BY type')
    assert {r['type']:r['rows'] for r in geom}=={k.upper():v for k,v in imported['geometry'].items()}
    parcel_ids=distribution(args,'parcel_id'); geom_ids=distribution(args,'geometry_sha256')
    postgis_geom=distribution(args,'md5(ST_AsEWKB(ST_Normalize(geom)))')
    for actual,expected in [(parcel_ids,report['stacked']['acceptedParcelIds']),(geom_ids,report['stacked']['acceptedIdenticalGeometry'])]:
        for key in ['groups','repeatedGroups','repeatedRows','frequencies']: assert actual[key]==expected[key],key
    assert postgis_geom==geom_ids,'PostGIS geometric identity grouping disagrees with Packet 6'
    city=query(args,f"SELECT count(*) rows,count(DISTINCT apn_norm) distinct_apns,count(DISTINCT parcel_id) distinct_parcel_ids,count(*) FILTER(WHERE address IS NULL) missing_situs FROM {TABLE} WHERE situs_juris='SD'")[0]
    city['parcelIdStacks']=distribution(args,'parcel_id',"situs_juris='SD'")
    city['geometryStacks']=distribution(args,'geometry_sha256',"situs_juris='SD'")
    rejected=int(sql(args,'SELECT count(*) FROM parcel_v2_rehearsal.rejection'))
    overlap=int(sql(args,f'SELECT count(*) FROM {TABLE} p JOIN parcel_v2_rehearsal.rejection r USING(acquisition_id,source_object_id)'))
    assert rejected==report['counts']['rejected'] and overlap==0
    reasons=query(args,"SELECT reason,count(*) rows FROM parcel_v2_rehearsal.rejection CROSS JOIN LATERAL jsonb_array_elements_text(reasons) AS reason GROUP BY reason ORDER BY reason")
    assert {r['reason']:r['rows'] for r in reasons}==report['rejectionReasons']
    # Independently compare every accepted source identity/APN and rejected identity/reasons to retained Packet 6 rows.
    expected={}; excluded={}
    with gzip.open(pass_dir/'rows.ndjson.gz','rt') as stream:
        for line in stream:
            entry=json.loads(line); row=entry['row']
            if entry['accepted']:expected[row['sourceObjectId']]=row['apnNorm']
            else:excluded[row['sourceObjectId']]=entry['reasons']
    proc=subprocess.Popen(args+['-c',f'COPY (SELECT source_object_id,apn_norm FROM {TABLE}) TO STDOUT WITH CSV'],stdout=subprocess.PIPE,text=True,env=ENV)
    for object_id,apn in csv.reader(proc.stdout):assert expected.pop(int(object_id))==apn
    assert proc.wait()==0 and not expected
    for row in query(args,'SELECT source_object_id,reasons FROM parcel_v2_rehearsal.rejection'):assert excluded.pop(row['source_object_id'])==row['reasons']
    assert not excluded
    samples={}
    for category,sample in report['deterministicSamples'].items():
        found=query(args,f"SELECT source_object_id,apn_norm,parcel_id,situs_juris,address IS NOT NULL AS address_present,centroid_within,approximate_geometry_area_sqft,ST_X(centroid) lon,ST_Y(centroid) lat FROM {TABLE} WHERE source_object_id={int(sample['sourceObjectId'])}")
        assert bool(found)==sample['accepted']
        if found:
            row=found[0]
            assert hashlib.sha256(row.pop('apn_norm').encode()).hexdigest()==sample['apnSha256']
            assert row['situs_juris']==sample['jurisdiction'] and row['address_present']==sample['addressPresent'] and row['centroid_within']==sample['centroidWithin']
            assert row['approximate_geometry_area_sqft']==sample['approximateAreaSqFt']
            row['apnSha256']=sample['apnSha256']
        samples[category]=found
    fingerprint=hashlib.sha256()
    proc=subprocess.Popen(args+['-c',f'COPY (SELECT row_to_json(p)::text FROM {TABLE} p ORDER BY acquisition_id,source_object_id) TO STDOUT'],stdout=subprocess.PIPE,env=ENV)
    while chunk:=proc.stdout.read(1024*1024):fingerprint.update(chunk)
    assert proc.wait()==0
    historical=query(args,f"SELECT source_object_id,apn_norm,parcel_id,situs_juris FROM {TABLE} WHERE apn_norm='5470501600'")
    result={'decision':'PARCEL_BASE_V2_DB_REHEARSAL_PASS','acquisitionId':imported['acquisitionId'],'artifactSha256':imported['artifactSha256'],
        'population':population,'jurisdictions':jurisdictions,'geometry':geom,'parcelIdStacks':parcel_ids,'identicalGeometryStacks':geom_ids,
        'postgisNormalizedGeometryStacks':postgis_geom,'citySanDiego':city,'rejected':rejected,'rejectedAcceptedOverlap':overlap,'rejectionReasons':reasons,
        'allAcceptedIdentityApnPairsMatch':True,'allRejectedIdentityReasonsMatch':True,'samples':samples,'fullDatabaseRowFingerprint':fingerprint.hexdigest(),
        'historicalExample':historical,'lineage':query(args,'SELECT * FROM parcel_v2_rehearsal.acquisition'),
        'apnsWithMultipleObjectIds':int(sql(args,f'SELECT count(*) FROM (SELECT apn_norm FROM {TABLE} GROUP BY apn_norm HAVING count(DISTINCT source_object_id)>1) x')),
        'apnsWithMultipleGeometries':int(sql(args,f'SELECT count(*) FROM (SELECT apn_norm FROM {TABLE} GROUP BY apn_norm HAVING count(DISTINCT geometry_sha256)>1) x')),
        'geometryTransformPerformedByDatabase':False,'productionReady':False}
    (run_dir/'reconciliation.json').write_text(json.dumps(result,indent=2)+'\n')
    plans={}
    for name,q in {'apn':f"SELECT * FROM {TABLE} WHERE apn_norm='5470501600'",'sourceObjectId':f"SELECT * FROM {TABLE} WHERE acquisition_id='sangis-20260924T183743Z' AND source_object_id=712883",'jurisdictionCount':f"SELECT count(*) FROM {TABLE} WHERE situs_juris='SD'",'boundingBox':f"SELECT source_object_id FROM {TABLE} WHERE geom && ST_MakeEnvelope(-117.16,32.71,-117.159,32.711,4326)"}.items():
        plans[name]=json.loads(sql(args,'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+q))
    (run_dir/'query-plans.json').write_text(json.dumps(plans,indent=2)+'\n')
    print(json.dumps({'decision':result['decision'],'population':population,'city':city['rows'],'fingerprint':result['fullDatabaseRowFingerprint']},indent=2))


if __name__=='__main__':
    if len(sys.argv)!=4:raise SystemExit('Usage: reconcile.py BOUNDARY_JSON PASS_DIR RUN_DIR')
    run(*sys.argv[1:])

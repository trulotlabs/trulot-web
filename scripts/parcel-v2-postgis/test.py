"""Local/offline Packet 7 contract tests. Optional second run proves rebuild equality."""
import hashlib
import json
import pathlib
import re
import sys
import tempfile
from unittest.mock import patch
import local
import xml.etree.ElementTree as ET
from local import connection, sql

ROOT=pathlib.Path(__file__).resolve().parents[2]
TABLE='parcel_v2_rehearsal.parcel_base_sangis_v2'


def run(boundary,run_dir,second=None):
    args=connection(boundary);count=0
    def test(name,condition):
        nonlocal count
        if not condition:raise AssertionError(name)
        count+=1;print('PASS',name)
    b=json.loads(pathlib.Path(boundary).read_text())
    for key,value in [('socket','db.example.com'),('database','postgres'),('directory','/Users/ops/trulot-web'),('port',5432),('user','postgres')]:
        with tempfile.TemporaryDirectory() as temp:
            file=pathlib.Path(temp)/'boundary.json';file.write_text(json.dumps({**b,key:value}))
            with patch.object(local.subprocess,'check_output',side_effect=AssertionError('Connection must not be attempted')):
                rejected=False
                try:connection(file)
                except ValueError:rejected=True
                test('Connection boundary rejects '+key,rejected)
    r=json.loads((pathlib.Path(run_dir)/'reconciliation.json').read_text())
    test('DDL created both parcel base and explicit quarantine',sql(args,"SELECT to_regclass('parcel_v2_rehearsal.parcel_base_sangis_v2') IS NOT NULL AND to_regclass('parcel_v2_rehearsal.rejection') IS NOT NULL")=='t')
    test('Imported population equals Packet 6',r['population']['accepted']==1088430)
    test('Accepted stacked rows preserved',r['parcelIdStacks']['repeatedRows']==353419)
    test('Repeated parcel IDs preserved',r['parcelIdStacks']['repeatedGroups']==12480)
    test('Rejected rows excluded and retained',r['rejected']==1328 and r['rejectedAcceptedOverlap']==0 and r['allRejectedIdentityReasonsMatch'])
    test('Every accepted object-ID/APN pair matches Packet 6',r['allAcceptedIdentityApnPairsMatch'])
    source=ROOT/'data/parcel-base-v2/postgis-rehearsal';observation=json.loads((source/'jurisdiction-observation.json').read_text())
    raw=(source/'jurisdiction-metadata.xml').read_bytes();tree=ET.fromstring(raw)
    definition=next(a.findtext('attrdef') for a in tree.findall('attr') if a.findtext('attrlabl')=='SITUS_JURIS')
    mapping={c:n.strip() for _,c,n in re.findall(r'^(NULL|\d{2}):\s+(\w{2}):\s+(.+)$',definition,re.M)}
    test('Authoritative metadata fragment checksum verified',hashlib.sha256(raw).hexdigest()==observation['capturedEvidenceFragmentSha256'])
    test('Jurisdiction mapping parsed from authoritative source',mapping=={v['code']:v['name'] for v in observation['values']} and mapping['SD']=='City of San Diego' and mapping['CN']=='County of San Diego')
    test('Observed jurisdictions all have authoritative definitions',all(row['code'] is None or row['code'] in mapping for row in r['jurisdictions']))
    test('City scope count matches independent grouped count',r['citySanDiego']['rows']==next(row['rows'] for row in r['jurisdictions'] if row['code']=='SD'))
    test('Derived point-on-surface and centroid membership preserved in PostGIS',sql(args,f"SELECT count(*) FROM {TABLE} WHERE NOT ST_Covers(geom,point_on_surface) OR ST_Covers(geom,centroid)<>centroid_within")=='0')
    columns=sql(args,"SELECT string_agg(column_name,',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='parcel_v2_rehearsal' AND table_name='parcel_base_sangis_v2'").split(',')
    expected=['acquisition_id','source_object_id','apn_raw','apn_norm','parcel_id','situs_components','address','situs_zip','situs_juris','taxable_acreage','geom','centroid','point_on_surface','centroid_within','approximate_geometry_area_sqft','geometry_sha256']
    test('Parcel-only schema has no zoning, permit, structure or overlay fields',columns==expected)
    test('Acquisition ID and checksum retained in relational lineage',r['lineage'][0]['acquisition_id']=='sangis-20260924T183743Z' and r['lineage'][0]['artifact_sha256']=='07913d1007d0e2f5b80c681c19c76bb1338f4b06d99c401c1784744bbd1a4544')
    # Exercise real DDL keys and geometry checks in a temporary table; transaction rollback leaves the full base untouched.
    statements=f"""BEGIN; CREATE TEMP TABLE probe (LIKE {TABLE} INCLUDING ALL);
    INSERT INTO probe SELECT acquisition_id,9000000001,'0000000001','0000000001',parcel_id,situs_components,address,situs_zip,situs_juris,taxable_acreage,geom,centroid,point_on_surface,centroid_within,approximate_geometry_area_sqft,geometry_sha256 FROM {TABLE} LIMIT 1;
    INSERT INTO probe SELECT acquisition_id,9000000002,'0000000002','0000000002',parcel_id,situs_components,address,situs_zip,situs_juris,taxable_acreage,geom,centroid,point_on_surface,centroid_within,approximate_geometry_area_sqft,geometry_sha256 FROM probe LIMIT 1;
    INSERT INTO probe SELECT acquisition_id,9000000003,apn_raw,apn_norm,parcel_id,situs_components,address,situs_zip,situs_juris,taxable_acreage,geom,centroid,point_on_surface,centroid_within,approximate_geometry_area_sqft,geometry_sha256 FROM probe LIMIT 1;
    DO $$ BEGIN
      IF (SELECT count(*) FROM probe)<>3 OR (SELECT count(DISTINCT parcel_id) FROM probe)<>1 THEN RAISE EXCEPTION 'Lost stacked rows'; END IF;
      BEGIN INSERT INTO probe SELECT * FROM probe LIMIT 1; RAISE EXCEPTION 'Duplicate acquisition/object ID accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
      BEGIN UPDATE probe SET apn_norm='123'; RAISE EXCEPTION 'Malformed APN accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
      BEGIN UPDATE probe SET geom=NULL; RAISE EXCEPTION 'Null geometry accepted'; EXCEPTION WHEN not_null_violation THEN NULL; END;
    END $$; ROLLBACK;"""
    sql(args,statements)
    test('Actual DDL preserves repeated parcel IDs/geometry/APNs while enforcing source-row identity and valid rows',True)
    if second:
        other=json.loads((pathlib.Path(second)/'reconciliation.json').read_text())
        test('Destroy/recreate and independent second import produce identical entire reconciliation including full-row fingerprint',r==other)
    test('Full population unchanged after schema tests',int(sql(args,f'SELECT count(*) FROM {TABLE}'))==1088430)
    print(f'{count} Packet 7 local/offline checks passed.')


if __name__=='__main__':
    run(*sys.argv[1:])

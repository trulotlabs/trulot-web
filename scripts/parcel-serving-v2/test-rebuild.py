"""Local count/lineage/field-boundary tests and exact serving rebuild comparisons."""
import hashlib
import json
import pathlib
import sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/parcel-v2-postgis'))
from local import connection,sql


def run(boundary,first,second):
    args=connection(boundary);first=pathlib.Path(first);second=pathlib.Path(second);n=0
    def test(name,condition):
        nonlocal n
        assert condition,name;n+=1;print('PASS',name)
    a=json.loads((first/'report.json').read_text());b=json.loads((second/'report.json').read_text())
    test('Independent serving objects rebuild produces identical report',a==b)
    test('All deterministic adapter inputs/responses match after rebuild',(first/'adapter-fixtures.json').read_bytes()==(second/'adapter-fixtures.json').read_bytes())
    test('City count is accepted source scope, not historical target',a['count']['rows']==393733)
    test('All served APNs unique without arbitrary row selection',a['count']['apns']==a['count']['rows'])
    test('Source-row identities exactly match scoped base',a['sourceIdsExactlyMatchScopedBase'])
    test('Repeated parcel IDs and geometries preserved',all(v=={'groups':5446,'rows':126239} for v in a['stacks'].values()))
    test('No invalid geometry or fabricated point',a['count']['invalid_geometry']==a['count']['point_outside']==0)
    test('Null address preserved',a['count']['null_address']==14846 and a['address']['fabricated_address']==0)
    test('Missing acreage remains null',a['count']['null_acreage']==374698)
    test('Full row and APN fingerprints stable',a['fullRowFingerprint']==b['fullRowFingerprint'] and a['apnSetFingerprint']==b['apnSetFingerprint'])
    receipt=json.loads((ROOT/a['provenance']['receipt_reference']).read_text())['receipt']
    test('Provenance resolves to actual acquisition receipt',a['provenance']['artifact_sha256']==receipt['contentSha256'] and a['provenance']['acquired_at']==receipt['acquiredAt'] and a['provenance']['source_temporal_extent']==receipt['sourceReported']['currency']['value'])
    test('Serving DDL identity matches executable definition',a['provenance']['serving_definition_sha256']==hashlib.sha256(pathlib.Path(__file__).with_name('schema.sql').read_bytes()).hexdigest())
    columns=sql(args,"SELECT string_agg(column_name,',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='parcel_serving_rehearsal' AND table_name='parcel_serving_v2'").split(',')
    expected=['acquisition_id','source_object_id','apn_norm','parcel_id','address','situs_components','situs_zip','situs_juris','geom','centroid','point_on_surface','centroid_within','approximate_geometry_area_sqft','taxable_acreage','geometry_sha256','native_crs','artifact_crs']
    test('Exact minimal field contract; no deferred enrichment',columns==expected)
    test('Countywide base remains intact',sql(args,'SELECT count(*) FROM parcel_v2_rehearsal.parcel_base_sangis_v2')=='1088430')
    test('Non-SD source rows never served',sql(args,"SELECT count(*) FROM parcel_serving_rehearsal.parcel_serving_v2 WHERE situs_juris<>'SD'")=='0')
    test('Quarantined APNs never silently served',sql(args,"SELECT count(*) FROM parcel_serving_rehearsal.parcel_serving_v2 s JOIN parcel_v2_rehearsal.rejection r ON r.acquisition_id=s.acquisition_id AND replace(r.apn_raw,'-','')=s.apn_norm")=='0')
    print(f'{n} Parcel Serving V2 local database/rebuild checks passed.')


if __name__=='__main__':run(*sys.argv[1:])

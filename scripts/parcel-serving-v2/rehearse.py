"""Recreate only isolated serving objects, reconcile and emit small adapter fixtures."""
import hashlib
import json
import pathlib
import subprocess
import sys
import csv
import io

ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/parcel-v2-postgis'))
from local import connection,sql,ENV

TABLE='parcel_serving_rehearsal.parcel_serving_v2'
BASE='parcel_v2_rehearsal.parcel_base_sangis_v2'


def query(args,command):
    return json.loads(sql(args,"SELECT coalesce(json_agg(t),'[]'::json) FROM ("+command+") t"))


def digest(path):return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def envelope(args,apn):
    assert len(apn)==10 and apn.isdigit()
    rows=query(args,f"SELECT acquisition_id,source_object_id,apn_norm,parcel_id,address,situs_components,situs_zip,situs_juris,ST_AsGeoJSON(geom,17)::json geom,ST_AsGeoJSON(centroid,17)::json centroid,ST_AsGeoJSON(point_on_surface,17)::json point_on_surface,centroid_within,approximate_geometry_area_sqft,taxable_acreage,geometry_sha256,native_crs,artifact_crs FROM {TABLE} WHERE apn_norm='{apn}' ORDER BY source_object_id")
    receipt=query(args,'SELECT r.* FROM parcel_serving_rehearsal.receipt r JOIN parcel_serving_rehearsal.selected_acquisition s USING(acquisition_id)')[0]
    quarantine=int(sql(args,f"SELECT count(*) FROM parcel_v2_rehearsal.rejection r JOIN parcel_serving_rehearsal.selected_acquisition s USING(acquisition_id) WHERE replace(apn_raw,'-','')='{apn}'"))
    return {'rows':rows,'quarantinedCount':quarantine,'receipt':receipt}


def run(boundary,output):
    args=connection(boundary);output=pathlib.Path(output);output.mkdir(exist_ok=False)
    assert int(sql(args,f'SELECT count(*) FROM {BASE}'))==1088430
    assert int(sql(args,f"SELECT count(*) FROM {BASE} WHERE situs_juris='SD'"))==393733
    a=ROOT/'data/parcel-base-v2/acquisitions/sangis-20260924T183743Z/acquisition.json';receipt=json.loads(a.read_text())['receipt']
    ddl=pathlib.Path(__file__).with_name('schema.sql');base=query(args,'SELECT * FROM parcel_v2_rehearsal.acquisition')[0]
    assert base['artifact_sha256']==receipt['contentSha256']
    base_import=json.loads((pathlib.Path(boundary).parent/'base-run/import.json').read_text())
    import_inputs={'lineage':base,'importerSha256':base_import['importerSha256'],'ddlSha256':base_import['ddlSha256']}
    import_identity=hashlib.sha256(json.dumps(import_inputs,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    values=[base['acquisition_id'],'parcel_base_sangis_v2',receipt['acquiredAt'],receipt['publisher'],receipt['sourceUrl'],receipt['metadataUrl'],receipt['sourceReported']['currency']['value'],receipt['contentSha256'],receipt['metadataContentSha256'],'data/parcel-base-v2/acquisitions/sangis-20260924T183743Z/acquisition.json',import_identity,digest(ddl)]
    csvout=io.StringIO();csv.writer(csvout,lineterminator='\n').writerow(values)
    command='BEGIN; DROP SCHEMA IF EXISTS parcel_serving_rehearsal CASCADE;\n'+ddl.read_text()+"\nCOPY parcel_serving_rehearsal.receipt FROM STDIN WITH CSV;\n"+csvout.getvalue()+"\\.\nINSERT INTO parcel_serving_rehearsal.selected_acquisition VALUES(true,'sangis-20260924T183743Z'); COMMIT;\n"
    subprocess.run(args,input=command,text=True,check=True,env=ENV,stdout=subprocess.DEVNULL)
    counts=query(args,f"SELECT count(*) rows,count(DISTINCT apn_norm) apns,count(DISTINCT source_object_id) source_ids,count(DISTINCT parcel_id) parcel_ids,count(*) FILTER(WHERE address IS NULL) null_address,count(*) FILTER(WHERE taxable_acreage IS NULL) null_acreage,count(*) FILTER(WHERE geom IS NULL OR NOT ST_IsValid(geom)) invalid_geometry,count(*) FILTER(WHERE NOT ST_Covers(geom,point_on_surface)) point_outside FROM {TABLE}")[0]
    assert counts['rows']==counts['apns']==counts['source_ids']==393733
    assert counts['invalid_geometry']==counts['point_outside']==0
    assert int(sql(args,f'SELECT count(*) FROM {BASE}'))==1088430
    stacks={}
    for key in ['parcel_id','geometry_sha256']:
        stacks[key]=query(args,f'SELECT count(*) groups,sum(n) rows FROM (SELECT {key},count(*) n FROM {TABLE} GROUP BY {key} HAVING count(*)>1) x')[0]
        assert stacks[key]=={'groups':5446,'rows':126239}
    assert int(sql(args,f'SELECT count(*) FROM {TABLE} s JOIN parcel_v2_rehearsal.rejection r USING(acquisition_id,source_object_id)'))==0
    source_ids_match=sql(args,f"SELECT NOT EXISTS ((SELECT acquisition_id,source_object_id FROM {BASE} WHERE situs_juris='SD' EXCEPT SELECT acquisition_id,source_object_id FROM {TABLE}) UNION ALL (SELECT acquisition_id,source_object_id FROM {TABLE} EXCEPT SELECT acquisition_id,source_object_id FROM {BASE} WHERE situs_juris='SD'))")=='t';assert source_ids_match
    def fingerprint(projection):
        h=hashlib.sha256();p=subprocess.Popen(args+['-c',f'COPY (SELECT {projection} FROM {TABLE} s ORDER BY acquisition_id,source_object_id) TO STDOUT'],stdout=subprocess.PIPE,env=ENV)
        while chunk:=p.stdout.read(1048576):h.update(chunk)
        assert p.wait()==0
        return h.hexdigest()
    area=query(args,f"""SELECT count(*) FILTER(WHERE taxable_acreage IS NULL) null_acreage,
    count(*) FILTER(WHERE taxable_acreage=0) zero_acreage,
    count(*) FILTER(WHERE taxable_acreage>0) positive_acreage,
    count(*) FILTER(WHERE abs(approximate_geometry_area_sqft-taxable_acreage*43560)<=1) within_one_sqft,
    count(*) FILTER(WHERE taxable_acreage>0 AND abs(approximate_geometry_area_sqft/(taxable_acreage*43560)-1)<=0.01) within_one_percent,
    count(*) FILTER(WHERE taxable_acreage>0 AND abs(approximate_geometry_area_sqft/(taxable_acreage*43560)-1)>0.10) over_ten_percent,
    percentile_cont(ARRAY[0.05,0.5,0.95]) WITHIN GROUP(ORDER BY approximate_geometry_area_sqft/(NULLIF(taxable_acreage,0)*43560)) ratio_p05_p50_p95
    FROM {TABLE}""")[0]
    address=query(args,f"""SELECT count(*) FILTER(WHERE address IS NULL AND (situs_components->>'situs_address' IS NULL OR (situs_components->>'situs_address')::int<=0)) missing_or_nonpositive_number,
    count(*) FILTER(WHERE address IS NULL AND nullif(trim(situs_components->>'situs_street'),'') IS NULL) missing_street,
    count(*) FILTER(WHERE nullif(trim(situs_components->>'situs_suite'),'') IS NOT NULL) suite_present,
    count(*) FILTER(WHERE nullif(trim(situs_components->>'situs_building'),'') IS NOT NULL) building_present,
    count(*) FILTER(WHERE address IS NOT NULL AND (coalesce((situs_components->>'situs_address')::int,0)<=0 OR nullif(trim(situs_components->>'situs_street'),'') IS NULL)) fabricated_address
    FROM {TABLE}""")[0];assert address['fabricated_address']==0
    chosen={'ordinary':'5470501600','missingAddress':sql(args,f'SELECT apn_norm FROM {TABLE} WHERE address IS NULL ORDER BY source_object_id LIMIT 1')}
    stacked=query(args,f"SELECT apn_norm FROM {TABLE} WHERE parcel_id=(SELECT parcel_id FROM {TABLE} GROUP BY parcel_id HAVING count(*)>1 ORDER BY parcel_id LIMIT 1) ORDER BY apn_norm LIMIT 2")
    for n,r in enumerate(stacked):chosen[f'stacked{n}']=r['apn_norm']
    fixtures={name:{'input':apn,'response':envelope(args,apn)} for name,apn in chosen.items()}
    duplicates=query(args,"SELECT replace(apn_raw,'-','') apn FROM parcel_v2_rehearsal.rejection WHERE reasons ? 'DUPLICATE_APN_OR_OBJECTID' GROUP BY apn_raw ORDER BY apn_raw")
    for n,r in enumerate(duplicates):fixtures[f'quarantined{n}']={'input':r['apn'],'response':envelope(args,r['apn'])}
    fixtures['notFound']={'input':'0000000000','response':envelope(args,'0000000000')}
    assert not fixtures['notFound']['response']['rows'] and len(duplicates)==5
    result={'count':counts,'stacks':stacks,'scope':"situs_juris = 'SD'",'sourceIdsExactlyMatchScopedBase':source_ids_match,
    'apnSetFingerprint':fingerprint('apn_norm'),'fullRowFingerprint':fingerprint('row_to_json(s)::text'),
    'provenance':fixtures['ordinary']['response']['receipt'],'importIdentityInputs':import_inputs,'area':area,'address':address,'quarantinedApns':len(duplicates),'countywideBaseUnchanged':True,'productionReady':False}
    (output/'report.json').write_text(json.dumps(result,indent=2)+'\n');(output/'adapter-fixtures.json').write_text(json.dumps(fixtures,indent=2)+'\n')
    plans={}
    for name,q in {'apn':f"SELECT * FROM {TABLE} WHERE apn_norm='5470501600'",'cityCount':f'SELECT count(*) FROM {TABLE}',
    'spatial':f"SELECT source_object_id FROM {TABLE} WHERE geom && ST_MakeEnvelope(-117.16,32.71,-117.159,32.711,4326)",
    'stacked':f"SELECT apn_norm FROM {TABLE} WHERE parcel_id={fixtures['stacked0']['response']['rows'][0]['parcel_id']}"}.items():
        plans[name]=json.loads(sql(args,'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+q))
    (output/'plans.json').write_text(json.dumps(plans,indent=2)+'\n')
    print(json.dumps(result,indent=2))


if __name__=='__main__':run(*sys.argv[1:])

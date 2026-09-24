"""Verify full rebuild identity and deterministic sampling on the guarded local cluster."""
import hashlib
import json
import pathlib
import sys
from sample import QUERY,ROOT,connection,sql

def run(boundary,first,second,output):
 args=connection(boundary);directory=pathlib.Path(boundary).parent
 a=pathlib.Path(first).read_bytes();b=pathlib.Path(second).read_bytes();assert a==b
 sample=json.loads(a);assert sample['querySha256']==hashlib.sha256(QUERY.encode()).hexdigest()
 old=json.loads((ROOT/'data/parcel-serving-v2/report.json').read_text())
 fresh=json.loads((directory/'serving1/report.json').read_text())
 rebuilt=json.loads((directory/'serving2/report.json').read_text())
 assert old==fresh==rebuilt
 base=json.loads((directory/'base-run/reconciliation.json').read_text())
 assert base['fullDatabaseRowFingerprint']=='8bdf89447fd77bd616a882db15875e8674b999051a1954caf1d4cec8a6c6df45'
 apns=[r['apn_norm'] for r in sample['rows']];assert len(apns)==576 and len(set(apns))==576
 assert apns==sorted(apns) and all(len(a)==10 and a.isdigit() for a in apns)
 listed=','.join("'"+a+"'" for a in apns)
 assert int(sql(args,"SELECT count(*) FROM parcel_v2_rehearsal.rejection WHERE replace(apn_raw,'-','') IN ("+listed+")"))==0
 assert int(sql(args,'SELECT count(*) FROM parcel_serving_rehearsal.parcel_serving_v2 WHERE apn_norm IN ('+listed+')'))==576
 assert int(sql(args,'SELECT count(*) FROM parcel_v2_rehearsal.parcel_base_sangis_v2'))==1088430
 result={'checksPassed':8,'sampleSelectionsByteIdentical':True,'sampleSha256':hashlib.sha256(a).hexdigest(),'sampleQuerySha256':sample['querySha256'],'fullBaseFingerprint':base['fullDatabaseRowFingerprint'],'fullServingFingerprint':old['fullRowFingerprint'],'servingCount':393733,'baseCount':1088430,'servingReportExactlyMatchesPacket8AndBothRebuilds':True,'quarantinedSampleApns':0,'boundary':json.loads(pathlib.Path(boundary).read_text()),'baseImport':json.loads((directory/'base-run/import.json').read_text())}
 pathlib.Path(output).write_text(json.dumps(result,indent=2)+'\n');print('PASS 8 local identity/sample/rebuild checks')
if __name__=='__main__':run(*sys.argv[1:])

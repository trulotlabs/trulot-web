#!/usr/bin/env python3
import gzip,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];D=ROOT/'data/san-diego-property-intelligence-composition-v0';RAW=Path('/Users/ops/trulot-data/parcel-base-v2/sangis-20260924T183743Z/_ags_GeoJson_EB07F5BCE8A34D208D2A6A7801151FB3.geojson');MARK=b'"properties":{'
accepted=set()
with gzip.open(D/'assessor-derived-facts.ndjson.gz','rt') as f:
 for l in f:accepted.add(json.loads(l)['apn'])
vals={};inside=False;buf=bytearray();depth=0;string=False;escaped=False;carry=b''
with RAW.open('rb') as h:
 while chunk:=h.read(8*1024*1024):
  data=carry+chunk;carry=b'';i=0
  while i<len(data):
   if not inside:
    j=data.find(MARK,i)
    if j<0:carry=data[max(i,len(data)-len(MARK)+1):];break
    inside=True;buf=bytearray(b'{');depth=1;string=escaped=False;i=j+len(MARK);continue
   b=data[i];buf.append(b)
   if string:
    if escaped:escaped=False
    elif b==92:escaped=True
    elif b==34:string=False
   elif b==34:string=True
   elif b==123:depth+=1
   elif b==125:
    depth-=1
    if depth==0:
     x=json.loads(buf);apn=str(x.get('apn') or '')
     if x.get('situs_juris')=='SD' and apn in accepted:vals[apn]=x.get('asr_impr')
     inside=False;buf=bytearray()
   i+=1
if len(vals)!=393733:raise SystemExit(f'assessed improvement rows {len(vals)}')
def rewrite(name,fn):
 src=D/name;tmp=src.with_suffix(src.suffix+'.tmp')
 with gzip.open(src,'rt') as f,open(tmp,'wb') as raw:
  with gzip.GzipFile(fileobj=raw,mode='wb',mtime=0) as out:
   for l in f:
    x=json.loads(l);fn(x,vals[x['apn']]);out.write((json.dumps(x,separators=(',',':'),sort_keys=True)+'\n').encode())
 tmp.replace(src)
rewrite('assessor-derived-facts.ndjson.gz',lambda x,v:x.__setitem__('assessedImprovementValue',v if isinstance(v,(int,float)) and v>0 else None))
def comp(x,v):x['recordedProperty']['assessedImprovementValue']=v if isinstance(v,(int,float)) and v>0 else None
rewrite('parcel-property-intelligence.ndjson.gz',comp)
files={}
for p in sorted(D.iterdir()):
 if p.name!='artifact-integrity.json':files[p.name]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
(D/'artifact-integrity.json').write_text(json.dumps({'files':files},indent=2,sort_keys=True)+'\n')
print(json.dumps({'rows':len(vals),'positive':sum(isinstance(v,(int,float)) and v>0 for v in vals.values())}))

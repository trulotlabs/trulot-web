// Packet 9 only: fixed relation/columns, selected APNs only, GET only, no RPC or SQL.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const columns = ['apn_norm','address','situs_zip','lat','lng','lot_area_sqft','slug'];
export function requestUrl(base, apns) {
  const url = new URL(base);
  if (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.port) throw Error('Unexpected endpoint');
  if (!Array.isArray(apns) || apns.length < 1 || apns.length > 40 || new Set(apns).size !== apns.length || apns.some(a=>!/^\d{10}$/.test(a))) throw Error('Invalid bounded APN batch');
  url.pathname='/rest/v1/parcel_page_api_v2';url.search='';url.hash='';
  url.searchParams.set('select',columns.join(','));url.searchParams.set('apn_norm',`in.(${apns.join(',')})`);
  url.searchParams.set('order','apn_norm.asc');url.searchParams.set('limit',String(apns.length+1));
  return url;
}
export function completeBatch(rows,range,selected) {
  const total=range?.match(/\/(\d+)$/)?.[1];
  return Array.isArray(rows) && total!==undefined && Number(total)===rows.length && rows.length<=selected.length && rows.every(r=>r && selected.includes(r.apn_norm)) && new Set(rows.map(r=>r.apn_norm)).size===rows.length;
}
export async function run(sampleFile, envFile, outputFile) {
  if (fs.existsSync(outputFile)) throw Error('Evidence already exists');
  const bytes=fs.readFileSync(sampleFile);const sample=JSON.parse(bytes);
  const apns=sample.rows.map(r=>r.apn_norm);
  if(apns.length<500 || apns.length>1000 || new Set(apns).size!==apns.length) throw Error('Sample bound failed');
  const env={};for(const line of fs.readFileSync(envFile,'utf8').split(/\r?\n/)) {
    const match=line.match(/^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY)=(.*)$/);
    if(match) env[match[1]]=match[2].trim().replace(/^(['"])(.*)\1$/,'$2');
  }
  const base=env.NEXT_PUBLIC_SUPABASE_URL,key=env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!key) throw Error('Local anonymous credential unavailable');
  // Reject privileged JWT credentials; no auth/session refresh client is initialized.
  try { if(JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role!=='anon') throw Error(); }
  catch { throw Error('Expected existing anon JWT credential'); }
  const batches=[];let consecutiveFailures=0;
  for(let i=0;i<apns.length;i+=40) {
    const selected=apns.slice(i,i+40),url=requestUrl(base,selected);
    const receipt={apns:selected,timestamp:new Date().toISOString(),status:'unavailable'};
    if(consecutiveFailures>=2){receipt.reason='not_attempted_after_two_failures';batches.push(receipt);continue;}
    try {
      const response=await fetch(url,{method:'GET',redirect:'error',headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json','Accept-Profile':'public',Prefer:'count=exact'},signal:AbortSignal.timeout(20000)});
      receipt.httpStatus=response.status;
      if(response.ok) {
        const rows=await response.json(); const range=response.headers.get('content-range');
        if(!completeBatch(rows,range,selected)) receipt.reason='incomplete_or_malformed_response';
        else {receipt.status='available';receipt.rows=rows;receipt.contentRange=range;}
      } else receipt.reason='http_error';
    } catch {receipt.reason='transport_or_json_error';}
    consecutiveFailures=receipt.status==='available'?0:consecutiveFailures+1;
    batches.push(receipt);
    console.log(`Batch ${batches.length}: ${receipt.status}${receipt.httpStatus?' HTTP '+receipt.httpStatus:''}`);
  }
  const result={relation:'public.parcel_page_api_v2',columns,sampleSize:apns.length,sampleSha256:crypto.createHash('sha256').update(bytes).digest('hex'),
    queryMode:'GET /rest/v1/parcel_page_api_v2?select=<fixed>&apn_norm=in.(<explicit batch>)&order=apn_norm.asc&limit=batch+1; count=exact',
    readOnlyGuard:'PostgREST table GET is READ ONLY; fixed relation/columns, anon JWT only, <=40 explicit APNs/request, <=1000 total, no redirects/RPC/SDK/session/write helpers. Completeness checked against Content-Range.',
    endpointHost:new URL(base).hostname,batches};
  fs.writeFileSync(outputFile,JSON.stringify(result)+'\n',{flag:'wx',mode:0o600});
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) await run(...process.argv.slice(2));

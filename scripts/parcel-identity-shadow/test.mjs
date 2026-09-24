import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {addressClass,normalizeAddress,distanceBucket,distanceMeters,areaDelta,existence,sourceState,compare,routeComparison,shadow,discrepancy} from './compare.mjs';
import {requestUrl,columns,run,completeBatch} from './fetch-legacy.mjs';
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS '+name);}
const apn='5470501600',l={apn_norm:apn,address:'740 47th St',situs_zip:'92102',lat:32.7,lng:-117.1,lot_area_sqft:100,slug:null};
const v={apn_norm:apn,address:'740 47TH ST',situs_zip:'92102',situs_juris:'SD',lat:32.7,lng:-117.1,pos_lat:32.7,pos_lng:-117.1,approximate_geometry_area_sqft:100,taxable_acreage:null};
const env=r=>({status:'available',rows:[r]});
await test('case, whitespace and safe token punctuation normalize',()=>{assert.equal(normalizeAddress(' 740  47th St. '),'740 47TH ST');assert.equal(addressClass(l.address,v.address),'NORMALIZED_EQUIVALENT');assert.equal(addressClass(' x ','x'),'NORMALIZED_EQUIVALENT');});
await test('unit, fraction, apostrophe, hyphen and street semantics retained',()=>{for(const a of ['740 47TH ST UNIT 2','740 1/2 47TH ST','740.5 47TH ST','740 47-TH ST',"740 O'NEIL ST"]){assert.equal(addressClass(a,v.address),'SUBSTANTIVE_DIFFERENCE');}});
await test('six address states',()=>{for(const [a,b,s] of [['x','x','EXACT'],['x','X','NORMALIZED_EQUIVALENT'],['x','y','SUBSTANTIVE_DIFFERENCE'],[null,'x','LEGACY_NULL_V2_VALUE'],['x',null,'LEGACY_VALUE_V2_NULL'],[null,null,'BOTH_NULL']])assert.equal(addressClass(a,b),s);});
await test('distance boundaries',()=>{for(const [d,b] of [[0,'EFFECTIVELY_EQUAL'],[.01,'EFFECTIVELY_EQUAL'],[.011,'LT_1M'],[1,'1_TO_5M'],[5,'5_TO_25M'],[25,'5_TO_25M'],[25.001,'GT_25M']])assert.equal(distanceBucket(d),b);assert.equal(distanceMeters(l,l),0);assert.ok(Math.abs(distanceMeters({lat:0,lng:0},{lat:0,lng:1})-111195)<1);});
await test('area delta magnitude, direction, percent and boundaries',()=>{assert.deepEqual(areaDelta(100,110),{absoluteSqft:10,signedSqft:10,percent:10,bucket:'5_TO_10_PERCENT'});for(const [x,b] of [[100,'LT_1_PERCENT'],[101,'1_TO_5_PERCENT'],[105,'5_TO_10_PERCENT'],[111,'GT_10_PERCENT']])assert.equal(areaDelta(100,x).bucket,b);assert.equal(areaDelta(100,90).signedSqft,-10);});
await test('null and zero area are not numeric equality',()=>{assert.equal(areaDelta(null,null).bucket,'BOTH_NULL');assert.equal(areaDelta(null,1).bucket,'LEGACY_NULL');assert.equal(areaDelta(1,null).bucket,'V2_NULL');assert.equal(areaDelta(0,1).percent,null);});
await test('five existence states',()=>{for(const [a,b,s] of [['present','present','BOTH_PRESENT'],['absent','present','V2_ONLY'],['present','absent','LEGACY_ONLY'],['unavailable','present','LEGACY_UNAVAILABLE'],['present','unavailable','V2_UNAVAILABLE']])assert.equal(existence(a,b),s);});
await test('malformed/unavailable/duplicate/mismatched legacy cannot establish parity',()=>{for(const response of [null,{status:'unavailable',rows:[]},{status:'available'},env({...l,apn_norm:'0000000000'}),env({...l,lat:'32.7'}),env({...l,lat:NaN}),env({...l,slug:undefined}),{status:'available',rows:[l,l]}, {...env(l),error:'failed'}])assert.equal(compare(apn,response,env(v)).presence,'LEGACY_UNAVAILABLE');});
await test('validated empty legacy distinguishes absence',()=>assert.equal(sourceState({status:'available',rows:[]},apn),'absent'));
await test('unavailable V2 is independent of legacy',()=>assert.equal(compare(apn,env(l),{status:'unavailable'}).presence,'V2_UNAVAILABLE'));
await test('numeric differences never assert correction or vintage',()=>{assert.equal(discrepancy('geometry_area',{}).classification,'LEGACY_SEMANTICS_UNKNOWN');assert.equal(discrepancy('address',{}).classification,'UNRESOLVED');});
await test('canonical routing and null display fallback use actual slug helper',()=>{assert.equal(routeComparison(apn,l.address,v.address).classification,'none');const n=routeComparison(apn,null,null);assert.equal(n.currentSlug,'547-050-16-00-apn-547-050-16-00');assert.equal(n.v2Slug,'apn-5470501600');assert.equal(n.classification,'requires canonical redirect strategy');assert.equal(routeComparison(apn,'740 47th St.','740 47TH ST').classification,'none');assert.equal(routeComparison(apn,'740,47TH ST','740 47TH ST').classification,'none');assert.equal(routeComparison(apn,'740 47TH ST','742 47TH ST').classification,'requires canonical redirect strategy');});
await test('redirect-safe and unresolved route classifications',()=>{assert.equal(routeComparison(apn,'1 Straße','1 STRASSE').classification,'redirect-safe');assert.equal(routeComparison('invalid','x','y').classification,'unresolved');});
await test('current output retained by object identity even if either source throws',async()=>{const current=Object.freeze({status:'found',nested:Object.freeze({address:'unchanged'})});for(const fail of [false,true]){const r=await shadow(current,apn,async()=>{if(fail)throw Error('private');return env(l);},async()=>{throw Error('private');});assert.equal(r.selected,current);assert.doesNotMatch(JSON.stringify(r),/private/);}});
await test('raw fields retained and acreage stays separate',()=>{const c=compare(apn,env(l),env(v));assert.equal(c.address.legacy,l.address);assert.equal(c.area.taxable.bucket,'V2_NULL');assert.equal(c.area.semantics,'unresolved');assert.equal(c.coordinates.centroid.legacyLineage,'unknown');});
await test('HTTP boundary rejects broad/untrusted endpoint and APN injection',()=>{for(const args of [['http://abc.supabase.co',[apn]],['https://evil.com',[apn]],['https://abc.supabase.co',[]],['https://abc.supabase.co',Array(41).fill(apn)],['https://abc.supabase.co',['1)']]])assert.throws(()=>requestUrl(...args));const u=requestUrl('https://abc.supabase.co',[apn]);assert.equal(u.pathname,'/rest/v1/parcel_page_api_v2');assert.equal(u.searchParams.get('select'),columns.join(','));assert.equal(u.searchParams.get('apn_norm'),'in.('+apn+')');assert.equal(u.searchParams.get('limit'),'2');});
await test('no runtime shadow wiring',()=>{for(const f of ['lib/parcel-page-v1.ts','app/parcel/san-diego/[slug]/page.tsx'])assert.doesNotMatch(fs.readFileSync(new URL('../../'+f,import.meta.url),'utf8'),/parcel-identity-shadow|parcel-serving-v2|parcel_serving_v2/);});
await test('bounded GET collector opens circuit after HTTP and transport errors',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trulot-shadow-test-'));
  const original=globalThis.fetch;
  try {
    const rows=Array.from({length:500},(_,i)=>({apn_norm:String(i).padStart(10,'0')}));
    fs.writeFileSync(dir+'/sample.json',JSON.stringify({rows}));
    fs.writeFileSync(dir+'/env','NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=x.'+Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')+'.x\n');
    let calls=0;
    globalThis.fetch=async (url,options)=>{
      assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
      assert.equal(url.pathname,'/rest/v1/parcel_page_api_v2');
      const selected=url.searchParams.get('apn_norm').slice(4,-1).split(',');
      assert.ok(selected.length<=40);assert.ok(selected.every(a=>rows.some(r=>r.apn_norm===a)));
      calls++;
      if(calls===1)return {ok:false,status:403};
      if(calls===2)throw Error('secret transport details');
      return {ok:true,status:200,json:async()=>[],headers:new Headers({'content-range':'*/0'})};
    };
    await run(dir+'/sample.json',dir+'/env',dir+'/result.json');
    const result=JSON.parse(fs.readFileSync(dir+'/result.json'));
    assert.equal(calls,2);assert.equal(result.batches.length,13);assert.ok(result.batches.every(b=>b.status==='unavailable'));
    assert.ok(result.batches.slice(2).every(b=>b.reason==='not_attempted_after_two_failures'));
    assert.doesNotMatch(JSON.stringify(result),/secret transport details|Authorization|apikey/);
  } finally {globalThis.fetch=original;fs.rmSync(dir,{recursive:true,force:true});}
});
await test('batch completeness rejects truncation, duplicates, missing count, null and foreign APNs',()=>{
  assert.equal(completeBatch([], '*/0',[apn]),true);
  assert.equal(completeBatch([l], '0-0/1',[apn]),true);
  for(const [rows,range] of [[[], '*/1'],[[l,l],'0-1/2'],[[null],'0-0/1'],[[{apn_norm:'0000000000'}],'0-0/1'],[[l],null],[{},'*/0']])assert.equal(completeBatch(rows,range,[apn]),false);
});
const samplePath=new URL('../../data/parcel-identity-shadow/sample.json',import.meta.url);
if(fs.existsSync(samplePath))await test('committed sample unique sorted APNs and all strata',()=>{const s=JSON.parse(fs.readFileSync(samplePath));const apns=s.rows.map(r=>r.apn_norm);assert.ok(apns.length>=500);assert.equal(new Set(apns).size,apns.length);assert.deepEqual(apns,[...apns].sort());for(const tag of ['ordinary','stacked','missing_address','acreage_null','acreage_populated','polygon','multipolygon','centroid_outside','zip_representative','historical_example','area_smallest','area_largest','quarantine_numeric_predecessor','quarantine_numeric_successor'])assert.ok(s.rows.some(r=>r.strata.includes(tag)),tag);});
if(fs.existsSync(samplePath))await test('offline report exactly reproduces committed evidence without treating unavailability as parity',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trulot-shadow-report-'));
  try {
    const root=new URL('../../',import.meta.url);
    const data=new URL('data/parcel-identity-shadow/',root);
    execFileSync(process.execPath,[new URL('./report.mjs',import.meta.url).pathname,new URL('sample.json',data).pathname,new URL('legacy-receipt.json',data).pathname,dir],{stdio:'pipe'});
    for(const name of ['report.json','comparisons.json'])assert.equal(fs.readFileSync(dir+'/'+name,'utf8'),fs.readFileSync(new URL(name,data),'utf8'));
    const r=JSON.parse(fs.readFileSync(dir+'/report.json'));
    assert.equal(r.pairedDenominator,0);assert.equal(r.presence.LEGACY_UNAVAILABLE,576);assert.equal(r.addresses.EXACT,0);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
console.log(`${checks} identity shadow checks passed`);

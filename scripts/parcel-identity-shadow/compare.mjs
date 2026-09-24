// Offline diagnostics only. This module has no network client or runtime selection path.
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const loadedModule={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../../lib/parcel-slug.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:loadedModule,exports:loadedModule.exports});
const {canonicalParcelSlug,formatApnForDisplay,extractApnFromSlug}=loadedModule.exports;
export const classes=['V2_CORRECTION','SOURCE_VINTAGE_CHANGE','LEGACY_ENRICHMENT','LEGACY_SEMANTICS_UNKNOWN','V2_DEFECT_CANDIDATE','UNRESOLVED'];
export const text=v=>v===null?null:v.trim()||null;
export function normalizeAddress(value) {return value===null?null:text(value)?.toUpperCase().replace(/(?<=[A-Z])\.(?=\s|$)/g,'').replace(/,(?=\s|$)/g,' ').replace(/\s+/g,' ').trim()||null;}
export function addressClass(a,b) {
  const rawEqual=a===b; a=text(a);b=text(b);
  if(a===null && b===null)return 'BOTH_NULL';
  if(a===null)return 'LEGACY_NULL_V2_VALUE';if(b===null)return 'LEGACY_VALUE_V2_NULL';
  if(rawEqual)return 'EXACT';if(normalizeAddress(a)===normalizeAddress(b))return 'NORMALIZED_EQUIVALENT';return 'SUBSTANTIVE_DIFFERENCE';
}
const number=v=>typeof v==='number' && Number.isFinite(v);
const nullableNumber=v=>v===null||number(v);
const nullableText=v=>v===null||typeof v==='string';
export function validLegacy(row,apn) {
  return row && row.apn_norm===apn && /^\d{10}$/.test(apn) && ['address','situs_zip','slug'].every(k=>nullableText(row[k])) && ['lat','lng','lot_area_sqft'].every(k=>nullableNumber(row[k])) && (row.lat===null||Math.abs(row.lat)<=90) && (row.lng===null||Math.abs(row.lng)<=180) && (row.lot_area_sqft===null||row.lot_area_sqft>=0);
}
function validV2(r,apn) {return r && r.apn_norm===apn && /^\d{10}$/.test(apn) && r.situs_juris==='SD' && nullableText(r.address) && nullableText(r.situs_zip) && ['lat','lng','pos_lat','pos_lng'].every(k=>number(r[k])) && Math.abs(r.lat)<=90 && Math.abs(r.pos_lat)<=90 && Math.abs(r.lng)<=180 && Math.abs(r.pos_lng)<=180 && number(r.approximate_geometry_area_sqft) && r.approximate_geometry_area_sqft>0 && nullableNumber(r.taxable_acreage) && (r.taxable_acreage===null||r.taxable_acreage>=0);}
export function sourceState(envelope,apn,validator=validLegacy) {
  if(!envelope || envelope.status!=='available' || !Array.isArray(envelope.rows) || envelope.rows.length>1 || envelope.error || envelope.rows.some(r=>!validator(r,apn))) return 'unavailable';
  return envelope.rows.length===0?'absent':'present';
}
export function existence(legacy,v2) {
  if(legacy==='unavailable')return 'LEGACY_UNAVAILABLE';
  if(v2==='unavailable')return 'V2_UNAVAILABLE';
  if(legacy==='present' && v2==='present')return 'BOTH_PRESENT';
  if(v2==='present')return 'V2_ONLY';
  if(legacy==='present')return 'LEGACY_ONLY';
  return 'V2_UNAVAILABLE'; // Neither present: no comparison subject, not parity evidence.
}
export function distanceMeters(a,b) {
  const rad=x=>x*Math.PI/180;
  const h=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;
  return 6371008.8*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
export function distanceBucket(d) {return d<=0.01?'EFFECTIVELY_EQUAL':d<1?'LT_1M':d<5?'1_TO_5M':d<=25?'5_TO_25M':'GT_25M';}
export function areaDelta(legacy,v2) {
  if(legacy===null||v2===null)return {bucket:legacy===null&&v2===null?'BOTH_NULL':legacy===null?'LEGACY_NULL':'V2_NULL',absoluteSqft:null,percent:null};
  const absoluteSqft=Math.abs(v2-legacy),percent=legacy===0?null:absoluteSqft/Math.abs(legacy)*100;
  return {absoluteSqft,signedSqft:v2-legacy,percent,bucket:percent===null?'ZERO_REFERENCE':percent<1?'LT_1_PERCENT':percent<5?'1_TO_5_PERCENT':percent<=10?'5_TO_10_PERCENT':'GT_10_PERCENT'};
}
export function routeComparison(apn,legacyAddress,v2Address) {
  const currentSlug=canonicalParcelSlug(apn,text(legacyAddress)||`APN ${formatApnForDisplay(apn)}`);
  const v2Slug=canonicalParcelSlug(apn,text(v2Address));
  const sameApn=extractApnFromSlug(currentSlug)===apn && extractApnFromSlug(v2Slug)===apn;
  return {currentSlug,v2Slug,sameApn,classification:currentSlug===v2Slug?'none':!sameApn?'unresolved':['EXACT','NORMALIZED_EQUIVALENT'].includes(addressClass(legacyAddress,v2Address))?'redirect-safe':'requires canonical redirect strategy'};
}
export function discrepancy(field,details) {
  // Numeric similarity cannot establish lineage or vintage. No correction/enrichment claim without provenance.
  return {field,classification:['centroid','point_on_surface','geometry_area','taxable_area','stored_slug'].includes(field)?'LEGACY_SEMANTICS_UNKNOWN':'UNRESOLVED',details};
}
export function compare(apn,legacy,v2) {
  const ls=sourceState(legacy,apn),vs=sourceState(v2,apn,validV2);
  const out={apn,legacyState:ls,v2State:vs,presence:existence(ls,vs),discrepancies:[]};
  if(out.presence!=='BOTH_PRESENT') {out.discrepancies.push(discrepancy('presence',{legacy:ls,v2:vs}));return out;}
  const l=legacy.rows[0],v=v2.rows[0];out.address={legacy:l.address,v2:v.address,classification:addressClass(l.address,v.address)};
  if(!['EXACT','NORMALIZED_EQUIVALENT','BOTH_NULL'].includes(out.address.classification))out.discrepancies.push(discrepancy('address',out.address));
  out.zip={legacy:l.situs_zip,v2:v.situs_zip,equal:text(l.situs_zip)===text(v.situs_zip)};
  if(!out.zip.equal)out.discrepancies.push(discrepancy('zip',out.zip));
  out.coordinates={};
  for(const [name,point] of [['centroid',{lat:v.lat,lng:v.lng}],['point_on_surface',{lat:v.pos_lat,lng:v.pos_lng}]]) {
    const d=l.lat===null||l.lng===null?null:distanceMeters(l,point);
    const detail={legacy:{lat:l.lat,lng:l.lng},v2:point,latitudeDelta:l.lat===null?null:point.lat-l.lat,longitudeDelta:l.lng===null?null:point.lng-l.lng,meters:d,bucket:d===null?'LEGACY_NULL':distanceBucket(d),legacyLineage:'unknown'};
    out.coordinates[name]=detail;if(detail.bucket!=='EFFECTIVELY_EQUAL')out.discrepancies.push(discrepancy(name,detail));
  }
  out.area={legacyField:'lot_area_sqft',legacy:l.lot_area_sqft,geometrySqft:v.approximate_geometry_area_sqft,taxableAcreage:v.taxable_acreage,semantics:'unresolved',geometry:areaDelta(l.lot_area_sqft,v.approximate_geometry_area_sqft),taxable:areaDelta(l.lot_area_sqft,v.taxable_acreage===null?null:v.taxable_acreage*43560)};
  for(const [name,delta] of [['geometry_area',out.area.geometry],['taxable_area',out.area.taxable]])if(delta.absoluteSqft!==0 && delta.bucket!=='BOTH_NULL')out.discrepancies.push(discrepancy(name,delta));
  out.route=routeComparison(apn,l.address,v.address);out.route.legacyStoredSlug=l.slug;
  if(out.route.classification!=='none')out.discrepancies.push(discrepancy('route',out.route));
  if(l.slug!==null && l.slug!==out.route.currentSlug)out.discrepancies.push(discrepancy('stored_slug',{stored:l.slug,currentCanonical:out.route.currentSlug}));
  return out;
}
export async function shadow(currentOutput,apn,getLegacy,getV2) {
  // Current result is returned by identity, even if either diagnostic source throws.
  const safe=async fn=>{try{return await fn(apn);}catch{return {status:'unavailable'};}};
  try {const [l,v]=await Promise.all([safe(getLegacy),safe(getV2)]);return {selected:currentOutput,diagnostics:compare(apn,l,v)};}
  catch {return {selected:currentOutput,diagnostics:{apn,error:'comparison_unavailable'}};}
}

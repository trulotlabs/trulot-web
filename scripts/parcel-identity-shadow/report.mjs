import fs from 'node:fs';
import crypto from 'node:crypto';
import {compare,classes,addressClass,routeComparison} from './compare.mjs';
import {completeBatch} from './fetch-legacy.mjs';
const [sampleFile,legacyFile,outdir]=process.argv.slice(2);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sample=read(sampleFile),legacy=read(legacyFile);
if(legacy.sampleSha256!==crypto.createHash('sha256').update(fs.readFileSync(sampleFile)).digest('hex'))throw Error('Legacy receipt sample mismatch');
const records=sample.rows.map(v=>{
  const batches=legacy.batches.filter(b=>b.apns.includes(v.apn_norm));
  const b=batches.length===1?batches[0]:null;
  const l=b?.status==='available' && completeBatch(b.rows,b.contentRange,b.apns)?{status:'available',rows:b.rows.filter(r=>r.apn_norm===v.apn_norm)}:{status:'unavailable'};
  return compare(v.apn_norm,l,{status:'available',rows:[v]});
});
const count=(values,defaults=[])=>{const out=Object.fromEntries(defaults.map(k=>[k,0]));for(const k of values)out[k]=(out[k]||0)+1;return out;};
const paired=records.filter(r=>r.presence==='BOTH_PRESENT');
const representative={address:paired.filter(r=>r.address.classification==='SUBSTANTIVE_DIFFERENCE').slice(0,8),
 nullAddress:paired.filter(r=>['LEGACY_NULL_V2_VALUE','LEGACY_VALUE_V2_NULL','BOTH_NULL'].includes(r.address.classification)).slice(0,5),
 coordinateOutliers:[...paired].filter(r=>r.coordinates.centroid.meters!==null).sort((a,b)=>b.coordinates.centroid.meters-a.coordinates.centroid.meters).slice(0,8),
 areaOutliers:[...paired].filter(r=>r.area.geometry.percent!==null).sort((a,b)=>b.area.geometry.percent-a.area.geometry.percent).slice(0,8),
 historical:records.filter(r=>r.apn==='5470501600')};
const historical=sample.rows.find(r=>r.apn_norm==='5470501600');
const report={comparisonStatus:paired.length===0?'NO_PAIRED_LEGACY_EVIDENCE':'PAIRED_SAMPLE_AVAILABLE',pairedDenominator:paired.length,sampleSize:records.length,algorithm:sample.algorithm,servingFingerprint:sample.servingFingerprint,
 strata:count(sample.rows.flatMap(r=>r.strata)),rawZipCount:new Set(sample.rows.map(r=>r.situs_zip)).size,zip5Count:new Set(sample.rows.map(r=>r.situs_zip?.trim().slice(0,5)).filter(Boolean)).size,
 actualCoverage:{ordinary:sample.rows.filter(r=>r.stack_count===1).length,stacked:sample.rows.filter(r=>r.stack_count>1).length,missingAddress:sample.rows.filter(r=>r.address===null).length,acreageNull:sample.rows.filter(r=>r.taxable_acreage===null).length,acreagePopulated:sample.rows.filter(r=>r.taxable_acreage!==null).length,geometry:count(sample.rows.map(r=>r.geometry_type)),centroidOutside:sample.rows.filter(r=>!r.centroid_within).length},
 presence:count(records.map(r=>r.presence),['BOTH_PRESENT','V2_ONLY','LEGACY_ONLY','LEGACY_UNAVAILABLE','V2_UNAVAILABLE']),
 addresses:count(paired.map(r=>r.address.classification),['EXACT','NORMALIZED_EQUIVALENT','SUBSTANTIVE_DIFFERENCE','LEGACY_NULL_V2_VALUE','LEGACY_VALUE_V2_NULL','BOTH_NULL']),
 zip:count(paired.map(r=>r.zip.equal?'equal':'different')),
 coordinates:Object.fromEntries(['centroid','point_on_surface'].map(k=>[k,count(paired.map(r=>r.coordinates[k].bucket),['EFFECTIVELY_EQUAL','LT_1M','1_TO_5M','5_TO_25M','GT_25M','LEGACY_NULL'])])),
 area:Object.fromEntries(['geometry','taxable'].map(k=>[k,count(paired.map(r=>r.area[k].bucket),['LT_1_PERCENT','1_TO_5_PERCENT','5_TO_10_PERCENT','GT_10_PERCENT','LEGACY_NULL','V2_NULL','BOTH_NULL','ZERO_REFERENCE'])])),
 routes:count(paired.map(r=>r.route.classification),['none','redirect-safe','requires canonical redirect strategy','unresolved']),
 discrepancyCounts:count(records.flatMap(r=>r.discrepancies.map(d=>d.classification)),classes),
 discrepancyFieldCounts:count(records.flatMap(r=>r.discrepancies.map(d=>d.field))),
 limitations:['Sample is V2-seeded: cannot estimate legacy-only population or citywide parity. Zero LEGACY_ONLY is by construction.','Legacy source vintage, coordinate methodology and area lineage remain unknown. Proximity and equality do not establish provenance.','Parcel ID and jurisdiction are not exposed by the audited legacy subset; no substitute city/name inference.','Quarantine neighbors are numeric APN neighbors only, not proof of geographic or cadastral relation.','Multiple bounded GETs are not a transactionally consistent city snapshot. Absence is scoped to anonymous public-reader visibility.'],historicalReference:historical?{source:'23cbcc4351c4734a980e3303635758537701b51e:app/page.tsx:39-42',meaning:'Committed display/link example only, not a legacy database row or current canonical URL observation.',apn:historical.apn_norm,legacyDisplay:'740 47th St',v2Address:historical.address,addressComparison:addressClass('740 47th St',historical.address),hypotheticalCurrentRouteComparison:routeComparison(historical.apn_norm,'740 47th St',historical.address)}:null,representative};
fs.mkdirSync(outdir,{recursive:true});
fs.writeFileSync(outdir+'/report.json',JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(outdir+'/comparisons.json',JSON.stringify(records.map(r=>({apn:r.apn,presence:r.presence,address:r.address?.classification,route:r.route?.classification,discrepancies:r.discrepancies.map(d=>({field:d.field,classification:d.classification}))})))+'\n');
console.log(JSON.stringify({...report,representative:undefined},null,2));

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import os from 'node:os';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {fixture,root,renderToStaticMarkup} from '../parcel-v1-test-fixture.mjs';
const require=createRequire(import.meta.url),cache=new Map(),read=p=>JSON.parse(fs.readFileSync(p));
function load(file){
 file=path.resolve(file);if(file.endsWith('.json'))return read(file);if(cache.has(file))return cache.get(file).exports;
 const loadedModule={exports:{}};cache.set(file,loadedModule);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module:loadedModule,exports:loadedModule.exports,process,require:id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id+(path.extname(id)?'':'.ts'))):require(id)});
 return loadedModule.exports;
}
const {rehearseResidentialParameters}=load(path.join(root,'scripts/rs17-parameter-rehearsal/adapter.ts'));
const {residentialPresentation,renderResidentialDisplay,coverageQualifier}=load(path.join(root,'scripts/residential-display-shadow/display.ts'));
const {renderRs17RuntimeShadow}=load(path.join(root,'lib/rs17-runtime-shadow.ts'));
const safe=read(path.join(root,'data/residential-standards-review/residential_standards_v2_integration_safe.json'));
const corpus=read(path.join(root,'data/zoning-standards-v2/rules.json'));
assert.equal(safe.length,97);assert.ok(safe.every(r=>r.review_state==='SOURCE_VERIFIED'));
const ids=new Set(safe.map(r=>r.rule_id)),excluded=corpus.filter(r=>!ids.has(r.rule_id));assert.equal(excluded.length,717);
const source=read(path.join(root,'data/zoning-serving-v2/golden-fixture.json'));
const authority={observation:read(path.join(root,'data/residential-standards-review/source-observation.json')),sourcePaths:read(process.argv[2])};
const context={evaluation_date:'2026-09-24',coastal_context:'outside',application_context:'new_application',airport_context:'outside_miramar_transition',lot_context:'unknown'};
const output=process.argv[3];assert.ok(output,'Explicit output directory required');fs.mkdirSync(output,{recursive:true});
function inputFor(zones){
 const f=structuredClone(zones.length>1?source.cases.multiZone:source.cases.singleZone),apn='3113333800';
 f.parcelResponse.rows.forEach(r=>r.apn_norm=apn);const row=f.zoningResponse.row;
 row.apn=apn;row.dominantZoneCode=zones[0];row.zoneEvidence.forEach((r,i)=>r.zoneCode=zones[i]);
 return {apn,parcelResponse:f.parcelResponse,zoningResponse:f.zoningResponse,context:{...context},authority:structuredClone(authority)};
}
const cases=[...new Set(safe.map(r=>r.zone_code))].sort().map(zone=>({id:zone,zones:[zone]}));
cases.push({id:'split',zones:['RS-1-7','RM-1-1']},{id:'split-one-approved',zones:['RX-1-2','UNKNOWN']},
 {id:'zero-safe-synthetic',zones:['RS-TEST-UNRECOGNIZED']},{id:'unknown-zone',zones:['UNKNOWN']},
 {id:'unmapped',zones:['RS-1-7'],mapping:'UNMAPPED'},{id:'indeterminate',zones:['RS-1-7'],mapping:'INDETERMINATE'},
 {id:'unknown-coastal',zones:['RS-1-7'],coastal:'unknown'},{id:'inside-coastal',zones:['RS-1-7'],coastal:'inside'},
 {id:'source-drift',zones:['RS-1-7'],drift:true},{id:'parcel-unavailable',zones:['RS-1-7'],parcelUnavailable:true});
const seen=new Set(),results=[],goodByZone=new Map();
for(const c of cases){
 const input=inputFor(c.zones);
 if(c.coastal)input.context.coastal_context=c.coastal;
 if(c.drift)input.authority.observation.sources.residential.sha256='drift';
 if(c.mapping==='UNMAPPED')Object.assign(input.zoningResponse.row,{mappingState:'UNMAPPED',dominantZoneCode:null,zoneEvidence:[],distinctZoneCount:0,totalCoveredPercent:0,dominantCoveragePercent:null,secondaryCoveragePercent:0});
 if(c.mapping==='INDETERMINATE')input.zoningResponse.row.mappingState='INDETERMINATE';
 const result=await rehearseResidentialParameters(input.apn,async()=>{if(c.parcelUnavailable)throw Error('fixture');return input.parcelResponse;},async()=>input.zoningResponse,input.context,input.authority);
 const model=residentialPresentation(result),html=renderResidentialDisplay(result),rows=model.groups.flatMap(g=>g.rows);
 const expected=c.coastal||c.drift||c.mapping||c.parcelUnavailable?0:safe.filter(r=>c.zones.includes(r.zone_code)).length;
 assert.equal(rows.length,expected,c.id);assert.ok(html.includes(coverageQualifier));
 assert.doesNotMatch(html,/Your lot must be|This parcel qualifies|You can build|Maximum units|The parcel meets|Allowed development/i);
 for(const r of rows){seen.add(r.rule.rule_id);assert.ok(html.includes(r.rule.rule_id)&&html.includes(r.rule.source_sha256));assert.ok(r.rule.source_evidence.page_evidence);if(r.rule.conditions.length)assert.ok(html.includes('Corner-lot condition; no parcel determination'));}
 if(c.zones.length>1){assert.equal(model.groups.length,c.zones.length);for(const g of model.groups)assert.ok(g.rows.every(r=>r.rule.zone_code===g.zone));}
 if(c.mapping||c.parcelUnavailable)assert.equal(result.standards.length,0);
 if(c.id==='RX-1-2'){assert.equal(rows.length,1);assert.equal(rows[0].rule.standard_type,'lot_depth_min');}
 if(c.zones.length===1&&expected)goodByZone.set(c.zones[0],result);
 fs.writeFileSync(path.join(output,c.id+'.json'),JSON.stringify(input,null,2));
 results.push({id:c.id,rows:rows.length,ruleIds:rows.map(r=>r.rule.rule_id)});console.log('PASS '+c.id);
}
assert.deepEqual([...seen].sort(),[...ids].sort());
for(const r of excluded){
 const attack=structuredClone(goodByZone.get(r.zone_code));assert.ok(attack);
 Object.assign(attack.standards[0].parameters[0].value,r,{review_state:'SOURCE_VERIFIED'});
 assert.equal(residentialPresentation(attack).groups.flatMap(g=>g.rows).length,0,r.rule_id);
}
const good=goodByZone.get('RS-1-7');let mutations=0;
for(const field of ['operator','dependency_record','authority_review','source','source_evidence','source_sha256','source_section','rule_set_version','version_profile','authority_metadata','approved_context','dependency_evidence','unresolved_dependencies','applicability_state','actual_lot_context','condition_branch_evaluated','conditions']){
 const a=structuredClone(good);delete a.standards[0].parameters[1].value[field];assert.equal(residentialPresentation(a).groups[0].rows.length,0,field);mutations++;
}
for(const state of ['INTERPRETATION_REQUIRED','APPLICABILITY_UNRESOLVED','SOURCE_INCOMPLETE','CONFLICTING_AUTHORITY','MALFORMED',null]){
 const a=structuredClone(good);a.standards[0].parameters[0].value.review_state=state;assert.equal(residentialPresentation(a).groups[0].rows.length,0);mutations++;
}
const a=structuredClone(good);delete a.standards[0].parameters[0].provenance;assert.equal(residentialPresentation(a).groups[0].rows.length,0);mutations++;
const reverse=structuredClone(good);reverse.standards[0].parameters.reverse();assert.equal(renderResidentialDisplay(reverse),renderResidentialDisplay(good));
// Exercise actual runtime adapter, including each of the 97 records, with supported canonical V1 fixtures.
const env={...process.env},temp=fs.mkdtempSync(path.join(os.tmpdir(),'residential-runtime-')),inputFile=path.join(temp,'input.json');
try {
 Object.assign(process.env,{NODE_ENV:'test',TRULOT_RS17_STANDARDS_SHADOW:'1',TRULOT_RS17_SHADOW_INPUT:inputFile});delete process.env.CI;delete process.env.VERCEL;
 for(const [zone,result] of goodByZone){
  fs.writeFileSync(inputFile,JSON.stringify(inputFor([zone])));
  const f=fixture({tpa:false,ctcac:false},{parcelFields:{zone_name:zone,base_zone:zone}});
  const current=await f.load(path.join(root,'lib/parcel-page-v1.ts')).getParcelPageV1Result('3113333800');
  const html=await renderRs17RuntimeShadow(current);assert.equal(html,renderResidentialDisplay(result),zone);
 }
 const f=fixture({tpa:false,ctcac:false});const current=await f.load(path.join(root,'lib/parcel-page-v1.ts')).getParcelPageV1Result('3113333800');
 fs.writeFileSync(inputFile,JSON.stringify(inputFor(['RS-1-7','RM-1-1'])));
 assert.ok((await renderRs17RuntimeShadow(current)).includes('RM-1-1'));
 process.env.NODE_ENV='production';assert.equal(await renderRs17RuntimeShadow(current),null);
 const priorFile=path.join(temp,'page.tsx');fs.writeFileSync(priorFile,execFileSync('git',['show','b842211cea327801e3f22be36404b3540b6464db:app/parcel/san-diego/[slug]/page.tsx'],{cwd:root}));
 const before=renderToStaticMarkup(await f.load(priorFile).default({params:Promise.resolve({slug:current.data.canonicalSlug})}));
 const after=renderToStaticMarkup(await f.load(path.join(root,'app/parcel/san-diego/[slug]/page.tsx')).default({params:Promise.resolve({slug:current.data.canonicalSlug})}));assert.equal(after,before);
}finally{for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);fs.rmSync(temp,{recursive:true});}
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({safe:97,excluded:717,exercised:seen.size,coveragePercent:100,states:results,metadataMutations:mutations,runtimeAllZones:true,offMatchesPacket15:true},null,2));
console.log(`PASS all97 through consumer/display/runtime, all717 renderer injections, ${mutations} metadata/state mutations, order, split and baseline`);

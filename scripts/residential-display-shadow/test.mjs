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
const {rehearseExpandedResidentialParameters}=load(path.join(root,'scripts/rs17-parameter-rehearsal/adapter.ts'));
const {residentialPresentation,renderResidentialDisplay,coverageQualifier}=load(path.join(root,'scripts/residential-display-shadow/display.ts'));
const {renderRs17RuntimeShadow}=load(path.join(root,'lib/rs17-runtime-shadow.ts'));
const prior=read(path.join(root,'data/residential-standards-review/residential_standards_v2_integration_safe.json'));
const proposed=read(path.join(root,'data/high-value-residential-review/proposed-safe-subset.json'));
const promoted=proposed.new_display_safe_records,safe=[...prior,...promoted],ids=new Set(safe.map(r=>r.rule_id));
const corpus=read(path.join(root,'data/zoning-standards-v2/rules.json'));
const decisions=read(path.join(root,'data/high-value-residential-review/decision.json')).candidate_decisions;
assert.equal(prior.length,97);assert.equal(promoted.length,116);assert.equal(safe.length,213);assert.equal(ids.size,213);
const familyCounts=Object.fromEntries([...new Set(promoted.map(r=>r.family))].map(f=>[f,promoted.filter(r=>r.family===f).length]));
assert.deepEqual(familyCounts,{density:33,lot_area:33,front_setback:14,interior_side_setback:14,far:8,height:7,lot_coverage:7});
const source=read(path.join(root,'data/zoning-serving-v2/golden-fixture.json'));
const authority={observation:read(path.join(root,'data/high-value-residential-review/authority-observation.json')),sourcePaths:read(process.argv[2])};
const context={evaluation_date:'2026-09-24',coastal_context:'outside',application_context:'new_application',airport_context:'outside_miramar_transition',lot_context:'unknown'};
const output=process.argv[3];assert.ok(output,'Explicit output directory required');fs.mkdirSync(output,{recursive:true});
function inputFor(zones){
 const f=structuredClone(zones.length>1?source.cases.multiZone:source.cases.singleZone),apn='3113333800';
 f.parcelResponse.rows.forEach(r=>r.apn_norm=apn);const row=f.zoningResponse.row;
 row.apn=apn;row.dominantZoneCode=zones[0];row.zoneEvidence.forEach((r,i)=>r.zoneCode=zones[i]);
 return {apn,parcelResponse:f.parcelResponse,zoningResponse:f.zoningResponse,context:{...context},authority:structuredClone(authority)};
}
const named=[
 {id:'rs-1-7-expanded',zones:['RS-1-7']},{id:'rs-approved-far',zones:['RS-1-8']},
 {id:'rs-conditional-coverage',zones:['RS-1-1']},{id:'rm-density-area',zones:['RM-1-1']},
 {id:'rt-density-area',zones:['RT-1-1']},{id:'rx-1-1',zones:['RX-1-1']},{id:'rx-1-2',zones:['RX-1-2']},
 {id:'split-rs-rm',zones:['RS-1-7','RM-1-1']},{id:'source-drift',zones:['RS-1-7'],drift:true},
 {id:'unknown-coastal',zones:['RS-1-7'],coastal:'unknown'},{id:'inside-coastal',zones:['RS-1-7'],coastal:'inside'},
 {id:'missing-predicate',zones:['RS-1-7'],attack:'missing-predicate'},
 {id:'excluded-far-attempt',zones:['RS-1-7'],attack:'excluded-far'},
 {id:'excluded-rear-setback-attempt',zones:['RS-1-7'],attack:'excluded-rear'},
 {id:'parcel-unavailable',zones:['RS-1-7'],parcelUnavailable:true},
];
const allZones=[...new Set(safe.map(r=>r.zone_code))].sort();
const allCases=[...allZones.map(zone=>({id:`all-${zone}`,zones:[zone]})),...named];
const goodByZone=new Map(),seen=new Set(),results=[];
for(const c of allCases){
 const input=inputFor(c.zones);if(c.coastal)input.context.coastal_context=c.coastal;
 if(c.drift)input.authority.observation.sources.residential.sha256='drift';
 const result=await rehearseExpandedResidentialParameters(input.apn,async()=>{if(c.parcelUnavailable)throw Error('fixture');return input.parcelResponse;},async()=>input.zoningResponse,input.context,input.authority);
 let model=residentialPresentation(result),html=renderResidentialDisplay(result);
 if(c.attack){
  const attack=structuredClone(result),parameter=attack.standards[0].parameters[0];
  if(c.attack==='missing-predicate')parameter.value.required_predicates=[];
  if(c.attack==='excluded-far')parameter.value.rule_id='sd-residential-2026-09-24-research-v1:RS-1-7:35:5';
  if(c.attack==='excluded-rear')parameter.value.rule_id=corpus.find(r=>r.zone_code==='RS-1-7'&&r.standard_type==='rear_setback_min').rule_id;
  model=residentialPresentation(attack);html=renderResidentialDisplay(attack);
 }
 const rows=model.groups.flatMap(g=>g.sections.flatMap(s=>s.rows));
 const expected=c.coastal||c.drift||c.parcelUnavailable||c.attack?0:safe.filter(r=>c.zones.includes(r.zone_code)).length;
 assert.equal(rows.length,expected,c.id);assert.ok(html.includes(coverageQualifier));
 assert.doesNotMatch(html,/maximum units|units allowed|buildable units|can build|qualifies|compliant|meets requirement|development potential/i);
 for(const item of rows){seen.add(item.rule.rule_id);assert.ok(html.includes(item.rule.rule_id)&&html.includes(item.rule.sealed_record_sha256));assert.equal(item.rule.display_safe,true);assert.equal(item.rule.parcel_application_safe,false);}
 if(c.zones.length>1&&!c.attack){assert.equal(model.groups.length,c.zones.length);for(const g of model.groups)assert.ok(g.sections.flatMap(s=>s.rows).every(r=>r.rule.zone_code===g.zone));}
 if(c.zones.length===1&&expected&&!c.id.startsWith('all-'))goodByZone.set(c.zones[0],result);
 if(c.id.startsWith('all-')&&expected)goodByZone.set(c.zones[0],result);
 if(!c.id.startsWith('all-')){fs.writeFileSync(path.join(output,c.id+'.json'),JSON.stringify(input,null,2));fs.writeFileSync(path.join(output,c.id+'.html'),html);}
 results.push({id:c.id,zones:c.zones,records:rows.length,families:[...new Set(rows.map(r=>r.family))],state:expected?'displayed':'blocked'});
 console.log('PASS '+c.id);
}
assert.deepEqual([...seen].sort(),[...ids].sort());

const rs17=residentialPresentation(goodByZone.get('RS-1-7'));
const rs17Rows=rs17.groups[0].sections.flatMap(s=>s.rows);
assert.ok(!rs17Rows.some(r=>r.family==='far'));assert.doesNotMatch(renderResidentialDisplay(goodByZone.get('RS-1-7')),/Floor-area ratio/);
const farRows=[...goodByZone.values()].flatMap(r=>residentialPresentation(r).groups.flatMap(g=>g.sections.flatMap(s=>s.rows))).filter(r=>r.family==='far');
assert.equal(new Set(farRows.map(r=>r.rule.rule_id)).size,8);
const height=rs17Rows.find(r=>r.family==='height');assert.match(height.summary,/24 ft angled-plane origin \/ 30 ft base-zone maximum/);
assert.match(height.condition,/45° inward plane below 75 ft/);assert.match(height.condition,/30° from 75–150 ft/);
const coverage=rs17Rows.find(r=>r.family==='lot_coverage');assert.match(coverage.condition,/Conditional and unresolved/);
assert.ok(rs17Rows.filter(r=>['front_setback','interior_side_setback'].includes(r.family)).every(r=>/Conditional/.test(r.condition)));
assert.match(rs17Rows.find(r=>r.family==='front_setback').condition,/reduces the table requirement by 5 ft but never below 5 ft/);
assert.match(rs17Rows.find(r=>r.family==='front_setback').condition,/separate 6 ft steep-front permission/);
assert.match(rs17Rows.find(r=>r.family==='interior_side_setback').condition,/retain the table-role sum/);
assert.match(rs17Rows.find(r=>r.family==='interior_side_setback').condition,/each interior side at least 4 ft and each street side at least 10 ft/);
assert.match(residentialPresentation(goodByZone.get('RS-1-8')).groups[0].sections.flatMap(s=>s.rows).find(r=>r.family==='far').condition,/No area, exclusion, dedication, or ratio was applied/);
assert.match(residentialPresentation(goodByZone.get('RM-1-1')).groups[0].sections.flatMap(s=>s.rows).find(r=>r.family==='density').condition,/fraction of 0.5 or more to round up once/);
assert.match(residentialPresentation(goodByZone.get('RT-1-1')).groups[0].sections.flatMap(s=>s.rows).find(r=>r.family==='lot_area').condition,/qualifying alley credit also remains unselected/);
assert.ok([...goodByZone.values()].flatMap(r=>residentialPresentation(r).groups.flatMap(g=>g.sections.flatMap(s=>s.rows))).filter(r=>r.family==='density').every(r=>!/maximum units|units allowed|buildable units/i.test(r.summary)));

const rendererAttacks=[...decisions.filter(r=>!ids.has(r.rule_id)),...corpus.filter(r=>!ids.has(r.rule_id))];
assert.equal(decisions.filter(r=>!ids.has(r.rule_id)).length,201);assert.equal(corpus.filter(r=>!ids.has(r.rule_id)).length,601);
for(const excluded of rendererAttacks){
 const base=goodByZone.get(excluded.zone_code)||goodByZone.get('RS-1-7'),attack=structuredClone(base);
 attack.standards[0].parameters[0].value.rule_id=excluded.rule_id;
 assert.equal(residentialPresentation(attack).groups.flatMap(g=>g.sections.flatMap(s=>s.rows)).length,0,excluded.rule_id);
}
let mutations=0;
for(const field of ['display_safe','parcel_application_safe','project_applicability_determined','compliance_determined','capacity_determined','safety_level','expression','required_predicates','sealed_origin','sealed_record','sealed_record_sha256','source_record','source_sha256','source','authority_metadata']){
 const attack=structuredClone(goodByZone.get('RS-1-7'));delete attack.standards[0].parameters[0].value[field];
 assert.equal(residentialPresentation(attack).groups[0].sections.length,0,field);mutations++;
}
for(const [field,value] of [['parcel_application_safe',true],['display_safe',false],['compliance_determined',true],['capacity_determined',true]]){
 const attack=structuredClone(goodByZone.get('RS-1-7'));attack.standards[0].parameters[0].value[field]=value;
 assert.equal(residentialPresentation(attack).groups[0].sections.length,0,field);mutations++;
}
const flattened=structuredClone(goodByZone.get('RS-1-7')),heightParameter=flattened.standards[0].parameters.find(p=>p.value.family==='height');heightParameter.value.expression={kind:'scalar',value:30,unit:'ft'};
assert.equal(residentialPresentation(flattened).groups[0].sections.length,0);mutations++;
const provenanceAttack=structuredClone(goodByZone.get('RS-1-7'));delete provenanceAttack.standards[0].parameters[0].provenance;
assert.equal(residentialPresentation(provenanceAttack).groups[0].sections.length,0);mutations++;

// Actual runtime, hard gate, and authorized baseline parity.
const saved={...process.env},temp=fs.mkdtempSync(path.join(os.tmpdir(),'expanded-residential-runtime-')),inputFile=path.join(temp,'input.json');
try{
 Object.assign(process.env,{NODE_ENV:'test',TRULOT_RS17_STANDARDS_SHADOW:'1',TRULOT_RS17_SHADOW_INPUT:inputFile});delete process.env.CI;delete process.env.VERCEL;
 for(const zone of allZones){
  fs.writeFileSync(inputFile,JSON.stringify(inputFor([zone])));const f=fixture({tpa:false,ctcac:false},{parcelFields:{zone_name:zone,base_zone:zone}});
  const current=await f.load(path.join(root,'lib/parcel-page-v1.ts')).getParcelPageV1Result('3113333800');
  const html=await renderRs17RuntimeShadow(current);assert.equal(html,renderResidentialDisplay(goodByZone.get(zone)),zone);
 }
 const f=fixture({tpa:false,ctcac:false});const current=await f.load(path.join(root,'lib/parcel-page-v1.ts')).getParcelPageV1Result('3113333800');
 fs.writeFileSync(inputFile,JSON.stringify(inputFor(['RS-1-7','RM-1-1'])));const split=await renderRs17RuntimeShadow(current);assert.ok(split.includes('RS-1-7')&&split.includes('RM-1-1'));
 for(const env of [{NODE_ENV:'production'},{NODE_ENV:'production',TRULOT_RS17_STANDARDS_SHADOW:'1'},{NODE_ENV:'development',TRULOT_RS17_STANDARDS_SHADOW:'0'},{NODE_ENV:'test',TRULOT_RS17_STANDARDS_SHADOW:'1',CI:'1'},{NODE_ENV:'development',TRULOT_RS17_STANDARDS_SHADOW:'1',VERCEL:'1'}]){
  Object.assign(process.env,{NODE_ENV:'development',TRULOT_RS17_STANDARDS_SHADOW:'0'});delete process.env.CI;delete process.env.VERCEL;Object.assign(process.env,env);assert.equal(await renderRs17RuntimeShadow(current),null,JSON.stringify(env));
 }
 const priorFile=path.join(temp,'page.tsx');fs.writeFileSync(priorFile,execFileSync('git',['show','c66eeb3a78dc21b9467e69d2ecbae67ad13f682b:app/parcel/san-diego/[slug]/page.tsx'],{cwd:root}));
 const before=renderToStaticMarkup(await f.load(priorFile).default({params:Promise.resolve({slug:current.data.canonicalSlug})}));
 const after=renderToStaticMarkup(await f.load(path.join(root,'app/parcel/san-diego/[slug]/page.tsx')).default({params:Promise.resolve({slug:current.data.canonicalSlug})}));assert.equal(after,before);
}finally{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);fs.rmSync(temp,{recursive:true});}

fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({result:'PASS',sealed:213,prior:97,new:116,familyCounts,zones:allZones.length,seen:seen.size,
 goldenFixtures:named.map(c=>c.id),remainingCandidatesRejected:201,otherCorpusRejected:601,metadataMutations:mutations,
 densityCapacityConversion:false,splitIndependent:true,productionAlwaysOff:true,gateOffMatchesAuthorizedBaseline:true,states:results},null,2));
console.log(`PASS expanded213 through consumer/display/runtime; 201 remaining candidates, 601 other corpus records, ${mutations} mutation attacks, split, production gate, baseline parity`);

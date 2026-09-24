import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import ts from "typescript";
import {fixture as pageFixture,renderToStaticMarkup} from "../parcel-v1-test-fixture.mjs";

const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,"../.."),require=createRequire(import.meta.url),cache=new Map();
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
function load(file){
 file=path.resolve(file);if(file.endsWith('.json'))return read(file);if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,process,__dirname:path.dirname(file),require:n=>n.startsWith('.')?load(path.resolve(path.dirname(file),n+(path.extname(n)?'':'.ts'))):require(n)});return module.exports;
}
const {rehearseParcelParameters}=load(path.join(root,'scripts/rs17-parameter-rehearsal/adapter.ts'));
const {presentation,renderDisplay,qualifier}=load(path.join(dir,'display.ts'));
const sourcePaths=read(process.argv[2]),output=process.argv[3];assert.ok(output,'Explicit external output directory required');fs.mkdirSync(output,{recursive:true});
const source=read(path.join(root,'data/zoning-serving-v2/golden-fixture.json'));
const observation=read(path.join(root,'data/residential-standards-review/source-observation.json'));
const context={evaluation_date:'2026-09-24',coastal_context:'outside',application_context:'new_application',airport_context:'outside_miramar_transition',lot_context:'non_corner'};
const cases=[
 {id:'supported',count:3},{id:'unknown-corner',context:{lot_context:'unknown'},count:3},{id:'corner',context:{lot_context:'corner'},count:3},
 {id:'unknown-coastal',context:{coastal_context:'unknown'},count:0},{id:'inside-coastal',context:{coastal_context:'inside'},count:0},
 {id:'source-drift',drift:true,count:0},{id:'zoning-unavailable',zoning:'unavailable',count:0},
 {id:'zoning-unmapped',zoning:'UNMAPPED',count:0},{id:'zoning-indeterminate',zoning:'INDETERMINATE',count:0},
 {id:'split',zones:['RS-1-7','RM-1-1'],count:3},{id:'other-residential',zones:['RM-1-1'],count:0},
 {id:'unknown-zone',zones:['UNZONED'],count:0},{id:'parcel-unavailable',parcelUnavailable:true,count:0},
 {id:'unsupported-date',context:{evaluation_date:'2025-01-01'},count:0},{id:'missing-application',context:{application_context:undefined},count:0}
];
const css=`body{font:16px/1.6 system-ui,sans-serif;color:#233747;background:#f4f6f7;margin:0}main{max-width:960px;margin:32px auto;padding:24px}h1,h2,h3{line-height:1.3;color:#153c49}h1{font-size:28px}h2{font-size:23px}h3{font-size:19px}a{color:#075b78}section,article{margin:20px 0}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{padding:14px 12px;text-align:left;border-bottom:1px solid #d6dfe4}thead{background:#f0f5f7}td:nth-child(2){white-space:nowrap;font-weight:650}td:last-child{font-size:14px}summary{cursor:pointer;font-weight:600;padding:12px 0}summary:focus-visible,a:focus-visible{outline:3px solid #b75808;outline-offset:3px}details{border-top:1px solid #d6dfe4;margin-top:12px}details details{padding-left:16px}code{overflow-wrap:anywhere;font-size:12px}.standards-card{padding:24px;background:white;border:1px solid #c9d8df;border-radius:8px;grid-column:1/-1}.qualifier{padding:14px 16px;background:#eef4f6;border-left:3px solid #527e90}.state{font-size:14px;color:#47606c}.banner{font-size:13px;letter-spacing:.03em;color:#526571}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}@media(max-width:600px){main{margin:0;padding:12px}.standards-card{padding:14px}th,td{padding:12px 6px;font-size:14px}h2{font-size:21px}td:last-child{font-size:12px}}`;
const shell=(title,body)=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style><body><main>${body}</main></body></html>`;
const outputs=[];
for(const c of cases){
 const zones=c.zones??['RS-1-7'],f=structuredClone(zones.length>1?source.cases.multiZone:source.cases.singleZone);
 f.apn='0000000001';f.parcelResponse.rows.forEach(r=>{r.apn_norm=f.apn;r.address='OFFLINE SYNTHETIC FIXTURE';});
 const row=f.zoningResponse.row;row.apn=f.apn;row.dominantZoneCode=zones[0];row.zoneEvidence.forEach((r,i)=>r.zoneCode=zones[i]);
 if(c.zoning==='UNMAPPED')Object.assign(row,{mappingState:'UNMAPPED',dominantZoneCode:null,zoneEvidence:[],distinctZoneCount:0,totalCoveredPercent:0,dominantCoveragePercent:null,secondaryCoveragePercent:0});
 if(c.zoning==='INDETERMINATE')row.mappingState='INDETERMINATE';
 const authority={observation:structuredClone(observation),sourcePaths};if(c.drift)authority.observation.sources.residential.sha256='changed';
 const result=await rehearseParcelParameters(f.apn,async()=>{if(c.parcelUnavailable)throw Error('fixture');return f.parcelResponse;},async()=>{if(c.zoning==='unavailable')throw Error('fixture');return f.zoningResponse;},{...context,...c.context},authority);
 const model=presentation(result),html=renderDisplay(result),rows=model.groups.flatMap(g=>g.rows);
 assert.equal(rows.length,c.count,c.id);assert.equal(model.project_applicability_determined,false);
 if(rows.length)assert.ok(html.includes(qualifier));else assert.ok(!html.includes('50 ft'));
 assert.doesNotMatch(html,/Your lot must be|This parcel qualifies|You can build|Maximum units|The parcel meets|Allowed development/i);
 if(rows.length){assert.deepEqual(Array.from(rows,r=>r.label),['Minimum lot width','Minimum corner-lot width','Minimum lot depth']);assert.match(html,/Corner-lot condition; no parcel determination/);assert.ok(html.indexOf('SHA-256')>html.indexOf('Source evidence details'));}
 if(c.zoning||c.parcelUnavailable)assert.equal(result.standards.length,0,'Consumer must not resolve standards without supported identity/zoning');
 if(c.id==='source-drift')assert.match(html,/Source evidence is unavailable/);
 if(c.id==='unknown-coastal')assert.match(html,/applicable rule version has not been resolved/);
 if(c.id==='split'){assert.equal(model.groups.length,2);assert.equal(model.groups.find(g=>g.zoneCode==='RM-1-1').rows.length,0);}
 const zoningTruth=result.parcelIntelligence.truth.baseZoning;
 const zoningLabel=zoningTruth.state==='supported'&&zoningTruth.value
   ? zoningTruth.value.zones.join(' + ')
   : zoningTruth.value?.mappingState==='UNMAPPED' ? 'No mapped base-zone assignment'
   : 'Base zoning unavailable or unresolved';
 if(c.zoning||c.parcelUnavailable)assert.ok(!zoningLabel.includes('RS-1-7'),'Unsupported zoning must not be asserted by the page scaffold');
 fs.writeFileSync(path.join(output,c.id+'.html'),shell(c.id,`<p class="banner">TruLot · Offline shadow preview · Synthetic fixture</p><h1>Parcel record</h1><section><h2>Base zoning</h2><p>${zoningLabel}</p></section>${html}<section><h2>Development pathways</h2><p>Not evaluated in this preview.</p></section>`));
 outputs.push({id:c.id,model,result});console.log('PASS '+c.id);
}
const good=outputs[0].result;
const corpus=read(path.join(root,'data/zoning-standards-v2/rules.json'));
const excluded=corpus.filter(r=>r.zone_code==='RS-1-7'&&!['lot_width_min','corner_lot_width_min','lot_depth_min'].includes(r.standard_type));assert.equal(excluded.length,21);
for(const r of excluded){const attack=structuredClone(good),fact=structuredClone(attack.standards[0].parameters[0]);fact.value.standard_type=r.standard_type;fact.value.rule_id=r.rule_id;attack.standards[0].parameters.push(fact);assert.equal(presentation(attack).groups[0].rows.length,3);assert.ok(!renderDisplay(attack).includes(r.rule_id));}
for(const mutate of [p=>p.value=999,p=>p.source_sha256='changed',p=>p.conditions=[],p=>p.source.url='javascript:alert(1)']){
 const a=structuredClone(good);mutate(a.standards[0].parameters[1].value);assert.equal(presentation(a).groups[0].rows.length,0);
}
const reversed=structuredClone(good);reversed.standards[0].parameters.reverse();assert.equal(renderDisplay(good),renderDisplay(reversed));
// Real current Parcel V1 fixture comparison: insert only; removing insertion restores exact bytes.
const fixture=pageFixture({tpa:true,ctcac:false,sda:true});const Page=fixture.load(path.join(root,'app/parcel/san-diego/[slug]/page.tsx')).default;
const loaded=await fixture.load(path.join(root,'lib/parcel-page-v1.ts')).getParcelPageV1Result('3113333800');
const current=renderToStaticMarkup(await Page({params:Promise.resolve({slug:loaded.data.canonicalSlug})}));
const anchor=current.indexOf('Current programs &amp; overlays');assert.ok(anchor>0);
const insertion=current.lastIndexOf('<div class="rounded border border-slate-200 bg-white p-4">',anchor);assert.ok(insertion>0);
const card=renderDisplay(good),shadow=current.slice(0,insertion)+card+current.slice(insertion);
assert.equal(shadow.replace(card,''),current);assert.ok(shadow.indexOf('base-zoning-standards')<shadow.indexOf('Current programs &amp; overlays'));
fs.writeFileSync(path.join(output,'current-parcel.html'),shell('Current Parcel V1 fixture','<p class="banner">Offline comparison · Current Parcel Page fixture</p>'+current));
fs.writeFileSync(path.join(output,'shadow-parcel.html'),shell('Shadow Parcel V1 fixture','<p class="banner">Offline comparison · Proposed section inserted; existing page content retained</p>'+shadow));
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({kind:'OFFLINE_SYNTHETIC_DISPLAY_FIXTURES',states:outputs.map(({id,model})=>({id,model})),checks:{golden_states:cases.length,excluded_records:21,mutations:4,deterministic_order:true,current_information_preserved_byte_for_byte:true,insertion_before_programs:true}},null,2));
console.log('PASS 21 excluded injections;4 evidence mutations;stable order;byte-preserving current/shadow comparison');

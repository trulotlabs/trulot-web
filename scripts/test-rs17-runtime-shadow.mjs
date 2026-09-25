import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {fixture,root,renderToStaticMarkup} from './parcel-v1-test-fixture.mjs';
const require=createRequire(import.meta.url),cache=new Map();
function load(file){
 file=path.resolve(file);if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file));
 if(cache.has(file))return cache.get(file).exports;
 const loadedModule={exports:{}};cache.set(file,loadedModule);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module:loadedModule,exports:loadedModule.exports,process,require:id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id+(path.extname(id)?'':'.ts'))):require(id)});
 return loadedModule.exports;
}
const {rs17ShadowEnabled,verifiedStandardsMode}=load(path.join(root,'lib/rs17-shadow-gate.ts'));
const {renderRs17RuntimeShadow}=load(path.join(root,'lib/rs17-runtime-shadow.ts'));
const pageFile=path.join(root,'app/parcel/san-diego/[slug]/page.tsx');
async function page(env={},shadowRenderer=()=>{throw Error('Shadow consumer must not run');}){
 let calls=0;
 const f=fixture({tpa:false,ctcac:false},{env,shadowRenderer:(result)=>{calls++;return shadowRenderer(result);}});
 const result=await f.load(path.join(root,'lib/parcel-page-v1.ts')).getParcelPageV1Result('3113333800');
 const html=renderToStaticMarkup(await f.load(pageFile).default({params:Promise.resolve({slug:result.data.canonicalSlug})}));
 return {result,html,calls};
}
const baseline=await page();let matrix=0;
const priorDir=fs.mkdtempSync(path.join(os.tmpdir(),'rs17-baseline-'));
try {
 const priorFile=path.join(priorDir,'page.tsx');
 fs.writeFileSync(priorFile,execFileSync('git',['show','bd5d758a2180bd93e95b4632aaab1968acf4343f:app/parcel/san-diego/[slug]/page.tsx'],{cwd:root}));
 const prior=fixture({tpa:false,ctcac:false});
 assert.equal(renderToStaticMarkup(await prior.load(priorFile).default({params:Promise.resolve({slug:baseline.result.data.canonicalSlug})})),baseline.html,'Disabled output must match authorized baseline byte for byte');
} finally {fs.rmSync(priorDir,{recursive:true});}
for(const node of [undefined,'production','development','test','staging'])for(const flag of [undefined,'0','1','true']){
 const env={NODE_ENV:node,TRULOT_RS17_STANDARDS_SHADOW:flag};
 const enabled=flag==='1'&&['development','test'].includes(node);
 assert.equal(rs17ShadowEnabled(env),enabled);matrix++;
 if(!enabled){const rendered=await page(env);assert.equal(rendered.html,baseline.html);assert.equal(rendered.calls,0);}
}
for(const host of ['VERCEL','CI'])assert.equal(rs17ShadowEnabled({NODE_ENV:'development',TRULOT_RS17_STANDARDS_SHADOW:'1',[host]:'1'}),false);
const staging={NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'preview',TRULOT_VERIFIED_STANDARDS_RELEASE:'1',
 TRULOT_VERIFIED_STANDARDS_RELEASE_ENV:'staging',TRULOT_VERIFIED_STANDARDS_STAGING_APPROVED:'1'};
assert.equal(verifiedStandardsMode(staging),'staging');
for(const changed of [
 {...staging,VERCEL_ENV:'production'}, {...staging,TRULOT_DEPLOYMENT_ENV:'production'},
 {...staging,TRULOT_VERIFIED_STANDARDS_RELEASE:'0'}, {...staging,TRULOT_VERIFIED_STANDARDS_RELEASE_ENV:'production'},
 {...staging,TRULOT_VERIFIED_STANDARDS_STAGING_APPROVED:'0'}, {...staging,VERCEL:'0'},
 {NODE_ENV:'production',TRULOT_RS17_STANDARDS_SHADOW:'1'},
])assert.equal(verifiedStandardsMode(changed),null,JSON.stringify(changed));
const on={NODE_ENV:'test',TRULOT_RS17_STANDARDS_SHADOW:'1'};
const marker='<section>Local insertion</section>';
const added=(await page(on,()=>marker)).html;
assert.ok(added.includes(marker));assert.ok(added.indexOf(marker)<added.indexOf('Current programs &amp; overlays'));
assert.equal((await page(on,()=>null)).html,baseline.html);
assert.equal((await page(on,()=>{throw Error('local dependency unavailable');})).html,baseline.html);
const saved={...process.env};Object.assign(process.env,on);delete process.env.CI;delete process.env.VERCEL;
try{
 const html=await renderRs17RuntimeShadow(baseline.result);
 assert.ok(html?.includes('50 ft')&&html.includes('55 ft')&&html.includes('95 ft'));
 assert.ok(html.includes("corner-lot branch; corner status is unresolved"));
 delete process.env.TRULOT_RS17_STANDARDS_SHADOW;
 Object.assign(process.env,staging);
 assert.ok((await renderRs17RuntimeShadow(baseline.result))?.includes('Verified base-zone standards'));
 process.env.VERCEL_ENV='production';assert.equal(await renderRs17RuntimeShadow(baseline.result),null);
 delete process.env.VERCEL;delete process.env.VERCEL_ENV;delete process.env.TRULOT_VERIFIED_STANDARDS_RELEASE;
 delete process.env.TRULOT_VERIFIED_STANDARDS_RELEASE_ENV;delete process.env.TRULOT_VERIFIED_STANDARDS_STAGING_APPROVED;
 Object.assign(process.env,on);
 process.env.NODE_ENV='production';assert.equal(await renderRs17RuntimeShadow(baseline.result),null);process.env.NODE_ENV='test';
 const absent=structuredClone(baseline.result);absent.truth.parcel.state='unavailable';assert.equal(await renderRs17RuntimeShadow(absent),null);
 if(process.argv[3]){fs.mkdirSync(process.argv[3],{recursive:true});fs.writeFileSync(path.join(process.argv[3],'receipt.json'),fs.readFileSync(path.join(root,'data/runtime/verified-residential-standards-v2.receipt.json')));}
}finally{for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}
console.log(`PASS ${matrix} local gate combinations, approved staging, production denial, unchanged disabled page, placement, compiled approved consumer, identity failure`);

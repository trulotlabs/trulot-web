import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const dir = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(dir, "../..");
const require = createRequire(import.meta.url), cache = new Map();
function load(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename,"utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = name => name.startsWith(".") ? load(path.resolve(path.dirname(filename), name + ".ts")) : require(name);
  vm.runInNewContext(code,{module,exports:module.exports,require:localRequire,__dirname:path.dirname(filename),process});
  return module.exports;
}
const {rehearseParcelParameters,consumeParameters} = load(path.join(dir,"adapter.ts"));
const read = p => JSON.parse(fs.readFileSync(p,"utf8"));
const golden = read(path.join(dir,"fixtures.json"));
const serving = read(path.join(root,"data/zoning-serving-v2/golden-fixture.json"));
const observation = read(path.join(root,"data/residential-standards-review/source-observation.json"));
const sourcePaths = read(process.argv[2]);
const approved = read(path.join(root,"data/residential-standards-review/residential_standards_v2_integration_safe.json")).filter(r=>r.zone_code==="RS-1-7");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),"rs17-rehearsal-"));
const outputs=[];
function fixture(zones) {
  const f=structuredClone(zones.length>1?serving.cases.multiZone:serving.cases.singleZone);
  f.apn="0000000001";
  f.parcelResponse.rows.forEach(r=>{r.apn_norm=f.apn;r.address="OFFLINE SYNTHETIC FIXTURE";});
  f.parcelResponse.receipt.receipt_reference="fixture://rs17/parcel";
  const row=f.zoningResponse.row;row.apn=f.apn;row.dominantZoneCode=zones[0];
  row.zoneEvidence.forEach((r,i)=>{r.zoneCode=zones[i];});
  f.zoningResponse.receipt.receiptReference="fixture://rs17/zoning";
  return f;
}
try {
  for (const c of golden.cases) {
    const context={...golden.context,...c.context};if(c.omit)delete context[c.omit];
    const authority={observation:structuredClone(observation),sourcePaths:{...sourcePaths}};
    if(c.drift==="hash")authority.observation.sources.residential.sha256="changed";
    if(c.drift==="effective")authority.observation.effective_metadata[0].outside_from="2020-01-01";
    if(c.drift==="coastal")authority.observation.coastal_certification.O22109="CERTIFIED";
    if(c.drift==="missing")delete authority.sourcePaths.residential;
    if(c.drift==="bytes") {const file=path.join(tmp,"bad.pdf");fs.writeFileSync(file,"changed");authority.sourcePaths.residential=file;}
    const f=fixture(c.zones??["RS-1-7"]);
    const r=await rehearseParcelParameters(f.apn,async()=>f.parcelResponse,async()=>f.zoningResponse,context,authority,c.request);
    assert.equal(r.parcelIntelligence.truth.parcel.state,"supported",c.id);
    assert.equal(r.parcelIntelligence.truth.baseZoning.state,"supported",c.id);
    assert.equal(r.project_applicability_determined,false);
    assert.equal(r.standards[0].state,c.state,c.id);
    const facts=r.standards.flatMap(z=>z.parameters);assert.equal(facts.length,c.count,c.id);
    for(const fact of facts){
      const p=fact.value, expected=approved.find(a=>a.rule_id===p.rule_id);assert.ok(expected);
      assert.equal(p.value,expected.value);assert.equal(p.unit,expected.unit);
      assert.deepEqual(JSON.parse(JSON.stringify(p.source_evidence)),expected.source_evidence);
      assert.equal(p.source_sha256,expected.source_sha256);assert.equal(p.project_applicability_determined,false);
      assert.equal(p.branch_is_parcel_fact,false);assert.equal(p.actual_lot_context,context.lot_context??"unknown");
      assert.equal(fact.state,"supported");assert.equal(fact.derivation,"conditional");
      assert.equal(fact.provenance.sourceUrl,observation.sources.residential.url);
      assert.ok(fact.provenance.retrievedAt);assert.ok(p.unresolved_dependencies.includes("113.0237"));
      assert.ok(p.dependency_evidence.canonical_sha256);
      assert.equal(p.dependency_evidence.evaluated,false);
      assert.equal(p.dependency_evidence.governing_sections,undefined);
      assert.deepEqual(JSON.parse(JSON.stringify(p.authority_metadata)),observation);
    }
    if(c.id==="split"){assert.equal(r.standards.length,2);assert.equal(r.standards[1].zoneCode,"RM-1-1");assert.equal(r.standards[1].parameters.length,0);}
    assert.match(r.display.qualifier,/applicability\/compliance has not been determined/);
    outputs.push({id:c.id,result:r});console.log(`PASS ${c.id}`);
  }
  // Exhaustive block of every other RS-1-7 record, not just the three named examples.
  const corpus=read(path.join(root,"data/zoning-standards-v2/rules.json"));
  const excluded=corpus.filter(r=>r.zone_code==="RS-1-7"&&!approved.some(a=>a.rule_id===r.rule_id));
  assert.equal(excluded.length,21);
  for(const row of excluded)assert.equal(consumeParameters("RS-1-7",golden.context,{observation,sourcePaths},[row.standard_type]).parameters.length,0);
  const f=fixture(["RS-1-7"]);
  const absent=await rehearseParcelParameters(f.apn,async()=>({...f.parcelResponse,rows:[]}),async()=>{throw Error("must not query");},golden.context,{observation,sourcePaths});
  assert.equal(absent.standards.length,0);
  const tiny=fixture(["RS-1-7"]);tiny.parcelResponse.rows[0].approximate_geometry_area_sqft=1;
  const tinyResult=await rehearseParcelParameters(tiny.apn,async()=>tiny.parcelResponse,async()=>tiny.zoningResponse,golden.context,{observation,sourcePaths});
  assert.equal(JSON.stringify(tinyResult.standards),JSON.stringify(outputs[0].result.standards));
  assert.equal(tinyResult.project_applicability_determined,false);
  if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify({kind:golden.kind,cases:outputs},null,2)+"\n");
  console.log("PASS 22 golden fixtures, 21 excluded records, parcel-absence isolation, geometry-area independence; no standards compliance output");
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }

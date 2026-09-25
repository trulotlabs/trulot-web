// Run from repository root. Entire data API is an in-memory fixture bound to
// loopback. No real Supabase URL/key, remote configuration or database is used.
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
const input=path.resolve(process.argv[2]??'');
if(!process.argv[2]||!fs.existsSync(input))throw Error('Provide an explicit local shadow input JSON path');
const enable=process.argv[3]==='on';
const parcel={apn_norm:'3113333800',address:'123 Fixture St',city:'San Diego',state:'CA',zone_name:'RS-1-7',base_zone:'RS-1-7',lot_area_sqft:7000,lat:32.75,lng:-117.19};
const api=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:4379');let data;
 if(req.method==='GET'&&url.pathname==='/rest/v1/parcel_page_api_v2'){
  const local=JSON.parse(fs.readFileSync(input,'utf8'));
  const zone=local.zoningResponse?.row?.dominantZoneCode??null;
  data=url.searchParams.get('apn_norm')==='eq.3113333800'?[{...parcel,zone_name:zone,base_zone:zone}]:[];
 }
 else if(req.method==='GET'&&url.pathname==='/rest/v1/trulot_permit_parcel_link_v1')data=[];
 else if(req.method==='POST'&&url.pathname==='/rest/v1/rpc/check_parcel_overlays')data={tpa:false,ctcac:false};
 else {res.writeHead(400);res.end('Unexpected fixture request');return;}
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));
});
api.listen(4379,'127.0.0.1',()=>{
 const env={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',
  NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:4379',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-fixture-not-a-credential',
  TRULOT_RS17_STANDARDS_SHADOW:enable?'1':'0',TRULOT_RS17_SHADOW_INPUT:input};
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','4380'],{env,stdio:'inherit'});
 const stop=()=>{child.kill('SIGTERM');api.close();};process.on('SIGINT',stop);process.on('SIGTERM',stop);
 child.on('exit',code=>{api.close();process.exitCode=code??0;});
 console.log(`Local fixture review: shadow ${enable?'ON':'OFF'}; http://127.0.0.1:4380/parcel/san-diego/apn-3113333800`);
});

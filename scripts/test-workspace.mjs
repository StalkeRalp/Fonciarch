import ts from "typescript";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
const directory = mkdtempSync(join(tmpdir(), "fonciarch-api-test-"));
for (const file of ["lib/file-types.ts", "lib/supabase-files.ts", "lib/errors.ts", "lib/backend.ts", "lib/supabase-config.ts", "app/api/workspace/route.ts"]) {
 const output = join(directory, file.replace(/\.ts$/, ".js")); mkdirSync(dirname(output), { recursive: true });
 const code = ts.transpileModule(readFileSync(join("src", file), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
 writeFileSync(output,code.replace(/(from\s*)(["'])(\.{1,2}\/[^"']+)\2/g,(_,pre,q,name)=>`${pre}${q}${name}.js${q}`));
}
writeFileSync(join(directory, "package.json"), '{"type":"module"}');
const { GET, POST } = await import(pathToFileURL(join(directory, "app/api/workspace/route.js")));
const originalFetch=globalThis.fetch, originalUrl=process.env.SUPABASE_URL, originalKey=process.env.SUPABASE_SECRET_KEY;
process.env.SUPABASE_URL="https://project.example.test";process.env.SUPABASE_SECRET_KEY="sb_secret_test_fixture";
const workspace={backendId:"cloud-test",user:null,directAccess:true,users:[],titles:[],boxes:[],activities:[],settings:{name:"",cadastre:"",location:""}};
let handler=async()=>Response.json(workspace),calls=[];
globalThis.fetch=async(url,options)=>{calls.push({url,options});return handler(url,options);};
const post=(data,origin="http://localhost:3000")=>POST(new Request("http://localhost:3000/api/workspace",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:typeof data==='string'?data:JSON.stringify(data)}));
await test("API Supabase uniquement avec transport simulé",async t=>{
 try{
 await t.test("Lecture exclusivement depuis la RPC Supabase et clé réservée aux en-têtes",async()=>{calls=[];const r=await GET();assert.equal(r.status,200);assert.deepEqual(await r.json(),workspace);assert.equal(calls.length,1);assert.equal(calls[0].url,"https://project.example.test/rest/v1/rpc/fonciarch_workspace");assert.equal(calls[0].options.headers.apikey,process.env.SUPABASE_SECRET_KEY);assert.equal(calls[0].options.cache,"no-store");});
 await t.test("Transmission de l’identifiant stable puis relecture du registre",async()=>{calls=[];const id=randomUUID();handler=async(url,options)=>url.endsWith("fonciarch_apply_operation")?Response.json({id:JSON.parse(options.body).p_operation_id,result:{id:"title-test"}}):Response.json(workspace);const r=await post({action:"box",operationId:id,number:"1"});assert.equal(r.status,200);assert.equal((await r.json()).receipt.id,id);assert.deepEqual(JSON.parse(calls[0].options.body),{p_operation_id:id,p_action:"box",p_input:{number:"1"}});assert.equal(calls.length,2);});
 await t.test("Erreur réseau sans remplacement par une base locale",async()=>{calls=[];handler=async()=>{throw new Error("Network unavailable");};const r=await GET();assert.equal(r.status,503);assert.match((await r.json()).error,/Supabase/);assert.equal(calls.length,1);});
 await t.test("Clé publique ou absente refusée avant tout appel",async()=>{calls=[];for(const key of ["","sb_publishable_fixture"]){process.env.SUPABASE_SECRET_KEY=key;assert.equal((await GET()).status,503);}assert.equal(calls.length,0);process.env.SUPABASE_SECRET_KEY="sb_secret_test_fixture";});
 await t.test("Conflit serveur renvoyé au client sans réécriture",async()=>{calls=[];handler=async()=>Response.json({code:"P0001",message:"CONFLICT: Version périmée."},{status:400});const r=await post({action:"title",operationId:randomUUID()});assert.equal(r.status,409);assert.equal(calls.length,1);});
 await t.test("Migration absente signalée explicitement",async()=>{handler=async()=>Response.json({code:"PGRST202",message:"Not found"},{status:404});const r=await GET();assert.equal(r.status,503);assert.match((await r.json()).error,/migration SQL/);});
 await t.test("Réponse invalide ou reçu absent conserve le statut d’échec",async()=>{handler=async()=>new Response("not json");assert.equal((await GET()).status,503);handler=async()=>Response.json({});assert.equal((await GET()).status,503);assert.equal((await post({action:"box",operationId:randomUUID()})).status,503);});
 await t.test("Cadastre par titre exige la migration avant toute mutation",async()=>{calls=[];handler=async()=>Response.json(workspace);const r=await post({action:"title",operationId:randomUUID(),cadastre:"Mfoundi B",number:"123",category:"A",box:"1"});assert.equal(r.status,503);const body=await r.json();assert.match(body.error,/mise à jour Cadastres/);assert.equal(body.code,"SUPABASE_MIGRATION_REQUIRED");assert.ok(calls.every(call=>call.url.endsWith("fonciarch_workspace")));});
 await t.test("Droits d’écriture refusés distingués d’une panne réseau",async()=>{calls=[];handler=async()=>Response.json({code:"42501",message:"permission denied"},{status:403});const r=await post({action:"box",operationId:randomUUID(),number:"1"});assert.equal(r.status,503);const body=await r.json();assert.equal(body.code,"SUPABASE_WRITE_DENIED");assert.match(body.error,/droits d’écriture/);assert.equal(calls.length,1);});
 await t.test("Origine, JSON, comptes suspendus et identifiants contrôlés avant Supabase",async()=>{calls=[];assert.equal((await post({action:"box"},"https://external.test")).status,403);assert.equal((await post("invalid")).status,400);assert.equal((await post({action:"login"})).status,403);assert.equal((await post({action:"box",operationId:"invalid"})).status,400);assert.equal(calls.length,0);});
 }finally{globalThis.fetch=originalFetch;if(originalUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=originalUrl;if(originalKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=originalKey;rmSync(directory,{recursive:true,force:true});}
});

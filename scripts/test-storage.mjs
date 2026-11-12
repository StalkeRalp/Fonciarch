import ts from "typescript";
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,dirname} from "node:path";
import {pathToFileURL} from "node:url";
import {randomUUID} from "node:crypto";
import assert from "node:assert/strict";
import {test} from "node:test";
const dir=mkdtempSync(join(tmpdir(),"fonciarch-storage-test-"));
for(const file of ["lib/errors.ts","lib/file-types.ts","lib/supabase-config.ts","lib/supabase-files.ts","lib/backend.ts","lib/models.ts","lib/offline/model.ts","lib/offline/engine.ts","app/api/files/route.ts","app/api/files/link/route.ts","app/api/workspace/route.ts"]){const out=join(dir,file.replace(/\.ts$/,'.js'));mkdirSync(dirname(out),{recursive:true});const code=ts.transpileModule(readFileSync(join('src',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;writeFileSync(out,code.replace(/(from\s*)(["'])(\.{1,2}\/[^"']+)\2/g,(_,pre,q,name)=>`${pre}${q}${name}.js${q}`));}
writeFileSync(join(dir,'package.json'),'{"type":"module"}');
const filesRoute=await import(pathToFileURL(join(dir,'app/api/files/route.js'))),linkRoute=await import(pathToFileURL(join(dir,'app/api/files/link/route.js'))),workspaceRoute=await import(pathToFileURL(join(dir,'app/api/workspace/route.js')));
const {OfflineEngine,transport}=await import(pathToFileURL(join(dir,'lib/offline/engine.js'))),{emptyState}=await import(pathToFileURL(join(dir,'lib/offline/model.js')));
const originalFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
process.env.SUPABASE_URL='https://project.example.test';process.env.SUPABASE_SECRET_KEY='sb_secret_test_fixture';
const records=new Map(),objects=new Map(),events=[];let failRegister=false;
const workspace={...emptyState().base,backendId:'project-test',capabilities:{titleCadastre:true},boxes:[{id:randomUUID(),number:'1',createdAt:new Date().toISOString()}]};
globalThis.fetch=async(url,options={})=>{
 const address=new URL(String(url),'http://localhost:3000');
 if(address.origin==='http://localhost:3000'){
  const headers=new Headers(options.headers);if(options.method==='POST')headers.set('origin',address.origin);
  const req=new Request(address,{...options,headers});
  if(address.pathname==='/api/files')return options.method==='POST'?filesRoute.POST(req):filesRoute.GET(req);
  if(address.pathname==='/api/workspace')return options.method==='POST'?workspaceRoute.POST(req):workspaceRoute.GET();
 }
 assert.equal(address.origin,'https://project.example.test');assert.equal(options.headers.apikey,'sb_secret_test_fixture');
 const path=decodeURIComponent(address.pathname);
 if(path==='/rest/v1/fonciarch_files'){const id=address.searchParams.get('id')?.slice(3);return Response.json(id?records.has(id)?[records.get(id)]:[]:[...records.values()]);}
 if(path==='/rest/v1/rpc/fonciarch_workspace')return Response.json(workspace);
 if(path==='/rest/v1/rpc/fonciarch_apply_operation'){events.push('import-data');const p=JSON.parse(options.body);return Response.json({id:p.p_operation_id,result:[]});}
 if(path==='/rest/v1/rpc/fonciarch_register_file'){events.push('register-file');if(failRegister){failRegister=false;return Response.json({message:'Temporary failure'},{status:503});}const row={...JSON.parse(options.body).p_file,created_at:new Date().toISOString()};records.set(row.id,row);return Response.json(row);}
 if(path.startsWith('/storage/v1/object/sign/'))return Response.json({signedURL:path.replace('/storage/v1','')+'?token=short-lived-test'});
 if(path.startsWith('/storage/v1/object/')){const key=path.slice('/storage/v1/object/'.length);if(options.method==='POST'){events.push('upload-file');assert.equal(options.headers['x-upsert'],'false');if(objects.has(key))return Response.json({error:'Duplicate',statusCode:'409'},{status:409});objects.set(key,new Uint8Array(await options.body.arrayBuffer()));return Response.json({Key:key});}return objects.has(key)?new Response(objects.get(key)):new Response('',{status:404});}
 throw new Error('Unexpected route '+path);
};
function form(id,name,content,kind='import',operationId){const f=new FormData();f.set('id',id);f.set('kind',kind);f.set('file',new Blob([content]),name);if(operationId)f.set('operationId',operationId);return f;}
const upload=f=>filesRoute.POST(new Request('http://localhost:3000/api/files',{method:'POST',headers:{origin:'http://localhost:3000'},body:f}));
class Memory{constructor(){this.state={...emptyState(),base:structuredClone(workspace)};}async read(){return structuredClone(this.state);}async change(fn){this.state=fn(structuredClone(this.state));return structuredClone(this.state);}}
await test('Stockage privé avec API et transport Supabase simulés',async t=>{try{
 let saved;
 await t.test('CSV transféré, métadonnées confirmées, clé non exposée',async()=>{const r=await upload(form(randomUUID(),'archives.csv','Numéro;Catégorie;Box\n123;A;1'));assert.equal(r.status,200);const data=await r.json();saved=data.file;assert.equal(saved.bucket,'fonciarch-imports');assert.equal(data.receipt.id,saved.id);assert.ok(!JSON.stringify(data).includes('sb_secret'));assert.ok(objects.has(`${saved.bucket}/${saved.path}`));});
 await t.test('Rejeu identique sans remplacement du fichier',async()=>{const before=objects.size;const r=await upload(form(saved.id,'archives.csv','Numéro;Catégorie;Box\n123;A;1'));assert.equal(r.status,200);assert.equal(objects.size,before);const different=await upload(form(saved.id,'archives.csv','Autre contenu'));assert.equal(different.status,409);});
 await t.test('Reprise après transfert réussi et métadonnées interrompues',async()=>{const id=randomUUID();failRegister=true;assert.equal((await upload(form(id,'reprise.csv','Numéro;Catégorie;Box\n456;B;1'))).status,503);assert.equal((await upload(form(id,'reprise.csv','Numéro;Catégorie;Box\n456;B;1'))).status,200);assert.ok(records.has(id));});
 await t.test('Origine, taille et signature contrôlées avant transfert',async()=>{const before=objects.size;assert.equal((await filesRoute.POST(new Request('http://localhost:3000/api/files',{method:'POST',headers:{origin:'https://external.test'},body:form(randomUUID(),'source.csv','x')}))).status,403);assert.equal((await filesRoute.POST(new Request('http://localhost:3000/api/files',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'multipart/form-data; boundary=x','content-length':'30000000'},body:'x'}))).status,413);assert.equal((await upload(form(randomUUID(),'faux.pdf','Texte ordinaire','document'))).status,422);assert.equal(objects.size,before);});
 await t.test('Lien privé signé, limité et sans secret',async()=>{const r=await linkRoute.POST(new Request('http://localhost:3000/api/files/link',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({id:saved.id})}));assert.equal(r.status,200);const data=await r.json();assert.equal(data.expiresIn,60);assert.equal(new URL(data.url).origin,'https://project.example.test');assert.equal(new URL(data.url).searchParams.get('download'),'archives.csv');assert.ok(!data.url.includes('sb_secret'));});
 await t.test('Blob conservé hors ligne puis transfert et reçu serveur',async()=>{const disk=new Memory(),engine=new OfflineEngine(disk,transport);await engine.enqueue('file',{filename:'piece.pdf'},[{blob:new Blob(['%PDF-1.7\nexample']),name:'piece.pdf',kind:'document'}]);const local=await engine.read();assert.equal(await local.operations[0].attachments[0].blob.text(),'%PDF-1.7\nexample');await engine.sync();assert.equal((await engine.read()).operations.length,0);assert.ok(records.has(local.operations[0].id));});
 await t.test('Le fichier source est stocké avant les données de l’import',async()=>{const disk=new Memory(),engine=new OfflineEngine(disk,transport);events.length=0;await engine.enqueue('import',{rows:[{number:'789',category:'C',box:'1'}],filename:'source.csv'},[{blob:new Blob(['Numéro;Catégorie;Box\n789;C;1']),name:'source.csv',kind:'import'}]);const op=(await engine.read()).operations[0];await engine.sync();assert.equal((await engine.read()).operations.length,0);const record=records.get(op.attachments[0].id);assert.equal(record.import_operation_id,op.id);assert.ok(events.indexOf('upload-file')<events.indexOf('register-file'));assert.ok(events.indexOf('register-file')<events.indexOf('import-data'));});
 await t.test('Liste des fichiers et pagination sans cache HTTP',async()=>{const r=await filesRoute.GET(new Request('http://localhost:3000/api/files?offset=0'));assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.ok((await r.json()).files.length>=4);assert.equal((await filesRoute.GET(new Request('http://localhost:3000/api/files?offset=bad'))).status,400);});
}finally{globalThis.fetch=originalFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;rmSync(dir,{recursive:true,force:true});}});

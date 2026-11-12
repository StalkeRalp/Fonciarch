import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import ts from "typescript";
const events = new Map(), items = new Map(), deleted=[]; let offline=false, skipped=false, writes=0;
const key=r=>typeof r==='string'?new URL(r,'https://fonciarch.test').pathname:new URL(r.url).pathname;
const cache={addAll:async paths=>{for(const path of paths)items.set(key(path),new Response(path==='/'?'APP SHELL':'STATIC'));},match:async r=>items.get(key(r))?.clone(),put:async(r,response)=>{writes++;items.set(key(r),response);}};
const fetcher=async request=>{if(offline)throw new Error('Offline');if(key(request)==='/pwa-assets.json')return Response.json({assets:['/_next/static/app.js','/_next/static/app.css']});return new Response('NETWORK');};
runInNewContext(readFileSync('public/sw.js','utf8'),{self:{addEventListener:(name,fn)=>events.set(name,fn),location:{origin:'https://fonciarch.test'},clients:{claim:async()=>{}},skipWaiting:()=>{skipped=true;}},caches:{open:async()=>cache,match:cache.match,keys:async()=>['other-app','fonciarch-pwa-old'],delete:async name=>{deleted.push(name);return true;}},fetch:fetcher,URL,Response,Promise});
function intercept(path,method='GET',mode='cors'){let response;events.get('fetch')({request:{url:`https://fonciarch.test${path}`,method,mode},respondWith:p=>{response=p;}});return response;}
await test('PWA et cache',async t=>{
 await t.test('Prépare le shell et tous les scripts nécessaires hors connexion',async()=>{let p;events.get('install')({waitUntil:x=>{p=x;}});await p;assert.ok(items.has('/'));assert.ok(items.has('/_next/static/app.js'));});
 await t.test('Réouverture hors connexion restitue le shell applicatif',async()=>{offline=true;const r=await intercept('/','GET','navigate');assert.equal(await r.text(),'APP SHELL');offline=false;});
 await t.test('Modèles Excel disponibles hors connexion, y compris en navigation',async()=>{offline=true;for(const path of ['/modeles/titres-vierge.xlsx','/modeles/titres-exemple.xlsx']){const r=await intercept(path,'GET','navigate');assert.equal(await r.text(),'STATIC');}offline=false;});
 await t.test('API et écritures ne sont jamais interceptées ni stockées dans le cache HTTP',()=>{assert.equal(intercept('/api/workspace'),undefined);assert.equal(intercept('/api/workspace','POST'),undefined);assert.equal(writes,0);});
 await t.test('Ne supprime pas les caches des autres applications',async()=>{let p;events.get('activate')({waitUntil:x=>{p=x;}});await p;assert.deepEqual(deleted,['fonciarch-pwa-old']);});
 await t.test('Une mise à jour attend une action explicite',()=>{assert.equal(skipped,false);events.get('message')({data:{type:'ACTIVATE_UPDATE'}});assert.equal(skipped,true);});
 await t.test('Manifeste et icônes carrées du logo',async()=>{const code=ts.transpileModule(readFileSync('src/app/manifest.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;const sandbox={exports:{}};runInNewContext(code,sandbox);const manifest=sandbox.exports.default();assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');for(const i of manifest.icons){assert.ok(existsSync('public'+i.src));const m=await sharp('public'+i.src).metadata();assert.equal(`${m.width}x${m.height}`,i.sizes);}const ico=readFileSync('src/app/favicon.ico');assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),4);});
});

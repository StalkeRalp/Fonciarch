import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const code=ts.transpileModule(readFileSync('src/components/offline-workspace.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const drain=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture(){
 let now=1000000,calls=0,fail=false,interval;
 const events=new Map(),effects=[],storage=new Map();
 const state={base:{titles:[]},operations:[]};
 class Engine{async read(){return state;}async sync(){calls++;if(fail)throw new Error('Indisponible');}async enqueue(){return state;}async resolve(){return state;}}
 const react={useState:value=>[typeof value==='function'?value():value,()=>{}],useRef:value=>({current:value}),useCallback:fn=>fn,useEffect:fn=>effects.push(fn)};
 const navigator={onLine:true,locks:{request:async(_name,_options,fn)=>fn({})}};
 const document={visibilityState:'visible',addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:()=>{}};
 const window={addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:()=>{}};
 const modules={'react':react,'react/jsx-runtime':{},'lucide-react':{},'../lib/offline/engine':{OfflineEngine:Engine},'../lib/offline/database':{},'../lib/offline/model':{emptyState:()=>state,project:x=>x.base}};
 const exports={};
 runInNewContext(code,{exports,require:name=>{assert.ok(name in modules,name);return modules[name];},navigator,document,window,localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},Date:class extends Date{static now(){return now;}},setInterval:(fn,delay)=>{assert.equal(delay,30000);interval=fn;return 1;},clearInterval:()=>{},console});
 const hook=exports.useOfflineWorkspace();const cleanup=effects[0]();
 return {hook,events,storage,navigator,document,cleanup,get calls(){return calls;},advance:ms=>{now+=ms;},tick:async()=>{interval();await drain();},setFail:value=>{fail=value;}};
}
await test('Enregistrement local, focus et reconnexion ne multiplient pas les envois',async()=>{
 const f=fixture();await drain();assert.equal(f.calls,1);
 await f.hook.enqueue('box',{number:'15'});assert.equal(f.calls,1);
 for(let i=0;i<5;i++){f.advance(1000);f.events.get('visibilitychange')();f.events.get('online')();await f.tick();}assert.equal(f.calls,1);
 f.advance(295000);await f.tick();assert.equal(f.calls,2);f.cleanup();
});
await test('Le bouton manuel ignore le délai et reporte le prochain passage automatique',async()=>{
 const f=fixture();await drain();f.advance(1000);await f.hook.synchronize();assert.equal(f.calls,2);
 f.advance(299000);await f.tick();assert.equal(f.calls,2);
 f.advance(1000);await f.tick();assert.equal(f.calls,3);f.cleanup();
});
await test('Les erreurs respectent le délai et les onglets partagent la dernière tentative',async()=>{
 const f=fixture();await drain();f.setFail(true);await f.hook.synchronize();assert.equal(f.calls,2);
 f.advance(20000);await f.tick();assert.equal(f.calls,2);
 f.storage.set('fonciarch-last-sync-attempt',String(1000000+300000));f.advance(280000);await f.tick();assert.equal(f.calls,2);
 f.advance(300000);await f.tick();assert.equal(f.calls,3);f.cleanup();
});

import ts from 'typescript';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
// Node has compression streams but no DOMParser. Use the independent Python XML
// parser as a DOM adapter; production uses the browser's native DOMParser.
class Element {
 constructor(node){Object.assign(this,node);}
 get textContent(){return this.text;}
 getAttribute(k){return this.attrs[k]??null;}
 hasAttribute(k){return k in this.attrs;}
 getAttributeNS(ns,k){return this.getAttribute(`{${ns}}${k}`);}
 getElementsByTagNameNS(_ns,tag){return this.children.flatMap(c=>[...(c.tag.split('}').at(-1)===tag?[new Element(c)]:[]),...new Element(c).getElementsByTagNameNS(_ns,tag)]);}
 getElementsByTagName(tag){return this.getElementsByTagNameNS('*',tag);}
}
globalThis.DOMParser=class {parseFromString(text){writeFileSync(join(dir,'input.xml'),text);const p=spawnSync('python3',['-c',`import sys,json,xml.etree.ElementTree as E
def node(e): return {'tag':e.tag,'attrs':e.attrib,'text':''.join(e.itertext()),'children':[node(c) for c in e]}
try: result=node(E.parse(sys.argv[1]).getroot())
except Exception: result={'tag':'parsererror','attrs':{},'text':'invalid','children':[]}
open(sys.argv[2],'w').write(json.dumps(result))`,join(dir,'input.xml'),join(dir,'output.json')],{encoding:'utf8',timeout:10000});if(p.status!==0) throw new Error(p.stderr);const root=JSON.parse(readFileSync(join(dir,'output.json'),'utf8'));return new Element({tag:'document',attrs:{},text:'',children:[root]});}};
const dir=mkdtempSync(join(tmpdir(),'fonciarch-xlsx-'));
const code=ts.transpileModule(readFileSync('src/lib/import-xlsx.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
writeFileSync(join(dir,'reader.mjs'),code);
const {readXlsx}=await import(pathToFileURL(join(dir,'reader.mjs')));
function buffer(b){return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const row=(n,cells)=>`<row r="${n}">${cells.map((v,i)=>v===null?'':`<c r="${String.fromCharCode(65+i)}${n}" t="inlineStr"><is><t>${v}</t></is></c>`).join('')}</row>`;
function fixture(sheet,extras={}){
 const files={'xl/workbook.xml':`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Titres" sheetId="1" r:id="rId1"/></sheets></workbook>`,'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/custom.xml"/></Relationships>','xl/worksheets/custom.xml':`<worksheet xmlns="${ns}"><sheetData>${sheet}</sheetData></worksheet>`,...extras};
 writeFileSync(join(dir,'files.json'),JSON.stringify(files));
 const p=spawnSync('python3',['-c',`import json,sys,zipfile,io
b=io.BytesIO()
with zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED) as z:
 for k,v in json.load(open(sys.argv[1])).items(): z.writestr(k,v)
open(sys.argv[2],'wb').write(b.getvalue())`,join(dir,'files.json'),join(dir,'fixture.xlsx')],{timeout:10000});assert.equal(p.status,0);return buffer(readFileSync(join(dir,'fixture.xlsx')));
}
const header=row(1,['Numéro','Conservation','Box','Cadastre','Statut']);
try {
await test('Modèles Excel réels : cinq cellules, zéros initiaux conservés',async()=>{
 const example=await readXlsx(buffer(readFileSync('public/modeles/titres-exemple.xlsx')));
 assert.deepEqual(example.records[0],['Numéro','Conservation','Box','Cadastre','Statut']);
 assert.deepEqual(example.records[1],['00125','A','15','Mfoundi A','Disponible']);
 assert.equal(example.records.length,4);
 const blank=await readXlsx(buffer(readFileSync('public/modeles/titres-vierge.xlsx')));assert.equal(blank.records.length,1);
});
await test('Cellules absentes et lignes vides : colonnes et numéros de ligne préservés',async()=>{
 const r=await readXlsx(fixture(header+row(4,['00015','A','15',null,null])));
 assert.deepEqual(r.records[1],['00015','A','15','','']);assert.deepEqual(r.lineNumbers,[1,4]);
});
await test('Shared strings, texte enrichi et noms de fichiers non standards',async()=>{
 const r=await readXlsx(fixture(header+'<row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2" t="inlineStr"><is><r><t>A</t></r></is></c><c r="C2"><v>15</v></c></row>',{'xl/sharedStrings.xml':`<sst xmlns="${ns}"><si><r><t>00</t></r><r><t>125</t></r></si></sst>`}));
 assert.deepEqual(r.records[1],['00125','A','15','','']);
});
await test('Les formules, cellules fusionnées, lignes masquées et identifiants arrondis sont bloqués',async()=>{
 await assert.rejects(readXlsx(fixture(header+'<row r="2"><c r="A2"><f>1+1</f><v>2</v></c></row>')),/formule/);
 await assert.rejects(readXlsx(fixture(header+'<row r="2" hidden="1"><c r="A2"><v>15</v></c></row>')),/masquée/);
 await assert.rejects(readXlsx(fixture(header+'<row r="2"><c r="A2"><v>1234567890123456</v></c></row>')),/Texte/);
 const merged=fixture(header,{'xl/worksheets/custom.xml':`<worksheet xmlns="${ns}"><sheetData>${header}</sheetData><mergeCells><mergeCell ref="A2:B2"/></mergeCells></worksheet>`});
 await assert.rejects(readXlsx(merged),/fusionnées/);
});
await test('Formats numériques : padding préservé, dates refusées',async()=>{
 const styles=`<styleSheet xmlns="${ns}"><numFmts><numFmt numFmtId="164" formatCode="00000"/></numFmts><cellXfs><xf numFmtId="164"/><xf numFmtId="14"/></cellXfs></styleSheet>`;
 const r=await readXlsx(fixture(header+'<row r="2"><c r="A2" s="0"><v>125</v></c></row>',{'xl/styles.xml':styles}));assert.equal(r.records[1][0],'00125');
 await assert.rejects(readXlsx(fixture(header+'<row r="2"><c r="A2" s="1"><v>45000</v></c></row>',{'xl/styles.xml':styles})),/date/);
});
await test('Faux Excel, XML externe, mauvais en-tête et excès de lignes refusés',async()=>{
 await assert.rejects(readXlsx(new ArrayBuffer(0)),/xlsx/);
 await assert.rejects(readXlsx(fixture(row(2,['Numéro']))),/ligne 1/);
 await assert.rejects(readXlsx(fixture(header,{'xl/workbook.xml':'<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>'})),/XML/);
 const rows=header+Array.from({length:5001},(_,i)=>row(i+2,['1'])).join('');await assert.rejects(readXlsx(fixture(rows)),/5 000/);
});
} finally {rmSync(dir,{recursive:true,force:true});delete globalThis.DOMParser;}

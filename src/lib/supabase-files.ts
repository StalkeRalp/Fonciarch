import { createHash } from "node:crypto";
import { readSupabaseConfig, SupabaseConfigError } from "./supabase-config";
import { AppError } from "./errors";
import { fileFormat, fileKinds, type FileKind, type FileRecord } from "./file-types";
export const MAX_UPLOAD_BODY = 20 * 1024 * 1024 + 65536;
function configuration() { try { return readSupabaseConfig(process.env); } catch (e) { if (e instanceof SupabaseConfigError) throw new AppError(e.message,503); throw e; } }
async function request(path: string, init: RequestInit = {}) {
  const { url, key }=configuration();
  try { return await fetch(url+path,{...init,headers:{apikey:key,...(key.startsWith("eyJ")?{Authorization:`Bearer ${key}`} : {}),...init.headers},cache:"no-store",signal:AbortSignal.timeout(30000)}); }
  catch { throw new AppError("Le stockage Supabase est inaccessible. Le fichier reste sur cet appareil.",503); }
}
async function json(response: Response) {
  const data=await response.json().catch(()=>null);
  if (!response.ok) {
    if (data?.code==="23505" || String(data?.message).startsWith("CONFLICT:")) throw new AppError("Cet identifiant de fichier est déjà utilisé avec un autre contenu.",409);
    if (data?.code==="23503") throw new AppError("Le titre associé au fichier est introuvable dans Supabase.",409);
    if (data?.code==="23514") throw new AppError("Les métadonnées du fichier ne respectent pas les limites du stockage.",400);
    if (data?.code==="P0001") throw new AppError(String(data.message).replace(/^INVALID:\s*/,""),400);
    if (["PGRST202","PGRST205","42P01"].includes(data?.code)) throw new AppError("Le stockage des fichiers n’est pas configuré. Exécutez la migration SQL Storage.",503);
    throw new AppError("Supabase a refusé le stockage du fichier. Vérifiez les buckets privés et la migration Storage.",503);
  }
  if (data===null) throw new AppError("Réponse du stockage invalide.",503);
  return data;
}
function uuid(value: unknown, label: string) { if(typeof value!=="string"||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new AppError(`${label} invalide.`); return value; }
function record(row: Record<string,unknown>): FileRecord { return {id:String(row.id),kind:row.kind as FileKind,bucket:String(row.bucket),path:String(row.object_path),name:String(row.original_name),mime:String(row.mime_type),size:Number(row.size_bytes),sha256:String(row.sha256),titleId:row.title_id?String(row.title_id):null,operationId:row.import_operation_id?String(row.import_operation_id):null,createdAt:String(row.created_at)}; }
export async function listFiles(offset=0) {
  const rows=await json(await request(`/rest/v1/fonciarch_files?select=*&order=created_at.desc,id.desc&limit=100&offset=${offset}`));
  if(!Array.isArray(rows))throw new AppError("Liste des fichiers invalide.",503);
  return {files:rows.map(record),nextOffset:rows.length===100?offset+100:null};
}
export async function findFile(id: string): Promise<FileRecord|null> {
  uuid(id,"Identifiant du fichier"); const rows=await json(await request(`/rest/v1/fonciarch_files?id=eq.${id}&select=*&limit=1`));
  if(!Array.isArray(rows))throw new AppError("Réponse du registre des fichiers invalide.",503);
  return rows[0]?record(rows[0]):null;
}
export async function limitedBody(request: Request, limit=MAX_UPLOAD_BODY): Promise<Uint8Array> {
  if(Number(request.headers.get("content-length"))>limit)throw new AppError("Fichier trop volumineux.",413);
  const reader=request.body?.getReader(); if(!reader)throw new AppError("Fichier absent.");
  const chunks:Uint8Array[]=[];let size=0;
  try { while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel();throw new AppError("Fichier trop volumineux.",413);}chunks.push(part.value);} }
  finally {reader.releaseLock();}
  return Buffer.concat(chunks,size);
}
function verifyContents(bytes: Uint8Array,extension:string) {
  const starts=(signature:number[])=>signature.every((n,i)=>bytes[i]===n);
  if(extension==="pdf"&&!starts([37,80,68,70,45]))throw new AppError("Le contenu ne correspond pas à un PDF.",422);
  if(extension==="png"&&!starts([137,80,78,71,13,10,26,10]))throw new AppError("Le contenu ne correspond pas à une image PNG.",422);
  if(["jpg","jpeg"].includes(extension)&&!starts([255,216,255]))throw new AppError("Le contenu ne correspond pas à une image JPEG.",422);
  if(extension==="xlsx"&&!starts([80,75,3,4]))throw new AppError("Le contenu ne correspond pas à un classeur XLSX.",422);
  if(extension==="xls"&&!starts([208,207,17,224,161,177,26,225]))throw new AppError("Le contenu ne correspond pas à un classeur XLS.",422);
  if(extension==="csv") {try {const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);if(text.includes("\0"))throw new Error();}catch{throw new AppError("Le CSV doit être un fichier texte UTF-8.",422);}}
}
function objectPath(file: FileRecord) {return `${encodeURIComponent(file.bucket)}/${file.path.split("/").map(encodeURIComponent).join("/")}`;}
export async function storeFile(input:{id:string;kind:FileKind;name:string;blob:Blob;titleId?:string;operationId?:string}) {
  const id=uuid(input.id,"Identifiant du fichier");
  if(!(fileKinds as readonly string[]).includes(input.kind))throw new AppError("Catégorie de fichier invalide.");
  const titleId=input.titleId?uuid(input.titleId,"Titre associé"):null;
  const operationId=input.operationId?uuid(input.operationId,"Import associé"):null;
  const name=input.name.split(/[\\/]/).pop()?.replace(/[\x00-\x1f\x7f]/g,"").trim();
  if(!name||name.length>255)throw new AppError("Nom de fichier invalide.");
  let format;try{format=fileFormat(name,input.blob.size,input.kind);}catch(e){throw new AppError(e instanceof Error?e.message:"Format invalide.");}
  const bytes=new Uint8Array(await input.blob.arrayBuffer());verifyContents(bytes,format.extension);
  const hash=createHash("sha256").update(bytes).digest("hex");
  const existing=await findFile(id);
  if(existing) {if(existing.sha256!==hash||existing.size!==bytes.length||existing.kind!==input.kind||existing.name!==name||existing.titleId!==titleId||existing.operationId!==operationId)throw new AppError("Le même identifiant désigne déjà un autre fichier.",409);return existing;}
  const path=`${id}/file.${format.extension}`;
  const uploaded=await request(`/storage/v1/object/${format.bucket}/${path}`,{method:"POST",headers:{"Content-Type":format.mime,"x-upsert":"false","cache-control":"private, max-age=0"},body:new Blob([bytes as BlobPart],{type:format.mime})});
  if(!uploaded.ok) {
    const error=await uploaded.json().catch(()=>({}));
    if(uploaded.status===409||error.error==="Duplicate"||error.code==="Duplicate"||String(error.statusCode)==="409") {
      const stored=await request(`/storage/v1/object/${format.bucket}/${path}`);
      if(!stored.ok)throw new AppError("Un transfert précédent doit être vérifié. La copie locale est conservée.",503);
      const content=await limitedBody(new Request("https://storage.local/",{method:"POST",body:stored.body,duplex:"half"} as RequestInit),20*1024*1024);
      if(createHash("sha256").update(content).digest("hex")!==hash)throw new AppError("Un autre contenu occupe déjà cet emplacement. Aucun fichier n’a été remplacé.",409);
    } else throw new AppError("Envoi refusé par Supabase Storage. Vérifiez la création des buckets et leurs limites.",503);
  }
  const saved=await json(await request("/rest/v1/rpc/fonciarch_register_file",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({p_file:{id,kind:input.kind,bucket:format.bucket,object_path:path,original_name:name,mime_type:format.mime,size_bytes:bytes.length,sha256:hash,title_id:titleId,import_operation_id:operationId}})}));
  return record(saved);
}
export async function signedDownload(id:string) {
  const file=await findFile(id);if(!file)throw new AppError("Fichier introuvable.",404);
  const data=await json(await request(`/storage/v1/object/sign/${objectPath(file)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expiresIn:60})}));
  if(typeof data.signedURL!=="string")throw new AppError("Lien de téléchargement invalide.",503);
  const {url}=configuration();const link=new URL(data.signedURL.startsWith("http")?data.signedURL:`${url}/storage/v1${data.signedURL}`);
  if(link.origin!==new URL(url).origin||!link.pathname.startsWith("/storage/v1/object/sign/"))throw new AppError("Lien de téléchargement non reconnu.",503);
  link.searchParams.set("download",file.name);return {url:link.toString(),expiresIn:60};
}

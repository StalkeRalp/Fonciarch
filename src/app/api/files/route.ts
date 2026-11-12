import { AppError } from "../../../lib/errors";
import { limitedBody, listFiles, storeFile } from "../../../lib/supabase-files";
import type { FileKind } from "../../../lib/file-types";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function fail(error:unknown){if(error instanceof AppError)return Response.json({error:error.message},{status:error.status,headers:{"Cache-Control":"no-store"}});return Response.json({error:"Le transfert n’a pas abouti. La copie locale est conservée."},{status:503,headers:{"Cache-Control":"no-store"}});}
export async function GET(request:Request){try{const raw=new URL(request.url).searchParams.get("offset")||"0";if(!/^\d+$/.test(raw)||Number(raw)>1000000)throw new AppError("Pagination invalide.");return Response.json(await listFiles(Number(raw)),{headers:{"Cache-Control":"no-store"}});}catch(error){return fail(error);}}
export async function POST(request:Request){try{
 if(request.headers.get("origin")!==new URL(request.url).origin)throw new AppError("Origine non autorisée.",403);
 const contentType=request.headers.get("content-type")||"";if(!contentType.startsWith("multipart/form-data;"))throw new AppError("Un fichier multipart est attendu.");
 const bytes=await limitedBody(request);let form;try{form=await new Response(bytes as BodyInit,{headers:{"Content-Type":contentType}}).formData();}catch{throw new AppError("Fichier multipart invalide.");}
 const file=form.get("file");if(!file||typeof file==="string")throw new AppError("Sélectionnez un fichier.");
 const saved=await storeFile({id:String(form.get("id")||""),kind:String(form.get("kind")||"") as FileKind,name:file.name,blob:file,titleId:String(form.get("titleId")||"")||undefined,operationId:String(form.get("operationId")||"")||undefined});
 return Response.json({file:saved,receipt:{id:saved.id,result:saved}},{headers:{"Cache-Control":"no-store"}});
}catch(error){return fail(error);}}

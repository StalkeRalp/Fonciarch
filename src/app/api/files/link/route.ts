import { AppError } from "../../../../lib/errors";
import { signedDownload } from "../../../../lib/supabase-files";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){try{
 if(request.headers.get("origin")!==new URL(request.url).origin)throw new AppError("Origine non autorisée.",403);
 if(Number(request.headers.get("content-length"))>2048)throw new AppError("Requête trop volumineuse.",413);
 const raw=await request.text();if(raw.length>2048)throw new AppError("Requête trop volumineuse.",413);
 let data;try{data=JSON.parse(raw);}catch{throw new AppError("Requête invalide.");}
 return Response.json(await signedDownload(String(data?.id||"")),{headers:{"Cache-Control":"no-store"}});
}catch(error){return Response.json({error:error instanceof AppError?error.message:"Téléchargement temporairement indisponible."},{status:error instanceof AppError?error.status:503,headers:{"Cache-Control":"no-store"}});}}

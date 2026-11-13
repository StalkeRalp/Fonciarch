import { AppError } from "../../../lib/errors";
import { readWorkspace, applyOperation } from "../../../lib/backend";
import { randomUUID } from "node:crypto";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function response(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
export async function GET() { try { return response(await readWorkspace()); } catch (error) { if (error instanceof AppError) return response({ error: error.message }, error.status); console.error(error); return response({ error: "Supabase est inaccessible." }, 503); } }
export async function POST(request: Request) {
 let operationAction = "unknown";
 try {
  const origin = request.headers.get("origin"); if (origin !== new URL(request.url).origin) throw new AppError("Origine de la requête non autorisée.", 403);
  if (Number(request.headers.get("content-length")) > 5_000_000) throw new AppError("Requête trop volumineuse.", 413);
  const raw = await request.text(); if (raw.length > 5_000_000) throw new AppError("Requête trop volumineuse.", 413);
  let input; try { input = JSON.parse(raw); } catch { throw new AppError("Requête JSON invalide."); } if (!input || typeof input !== "object") throw new AppError("Requête invalide.");
  const { action, operationId, ...data } = input;
  if (!["title", "box", "move", "import", "settings"].includes(action)) throw new AppError("La gestion des comptes est suspendue pendant l’accès sans authentification.", 403);
  operationAction = action;
  if (operationId !== undefined && (typeof operationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId))) throw new AppError("Identifiant d’opération invalide.");
  return response(await applyOperation(operationId || randomUUID(), String(action), data));
 } catch (error) { if (error instanceof AppError) { if (error.status >= 500) console.warn("[FONCIARCH synchronisation]", { action: operationAction, status: error.status, code: error.code || "SUPABASE_UNAVAILABLE" }); return response({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status); } console.error(error); return response({ error: "L’opération n’a pas pu être enregistrée. Réessayez." }, 500); }
}

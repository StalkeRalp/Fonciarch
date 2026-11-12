import { readSupabaseConfig, SupabaseConfigError } from "./supabase-config";
import type { Workspace } from "./models";
import { findFile } from "./supabase-files";
import { AppError } from "./errors";
import type { Receipt } from "./offline/model";

async function rpc(name: string, input: Record<string, unknown> = {}) {
  let config;
  try { config = readSupabaseConfig(process.env); }
  catch (error) { if (error instanceof SupabaseConfigError) throw new AppError(error.message, 503); throw error; }
  const { url, key } = config;
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify(input), cache: "no-store", signal: AbortSignal.timeout(15000),
    });
  } catch { throw new AppError("Supabase est temporairement inaccessible. Les saisies restent sur l’appareil.", 503); }
  let data;
  try { data = await response.json(); }
  catch { throw new AppError("Supabase n’a pas renvoyé une réponse valide. Les saisies restent en attente.", 503); }
  if (!response.ok) {
    const message = String(data?.message || "Échec Supabase.");
    if (message.startsWith("CONFLICT:") || data?.code === "23505") throw new AppError(message.startsWith("CONFLICT:") ? message.slice(9).trim() : "Un titre ou un box avec ces références existe déjà.", 409);
    if (data?.code === "P0001" || ["23503", "23514", "22P02"].includes(data?.code)) throw new AppError(message.startsWith("INVALID:") ? message.slice(8).trim() : "Les données ne respectent pas les contraintes du registre.", 400);
    if (data?.code === "PGRST202") throw new AppError("Les fonctions FONCIARCH sont absentes de Supabase. Exécutez la migration SQL du projet.", 503);
    throw new AppError("Supabase a refusé la requête. Vérifiez la migration et la clé serveur.", 503);
  }
  return data;
}
export async function readWorkspace(): Promise<Workspace> {
  const data = await rpc("fonciarch_workspace");
  if (!data || !Array.isArray(data.titles) || !Array.isArray(data.boxes) || !Array.isArray(data.activities) || !data.settings || typeof data.backendId !== "string") throw new AppError("Le format du registre Supabase est invalide. Vérifiez la migration SQL.", 503);
  return data;
}
export async function applyOperation(id: string, action: string, input: Record<string, unknown>): Promise<Workspace & { receipt: Receipt }> {
  const usesCadastre = (action === "box" && input.reuseExisting === true) || (action === "title" && typeof input.cadastre === "string") || (action === "import" && Array.isArray(input.rows) && input.rows.some(row => row && typeof row.cadastre === "string"));
  if (usesCadastre && !(await readWorkspace()).capabilities?.titleCadastre) throw new AppError("Exécutez la migration Cadastres dans Supabase avant de synchroniser ces titres.", 503);
  if (action === "import" && input.sourceFileId) {
    const source = await findFile(String(input.sourceFileId));
    if (!source || source.kind !== "import" || source.operationId !== id) throw new AppError("Le fichier source de cet import doit être transféré avant les titres.", 409);
  }
  const receipt = await rpc("fonciarch_apply_operation", { p_operation_id: id, p_action: action, p_input: input });
  if (receipt?.id !== id) throw new AppError("Supabase n’a pas confirmé l’opération. Elle reste en attente sur l’appareil.", 503);
  return { ...await readWorkspace(), receipt };
}

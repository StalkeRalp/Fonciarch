/** Validation locale du type de clé ; Supabase vérifie ensuite sa validité réelle. */
export class SupabaseConfigError extends Error {}
export function legacyKeyRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try { const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); return typeof claims.role === "string" ? claims.role : null; }
  catch { return null; }
}
export function readSupabaseConfig(env: Record<string, string | undefined>) {
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) throw new SupabaseConfigError("Renseignez SUPABASE_URL et une vraie SUPABASE_SECRET_KEY dans la configuration du serveur.");
  try { if (new URL(url).protocol !== "https:") throw new Error(); } catch { throw new SupabaseConfigError("SUPABASE_URL doit être une URL HTTPS valide."); }
  const role = legacyKeyRole(key);
  if (key.startsWith("sb_publishable_") || role === "anon" || role === "authenticated") throw new SupabaseConfigError("SUPABASE_SECRET_KEY contient une clé publique. Utilisez une clé serveur sb_secret_ ou une ancienne clé service_role.");
  if (!key.startsWith("sb_secret_") && role !== "service_role") throw new SupabaseConfigError("Le type de SUPABASE_SECRET_KEY n’est pas reconnu. Utilisez la clé secrète serveur du projet Supabase.");
  return { url: url.replace(/\/$/, ""), key };
}

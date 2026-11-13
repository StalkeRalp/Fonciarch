import ts from "typescript";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../src/lib/supabase-config.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { readSupabaseConfig } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

async function probe(url, key) {
  let response;
  try { response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/fonciarch_workspace`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(10000) }); }
  catch (error) { console.log(`Vérification réseau impossible (${error.cause?.code || error.name}). Aucun accès distant confirmé.`); process.exitCode = 1; return; }
  // Ne jamais afficher les données du registre ni les clés.
  const data = await response.json().catch(() => ({}));
  if (response.ok) { console.log("RPC de lecture accessible."); if (Array.isArray(data.titles)) {
    console.log(`Registre distant : ${data.titles.length} titre(s), ${data.boxes?.length || 0} box(es).`);
    console.log(`Cadastre par titre : ${data.capabilities?.titleCadastre ? "prêt" : "migration Cadastres requise"}.`);
    if (!data.capabilities?.titleCadastre) { console.log("Synchronisation des titres bloquée : exécutez supabase/MISE_A_JOUR_SYNCHRONISATION.sql dans le SQL Editor, puis réessayez."); process.exitCode=1; }
    if (process.argv.includes("--storage")) {
      const files=await fetch(`${url}/rest/v1/fonciarch_files?select=id&limit=1`,{headers:{apikey:key},signal:AbortSignal.timeout(10000)});
      console.log(`Registre des fichiers : ${files.ok ? "accessible" : "migration Storage ou droits à vérifier"}.`);
      if (!files.ok) process.exitCode=1;
      const buckets=await fetch(`${url}/storage/v1/bucket`,{headers:{apikey:key},signal:AbortSignal.timeout(10000)});
      const list=await buckets.json().catch(()=>null);
      if(buckets.ok&&Array.isArray(list))for(const name of ["fonciarch-imports","fonciarch-documents","fonciarch-exports"]){const bucket=list.find(b=>b.id===name);console.log(`${name} : ${bucket ? bucket.public ? "ATTENTION public" : "privé" : "absent"}.`);if(!bucket||bucket.public)process.exitCode=1;}
      else {console.log("Impossible de vérifier la configuration des buckets.");process.exitCode=1;}
    }
  } }
  else if (response.status === 404 && data.code === "PGRST202") { console.log("Projet joignable, mais fonction FONCIARCH absente : exécutez la migration SQL puis actualisez le cache du schéma si nécessaire."); process.exitCode = 1; }
  else if ([401,403].includes(response.status)) { console.log(`Accès refusé (HTTP ${response.status}). Une clé publique ne peut pas utiliser les fonctions réservées au serveur.`); process.exitCode = 1; }
  else { console.log(`RPC non disponible (HTTP ${response.status}, code ${data.code || "non précisé"}).`); process.exitCode = 1; }
}
if (process.argv.includes("--public-probe")) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url?.startsWith("https://") || !key) { console.log("URL ou clé publique absente."); process.exitCode=1; }
  else { console.log("Diagnostic en lecture avec la clé publique ; aucune donnée écrite."); await probe(url,key); }
} else {
  try { const { url,key }=readSupabaseConfig(process.env); console.log("Type de clé serveur correct. Vérification de la RPC FONCIARCH…"); await probe(url,key); }
  catch (error) { console.log(error.message); process.exitCode=1; }
}

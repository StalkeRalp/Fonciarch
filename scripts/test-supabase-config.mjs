import { readFile } from "node:fs/promises";
import ts from "typescript";
import assert from "node:assert/strict";
import { test } from "node:test";
const source = await readFile(new URL("../src/lib/supabase-config.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { readSupabaseConfig } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const env = key => ({ SUPABASE_URL: "https://project.example.test", SUPABASE_SECRET_KEY: key });
const legacy = role => `header.${Buffer.from(JSON.stringify({role})).toString("base64url")}.signature`;
await test("Configuration des clés Supabase", async t => {
 await t.test("Refuse une clé publishable nommée par erreur SECRET", () => assert.throws(() => readSupabaseConfig(env("sb_publishable_test")), /clé publique/));
 await t.test("Refuse l’ancienne clé anon et un JWT utilisateur", () => { for (const role of ["anon", "authenticated"]) assert.throws(() => readSupabaseConfig(env(legacy(role))), /clé publique/); });
 await t.test("Accepte le type secret et le type service_role sans prétendre valider leur signature", () => { for (const key of ["sb_secret_test", legacy("service_role")]) assert.equal(readSupabaseConfig(env(key)).key, key); });
 await t.test("Refuse la configuration incomplète et une URL sans HTTPS", () => { assert.throws(() => readSupabaseConfig(env("")), /vraie SUPABASE_SECRET_KEY/); assert.throws(() => readSupabaseConfig({...env("sb_secret_test"), SUPABASE_URL:"http://example.test"}), /HTTPS/); });
});

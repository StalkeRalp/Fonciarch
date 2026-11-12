import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
async function list(folder) { const result = []; for (const entry of await readdir(folder, { withFileTypes: true })) { const path = join(folder, entry.name); if (entry.isDirectory()) result.push(...await list(path)); else if (/\.(js|css|woff2?|ttf)$/.test(entry.name)) result.push('/_next/' + path.replace(/^\.next\//, '').replaceAll('\\','/')); } return result; }
const assets = (await list(".next/static")).sort();
const worker = await readFile("public/sw.js", "utf8");
const version = createHash("sha256").update(await readFile(".next/BUILD_ID")).update(assets.join("\n")).update(worker.replace(/const CACHE = "[^"]+";/, "")).digest("hex").slice(0,16);
await writeFile("public/pwa-assets.json", JSON.stringify({ version, assets }));
await writeFile("public/sw.js", worker.replace(/const CACHE = "[^"]+";/, `const CACHE = "fonciarch-pwa-${version}";`));
console.log(`PWA : ${assets.length} ressources préparées pour le mode hors connexion.`);

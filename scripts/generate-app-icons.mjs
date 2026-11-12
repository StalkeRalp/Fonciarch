import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

// Déclinaisons techniques du pictogramme du logo original, sans le redessiner.
const logo = "public/Logo foncier camerounais.png";
await mkdir("public/icons", { recursive: true });
async function icon(size, padding = 0.08) {
  const inset = Math.round(size * padding);
  const content = await sharp(logo).extract({ left: 330, top: 40, width: 880, height: 540 }).resize(size - inset * 2, size - inset * 2, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: "#ffffff" } }).composite([{ input: content, left: inset, top: inset }]).png().toBuffer();
}
for (const size of [16, 32, 192, 512]) await writeFile(`public/icons/icon-${size}.png`, await icon(size));
await writeFile("public/icons/apple-touch-icon.png", await icon(180));
await writeFile("public/icons/maskable-512.png", await icon(512, 0.2));
const images = await Promise.all([16, 32, 48, 64].map(async size => ({ size, data: await icon(size) })));
const header = Buffer.alloc(6 + images.length * 16); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach(({ size, data }, index) => { const entry = 6 + index * 16; header[entry] = size; header[entry + 1] = size; header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6); header.writeUInt32LE(data.length, entry + 8); header.writeUInt32LE(offset, entry + 12); offset += data.length; });
await writeFile("src/app/favicon.ico", Buffer.concat([header, ...images.map(i => i.data)]));
console.log("Icônes du navigateur et de la PWA générées depuis le logo FONCIARCH.");

// XLSX only: ZIP/Open XML read locally in the browser, with bounded expansion.
// No macros, formulas, external links or merged data cells are evaluated.
const MAX_XML = 24 * 1024 * 1024;
function xml(text: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("Déclarations XML non autorisées.");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Classeur Excel endommagé.");
  return doc;
}
function elements(node: Document | Element, name: string) { return Array.from(node.getElementsByTagNameNS("*", name)); }
function text(node: Element, tag: string) { return elements(node, tag).map(n => n.textContent || "").join(""); }
async function openZip(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  const check = (offset: number, length: number) => { if (offset < 0 || offset + length > bytes.length) throw new Error("Classeur Excel incomplet."); };
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break;
  if (end < Math.max(0, bytes.length - 65557)) throw new Error("Choisissez un véritable fichier Excel .xlsx.");
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new Error("Archive Excel non prise en charge.");
  const count = view.getUint16(end + 10, true), start = view.getUint32(end + 16, true), size = view.getUint32(end + 12, true);
  if (count > 2000 || start + size > end) throw new Error("Classeur Excel trop complexe.");
  const entries = new Map<string, { offset: number; packed: number; unpacked: number; method: number }>();
  let cursor = start, expanded = 0;
  for (let i = 0; i < count; i++) {
    check(cursor, 46);
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Archive Excel invalide.");
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true), packed = view.getUint32(cursor + 20, true), unpacked = view.getUint32(cursor + 24, true), nameLength = view.getUint16(cursor + 28, true), extra = view.getUint16(cursor + 30, true), comment = view.getUint16(cursor + 32, true), offset = view.getUint32(cursor + 42, true);
    check(cursor + 46, nameLength + extra + comment);
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (flags & 1 || ![0, 8].includes(method)) throw new Error("Classeur chiffré ou compression non prise en charge.");
    if (entries.has(name)) throw new Error("Archive Excel ambiguë.");
    expanded += unpacked;
    if (expanded > 48 * 1024 * 1024 || unpacked > MAX_XML) throw new Error("Classeur trop volumineux après décompression. Retirez les images et feuilles inutiles.");
    entries.set(name, { offset, packed, unpacked, method });
    cursor += 46 + nameLength + extra + comment;
  }
  return async (name: string, optional = false) => {
    const entry = entries.get(name);
    if (!entry) { if (optional) return ""; throw new Error(`Partie Excel manquante : ${name}.`); }
    check(entry.offset, 30);
    if (view.getUint32(entry.offset, true) !== 0x04034b50) throw new Error("Archive Excel invalide.");
    const at = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
    check(at, entry.packed);
    const data = bytes.slice(at, at + entry.packed);
    let result: Uint8Array;
    if (entry.method === 0) result = data;
    else {
      let stream: DecompressionStream;
      try { stream = new DecompressionStream("deflate-raw"); } catch { throw new Error("Mettez votre navigateur à jour pour lire les fichiers Excel hors ligne."); }
      const reader = new Blob([data]).stream().pipeThrough(stream).getReader();
      const chunks: Uint8Array[] = []; let total = 0;
      try { for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > entry.unpacked || total > MAX_XML) throw new Error("Décompression Excel trop volumineuse."); chunks.push(value); } }
      finally { await reader.cancel(); }
      result = new Uint8Array(total); let pos = 0; for (const chunk of chunks) { result.set(chunk, pos); pos += chunk.length; }
    }
    if (result.length !== entry.unpacked) throw new Error("Partie Excel endommagée.");
    return new TextDecoder("utf-8", { fatal: true }).decode(result);
  };
}
export async function readXlsx(buffer: ArrayBuffer): Promise<{ records: string[][]; sheetName: string; lineNumbers: number[] }> {
  const read = await openZip(buffer);
  const workbook = xml(await read("xl/workbook.xml"));
  const sheets = elements(workbook, "sheet");
  // A populated second sheet is never silently ignored: require an explicit Titres sheet.
  const sheet = sheets.find(s => s.getAttribute("name")?.toLowerCase() === "titres") || (sheets.length === 1 ? sheets[0] : undefined);
  if (!sheet) throw new Error("Avec plusieurs feuilles, nommez la feuille à importer « Titres ». Seule cette feuille sera importée.");
  if (sheet.getAttribute("state") && sheet.getAttribute("state") !== "visible") throw new Error("La feuille Titres doit être visible.");
  const id = sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || sheet.getAttribute("r:id");
  const rel = elements(xml(await read("xl/_rels/workbook.xml.rels")), "Relationship").find(r => r.getAttribute("Id") === id);
  const target = rel?.getAttribute("Target") || "";
  if (!rel || rel.getAttribute("TargetMode") === "External" || !/^(?:\/xl\/|(?:\.\/)?(?:worksheets\/))[^?#]+\.xml$/.test(target) || target.includes("..")) throw new Error("Feuille Excel non prise en charge.");
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  const sharedXml = await read("xl/sharedStrings.xml", true);
  const shared = sharedXml ? elements(xml(sharedXml), "si").map(si => text(si, "t")) : [];
  const stylesXml = await read("xl/styles.xml", true);
  const styles = stylesXml ? xml(stylesXml) : null;
  const formats = styles ? elements(styles, "numFmt") : [];
  const styleParent = styles ? elements(styles, "cellXfs")[0] : null;
  const cellStyles = styleParent ? elements(styleParent, "xf") : [];
  const doc = xml(await read(path));
  if (elements(doc, "mergeCell").length) throw new Error("Retirez les cellules fusionnées de la feuille Titres.");
  const records: string[][] = [], lineNumbers: number[] = [];
  for (const row of elements(doc, "row")) {
    const cells = elements(row, "c"), result: string[] = [];
    const line = Number(row.getAttribute("r"));
    if (!Number.isInteger(line) || line < 1 || line > 10000) throw new Error("La feuille doit contenir au maximum 5 000 titres, sans zone de données éloignée.");
    if (row.getAttribute("hidden") === "1") throw new Error(`Ligne ${line} masquée : affichez toutes les lignes avant l’import.`);
    const used = new Set<number>();
    for (const cell of cells) {
      const address = /^([A-Z]+)(\d+)$/.exec(cell.getAttribute("r") || "");
      if (!address || Number(address[2]) !== line) throw new Error("Adresse de cellule Excel invalide.");
      const col = Array.from(address[1]).reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
      if (col > 31 || used.has(col)) throw new Error("Utilisez un tableau simple de 32 colonnes maximum, sans cellules dupliquées.");
      used.add(col);
      if (elements(cell, "f").length) throw new Error(`Cellule ${address[0]} : remplacez la formule par une valeur (Collage spécial → Valeurs).`);
      const type = cell.getAttribute("t"), value = text(cell, "v");
      if (type === "e" || type === "b" || type === "d") throw new Error(`Cellule ${address[0]} : utilisez du texte ou un nombre entier, sans erreur Excel.`);
      let content = type === "inlineStr" ? text(cell, "t") : value;
      if (type === "s") { const index = Number(value); if (!/^\d+$/.test(value) || shared[index] === undefined) throw new Error("Texte Excel endommagé."); content = shared[index]; }
      if ((!type || type === "n") && value && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || value.replace(/^0+/, "").length > 15)) throw new Error(`Cellule ${address[0]} : saisissez les identifiants au format Texte pour conserver exactement leurs chiffres.`);
      if ((!type || type === "n") && value && cell.hasAttribute("s")) {
        const style = cellStyles[Number(cell.getAttribute("s"))];
        if (!style) throw new Error(`Cellule ${address[0]} : format Excel invalide.`);
        const formatId = Number(style.getAttribute("numFmtId") || 0);
        const format = formats.find(f => Number(f.getAttribute("numFmtId")) === formatId)?.getAttribute("formatCode") || "";
        // Honor simple zero-padding; reject dates, decimals and scientific display.
        if (/^0{1,20}$/.test(format)) content = content.padStart(format.length, "0");
        else if (![0, 1, 49].includes(formatId)) throw new Error(`Cellule ${address[0]} : utilisez le format Texte ou un nombre entier, sans date ni format spécial.`);
      }
      result[col] = content;
    }
    if (!result.some(v => v?.trim())) continue;
    if (records.length === 0 && line !== 1) throw new Error("Placez les en-têtes en ligne 1, sans titre au-dessus du tableau.");
    records.push(Array.from({ length: result.length }, (_, i) => result[i] || "")); lineNumbers.push(line);
    if (records.length > 5001) throw new Error("Le fichier dépasse 5 000 titres.");
  }
  if (!records.length) throw new Error("La feuille Excel est vide.");
  // Excel omits trailing empty cells; retain the width defined by the header.
  const width = records[0].length;
  for (let i = 1; i < records.length; i++) while (records[i].length < width) records[i].push("");
  return { records, sheetName: sheet.getAttribute("name") || "Titres", lineNumbers };
}

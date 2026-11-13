import { fileFormat, type AttachmentInput } from "../file-types";
import type { Title, Workspace } from "../models";
import { statuses } from "../models";
import { acknowledge, dependentIds, project, type LocalState, type Operation, type Receipt } from "./model";
import type { Persistence } from "./database";
export class SyncError extends Error { constructor(message: string, public status = 0) { super(message); } }
export interface Transport { read(): Promise<Workspace>; send(op: Operation): Promise<Workspace & { receipt: Receipt }> }
export const transport: Transport = {
  async read() { const r = await fetch("/api/workspace", { cache: "no-store", signal: AbortSignal.timeout(15000) }); const data = await r.json(); if (!r.ok) throw new SyncError(data.error || "Serveur inaccessible.", r.status); return data; },
  async send(op) {
    let fileReceipt: Receipt | undefined;
    for (const attachment of op.attachments || []) {
      const form = new FormData(); form.set("id", attachment.id); form.set("kind", attachment.kind); form.set("file", attachment.blob, attachment.name);
      if (attachment.titleId) form.set("titleId", attachment.titleId);
      if (op.action === "import") form.set("operationId", op.id);
      const response = await fetch("/api/files", { method: "POST", body: form, signal: AbortSignal.timeout(60000) });
      const result = await response.json();
      if (!response.ok) throw new SyncError(result.error || "Le transfert du fichier est en attente.", response.status);
      if (result.file?.id !== attachment.id || result.receipt?.id !== attachment.id) throw new Error("Le fichier n’a pas été confirmé par le serveur.");
      fileReceipt = result.receipt;
    }
    if (op.action === "file") {
      if (fileReceipt?.id !== op.id) throw new Error("Le serveur n’a pas confirmé le fichier.");
      return { ...await transport.read(), receipt: fileReceipt };
    }
    const r = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...op.input, action: op.action, operationId: op.id }), signal: AbortSignal.timeout(20000) }); const data = await r.json(); if (!r.ok) throw new SyncError(data.error || "Synchronisation impossible.", r.status); return data;
  },
};
function required(v: unknown, name: string, limit = 200) { if (typeof v !== "string" || !v.trim() || v.length > limit) throw new Error(`${name} invalide.`); return v.trim(); }
export class OfflineEngine {
  constructor(private store: Persistence, private network: Transport) {}
  read() { return this.store.read(); }
  async enqueue(action: string, raw: Record<string, unknown>, files: AttachmentInput[] = []) {
    return this.store.change(state => {
      if (files.length > 1) throw new Error("Ajoutez un fichier à la fois.");
      for (const file of files) { if (!(file.blob instanceof Blob)) throw new Error("Fichier local invalide."); fileFormat(file.name, file.blob.size, file.kind); }
      const view = project(state); const input = structuredClone(raw); const id = crypto.randomUUID(); const now = new Date().toISOString(); let entityId: string | undefined; const staged: Operation[] = [];
      if (action === "title") {
        input.box = required(input.box, "Numéro du box", 30).replace(/^0+(?=\d)/, "");
        if (!/^\d+$/.test(String(input.box)) || /^0+$/.test(String(input.box))) throw new Error("Le numéro du box doit être un entier positif.");
        if (input.createBox === true && !view.boxes.some(b => b.number === input.box)) {
          const boxId = crypto.randomUUID();
          staged.push({ id: crypto.randomUUID(), action: "box", input: { number: input.box, clientId: boxId, reuseExisting: true }, createdAt: now, state: "pending" });
          view.boxes.push({ id: boxId, number: String(input.box), createdAt: now });
        }
        delete input.createBox;
      }
      const checkTitle = (p: Record<string, unknown>, seen: Title[] | Set<string>, allowCreateBox = false) => {
        p.number = required(p.number, "Numéro", 50).replace(/[\s-]/g, ""); p.category = String(p.category).toUpperCase();
        p.cadastre = required(p.cadastre || view.settings.cadastre || "Mfoundi A", "Cadastre");
        if (!/^\d+$/.test(String(p.number)) || !["A", "B", "C"].includes(String(p.category))) throw new Error("Vérifiez le numéro et la conservation du titre.");
        p.box = required(p.box, "Numéro du box", 30).replace(/^0+(?=\d)/, "");
        if (!/^\d+$/.test(String(p.box)) || /^0+$/.test(String(p.box))) throw new Error("Le numéro du box doit être un entier positif.");
        if (!allowCreateBox && !view.boxes.some(b => b.number === p.box)) throw new Error("Créez d’abord le box de rangement.");
        const duplicateKey = `${p.number}:${p.category}:${p.cadastre}`;
        if (seen instanceof Set ? seen.has(duplicateKey) : seen.some(t => t.number === p.number && t.category === p.category && (t.cadastre || view.settings.cadastre || "Mfoundi A") === p.cadastre && t.id !== p.id)) throw new Error("Ce numéro et cette conservation existent déjà.");
        if (p.id) { const old = view.titles.find(t => t.id === p.id); if (!old) throw new Error("Titre introuvable sur cet appareil."); if (old.box !== p.box) throw new Error("Utilisez Déplacer pour changer le box."); }
        else p.clientId = crypto.randomUUID();
        p.status ||= "Disponible"; if (!statuses.includes(p.status as typeof statuses[number])) throw new Error("Statut invalide.");
        p.notes = typeof p.notes === "string" ? p.notes.slice(0, 10000) : "";
      };
      if (action === "title") { checkTitle(input, view.titles); entityId = String(input.id || input.clientId); }
      else if (action === "box") { input.number = required(input.number, "Numéro du box", 30).replace(/^0+(?=\d)/, ""); if (!/^\d+$/.test(String(input.number)) || /^0+$/.test(String(input.number))) throw new Error("Numéro du box invalide."); if (view.boxes.some(b => b.number === input.number)) throw new Error("Ce box existe déjà."); input.clientId = crypto.randomUUID(); }
      else if (action === "move") { entityId = String(input.id); const old = view.titles.find(t => t.id === entityId); if (!old || old.box === input.box || !view.boxes.some(b => b.number === input.box)) throw new Error("Choisissez un autre box existant."); input.reason = required(input.reason, "Motif", 2000); }
      else if (action === "settings") { for (const key of ["name", "cadastre", "location"]) input[key] = required(input[key], "Informations du service"); }
      else if (action === "import") { if (!Array.isArray(input.rows) || !input.rows.length || input.rows.length > 5000) throw new Error("Import limité à 5 000 lignes."); const seen = new Set(view.titles.map(t => `${t.number}:${t.category}:${t.cadastre || view.settings.cadastre || "Mfoundi A"}`)); const knownBoxes = new Set(view.boxes.map(b => b.number)); for (const row of input.rows as Record<string, unknown>[]) { delete row.id; checkTitle(row, seen, true); if (!knownBoxes.has(String(row.box))) { knownBoxes.add(String(row.box)); view.boxes.push({ id: `import-box-${row.box}`, number: String(row.box), createdAt: now }); } seen.add(`${row.number}:${row.category}:${row.cadastre}`); } }
      else if (action === "file") {
        if (files.length !== 1) throw new Error("Sélectionnez un fichier.");
        if (files[0].titleId && !view.titles.some(t => t.id === files[0].titleId)) throw new Error("Titre associé introuvable sur cet appareil.");
        input.filename = files[0].name;
      }
      else throw new Error("Cette opération n’est pas disponible hors connexion.");
      const previous = entityId ? [...state.operations].reverse().find(op => op.entityId === entityId || (op.action === "import" && (op.input.rows as Record<string, unknown>[]).some(r => r.clientId === entityId))) : undefined;
      const attachments = files.map(file => ({ ...file, id: action === "file" ? id : crypto.randomUUID() }));
      if (action === "import" && attachments.length) { if (attachments[0].kind !== "import") throw new Error("Le fichier source doit être classé comme import."); input.sourceFileId = attachments[0].id; }
      const parent = action === "file" && attachments[0]?.titleId ? [...state.operations].reverse().find(op => op.entityId === attachments[0].titleId || (op.action === "import" && (op.input.rows as Record<string, unknown>[]).some(row => row.clientId === attachments[0].titleId))) : undefined;
      const op: Operation = { id, action, input, createdAt: now, entityId, dependsOn: previous?.id || parent?.id || staged[0]?.id, state: "pending", ...(attachments.length ? { attachments } : {}) };
      return { ...state, operations: [...state.operations, ...staged, op] };
    });
  }
  async sync(onChange: (state: LocalState) => void = () => {}) {
    const remote = await this.network.read();
    let state = await this.store.change(local => {
      if (local.base.backendId && remote.backendId && local.base.backendId !== remote.backendId && local.operations.length) throw new Error("La source des données a changé. Exportez puis traitez les saisies en attente avant de changer de serveur.");
      return { ...local, base: remote, lastSync: new Date().toISOString() };
    }); onChange(state);
    while (state.operations.length) {
      const op = state.operations[0]; if (op.state === "conflict") return state;
      try {
        const result = await this.network.send(op);
        if (result.receipt?.id !== op.id) throw new Error("Le serveur n’a pas confirmé cette opération. Elle reste en attente.");
        state = await this.store.change(current => acknowledge(current, result, result.receipt)); onChange(state);
      } catch (error) {
        if (error instanceof SyncError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) {
          let latest = state.base;
          try { latest = await this.network.read(); } catch { /* La version locale reste disponible. */ }
          state = await this.store.change(current => ({ ...current, base: latest.backendId === current.base.backendId ? latest : current.base, operations: current.operations.map(x => x.id === op.id ? { ...x, state: "conflict", error: error.message } : x) })); onChange(state); return state;
        }
        throw error;
      }
    }
    return state;
  }
  async resolve(id: string, choice: "server" | "local") {
    return this.store.change(state => {
      const op = state.operations.find(x => x.id === id); if (!op) return state;
      if (choice === "server") { const ids = dependentIds(state.operations, id); return { ...state, operations: state.operations.filter(x => !ids.has(x.id)) }; }
      const current = state.base.titles.find(t => t.id === op.input.id);
      if (!["title", "move"].includes(op.action) || !current) throw new Error("Cette saisie ne peut pas remplacer un titre existant. Exportez-la avant d’écarter l’opération puis corrigez le numéro ou le box.");
      const nextId = crypto.randomUUID();
      return { ...state, operations: state.operations.map(x => x.id === id ? { ...x, id: nextId, state: "pending", error: undefined, dependsOn: undefined, input: { ...x.input, updatedAt: current.updatedAt } } : x.dependsOn === id ? { ...x, dependsOn: nextId } : x) };
    });
  }
}

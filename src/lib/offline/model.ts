import type { FileRecord, PendingAttachment } from "../file-types";
import type { Activity, Title, Workspace } from "../models";
export type Operation = { id: string; action: string; input: Record<string, unknown>; createdAt: string; dependsOn?: string; entityId?: string; state: "pending" | "conflict"; error?: string; attachments?: PendingAttachment[] };
export type LocalState = { base: Workspace; operations: Operation[]; lastSync: string | null; cloudFiles?: FileRecord[] };
export type Receipt = { id: string; result: unknown };
export const emptyWorkspace = (): Workspace => ({ user: null, directAccess: true, users: [], titles: [], boxes: [], activities: [], settings: { name: "", cadastre: "", location: "" } });
export const emptyState = (): LocalState => ({ base: emptyWorkspace(), operations: [], lastSync: null });
export function project(state: LocalState): Workspace {
  const workspace = structuredClone(state.base);
  const titlesById = new Map(workspace.titles.map(title => [title.id, title]));
  const boxNumbers = new Set(workspace.boxes.map(box => box.number));
  for (const op of state.operations) {
    const p = op.input;
    if (op.action === "box" && !boxNumbers.has(String(p.number))) { workspace.boxes.push({ id: String(p.clientId), number: String(p.number), createdAt: op.createdAt }); boxNumbers.add(String(p.number)); }
    if (op.action === "settings") workspace.settings = { name: String(p.name), cadastre: String(p.cadastre), location: String(p.location) };
    const applyTitle = (row: Record<string, unknown>) => {
      const id = String(row.id || row.clientId); const old = titlesById.get(id);
      const title: Title = { id, number: String(row.number), category: String(row.category), cadastre: String(row.cadastre || old?.cadastre || workspace.settings.cadastre || "Mfoundi A"), box: String(row.box), status: String(row.status || old?.status || "Disponible"), notes: String(row.notes || ""), date: old?.date || op.createdAt, updatedAt: op.createdAt, createdBy: old?.createdBy || "Accès sans authentification" };
      titlesById.set(id, title);
    };
    if (op.action === "title") applyTitle(p);
    if (op.action === "import") for (const row of p.rows as Record<string, unknown>[]) { const box = String(row.box); if (!boxNumbers.has(box)) { workspace.boxes.push({ id: `import-box-${box}`, number: box, createdAt: op.createdAt }); boxNumbers.add(box); } applyTitle(row); }
    if (op.action === "move") { const old = titlesById.get(String(p.id)); if (old) titlesById.set(old.id, { ...old, box: String(p.box), updatedAt: op.createdAt }); }
    const event: Activity = { id: `local-${op.id}`, date: op.createdAt, actor: "Cet appareil", actorId: "local", action: op.state === "conflict" ? "Synchronisation à vérifier" : "En attente de synchronisation", item: op.action === "box" ? `Box ${p.number}` : op.action === "import" ? `${(p.rows as unknown[]).length} titres` : op.action === "file" ? String(op.attachments?.[0]?.name || "Fichier") : String(p.number || p.id || p.name || ""), before: null, after: null };
    workspace.activities.unshift(event);
  }
  workspace.titles = [...titlesById.values()].sort((a,b) => b.date.localeCompare(a.date));
  return workspace;
}
export function acknowledge(state: LocalState, workspace: Workspace, receipt: Receipt): LocalState {
  const operations = state.operations.filter(op => op.id !== receipt.id).map(op => {
    if (op.dependsOn !== receipt.id) return op;
    const result = (Array.isArray(receipt.result) ? receipt.result.find((t: { id: string }) => t.id === op.entityId) : receipt.result) as { updatedAt?: string } | null;
    return { ...op, dependsOn: undefined, input: { ...op.input, ...(result?.updatedAt ? { updatedAt: result.updatedAt } : {}) } };
  });
  return { base: workspace, operations, lastSync: new Date().toISOString() };
}
export function dependentIds(operations: Operation[], root: string): Set<string> {
 const ids = new Set([root]); let changed = true;
 while (changed) { changed = false; const removedBoxes = operations.filter(op => ids.has(op.id) && op.action === "box").map(op => op.input.number);
  for (const op of operations) {
   const usesBox = removedBoxes.includes(op.input.box) || (op.action === "import" && (op.input.rows as Record<string, unknown>[]).some(row => removedBoxes.includes(row.box)));
   if (!ids.has(op.id) && ((op.dependsOn && ids.has(op.dependsOn)) || usesBox)) { ids.add(op.id); changed = true; }
  }
 }
 return ids;
}

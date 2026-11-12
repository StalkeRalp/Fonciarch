import { emptyState, type LocalState } from "./model";
export interface Persistence { read(): Promise<LocalState>; change(fn: (state: LocalState) => LocalState): Promise<LocalState> }
let database: Promise<IDBDatabase> | undefined;
function open() {
  if (!database) database = new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) { reject(new Error("Le stockage local est indisponible dans ce navigateur.")); return; }
    const request = indexedDB.open("fonciarch-offline-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspace");
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = undefined; }; resolve(request.result); };
    request.onerror = () => { database = undefined; reject(new Error("Impossible d’ouvrir le stockage local. Vérifiez l’espace disponible et les réglages du navigateur.")); };
    request.onblocked = () => reject(new Error("Fermez les anciens onglets FONCIARCH et réessayez."));
  });
  return database;
}
export const persistence: Persistence = {
  async read() { const db = await open(); return new Promise((resolve, reject) => { const tx = db.transaction("workspace", "readonly"); const r = tx.objectStore("workspace").get("state"); r.onsuccess = () => resolve(r.result || emptyState()); r.onerror = () => reject(new Error("Lecture du stockage local impossible.")); }); },
  async change(fn) { const db = await open(); return new Promise((resolve, reject) => {
    const tx = db.transaction("workspace", "readwrite"); const store = tx.objectStore("workspace"); const r = store.get("state"); let next: LocalState;
    r.onsuccess = () => { try { next = fn(r.result || emptyState()); store.put(next, "state"); } catch (error) { tx.abort(); reject(error); } };
    tx.oncomplete = () => resolve(next);
    tx.onerror = () => reject(new Error("L’enregistrement local a échoué. Libérez de l’espace avant de recommencer."));
    tx.onabort = () => reject(new Error("Enregistrement local annulé. Votre saisie n’a pas été confirmée."));
  }); },
};

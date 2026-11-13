"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, CloudOff, Download, RefreshCw, RotateCcw } from "lucide-react";
import type { AttachmentInput, FileRecord } from "../lib/file-types";
import { persistence } from "../lib/offline/database";
import { OfflineEngine, transport } from "../lib/offline/engine";
import { dependentIds, emptyState, project, type LocalState } from "../lib/offline/model";
const engine = new OfflineEngine(persistence, transport);
const AUTO_SYNC_INTERVAL = 5 * 60 * 1000;
const SYNC_ATTEMPT_KEY = "fonciarch-last-sync-attempt";
export function useOfflineWorkspace() {
  const [state, setState] = useState<LocalState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);
  const [storageError, setStorageError] = useState("");
  const [persistent, setPersistent] = useState(false);
  const [storageMessage, setStorageMessage] = useState("");
  const [networkError, setNetworkError] = useState("");
  const workspace = useMemo(() => project(state), [state]);
  const running = useRef(false);
  const lastAttempt = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const mounted = useRef(true);
  const publish = useCallback((next: LocalState) => { if (mounted.current) setState(next); channel.current?.postMessage("changed"); }, []);
  const requestSync = useCallback(async (automatic: boolean) => {
    if (running.current || !navigator.onLine) { if (mounted.current) setOnline(navigator.onLine); return; }
    running.current = true;
    const run = async () => {
      let previous = lastAttempt.current;
      try { previous = Math.max(previous, Number(localStorage.getItem(SYNC_ATTEMPT_KEY)) || 0); } catch { /* Le délai fonctionne aussi sans localStorage. */ }
      const now = Date.now();
      if (automatic && previous > 0 && now >= previous && now - previous < AUTO_SYNC_INTERVAL) return;
      lastAttempt.current = now;
      try { localStorage.setItem(SYNC_ATTEMPT_KEY, String(now)); } catch { /* Copie en mémoire disponible. */ }
      if (mounted.current) setSyncing(true);
      try { await engine.sync(publish); if (mounted.current) { setNetworkError(""); setOnline(true); } }
      catch (error) { if (mounted.current) { setNetworkError(error instanceof Error ? error.message : "Serveur temporairement inaccessible."); setOnline(navigator.onLine); } }
      finally { if (mounted.current) setSyncing(false); }
    };
    try { if (navigator.locks) await navigator.locks.request("fonciarch-sync", { ifAvailable: automatic }, async lock => { if (lock) await run(); }); else await run(); }
    finally { running.current = false; }
  }, [publish]);
  const synchronize = useCallback(() => requestSync(false), [requestSync]);
  useEffect(() => {
    mounted.current = true;
    navigator.storage?.persisted?.().then(granted => { if (mounted.current) setPersistent(granted); }).catch(() => {});
    if ("BroadcastChannel" in window) { channel.current = new BroadcastChannel("fonciarch-data"); channel.current.onmessage = () => { engine.read().then(next => { if (mounted.current) setState(next); }).catch(() => {}); }; }
    engine.read().then(next => { if (mounted.current) { setState(next); setLoading(false); setOnline(navigator.onLine); } void requestSync(true); }).catch(error => { if (mounted.current) { setStorageError(error.message); setLoading(false); } });
    const reconnect = () => { setOnline(true); void requestSync(true); };
    const disconnect = () => setOnline(false);
    const focus = () => { if (document.visibilityState === "visible") void requestSync(true); };
    window.addEventListener("online", reconnect); window.addEventListener("offline", disconnect); document.addEventListener("visibilitychange", focus);
    const interval = setInterval(() => { if (document.visibilityState === "visible") void requestSync(true); }, 30000);
    return () => { mounted.current = false; clearInterval(interval); window.removeEventListener("online", reconnect); window.removeEventListener("offline", disconnect); document.removeEventListener("visibilitychange", focus); channel.current?.close(); channel.current = null; };
  }, [requestSync]);
  const enqueue = async (action: string, input: Record<string, unknown>, files: AttachmentInput[] = []) => {
    setSaving(true);
    try { const next = await engine.enqueue(action, input, files); publish(next); }
    finally { setSaving(false); }
  };
  const resolve = async (id: string, choice: "server" | "local") => { publish(await engine.resolve(id, choice)); };
  const requestPersistence = async () => { try { const granted = await navigator.storage?.persist?.(); setPersistent(!!granted); setStorageMessage(granted ? "Le navigateur a accordé le stockage persistant." : "Le navigateur conserve sa politique de stockage habituelle. Gardez une copie exportée des saisies importantes."); } catch { setStorageMessage("Le stockage persistant n’est pas disponible dans ce navigateur."); } };
  const saveFileList = useCallback(async (files: FileRecord[]) => {
    const next = await persistence.change(current => ({ ...current, cloudFiles: [...new Map([...(current.cloudFiles || []), ...files].map(file => [file.id, file])).values()].sort((a,b) => b.createdAt.localeCompare(a.createdAt)) }));
    publish(next);
  }, [publish]);
  const exportPending = async () => {
    const exported = { ...state, operations: await Promise.all(state.operations.map(async op => ({ ...op, attachments: op.attachments ? await Promise.all(op.attachments.map(async attachment => { const bytes = new Uint8Array(await attachment.blob.arrayBuffer()); let binary = ""; for (let index=0; index<bytes.length; index+=32768) binary += String.fromCharCode(...bytes.subarray(index,index+32768)); return { ...attachment, blob: undefined, encoding: "base64", content: btoa(binary) }; })) : undefined }))) };
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...exported }, null, 2)], { type: "application/json" })); link.download = `fonciarch-saisies-${new Date().toISOString().slice(0,10)}.json`; link.click(); URL.revokeObjectURL(link.href);
  };
  return { state, workspace, loading, saving, syncing, online, storageError, networkError, persistent, storageMessage, requestPersistence, saveFileList, synchronize, enqueue, resolve, exportPending };
}
export type OfflineWorkspace = ReturnType<typeof useOfflineWorkspace>;
export function SyncStatus({ offline, onOpen }: { offline: OfflineWorkspace; onOpen(): void }) {
  const conflicts = offline.state.operations.filter(op => op.state === "conflict").length;
  return <button className={`sync-status ${conflicts ? "sync-conflict" : ""}`} onClick={onOpen} title="Consulter la synchronisation" aria-label="Consulter la synchronisation">{offline.syncing ? <RefreshCw size={15} className="sync-spin" /> : !offline.online ? <CloudOff size={16} /> : offline.networkError ? <RefreshCw size={16} /> : <CheckCheck size={16} />}<span>{conflicts ? `${conflicts} à vérifier` : offline.syncing ? "Synchronisation" : offline.networkError ? "Synchronisation bloquée" : offline.state.operations.length ? `${offline.state.operations.length} en attente` : !offline.online ? "Hors ligne" : "À jour"}</span></button>;
}
export function SyncPanel({ offline }: { offline: OfflineWorkspace }) {
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  async function choose(id: string, choice: "server" | "local") { setWorking(true); setError(""); try { await offline.resolve(id, choice); setConfirmation(""); } catch (e) { setError(e instanceof Error ? e.message : "Résolution impossible."); } finally { setWorking(false); } }
  return <section className="panel sync-panel"><div className="panel-heading"><div><h2><RefreshCw size={18} /> Données et synchronisation</h2><p>{offline.state.operations.length} opération(s) conservée(s) sur cet appareil en attente d’envoi.</p></div><button className="button" onClick={offline.synchronize} disabled={offline.syncing || working}><RotateCcw size={15} /> Synchroniser maintenant</button></div><div className="setting-content"><div className="sync-summary"><span>{offline.networkError ? "Échec de synchronisation — saisies conservées" : offline.online ? "Réseau disponible" : "Travail hors connexion"}</span><span>{offline.state.lastSync ? `Dernier échange : ${new Date(offline.state.lastSync).toLocaleString("fr-FR")}` : "Aucun échange avec le serveur"}</span></div><p>Les titres, boxes et déplacements sont d’abord enregistrés sur cet appareil. La synchronisation automatique est espacée d’au moins 5 minutes lorsque l’application est ouverte et visible. Vos nouvelles saisies restent en attente jusqu’au prochain passage. « Synchroniser maintenant » lance l’envoi immédiatement, sans attendre ce délai.</p>{offline.networkError && <p className="sync-explanation">{offline.networkError}</p>}{offline.storageError && <p className="form-error">{offline.storageError}</p>}<div className="sync-actions">{!offline.persistent && <button className="button" onClick={offline.requestPersistence}>Demander un stockage persistant</button>}<button className="button" onClick={offline.exportPending}><Download size={16} /> Exporter ma copie locale</button></div>{offline.persistent && <p className="sync-explanation">Stockage persistant accordé sur cet appareil.</p>}{offline.storageMessage && <p className="sync-explanation">{offline.storageMessage}</p>}{offline.state.operations.map(op => <div className="pending-operation" key={op.id}><div><strong>{op.action === "box" ? `Création du box ${op.input.number}` : op.action === "title" ? `Titre ${op.input.number} ${op.input.category}` : op.action === "move" ? "Déplacement d’un titre" : op.action === "import" ? "Import de titres" : op.action === "file" ? `Fichier ${op.attachments?.[0]?.name || ""}` : "Informations du service"}</strong><span>{new Date(op.createdAt).toLocaleString("fr-FR")}</span><span className={op.state === "conflict" ? "conflict-label" : "muted"}>{op.state === "conflict" ? "À vérifier" : "En attente"}</span></div>{op.error && <p>{op.error}</p>}{op.state === "conflict" && <><details><summary>Examiner et résoudre</summary><p>Votre saisie est conservée sur cet appareil. Exportez votre copie avant d’écarter une opération.</p>{(() => { const server = offline.state.base.titles.find(t => t.id === op.input.id); return server && <div className="conflict-comparison"><div><strong>Sur le serveur</strong><p>Titre {server.number} {server.category} · Box {server.box}</p><p>{server.status} · {server.notes || "Aucune observation"}</p></div><div><strong>Votre saisie</strong><p>{op.input.number ? `Titre ${op.input.number} ${op.input.category}` : "Déplacement"} · Box {String(op.input.box)}</p><p>{String(op.input.notes || op.input.reason || "")}</p></div></div>; })()}<div className="sync-actions">{["title", "move"].includes(op.action) && offline.state.base.titles.some(t => t.id === op.input.id) && <button className="button" onClick={() => setConfirmation(`local:${op.id}`)}>Choisir ma version</button>}<button className="button" onClick={() => setConfirmation(`server:${op.id}`)}>Écarter la saisie locale</button></div>{confirmation.endsWith(op.id) && <div className="inline-confirmation"><p>{confirmation.startsWith("local:") ? "Votre version sera envoyée en utilisant la version actuelle du serveur comme point de départ. Une nouvelle modification concurrente sera contrôlée." : `Cette action écarte ${dependentIds(offline.state.operations, op.id).size} opération(s) locale(s), y compris les opérations dépendantes. Les données déjà reçues par le serveur restent intactes.`}</p><button className="button primary" disabled={working} onClick={() => choose(op.id, confirmation.startsWith("local:") ? "local" : "server")}>Confirmer ce choix</button><button className="text-button" onClick={() => setConfirmation("")}>Annuler</button></div>}</details></>}</div>)}{error && <p className="form-error">{error}</p>}<p className="sync-explanation">La fermeture de l’application suspend l’envoi, mais conserve les saisies. Ne supprimez pas les données du navigateur tant qu’il reste des opérations en attente.</p></div></section>;
}

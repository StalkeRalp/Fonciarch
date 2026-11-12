"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Download, MonitorSmartphone, RefreshCw, WifiOff } from "lucide-react";

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type WorkerState = "checking" | "development" | "unsupported" | "ready" | "error";
type PwaContext = { installed: boolean; canInstall: boolean; installing: boolean; workerState: WorkerState; updateReady: boolean; updating: boolean; applyUpdate(): void; install(): Promise<void> };
const PwaContext = createContext<PwaContext | null>(null);

export function PwaProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installing, setInstalling] = useState(false);
  const [workerState, setWorkerState] = useState<WorkerState>("checking");
  const [updateReady, setUpdateReady] = useState(false);
  const [updating, setUpdating] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const requestedUpdate = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const standalone = window.matchMedia("(display-mode: standalone)");
    const updateInstalled = () => setInstalled(standalone.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    const initial = requestAnimationFrame(() => { updateInstalled(); if (!window.isSecureContext || !("serviceWorker" in navigator)) setWorkerState("unsupported"); else if (process.env.NODE_ENV !== "production") setWorkerState("development"); });
    const available = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const completed = () => { setInstalled(true); setPrompt(null); };
    const controllerChanged = () => { if (requestedUpdate.current) window.location.reload(); };
    window.addEventListener("beforeinstallprompt", available); window.addEventListener("appinstalled", completed);
    standalone.addEventListener("change", updateInstalled);
    navigator.serviceWorker?.addEventListener("controllerchange", controllerChanged);
    if (window.isSecureContext && "serviceWorker" in navigator && process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistration("/").then(existing => {
        if (existing && [existing.active, existing.waiting, existing.installing].some(worker => worker && new URL(worker.scriptURL).pathname === "/sw.js")) existing.unregister();
      }).catch(() => {});
    } else if (window.isSecureContext && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(async current => {
        if (cancelled) return;
        registration.current = current;
        const waiting = () => { if (cancelled) return; if (current.waiting && navigator.serviceWorker.controller) { setUpdateReady(true); } };
        waiting();
        current.addEventListener("updatefound", () => {
          const worker = current.installing;
          worker?.addEventListener("statechange", () => { if (worker.state === "installed") waiting(); if (worker.state === "redundant" && !current.active && !cancelled) setWorkerState("error"); });
        });
        await navigator.serviceWorker.ready;
        if (!cancelled) setWorkerState("ready");
      }).catch(async () => { const existing = await navigator.serviceWorker.getRegistration("/").catch(() => undefined); if (!cancelled) setWorkerState(existing?.active ? "ready" : "error"); });
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(initial);
      window.removeEventListener("beforeinstallprompt", available); window.removeEventListener("appinstalled", completed);
      standalone.removeEventListener("change", updateInstalled);
      navigator.serviceWorker?.removeEventListener("controllerchange", controllerChanged);
    };
  }, []);

  async function install() {
    if (!prompt || installing) return;
    setInstalling(true);
    try { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }
    catch { setPrompt(null); }
    finally { setInstalling(false); }
  }
  function applyUpdate() {
    if (!registration.current?.waiting) return;
    requestedUpdate.current = true; setUpdating(true);
    registration.current.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  }
  return <PwaContext.Provider value={{ installed, canInstall: !!prompt && !installed, installing, workerState, updateReady, updating, applyUpdate, install }}>{children}</PwaContext.Provider>;

}

export function PwaInstallButton() {
  const pwa = useContext(PwaContext);
  if (!pwa?.canInstall) return null;
  return <button className="icon-button" title="Installer FONCIARCH" aria-label="Installer FONCIARCH" disabled={pwa.installing} onClick={pwa.install}><Download size={18} /></button>;
}

export function PwaSettings() {
  const pwa = useContext(PwaContext);
  if (!pwa) return null;
  return <section className="panel settings-panel pwa-settings"><div className="panel-heading"><div><h2><MonitorSmartphone size={19} /> Application FONCIARCH</h2><p>Un accès direct depuis votre ordinateur, tablette ou téléphone.</p></div>{pwa.installed && <span className="badge green"><CheckCircle2 size={14} /> Installée</span>}</div><div className="setting-content">{pwa.updateReady && <div className="update-inline"><p>Une nouvelle version est prête. Terminez votre saisie avant de recharger.</p><button className="button" disabled={pwa.updating} onClick={pwa.applyUpdate}><RefreshCw size={16} />{pwa.updating ? "Mise à jour…" : "Mettre à jour l’application"}</button></div>}<p>Retrouvez le logo FONCIARCH sur votre écran d’accueil et ouvrez l’application dans sa propre fenêtre.</p>{pwa.canInstall && <button className="button primary" disabled={pwa.installing} onClick={pwa.install}><Download size={17} />{pwa.installing ? "Installation…" : "Installer FONCIARCH"}</button>}{!pwa.installed && !pwa.canInstall && <details className="pwa-install-help"><summary>Comment installer l’application ?</summary><p>Ouvrez le menu de votre navigateur et cherchez « Installer l’application » ou « Ajouter à l’écran d’accueil ». Sur iPhone ou iPad, utilisez le menu Partager, puis « Sur l’écran d’accueil ».</p><p>Les options proposées dépendent du navigateur et de l’appareil.</p></details>}<div className="info-strip"><WifiOff size={18} /><p>Après une première préparation en ligne, l’application et les données déjà chargées restent accessibles hors connexion. Vos nouvelles saisies sont conservées sur cet appareil et synchronisées à la reconnexion.</p></div>{pwa.workerState === "development" && <p className="pwa-state">Mode développement : le cache hors connexion sera activé avec la version de production.</p>}{pwa.workerState === "unsupported" && <p className="pwa-state">L’installation nécessite HTTPS ou localhost et un navigateur compatible.</p>}{pwa.workerState === "error" && <p className="form-error">Le mode hors connexion n’a pas pu être préparé. Vérifiez votre connexion puis rechargez la page.</p>}{pwa.workerState === "ready" && <p className="pwa-state"><CheckCircle2 size={15} /> Application disponible hors connexion.</p>}</div></section>;
}

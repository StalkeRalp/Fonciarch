"use client";

import Image from "next/image";
import { RefreshCw } from "lucide-react";

export function AppSplash({ message, retry }: { message?: string; retry?: () => void }) {
  return <main className="app-splash" role="status" aria-live="polite">
    <div className="splash-colorbar" aria-hidden="true"><i/><i/><i/></div>
    <div className="splash-content">
      <Image className="splash-project-mark" src="/icons/icon-192.png" width={72} height={72} alt="" priority unoptimized/>
      <h1>FONCIARCH</h1>
      <p className="splash-subtitle">Gestion des archives foncières</p>
      <div className="splash-divider"/>
      <div className="splash-progress" aria-label="Préparation de l’application"><i/></div>
      <p className="splash-message">{message || "Ouverture de votre espace…"}</p>
      {retry&&<button className="splash-retry" onClick={retry}><RefreshCw size={16}/>Réessayer</button>}
    </div>
    <footer className="splash-footer"><Image src="/LogoMindCaf.png" width={32} height={32} alt="" unoptimized/><span><strong>MINDCAF</strong><small>République du Cameroun</small></span></footer>
  </main>;
}

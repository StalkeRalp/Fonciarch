import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight, Archive, CloudOff, FileSpreadsheet, MapPin, Search, ShieldCheck } from "lucide-react";
import "./landing.css";

export const metadata: Metadata = {
  title: "FONCIARCH — Registre des archives foncières",
  description: "Classement et recherche des titres fonciers du Mfoundi.",
};

export default function LandingPage() {
  return <main className="landing-page">
    <div className="landing-frame">
      <header className="landing-header">
        <Link href="/" className="landing-brand" aria-label="FONCIARCH, accueil">
          <Image src="/Logo%20foncier%20camerounais.png" alt="FONCIARCH" width={1536} height={1024} priority />
          <span><strong>FONCIARCH</strong><small>REGISTRE FONCIER · MFOUNDI</small></span>
        </Link>
        <div className="landing-ministry"><Image src="/LogoMindCaf.png" alt="MINDCAF" width={256} height={251} /><span><small>RÉPUBLIQUE DU CAMEROUN</small><strong>MINDCAF</strong><small>Domaines · Cadastre · Affaires foncières</small></span></div>
        <Link className="landing-open" href="/application">Ouvrir le registre <ArrowUpRight size={17} /></Link>
      </header>

      <section className="landing-main">
        <div className="landing-copy">
          <div className="landing-kicker"><span>GESTION DES ARCHIVES FONCIÈRES</span><span className="landing-kicker-code">01 — MFOUNDI</span></div>
          <h1>Un titre.<br />Une conservation.<br /><em>Un emplacement.</em></h1>
          <p>FONCIARCH rassemble les titres fonciers et leur classement pour faciliter la consultation du registre.</p>
          <Link className="landing-primary" href="/application">Accéder à l’espace de travail <ArrowUpRight size={18} /></Link>
          <div className="landing-offline"><CloudOff size={16} /><span>Les saisies hors connexion sont conservées sur l’appareil et envoyées au retour du réseau.</span></div>
        </div>

        <div className="landing-index-wrap">
        <div className="landing-flag" role="img" aria-label="Drapeau du Cameroun">
          <svg viewBox="0 0 124 88" aria-hidden="true"><defs><clipPath id="cameroon-flag-shape"><path d="M13 10C45 5 78 16 116 9v63c-38 9-70-5-103 2Z" /></clipPath></defs><path d="M8 5v77" fill="none" stroke="#748278" strokeWidth="3"/><circle cx="8" cy="5" r="4" fill="#d3a83d"/><g clipPath="url(#cameroon-flag-shape)" className="landing-flag-cloth"><rect x="12" y="5" width="35" height="75" fill="#007a3d"/><rect x="47" y="5" width="35" height="75" fill="#ce1126"/><rect x="82" y="5" width="38" height="75" fill="#fcd116"/><path d="m64 28 3.4 9.5h10l-8.1 5.9 3.1 9.5-8.4-5.8-8.4 5.8 3.1-9.5-8.1-5.9h10Z" fill="#fcd116"/></g></svg>
        </div>
        <div className="landing-index" aria-label="Exemple illustratif du classement d’un titre foncier">
          <div className="index-heading"><span>REPÈRE DE CLASSEMENT</span><span>EXEMPLE</span></div>
          <div className="index-number"><span>NUMÉRO DU TITRE</span><strong>34444 <i>A</i></strong></div>
          <div className="index-rule"><span>CONSERVATION</span><b>A</b></div>
          <div className="index-rule"><span>SÉRIE</span><b>3 <small>Premier chiffre du titre</small></b></div>
          <div className="index-location"><div><span>EMPLACEMENT</span><strong><Archive size={19} /> Box 15</strong></div><MapPin size={22} /></div>
          <div className="index-foot"><span><FileSpreadsheet size={15} /> Import Excel ou CSV</span><span><ShieldCheck size={15} /> Contrôle avant intégration</span></div>
          <div className="index-search"><Search size={15} /><span>Rechercher un titre, une série ou un box</span></div>
        </div></div>
      </section>

      <footer className="landing-footer">
        <span className="footer-caption">UN REGISTRE POUR LE TRAVAIL QUOTIDIEN</span>
        <div className="footer-details"><span>Recherche par titre et conservation</span><i /><span>Classement par série et box</span><i /><span>Utilisable hors connexion</span></div>
        <Link href="/application">FONCIARCH <ArrowUpRight size={14} /></Link>
      </footer>
    </div>
  </main>;
}

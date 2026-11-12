import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { PwaProvider } from "../components/pwa";

const coustard = localFont({
  src: [
    { path: "../../Coustard/Coustard-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../Coustard/Coustard-Black.ttf", weight: "900", style: "normal" },
  ],
  variable: "--font-coustard",
  display: "swap",
});

const creteRound = localFont({
  src: [
    { path: "../../Crete_Round/CreteRound-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../Crete_Round/CreteRound-Italic.ttf", weight: "400", style: "italic" },
  ],
  variable: "--font-crete-round",
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "FONCIARCH",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "FONCIARCH", statusBarStyle: "default" },
  title: "FONCIARCH — Gestion des archives foncières",
  description: "Retrouver chaque titre, en quelques secondes. Gestion et localisation des archives foncières du Mfoundi.",
};

export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#098477" }, { media: "(prefers-color-scheme: dark)", color: "#101a22" }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fr" className={`${coustard.variable} ${creteRound.variable}`}><body><PwaProvider>{children}</PwaProvider></body></html>;
}

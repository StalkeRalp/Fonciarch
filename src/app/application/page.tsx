import type { Metadata } from "next";
import Workspace from "../../components/workspace";

export const metadata: Metadata = {
  title: "Espace de travail — FONCIARCH",
  description: "Gestion et consultation du registre foncier FONCIARCH.",
};

export default function ApplicationPage() {
  return <Workspace />;
}

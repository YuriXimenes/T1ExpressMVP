import type { Metadata } from "next";
import { RotasView } from "@/components/admin/rotas/rotas-view";

export const metadata: Metadata = { title: "Rotas e viagens" };

export default function AdminRotasPage() {
  return <RotasView />;
}

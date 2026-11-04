import type { Metadata } from "next";
import { PlanejamentoView } from "@/components/admin/rotas/planejamento-view";

export const metadata: Metadata = { title: "Planejamento" };

export default function AdminPlanejamentoPage() {
  return <PlanejamentoView />;
}

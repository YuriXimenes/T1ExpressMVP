import type { Metadata } from "next";
import { VeiculosView } from "@/components/admin/rotas/veiculos-view";

export const metadata: Metadata = { title: "Veículos e combustível" };

export default function AdminVeiculosPage() {
  return <VeiculosView />;
}

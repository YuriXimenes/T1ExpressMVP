import type { Metadata } from "next";
import { HistoricoPedidosView } from "@/components/admin/historico-pedidos-view";

export const metadata: Metadata = { title: "Histórico de pedidos" };

export default function AdminHistoricoPage() {
  return <HistoricoPedidosView />;
}

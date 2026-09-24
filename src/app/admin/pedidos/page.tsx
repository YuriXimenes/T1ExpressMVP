import type { Metadata } from "next";
import { PedidosAdminView } from "@/components/admin/pedidos-admin-view";

export const metadata: Metadata = { title: "Pedidos" };

export default function AdminPedidosPage() {
  return <PedidosAdminView />;
}

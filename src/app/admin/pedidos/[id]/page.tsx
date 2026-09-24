import type { Metadata } from "next";
import { PedidoAdminDetailView } from "@/components/admin/pedido-admin-detail-view";

export const metadata: Metadata = { title: "Pedido" };

export default async function AdminPedidoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PedidoAdminDetailView orderId={id} />;
}

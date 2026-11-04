import type { Metadata } from "next";
import { LabelPrint } from "@/components/admin/pedidos/label-print";

export const metadata: Metadata = { title: "Etiqueta" };

export default async function AdminEtiquetaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LabelPrint orderId={id} />;
}

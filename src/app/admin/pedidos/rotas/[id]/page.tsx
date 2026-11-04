import type { Metadata } from "next";
import { ViagemView } from "@/components/admin/rotas/viagem-view";

export const metadata: Metadata = { title: "Viagem" };

export default async function AdminViagemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ViagemView tripId={id} />;
}

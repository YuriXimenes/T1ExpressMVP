import type { Metadata } from "next";
import { SinistroDetailView } from "@/components/admin/financeiro/sinistro-detail-view";

export const metadata: Metadata = { title: "Sinistro" };

export default async function AdminSinistroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SinistroDetailView id={id} />;
}

import type { Metadata } from "next";
import { OcorrenciaDetailView } from "@/components/admin/ocorrencias/ocorrencia-detail-view";

export const metadata: Metadata = { title: "Ocorrência" };

export default async function AdminOcorrenciaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OcorrenciaDetailView id={id} />;
}

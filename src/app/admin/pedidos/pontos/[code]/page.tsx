import type { Metadata } from "next";
import { PontoDetailView } from "@/components/admin/pontos/ponto-detail-view";

export const metadata: Metadata = { title: "Ponto de retirada" };

export default async function AdminPontoPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <PontoDetailView code={decodeURIComponent(code)} />;
}

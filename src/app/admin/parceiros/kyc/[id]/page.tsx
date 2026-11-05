import type { Metadata } from "next";
import { KycDetailView } from "@/components/admin/parceiros/kyc-detail-view";

export const metadata: Metadata = { title: "Cadastro de parceiro" };

export default async function AdminKycDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KycDetailView id={id} />;
}

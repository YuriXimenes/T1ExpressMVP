import type { Metadata } from "next";
import { UsuarioAdminDetailView } from "@/components/admin/usuario-admin-detail-view";

export const metadata: Metadata = { title: "Usuário" };

export default async function AdminUsuarioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <UsuarioAdminDetailView userId={id} />;
}

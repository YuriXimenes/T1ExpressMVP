import type { Metadata } from "next";
import { PesquisaAdminView } from "@/components/admin/pesquisa-admin-view";

export const metadata: Metadata = { title: "Pesquisa" };

export default function AdminPesquisaPage() {
  return <PesquisaAdminView />;
}

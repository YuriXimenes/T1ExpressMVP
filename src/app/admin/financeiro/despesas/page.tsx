import type { Metadata } from "next";
import { DespesasView } from "@/components/admin/financeiro/despesas-view";

export const metadata: Metadata = { title: "Despesas" };

export default function AdminDespesasPage() {
  return <DespesasView />;
}

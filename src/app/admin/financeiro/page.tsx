import type { Metadata } from "next";
import { VisaoGeralView } from "@/components/admin/financeiro/visao-geral-view";

export const metadata: Metadata = { title: "Visão financeira" };

export default function AdminFinanceiroPage() {
  return <VisaoGeralView />;
}

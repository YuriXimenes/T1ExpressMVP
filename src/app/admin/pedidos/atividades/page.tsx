import type { Metadata } from "next";
import { AtividadesAdminView } from "@/components/admin/atividades-admin-view";

export const metadata: Metadata = { title: "Atividades dos pedidos" };

export default function AdminAtividadesPage() {
  return <AtividadesAdminView />;
}

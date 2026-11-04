import type { Metadata } from "next";
import { AcessosView } from "@/components/admin/pessoas/acessos-view";

export const metadata: Metadata = { title: "Usuários do admin" };

export default function AdminAcessosPage() {
  return <AcessosView />;
}

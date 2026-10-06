import type { Metadata } from "next";
import { UsuariosAdminView } from "@/components/admin/usuarios-admin-view";

export const metadata: Metadata = { title: "Usuários" };

export default function AdminUsuariosPage() {
  return <UsuariosAdminView />;
}

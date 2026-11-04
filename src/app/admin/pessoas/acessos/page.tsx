import type { Metadata } from "next";
import { AdministradoresAdminView } from "@/components/admin/administradores-admin-view";

export const metadata: Metadata = { title: "Administradores" };

export default function AdminAdministradoresPage() {
  return <AdministradoresAdminView />;
}

import type { Metadata } from "next";
import { CatalogoAdminView } from "@/components/admin/catalogo-admin-view";

export const metadata: Metadata = { title: "Catálogo" };

export default function AdminCatalogoPage() {
  return <CatalogoAdminView />;
}

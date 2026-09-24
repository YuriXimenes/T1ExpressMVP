import type { Metadata } from "next";
import { FormulariosAdminView } from "@/components/admin/formularios-admin-view";

export const metadata: Metadata = { title: "Formulários" };

export default function AdminFormulariosPage() {
  return <FormulariosAdminView />;
}

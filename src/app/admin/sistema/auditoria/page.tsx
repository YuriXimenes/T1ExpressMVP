import type { Metadata } from "next";
import { AuditoriaView } from "@/components/admin/sistema/auditoria-view";

export const metadata: Metadata = { title: "Auditoria" };

export default function AdminAuditoriaPage() {
  return <AuditoriaView />;
}

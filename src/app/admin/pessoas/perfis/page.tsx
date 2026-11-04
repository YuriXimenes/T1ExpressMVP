import type { Metadata } from "next";
import { PerfisView } from "@/components/admin/pessoas/perfis-view";

export const metadata: Metadata = { title: "Perfis e permissões" };

export default function AdminPerfisPage() {
  return <PerfisView />;
}

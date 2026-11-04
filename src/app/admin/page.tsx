import type { Metadata } from "next";
import { DashboardView } from "@/components/admin/dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };

// Mostra o conteúdo direto, sem redirect() de servidor: esse padrão disparava
// um erro de instrumentação do React em dev ("Failed to execute 'measure' on
// Performance...") que interrompia a navegação antes da guarda de acesso rodar.
export default function AdminIndexPage() {
  return <DashboardView />;
}

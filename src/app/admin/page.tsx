import type { Metadata } from "next";
import { PedidosAdminView } from "@/components/admin/pedidos-admin-view";

export const metadata: Metadata = { title: "Pedidos" };

// Antes isto era um redirect() de servidor para /admin/pedidos, mas esse
// padrão (Server Component minúsculo que só redireciona) disparava um erro
// de instrumentação do React em dev ("Failed to execute 'measure' on
// Performance... cannot have a negative time stamp") que interrompia a
// navegação antes da guarda de acesso rodar. Mostrar o conteúdo direto evita
// o redirect e o problema.
export default function AdminIndexPage() {
  return <PedidosAdminView />;
}

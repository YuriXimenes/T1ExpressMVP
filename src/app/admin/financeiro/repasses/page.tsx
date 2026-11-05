import { redirect } from "next/navigation";

/** Repasses e pagamentos foi unido a Despesas (um lugar só para ver e pagar). */
export default function AdminRepassesPage() {
  redirect("/admin/financeiro/despesas");
}

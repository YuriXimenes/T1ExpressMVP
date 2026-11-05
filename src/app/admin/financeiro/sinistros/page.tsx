import type { Metadata } from "next";
import { SinistrosView } from "@/components/admin/financeiro/sinistros-view";

export const metadata: Metadata = { title: "Sinistros" };

export default function AdminSinistrosPage() {
  return <SinistrosView />;
}

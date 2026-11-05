import type { Metadata } from "next";
import { PontosView } from "@/components/admin/pontos/pontos-view";

export const metadata: Metadata = { title: "Pontos de retirada" };

export default function AdminPontosPage() {
  return <PontosView />;
}

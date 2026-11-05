import type { Metadata } from "next";
import { DesempenhoView } from "@/components/admin/parceiros/desempenho-view";

export const metadata: Metadata = { title: "Desempenho dos parceiros" };

export default function AdminDesempenhoPage() {
  return <DesempenhoView />;
}

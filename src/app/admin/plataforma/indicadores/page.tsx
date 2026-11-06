import type { Metadata } from "next";
import { IndicadoresView } from "@/components/admin/plataforma/indicadores-view";

export const metadata: Metadata = { title: "Indicadores" };

export default function AdminIndicadoresPage() {
  return <IndicadoresView />;
}

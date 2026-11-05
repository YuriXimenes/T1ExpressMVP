import type { Metadata } from "next";
import { OcorrenciasView } from "@/components/admin/ocorrencias/ocorrencias-view";

export const metadata: Metadata = { title: "Ocorrências" };

export default function AdminOcorrenciasPage() {
  return <OcorrenciasView />;
}

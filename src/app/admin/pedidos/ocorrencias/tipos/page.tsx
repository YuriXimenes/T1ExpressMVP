import type { Metadata } from "next";
import { TiposOcorrenciaView } from "@/components/admin/ocorrencias/tipos-view";

export const metadata: Metadata = { title: "Tipos de ocorrência" };

export default function AdminTiposOcorrenciaPage() {
  return <TiposOcorrenciaView />;
}

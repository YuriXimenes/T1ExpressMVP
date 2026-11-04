import type { Metadata } from "next";
import { EquipeView } from "@/components/admin/pessoas/equipe-view";

export const metadata: Metadata = { title: "Equipe" };

export default function AdminEquipePage() {
  return <EquipeView />;
}

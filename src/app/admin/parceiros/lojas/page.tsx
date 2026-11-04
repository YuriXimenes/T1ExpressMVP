import type { Metadata } from "next";
import { CatalogPage } from "@/components/admin/catalog-page";
import { LojasTab } from "@/components/admin/lojas-tab";

export const metadata: Metadata = { title: "Lojas" };

export default function AdminLojasPage() {
  return (
    <CatalogPage
      title="Lojas"
      description="Lojas parceiras de coleta e T1 Points de retirada que aparecem no site."
    >
      <LojasTab />
    </CatalogPage>
  );
}

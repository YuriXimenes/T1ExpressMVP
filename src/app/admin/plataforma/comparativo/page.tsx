import type { Metadata } from "next";
import { CatalogPage } from "@/components/admin/catalog-page";
import { ComparativoTab } from "@/components/admin/comparativo-tab";

export const metadata: Metadata = { title: "Comparativo do site" };

export default function AdminComparativoPage() {
  return (
    <CatalogPage
      title="Comparativo do site"
      description="Tabela que compara a T1 com outros serviços na página inicial."
    >
      <ComparativoTab />
    </CatalogPage>
  );
}

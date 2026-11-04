import type { Metadata } from "next";
import { CatalogPage } from "@/components/admin/catalog-page";
import { PrecosTab } from "@/components/admin/precos-tab";

export const metadata: Metadata = { title: "Preços" };

export default function AdminPrecosPage() {
  return (
    <CatalogPage
      title="Preços"
      description="Frete da T1 e custo do seguro adicional cobrados nos novos pedidos."
    >
      <PrecosTab />
    </CatalogPage>
  );
}

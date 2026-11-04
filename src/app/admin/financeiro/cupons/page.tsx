import type { Metadata } from "next";
import { CatalogPage } from "@/components/admin/catalog-page";
import { CuponsTab } from "@/components/admin/cupons-tab";

export const metadata: Metadata = { title: "Cupons" };

export default function AdminCuponsPage() {
  return (
    <CatalogPage title="Cupons" description="Cupons de desconto aceitos no frete.">
      <CuponsTab />
    </CatalogPage>
  );
}

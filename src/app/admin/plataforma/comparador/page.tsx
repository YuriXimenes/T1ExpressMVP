import type { Metadata } from "next";
import { CatalogEditGuard, CatalogPage } from "@/components/admin/catalog-page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RotasTab } from "@/components/admin/rotas-tab";
import { CorreiosTab } from "@/components/admin/correios-tab";

export const metadata: Metadata = { title: "Comparador de fretes" };

export default function AdminComparadorPage() {
  return (
    <CatalogPage
      title="Comparador de fretes"
      description="Valores de Uber, Loggi e Correios usados no simulador de frete do site."
      guard={false}
    >
      <Tabs defaultValue="rotas">
        <TabsList>
          <TabsTrigger value="rotas">Rotas (Uber e Loggi)</TabsTrigger>
          <TabsTrigger value="correios">Correios</TabsTrigger>
        </TabsList>
        <TabsContent value="rotas" className="pt-4">
          <CatalogEditGuard>
            <RotasTab />
          </CatalogEditGuard>
        </TabsContent>
        <TabsContent value="correios" className="pt-4">
          <CatalogEditGuard>
            <CorreiosTab />
          </CatalogEditGuard>
        </TabsContent>
      </Tabs>
    </CatalogPage>
  );
}

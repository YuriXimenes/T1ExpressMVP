"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LojasTab } from "@/components/admin/lojas-tab";
import { RotasTab } from "@/components/admin/rotas-tab";
import { CorreiosTab } from "@/components/admin/correios-tab";
import { ComparativoTab } from "@/components/admin/comparativo-tab";
import { CuponsTab } from "@/components/admin/cupons-tab";

export function CatalogoAdminView() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Catálogo</h1>
      <p className="mb-6 text-sm text-slate-500">
        Edições aqui podem levar até 5 minutos para aparecer no site (cache do catálogo).
      </p>
      <Tabs defaultValue="lojas">
        <TabsList>
          <TabsTrigger value="lojas">Lojas</TabsTrigger>
          <TabsTrigger value="rotas">Rotas</TabsTrigger>
          <TabsTrigger value="correios">Correios</TabsTrigger>
          <TabsTrigger value="comparativo">Comparativo</TabsTrigger>
          <TabsTrigger value="cupons">Cupons</TabsTrigger>
        </TabsList>
        <TabsContent value="lojas" className="pt-4">
          <LojasTab />
        </TabsContent>
        <TabsContent value="rotas" className="pt-4">
          <RotasTab />
        </TabsContent>
        <TabsContent value="correios" className="pt-4">
          <CorreiosTab />
        </TabsContent>
        <TabsContent value="comparativo" className="pt-4">
          <ComparativoTab />
        </TabsContent>
        <TabsContent value="cupons" className="pt-4">
          <CuponsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

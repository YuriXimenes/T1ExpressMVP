"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LojasTab } from "@/components/admin/lojas-tab";
import { RotasTab } from "@/components/admin/rotas-tab";
import { CorreiosTab } from "@/components/admin/correios-tab";
import { ComparativoTab } from "@/components/admin/comparativo-tab";
import { CuponsTab } from "@/components/admin/cupons-tab";
import { AdminError, revalidateCatalog } from "@/lib/admin/api";

export function CatalogoAdminView() {
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleRefresh() {
    setRefreshing(true);
    setFeedback(null);
    try {
      await revalidateCatalog();
      setFeedback({ ok: true, text: "Catálogo atualizado no site." });
    } catch (err) {
      setFeedback({
        ok: false,
        text:
          err instanceof AdminError
            ? err.message
            : "Não foi possível atualizar o catálogo.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="mb-1 text-xl font-semibold text-slate-900">Catálogo</h1>
          <p className="text-sm text-slate-500">
            Edições aqui podem levar até 5 minutos para aparecer no site (cache do
            catálogo). Para aplicar na hora, use &ldquo;Atualizar catálogo no site&rdquo;.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1 sm:items-end">
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
            {refreshing ? "Atualizando..." : "Atualizar catálogo no site"}
          </Button>
          {feedback && (
            <p
              role="status"
              className={feedback.ok ? "text-xs text-green-700" : "text-xs text-red-600"}
            >
              {feedback.text}
            </p>
          )}
        </div>
      </div>
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

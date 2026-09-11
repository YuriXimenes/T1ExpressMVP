"use client";

import { useState } from "react";
import { Package, PackageCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NetworkMapList } from "@/components/shared/network-map-list";
import { cn } from "@/lib/utils";
import type { PickupPartner } from "@/lib/types/pickup-partner";

type NetworkTab = "coleta" | "retirada";

export function PontosT1Network({
  coletaPartners,
  retiradaPartners,
}: {
  coletaPartners: PickupPartner[];
  retiradaPartners: PickupPartner[];
}) {
  const [tab, setTab] = useState<NetworkTab>("coleta");

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as NetworkTab)}
      className="mt-12"
    >
      <TabsList className="mx-auto h-auto w-full max-w-md gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-2 shadow-inner">
        <TabsTrigger
          value="coleta"
          className={cn(
            "h-12 flex-1 gap-2 rounded-xl border-2 text-base font-bold",
            tab === "coleta"
              ? "!border-brand-700 !bg-brand-600 !text-white !shadow-lg"
              : "border-transparent !text-slate-500 hover:!text-slate-800",
          )}
        >
          <Package className="h-5 w-5" aria-hidden="true" />
          Coleta
        </TabsTrigger>
        <TabsTrigger
          value="retirada"
          className={cn(
            "h-12 flex-1 gap-2 rounded-xl border-2 text-base font-bold",
            tab === "retirada"
              ? "!border-brand-700 !bg-brand-600 !text-white !shadow-lg"
              : "border-transparent !text-slate-500 hover:!text-slate-800",
          )}
        >
          <PackageCheck className="h-5 w-5" aria-hidden="true" />
          Retirada
        </TabsTrigger>
      </TabsList>

      <TabsContent value="coleta" className="mt-8">
        <NetworkMapList partners={coletaPartners} badgeLabel="Ponto de coleta" />
      </TabsContent>

      <TabsContent value="retirada" className="mt-8">
        <NetworkMapList partners={retiradaPartners} badgeLabel="Ponto de retirada" />
      </TabsContent>
    </Tabs>
  );
}

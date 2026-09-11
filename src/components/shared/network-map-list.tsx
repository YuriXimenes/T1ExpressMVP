"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { PickupPartnerCard } from "@/components/shared/pickup-partner-card";
import type { PickupPartner } from "@/lib/types/pickup-partner";

const RioLeafletMap = dynamic(
  () => import("@/components/shared/rio-leaflet-map").then((mod) => mod.RioLeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] w-full items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-sm text-slate-400">
        Carregando mapa...
      </div>
    ),
  },
);

export function NetworkMapList({
  partners,
  badgeLabel,
}: {
  partners: PickupPartner[];
  badgeLabel?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(partners[0]?.id ?? null);

  return (
    <ScrollReveal>
      <div className="grid gap-8 lg:grid-cols-[42%_58%] lg:items-start lg:gap-10">
        <div className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-none">
          <div className="grid max-h-[420px] grid-cols-2 gap-3 overflow-y-auto pr-1">
            {partners.map((partner) => (
              <PickupPartnerCard
                key={partner.id}
                partner={partner}
                isSelected={partner.id === selectedId}
                onSelect={() => setSelectedId(partner.id)}
                badgeLabel={badgeLabel}
              />
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-none">
          <RioLeafletMap
            partners={partners}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
      </div>
    </ScrollReveal>
  );
}

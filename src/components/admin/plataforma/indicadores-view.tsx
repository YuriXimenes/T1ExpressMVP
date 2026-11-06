"use client";

import { useEffect, useState } from "react";
import { PeriodFilter, usePeriodFilter } from "@/components/admin/period-filter";
import {
  AbandonedTab,
  ComparatorTab,
  CustomersTab,
  DemandTab,
  FunnelTab,
  PricingTab,
  StoreRequestsTab,
} from "@/components/admin/plataforma/indicadores-tabs";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "funil", label: "Funil", usesPeriod: true },
  { id: "demanda", label: "Demanda", usesPeriod: true },
  { id: "preco", label: "Preço x concorrentes", usesPeriod: true },
  { id: "clientes", label: "Clientes", usesPeriod: true },
  { id: "abandonadas", label: "Simulações abandonadas", usesPeriod: true },
  { id: "lojas", label: "Lojas pedidas", usesPeriod: false },
  { id: "comparador", label: "Saúde do comparador", usesPeriod: false },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Plataforma › Indicadores: funil, demanda, preço, clientes e saúde do comparador. */
export function IndicadoresView() {
  const periodFilter = usePeriodFilter("30d");
  const { period } = periodFilter;
  const [tab, setTab] = useState<TabId>("funil");

  // Link direto para uma aba (ex.: #comparador, vindo do Comparador de fretes).
  useEffect(() => {
    queueMicrotask(() => {
      const hash = window.location.hash.slice(1);
      if (TABS.some((t) => t.id === hash)) setTab(hash as TabId);
    });
  }, []);

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Indicadores</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Como as pessoas usam o site: simulações, conversão em pedido, rotas procuradas
            e clientes. As simulações são registradas sem dado pessoal (ligadas à conta só
            quando a pessoa está logada), por dia de Brasília.
          </p>
        </div>
        {current.usesPeriod && <PeriodFilter state={periodFilter} idPrefix="ind" />}
      </div>

      <div
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
        role="tablist"
        aria-label="Indicadores"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              history.replaceState(null, "", `#${t.id}`);
            }}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-sm font-medium whitespace-nowrap",
              tab === t.id
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "funil" && <FunnelTab period={period} />}
        {tab === "demanda" && <DemandTab period={period} />}
        {tab === "preco" && <PricingTab period={period} />}
        {tab === "clientes" && <CustomersTab period={period} />}
        {tab === "abandonadas" && <AbandonedTab period={period} />}
        {tab === "lojas" && <StoreRequestsTab />}
        {tab === "comparador" && <ComparatorTab />}
      </div>
    </div>
  );
}

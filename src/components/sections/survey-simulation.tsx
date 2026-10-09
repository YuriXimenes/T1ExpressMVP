"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import Image from "next/image";
import { CalendarDays, MapPin, PackageCheck, Receipt, Store, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useCatalog } from "@/lib/catalog/provider";
import { formatOrderMoment, formatScheduleDate } from "@/lib/operating-calendar";
import {
  SIMULATION_PRICE,
  brl,
  buildSimulation,
  simulationAnswers,
} from "@/lib/survey/simulation";
import { cn } from "@/lib/utils";

function CardTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
      <span className="text-brand-600" aria-hidden="true">
        {icon}
      </span>
      {children}
    </p>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={cn("text-right text-slate-900", strong && "font-semibold")}>
        {value}
      </span>
    </div>
  );
}

/**
 * Resumo do 1º pedido do respondente com preço e prazo da simulação (Bloco 5).
 * Preço: valores fixos da pesquisa. Datas: calendário da T1 a partir do dia e
 * hora em que o pedido foi criado. Entrega o que foi exibido em `onReady`, para
 * ser gravado junto das respostas.
 */
export function SurveySimulation({
  order,
  onReady,
}: {
  order: { originStoreIds: string[]; destinationStoreId: string; createdAt: string };
  onReady: (answers: ReturnType<typeof simulationAnswers>) => void;
}) {
  const { coletaPartners, stores } = useCatalog();

  // A simulação depende só de quais lojas e de quando o pedido foi feito.
  const storesKey = order.originStoreIds.join("|");
  const sim = useMemo(
    () =>
      buildSimulation({
        originStoreIds: storesKey.split("|"),
        createdAt: order.createdAt,
      }),
    [storesKey, order.createdAt],
  );

  const callback = useRef(onReady);
  useEffect(() => {
    callback.current = onReady;
  });
  useEffect(() => {
    callback.current(simulationAnswers(sim));
  }, [sim]);

  const origins = coletaPartners.filter((p) => order.originStoreIds.includes(p.id));
  const pickup = stores.find((s) => s.id === order.destinationStoreId);

  return (
    <div className="mt-6 flex flex-col gap-4" aria-label="Resumo do seu pedido">
      <Card className="gap-4 p-5 sm:p-6">
        <CardTitle icon={<Store className="h-4 w-4" />}>Seu pedido</CardTitle>
        <div>
          <p className="text-sm text-slate-600">Você fez o pedido nas seguintes lojas:</p>
          <ul className="mt-3 flex flex-col gap-3">
            {origins.map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-10 w-14 shrink-0 items-center justify-center rounded-md border border-slate-100 p-1",
                    p.onDark && "border-slate-900 bg-slate-900",
                  )}
                >
                  <Image
                    src={p.logo}
                    alt=""
                    width={56}
                    height={40}
                    className="h-full w-auto object-contain"
                  />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900">{p.name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {[p.neighborhood, p.city].filter(Boolean).join(", ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-slate-100 pt-4">
          <p className="flex items-center gap-1.5 text-sm text-slate-600">
            <MapPin className="h-4 w-4 text-slate-400" aria-hidden="true" />
            Local de retirada
          </p>
          <p className="mt-1 font-medium text-slate-900">{pickup?.name ?? "—"}</p>
          {pickup?.address && <p className="text-xs text-slate-500">{pickup.address}</p>}
        </div>
      </Card>

      <Card className="gap-3 p-5 sm:p-6">
        <CardTitle icon={<Receipt className="h-4 w-4" />}>Preço do serviço</CardTitle>
        <Row label="Primeira loja" value={brl(SIMULATION_PRICE.firstStoreBRL)} strong />
        <Row
          label="Cada loja adicional"
          value={brl(SIMULATION_PRICE.extraStoreBRL)}
          strong
        />
      </Card>

      <Card className="border-brand-200 bg-brand-50 gap-1 p-5 ring-0 sm:border sm:p-6">
        <CardTitle icon={<PackageCheck className="h-4 w-4" />}>
          Valor total estimado do serviço para {sim.stores}{" "}
          {sim.stores === 1 ? "loja" : "lojas"}
        </CardTitle>
        <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900 tabular-nums">
          {brl(sim.totalBRL)}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          O valor inclui a coleta nas lojas de origem e a consolidação para retirada no T1
          Point escolhido. O valor das cartas não está incluído.
        </p>
      </Card>

      <Card className="gap-4 p-5 sm:p-6">
        <CardTitle icon={<CalendarDays className="h-4 w-4" />}>
          Previsão de coleta e retirada
        </CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Truck className="h-4 w-4 text-slate-400" aria-hidden="true" />
              Coleta prevista
            </p>
            <p className="mt-1 font-semibold text-slate-900">
              {formatScheduleDate(sim.collectDate)}
            </p>
          </div>
          <div className="border-brand-200 bg-brand-50 rounded-lg border p-4">
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <PackageCheck className="text-brand-600 h-4 w-4" aria-hidden="true" />
              Disponível para retirada
            </p>
            <p className="mt-1 font-semibold text-slate-900">
              {formatScheduleDate(sim.pickupDate)}
            </p>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-slate-500">
          A data de retirada é calculada automaticamente com base no dia e horário do
          pedido ({formatOrderMoment(sim.orderAt)}), no calendário operacional da T1
          (coletas e entregas às segundas, quartas e sextas) e em eventuais feriados ou
          exceções.
        </p>
      </Card>
    </div>
  );
}

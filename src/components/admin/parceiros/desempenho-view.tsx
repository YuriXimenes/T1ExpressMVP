"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PeriodFilter, usePeriodFilter } from "@/components/admin/period-filter";
import { dayKey } from "@/lib/admin/dashboard";
import { addDays } from "@/lib/operating-calendar";
import {
  PartnerError,
  fetchPartnerPerformance,
  type PartnerPerformance,
} from "@/lib/partners/api";
import { hoursLabel } from "@/lib/points/guard";
import { cn } from "@/lib/utils";

type SortKey =
  "name" | "collected" | "pickedUp" | "failedStops" | "occurrences" | "guardExpired";

/** Como cada loja parceira está performando no período. */
export function DesempenhoView() {
  const period = usePeriodFilter("30d");
  const [rows, setRows] = useState<PartnerPerformance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("collected");
  const from = period.period.from ?? addDays(dayKey(new Date()), -365);
  const to = period.period.to ?? dayKey(new Date());

  useEffect(() => {
    queueMicrotask(() => {
      fetchPartnerPerformance(from, to)
        .then((r) => {
          setRows(r);
          setError(null);
        })
        .catch((err) =>
          setError(
            err instanceof PartnerError ? err.message : "Não foi possível carregar.",
          ),
        );
    });
  }, [from, to]);

  const sorted = useMemo(
    () =>
      [...(rows ?? [])]
        .filter(
          (r) =>
            r.collected + r.pickedUp + r.failedStops + r.occurrences + r.guardExpired >
              0 || r.published,
        )
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name)
            : (b[sort] as number) - (a[sort] as number),
        ),
    [rows, sort],
  );

  const flag = (r: PartnerPerformance) =>
    r.failedStops >= 2 || r.occurrences >= 3 || r.guardExpired >= 3;

  const header = (key: SortKey, label: string, right = true) => (
    <th className={cn("px-3 py-2 font-medium", right && "text-right")}>
      <button
        type="button"
        onClick={() => setSort(key)}
        className={cn("hover:text-slate-800", sort === key && "text-slate-900 underline")}
      >
        {label}
      </button>
    </th>
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Desempenho dos parceiros</h1>
        <p className="text-sm text-slate-500">
          Volume, prazos e problemas por loja no período. Lojas com muitas paradas não
          realizadas, ocorrências ou prazos de guarda vencidos aparecem sinalizadas.
        </p>
      </div>
      <PeriodFilter state={period} idPrefix="desempenho" />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {!rows && !error && <p className="text-sm text-slate-500">Carregando...</p>}
      {rows && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                {header("name", "Loja", false)}
                {header("collected", "Coletados")}
                {header("pickedUp", "Retirados")}
                <th className="px-3 py-2 text-right font-medium">Tempo até retirar</th>
                {header("failedStops", "Paradas não feitas")}
                {header("occurrences", "Ocorrências")}
                {header("guardExpired", "Guarda vencida")}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.code}
                  className={cn("border-t border-slate-100", flag(r) && "bg-amber-50/60")}
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/parceiros/lojas/${r.code}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {r.name}
                    </Link>
                    {!r.published && (
                      <span className="ml-1 text-xs text-slate-400">(oculta)</span>
                    )}
                    {flag(r) && (
                      <span className="ml-1 text-xs font-medium text-amber-700">
                        atenção
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{r.collected}</td>
                  <td className="px-3 py-2 text-right">
                    {r.isPickupPoint ? r.pickedUp : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.isPickupPoint ? hoursLabel(r.avgHoursToPickup) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{r.failedStops}</td>
                  <td className="px-3 py-2 text-right">{r.occurrences}</td>
                  <td className="px-3 py-2 text-right">
                    {r.isPickupPoint ? r.guardExpired : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

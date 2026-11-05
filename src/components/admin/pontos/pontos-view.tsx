"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AdminError } from "@/lib/admin/api";
import { fetchPickupPoints, type PickupPoint } from "@/lib/points/api";
import { WEEKDAY_LABELS, hoursLabel } from "@/lib/points/guard";
import { cn } from "@/lib/utils";

/** Horário de hoje ("Hoje: 10:00–19:00" ou "Hoje: fechado / sem horário"). */
function todayHours(hours: Record<string, string>): string {
  const weekday = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  ).getDay();
  if (Object.keys(hours).length === 0) return "Horário não informado";
  return `Hoje (${WEEKDAY_LABELS[weekday].toLowerCase()}): ${hours[String(weekday)] ?? "fechado"}`;
}

export function PontosView() {
  const [points, setPoints] = useState<PickupPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => {
      fetchPickupPoints()
        .then(setPoints)
        .catch((err) =>
          setError(
            err instanceof AdminError ? err.message : "Não foi possível carregar.",
          ),
        );
    });
  }, []);

  const totals = (points ?? []).reduce(
    (acc, p) => ({
      stored: acc.stored + p.stored,
      expired: acc.expired + p.expired,
      dueToday: acc.dueToday + p.dueToday,
    }),
    { stored: 0, expired: 0, dueToday: 0 },
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Pontos de retirada</h1>
        <p className="text-sm text-slate-500">
          O que está guardado em cada ponto, há quanto tempo e o prazo de guarda. Pacote
          com prazo vencido abre uma ocorrência automática.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {!points && !error && <p className="text-sm text-slate-500">Carregando...</p>}

      {points && (
        <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
          <Stat label="Guardados" value={totals.stored} />
          <Stat
            label="Vencem hoje"
            value={totals.dueToday}
            tone={totals.dueToday ? "amber" : undefined}
          />
          <Stat
            label="Prazo vencido"
            value={totals.expired}
            tone={totals.expired ? "red" : undefined}
          />
        </div>
      )}

      {points && points.length === 0 && (
        <p className="text-sm text-slate-500">
          Nenhuma loja marcada como ponto de retirada no catálogo.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(points ?? []).map((p) => {
          const pct = p.capacity
            ? Math.min(100, Math.round((p.stored / p.capacity) * 100))
            : null;
          return (
            <Link
              key={p.code}
              href={`/admin/pedidos/pontos/${encodeURIComponent(p.code)}`}
            >
              <Card className="h-full gap-3 p-4 transition-colors hover:border-slate-300">
                <div>
                  <p className="font-semibold text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-500">
                    {p.address}
                    {p.neighborhood && ` · ${p.neighborhood}`} · {p.city}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-sm text-slate-700">
                    <span className="text-lg font-semibold text-slate-900">
                      {p.stored}
                    </span>
                    {p.capacity ? ` de ${p.capacity} pacotes` : " pacote(s) guardado(s)"}
                  </p>
                  {pct !== null && (
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-slate-100"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Ocupação"
                    >
                      <div
                        className={cn(
                          "h-full rounded-full",
                          pct >= 90
                            ? "bg-red-500"
                            : pct >= 70
                              ? "bg-amber-500"
                              : "bg-emerald-500",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {p.expired > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      {p.expired} vencido(s)
                    </span>
                  )}
                  {p.dueToday > 0 && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                      {p.dueToday} vence(m) hoje
                    </span>
                  )}
                </div>
                <p className="flex flex-wrap gap-x-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {todayHours(p.hours)}
                  </span>
                  <span>Guarda: {p.guardDays} dias</span>
                  <span>
                    30 dias: {p.pickups30d} retirada(s) · média{" "}
                    {hoursLabel(p.avgHoursToPickup30d)}
                  </span>
                </p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "amber" | "red";
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={cn(
          "text-xl font-semibold",
          tone === "red"
            ? "text-red-600"
            : tone === "amber"
              ? "text-amber-600"
              : "text-slate-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}

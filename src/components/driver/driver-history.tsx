"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DriverError, fetchDriverHistory, type DriverTrip } from "@/lib/driver/api";
import { stopTone } from "@/lib/driver/rules";
import { stopReasonLabel } from "@/lib/routes/planning";
import { cn } from "@/lib/utils";

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
const time = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    : "";

/** Aba Histórico: viagens concluídas dos últimos 30 dias. */
export function DriverHistory() {
  const [trips, setTrips] = useState<DriverTrip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      fetchDriverHistory()
        .then(setTrips)
        .catch((err) =>
          setError(
            err instanceof DriverError
              ? err.message
              : "Não foi possível carregar o histórico.",
          ),
        );
    });
  }, []);

  const totalKm = (trips ?? []).reduce((s, t) => s + (t.actualKm ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Histórico</h1>
        <p className="text-sm text-slate-500">Viagens concluídas nos últimos 30 dias.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!trips && !error && <p className="text-sm text-slate-500">Carregando...</p>}
      {trips && trips.length === 0 && (
        <Card className="p-6 text-center text-sm text-slate-600">
          Nenhuma viagem concluída nos últimos 30 dias.
        </Card>
      )}
      {trips && trips.length > 0 && (
        <p className="text-xs text-slate-500">
          {trips.length} viagem(ns) · {totalKm.toLocaleString("pt-BR")} km rodados
        </p>
      )}
      {trips?.map((t) => {
        const stops = t.routes.flatMap((r) =>
          r.stops.map((s) => ({ ...s, kind: r.kind })),
        );
        const expanded = openId === t.id;
        return (
          <div key={t.id} className="rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpenId(expanded ? null : t.id)}
              className="flex w-full items-center gap-3 p-4 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900 capitalize">
                  {dayLabel(t.day)}
                </span>
                <span className="block text-sm text-slate-600">
                  {t.routes
                    .map(
                      (r) =>
                        `${r.kind === "coleta" ? "Coletas" : "Entregas"} (${r.stops.length})`,
                    )
                    .join(" + ")}
                </span>
                <span className="block text-xs text-slate-500">
                  {t.actualKm !== undefined
                    ? `${t.actualKm.toLocaleString("pt-BR")} km`
                    : "km —"}
                  {" · "}
                  {t.stopsDone ?? 0} feita(s)
                  {(t.stopsFailed ?? 0) > 0 && (
                    <span className="text-red-600">
                      {" "}
                      · {t.stopsFailed} não realizada(s)
                    </span>
                  )}
                  {t.startedAt && ` · ${time(t.startedAt)}–${time(t.finishedAt)}`}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-slate-400 transition-transform",
                  expanded && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>
            {expanded && (
              <ol className="flex flex-col gap-2 border-t border-slate-100 p-4">
                {stops.map((s, i) => {
                  const tone = stopTone(s.status);
                  return (
                    <li key={s.id} className="flex gap-2 text-sm">
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white",
                          tone === "feita"
                            ? "bg-emerald-600"
                            : tone === "falhou"
                              ? "bg-red-600"
                              : "bg-slate-400",
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-slate-900">
                          {s.store.name}{" "}
                          <span className="text-xs text-slate-500">
                            · {s.kind === "coleta" ? "coleta" : "entrega"}
                            {s.doneAt && ` · ${time(s.doneAt)}`}
                          </span>
                        </span>
                        {tone === "falhou" && (
                          <span className="block text-xs text-red-600">
                            Não realizada
                            {s.reason ? `: ${stopReasonLabel(s.reason)}` : ""}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
}

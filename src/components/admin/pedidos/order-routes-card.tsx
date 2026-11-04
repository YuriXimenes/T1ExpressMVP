"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { useCatalog } from "@/lib/catalog/provider";
import {
  ROUTE_KIND_LABELS,
  STOP_STATUS_LABELS,
  stopReasonLabel,
} from "@/lib/routes/planning";
import { fetchOrderRoutes } from "@/lib/routes/api";

type Entry = Awaited<ReturnType<typeof fetchOrderRoutes>>[number];

const RESULT_LABELS: Record<string, string> = {
  coletado: "Coletado",
  nao_coletado: "Não coletado",
  entregue: "Entregue",
  nao_entregue: "Não entregue",
};

/** Rotas em que o pedido entrou e o que aconteceu em cada parada. */
export function OrderRoutesCard({
  orderId,
  refreshKey,
}: {
  orderId: string;
  refreshKey?: unknown;
}) {
  const { stores } = useCatalog();
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOrderRoutes(orderId)
      .then((data) => !cancelled && setEntries(data))
      // Sem a migração de rotas (ou sem permissão), o cartão só não aparece.
      .catch(() => !cancelled && setEntries([]));
    return () => {
      cancelled = true;
    };
  }, [orderId, refreshKey]);

  if (!entries || entries.length === 0) return null;
  const storeName = (code: string) => stores.find((s) => s.id === code)?.name ?? code;

  return (
    <Card className="gap-3 p-6">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Rotas</p>
      <ul className="flex flex-col gap-2 text-sm">
        {entries.map((e, i) => (
          <li key={`${e.routeId}-${i}`} className="border-l-2 border-slate-200 pl-3">
            <p className="font-medium text-slate-900">
              {ROUTE_KIND_LABELS[e.kind]} ·{" "}
              {new Date(`${e.day}T12:00:00`).toLocaleDateString("pt-BR")} ·{" "}
              {storeName(e.storeCode)}
            </p>
            <p className="text-slate-600">
              {e.result
                ? RESULT_LABELS[e.result]
                : e.routeStatus === "cancelada"
                  ? "Rota cancelada"
                  : (STOP_STATUS_LABELS[e.stopStatus] ?? e.stopStatus)}
              {e.reason && ` · ${stopReasonLabel(e.reason)}`}
              {e.tripId && (
                <>
                  {" · "}
                  <Link
                    href={`/admin/pedidos/rotas/${e.tripId}`}
                    className="text-brand-700 hover:underline"
                  >
                    ver viagem
                  </Link>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PhotoGallery } from "@/components/shared/photo-gallery";
import { orderItemRows } from "@/components/sections/order-item-rows";
import { fetchOwnOrderHandling, type OwnOrderHandling } from "@/lib/orders/handling";
import { divergenceText, isDivergent } from "@/lib/admin/handling";
import type { MockOrder } from "@/lib/types/mock-order";

/** Código de retirada, fotos das cartas e divergências da conferência, para o cliente. */
export function OrderHandlingSection({ order }: { order: MockOrder }) {
  const [data, setData] = useState<OwnOrderHandling | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOwnOrderHandling(order.id)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      // Sem estes dados o pedido continua utilizável: só não mostra os cartões.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [order.id, order.status, order.deliveryStage]);

  if (!data) return null;

  const rows = orderItemRows(order.ordersByStore);
  const labelOf = (id?: string) => rows.find((r) => r.id === id)?.label ?? "Item";
  const divergent = data.checks.filter(isDivergent);
  const showCode =
    !!data.pickupCode &&
    !data.pickupUsedAt &&
    order.status === "active" &&
    order.deliveryStage === "disponivel-para-retirada";
  const photoGroups = [
    ...rows
      .map((r) => ({
        key: r.id,
        title: r.label,
        photos: data.photos.filter((p) => p.itemId === r.id),
      }))
      .filter((g) => g.photos.length > 0),
    ...(data.photos.some((p) => !p.itemId)
      ? [{ key: "geral", title: "Pacote", photos: data.photos.filter((p) => !p.itemId) }]
      : []),
  ];

  return (
    <>
      {showCode && (
        <Card className="border-brand-200 bg-brand-50/60 gap-2 p-6">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <KeyRound className="text-brand-700 h-4 w-4" aria-hidden="true" />
            Código de retirada
          </p>
          <p className="font-mono text-4xl font-bold tracking-[0.3em] text-slate-900">
            {data.pickupCode}
          </p>
          <p className="text-sm text-slate-600">
            Mostre este código na loja de retirada. Ele vale uma vez só.
          </p>
        </Card>
      )}

      {divergent.length > 0 && (
        <Card className="gap-2 border-amber-200 p-6">
          <p className="text-sm font-semibold text-slate-900">Conferência dos itens</p>
          <p className="text-sm text-slate-600">
            Na coleta, alguns itens chegaram em quantidade diferente do pedido:
          </p>
          <ul className="flex flex-col gap-1 text-sm text-slate-700">
            {divergent.map((check) => (
              <li key={check.itemId}>
                {divergenceText(check)} · {labelOf(check.itemId)}
                {check.note && <span className="text-slate-500"> ({check.note})</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {photoGroups.length > 0 && (
        <Card className="gap-3 p-6">
          <p className="text-sm font-semibold text-slate-900">Fotos das cartas</p>
          {photoGroups.map((group) => (
            <div key={group.key} className="flex flex-col gap-1.5">
              <p className="text-sm text-slate-600">{group.title}</p>
              <PhotoGallery photos={group.photos} title={group.title} />
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

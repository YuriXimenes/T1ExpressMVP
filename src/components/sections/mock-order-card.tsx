"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useCatalog } from "@/lib/catalog/provider";
import { computeTotalPaidBRL, getOrderStatusLabel } from "@/lib/order-helpers";
import { cn } from "@/lib/utils";
import type { FreightStore } from "@/lib/types/freight-store";
import type { MockOrder } from "@/lib/types/mock-order";

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function LogoCircle({ store }: { store: FreightStore }) {
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-white",
        store.logoOnDark && "bg-slate-900",
      )}
    >
      <Image
        src={store.logo}
        alt=""
        width={28}
        height={28}
        className="h-full w-full object-contain"
      />
    </span>
  );
}

export function MockOrderCard({
  order,
  onMarkCompleted,
}: {
  order: MockOrder;
  onMarkCompleted?: () => void;
}) {
  const router = useRouter();
  const { stores: freightStores } = useCatalog();
  const origins = freightStores.filter((store) =>
    order.originStoreIds.includes(store.id),
  );
  const destination = freightStores.find(
    (store) => store.id === order.destinationStoreId,
  );
  const itemCount = Object.values(order.ordersByStore)
    .flat()
    .reduce(
      (sum, group) => sum + group.cardItems.length + group.accessoryItems.length,
      0,
    );
  const dateLabel = new Date(order.paidAt ?? order.createdAt).toLocaleDateString("pt-BR");
  const canMarkCompleted =
    onMarkCompleted && order.deliveryStage === "disponivel-para-retirada";
  const statusLabel = getOrderStatusLabel(order);
  const pickupDateLabel =
    order.status === "active" && order.estimatedPickupDate
      ? new Date(order.estimatedPickupDate).toLocaleDateString("pt-BR")
      : null;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/pedidos/${order.id}`)}
      onKeyDown={(event) => {
        if (event.key === "Enter") router.push(`/pedidos/${order.id}`);
      }}
      className="cursor-pointer gap-3 p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <div className="flex -space-x-2">
            {origins.map((store) => (
              <LogoCircle key={store.id} store={store} />
            ))}
          </div>
          <ArrowRight className="mx-1 h-4 w-4 text-slate-400" aria-hidden="true" />
          {destination && <LogoCircle store={destination} />}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={order.status === "active" ? "default" : "secondary"}>
            {statusLabel}
          </Badge>
          {pickupDateLabel && (
            <span className="text-xs text-slate-400">previsão {pickupDateLabel}</span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {itemCount} {itemCount === 1 ? "item" : "itens"}
        </span>
        <span>{dateLabel}</span>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-sm text-slate-600">Valor pago</span>
        <span className="font-semibold text-slate-900">
          {formatBRL(computeTotalPaidBRL(order))}
        </span>
      </div>

      {canMarkCompleted && (
        <div onClick={(event) => event.stopPropagation()}>
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm">
                Concluir retirada
              </Button>
            }
            title="Concluir retirada?"
            description="Essa ação não pode ser desfeita. O pedido será marcado como concluído e movido para o histórico."
            confirmLabel="Concluir retirada"
            onConfirm={onMarkCompleted}
          />
        </div>
      )}
    </Card>
  );
}

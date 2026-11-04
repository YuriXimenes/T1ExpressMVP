"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/components/shared/price";
import { MoveOrderMenu, type OrderMover } from "@/components/admin/pedidos/move-order";
import { OrderFlags } from "@/components/admin/pedidos/order-flags";
import type { AdminOrderSummary } from "@/lib/admin/api";
import {
  ORDER_COLUMNS,
  columnOf,
  moveRule,
  orderCode,
  type OrderColumnId,
} from "@/lib/admin/order-moves";
import { cn } from "@/lib/utils";
import { useCan } from "@/lib/admin/access-provider";

/** Cartões por coluna antes de pedir para abrir a tabela. */
const COLUMN_LIMIT = 60;

export function OrdersKanban({
  orders,
  mover,
  storeName,
}: {
  orders: AdminOrderSummary[];
  mover: OrderMover;
  storeName: (code: string) => string;
}) {
  const [dragging, setDragging] = useState<AdminOrderSummary | null>(null);
  const [hover, setHover] = useState<OrderColumnId | null>(null);

  const canDrop = (column: OrderColumnId) =>
    !!dragging &&
    column !== "pending-payment" &&
    column !== columnOf(dragging) &&
    moveRule(dragging, column).allowed;

  /** Por que a coluna não aceita o cartão que está sendo arrastado (aparece no topo dela). */
  const blockedReason = (column: OrderColumnId): string | null => {
    if (!dragging || column === columnOf(dragging) || canDrop(column)) return null;
    if (column === "pending-payment") return "O pagamento é feito só pelo cliente.";
    const rule = moveRule(dragging, column);
    return rule.allowed ? null : rule.why;
  };

  return (
    // Rola de lado só dentro do quadro; a página não.
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      <div className="flex min-w-max gap-3">
        {ORDER_COLUMNS.map((column) => {
          const cards = orders.filter((o) => columnOf(o) === column.id);
          const droppable = canDrop(column.id);
          const blocked = blockedReason(column.id);
          return (
            <section
              key={column.id}
              aria-label={column.label}
              onDragOver={(e) => {
                if (!droppable) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setHover(column.id);
              }}
              onDragLeave={() => setHover((h) => (h === column.id ? null : h))}
              onDrop={(e) => {
                e.preventDefault();
                const order = dragging;
                setDragging(null);
                setHover(null);
                if (order && droppable && column.id !== "pending-payment") {
                  mover.request(order, column.id);
                }
              }}
              className={cn(
                "flex w-72 shrink-0 flex-col rounded-xl border bg-slate-100/70 transition-opacity",
                blocked && "opacity-60",
                droppable ? "border-brand-400 border-dashed" : "border-slate-200",
                hover === column.id && "bg-brand-50",
              )}
            >
              <header className="flex items-center justify-between px-3 py-2.5">
                <h2 className="text-sm font-semibold text-slate-700">{column.label}</h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">
                  {cards.length}
                </span>
              </header>
              {blocked && (
                <p className="mx-2 mb-2 rounded-md bg-white px-2.5 py-1.5 text-xs text-slate-600">
                  {blocked}
                </p>
              )}
              <div className="flex max-h-[calc(100dvh-20rem)] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {cards.slice(0, COLUMN_LIMIT).map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    mover={mover}
                    storeName={storeName}
                    isDragging={dragging?.id === order.id}
                    onDragStart={() => setDragging(order)}
                    onDragEnd={() => {
                      setDragging(null);
                      setHover(null);
                    }}
                  />
                ))}
                {cards.length > COLUMN_LIMIT && (
                  <p className="px-1 py-2 text-center text-xs text-slate-500">
                    Mais {cards.length - COLUMN_LIMIT} pedidos: veja todos na tabela.
                  </p>
                )}
                {cards.length === 0 && (
                  <p className="px-1 py-6 text-center text-xs text-slate-400">
                    Nenhum pedido
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function OrderCard({
  order,
  mover,
  storeName,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  order: AdminOrderSummary;
  mover: OrderMover;
  storeName: (code: string) => string;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const canEdit = useCan("pedidos", "edit");
  const router = useRouter();
  const finished = order.status === "completed" || order.status === "cancelled";
  const busy = mover.busyId === order.id;
  const href = `/admin/pedidos/${order.id}`;

  return (
    <article
      draggable={canEdit && !finished && !mover.busyId}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", order.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={() => router.push(href)}
      className={cn(
        "cursor-pointer rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-xs hover:border-slate-300",
        !finished && "active:cursor-grabbing",
        (isDragging || busy) && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            className="font-semibold text-slate-900 hover:underline"
          >
            #{orderCode(order.id)}
          </Link>
          <p className="truncate text-xs text-slate-500">
            {order.customerName || order.customerEmail}
          </p>
        </div>
        <MoveOrderMenu order={order} mover={mover} size="icon" />
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-slate-600">
        {order.originStoreIds.map(storeName).join(", ")}
        <span className="text-slate-400"> → </span>
        {storeName(order.destinationStoreId)}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-slate-900">
          {formatBRL(order.totalPaidBRL)}
        </span>
        <span className="flex items-center gap-1.5 text-slate-500">
          <OrderFlags order={order} />
          {cardDate(order)}
        </span>
      </div>
    </article>
  );
}

function cardDate(order: AdminOrderSummary): string {
  const short = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  if (order.status === "active" && order.estimatedPickupDate) {
    return `Previsão ${short(order.estimatedPickupDate)}`;
  }
  if (order.status === "completed" && order.completedAt) {
    return `Concluído ${short(order.completedAt)}`;
  }
  return `Criado ${short(order.createdAt)}`;
}

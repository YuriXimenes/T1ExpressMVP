"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/components/shared/price";
import { MoveOrderMenu, type OrderMover } from "@/components/admin/pedidos/move-order";
import { OrderFlags } from "@/components/admin/pedidos/order-flags";
import type { AdminOrderSummary } from "@/lib/admin/api";
import { ORDER_COLUMNS, columnOf, orderCode } from "@/lib/admin/order-moves";
import { cn } from "@/lib/utils";

type SortKey = "code" | "customer" | "situation" | "total" | "created" | "pickup";

const columnIndex = (o: AdminOrderSummary) =>
  ORDER_COLUMNS.findIndex((c) => c.id === columnOf(o));

const SORTERS: Record<SortKey, (a: AdminOrderSummary, b: AdminOrderSummary) => number> = {
  code: (a, b) => a.id.localeCompare(b.id),
  customer: (a, b) =>
    (a.customerName || a.customerEmail).localeCompare(
      b.customerName || b.customerEmail,
      "pt-BR",
    ),
  situation: (a, b) => columnIndex(a) - columnIndex(b),
  total: (a, b) => a.totalPaidBRL - b.totalPaidBRL,
  created: (a, b) => a.createdAt.localeCompare(b.createdAt),
  // Sem previsão (não pago, finalizado) vai para o fim.
  pickup: (a, b) =>
    (a.estimatedPickupDate ?? "9999").localeCompare(b.estimatedPickupDate ?? "9999"),
};

export function situationLabel(order: AdminOrderSummary): string {
  const label = ORDER_COLUMNS.find((c) => c.id === columnOf(order))!.label;
  // Colunas no plural ("Concluídos"); na linha, singular.
  if (order.status === "completed") return "Concluído";
  if (order.status === "cancelled") return "Cancelado";
  return label;
}

export function situationVariant(
  order: AdminOrderSummary,
): "default" | "secondary" | "destructive" {
  if (order.status === "cancelled") return "destructive";
  if (order.status === "active") return "default";
  return "secondary";
}

function SortHeader({
  id,
  label,
  right,
  sort,
  onSort,
}: {
  id: SortKey;
  label: string;
  right?: boolean;
  sort: { key: SortKey; desc: boolean };
  onSort: () => void;
}) {
  const active = sort.key === id;
  const Icon = sort.desc ? ArrowDown : ArrowUp;
  return (
    <th
      className={cn("px-4 py-2 font-medium", right && "text-right")}
      aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          "inline-flex items-center gap-1 hover:text-slate-900",
          active && "text-slate-900",
        )}
      >
        {label}
        {active && <Icon className="h-3 w-3" aria-hidden="true" />}
      </button>
    </th>
  );
}

const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

export function OrdersTable({
  orders,
  mover,
  storeName,
}: {
  orders: AdminOrderSummary[];
  mover: OrderMover;
  storeName: (code: string) => string;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "created",
    desc: true,
  });

  const sorted = useMemo(() => {
    const list = [...orders].sort(SORTERS[sort.key]);
    return sort.desc ? list.reverse() : list;
  }, [orders, sort]);

  const header = (id: SortKey, label: string, right?: boolean) => (
    <SortHeader
      id={id}
      label={label}
      right={right}
      sort={sort}
      onSort={() =>
        setSort((s) => ({ key: id, desc: s.key === id ? !s.desc : id !== "code" }))
      }
    />
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            {header("code", "Código")}
            {header("customer", "Cliente")}
            {header("situation", "Situação")}
            <th className="px-4 py-2 font-medium">Lojas</th>
            {header("total", "Valor pago", true)}
            {header("created", "Criado em")}
            {header("pickup", "Previsão")}
            <th className="px-4 py-2 font-medium">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                Nenhum pedido encontrado.
              </td>
            </tr>
          ) : (
            sorted.map((order) => (
              <tr
                key={order.id}
                className={cn(
                  "cursor-pointer border-t border-slate-100 hover:bg-slate-50",
                  mover.busyId === order.id && "opacity-50",
                )}
                onClick={() => router.push(`/admin/pedidos/${order.id}`)}
              >
                <td className="px-4 py-3 font-medium text-slate-900">
                  #{orderCode(order.id)}
                </td>
                <td className="max-w-48 truncate px-4 py-3 text-slate-600">
                  {order.customerName || order.customerEmail}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Badge variant={situationVariant(order)}>
                      {situationLabel(order)}
                    </Badge>
                    <OrderFlags order={order} />
                  </div>
                </td>
                <td className="max-w-64 px-4 py-3 text-xs text-slate-600">
                  <span className="line-clamp-2">
                    {order.originStoreIds.map(storeName).join(", ")}
                    <span className="text-slate-400"> → </span>
                    {storeName(order.destinationStoreId)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">
                  {formatBRL(order.totalPaidBRL)}
                </td>
                <td className="px-4 py-3 text-slate-500">{date(order.createdAt)}</td>
                <td className="px-4 py-3 text-slate-500">
                  {order.status === "active" ? date(order.estimatedPickupDate) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <MoveOrderMenu order={order} mover={mover} size="icon" />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

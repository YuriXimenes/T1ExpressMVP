"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AdminError, fetchAdminOrders, type AdminOrderSummary } from "@/lib/admin/api";
import { cn } from "@/lib/utils";

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

const FILTERS: { id: string; label: string; test: (o: AdminOrderSummary) => boolean }[] =
  [
    { id: "todos", label: "Todos", test: () => true },
    {
      id: "pending-payment",
      label: "Aguardando pagamento",
      test: (o) => o.status === "pending-payment",
    },
    {
      id: "aguardando-coleta",
      label: "Aguardando coleta",
      test: (o) => o.status === "active" && o.deliveryStage === "aguardando-coleta",
    },
    {
      id: "em-transporte",
      label: "Em transporte",
      test: (o) => o.status === "active" && o.deliveryStage === "em-transporte",
    },
    {
      id: "disponivel-para-retirada",
      label: "Disponível p/ retirada",
      test: (o) =>
        o.status === "active" && o.deliveryStage === "disponivel-para-retirada",
    },
    { id: "completed", label: "Concluídos", test: (o) => o.status === "completed" },
    { id: "cancelled", label: "Cancelados", test: (o) => o.status === "cancelled" },
  ];

function statusLabel(order: AdminOrderSummary) {
  if (order.status === "pending-payment") return "Aguardando pagamento";
  if (order.status === "completed") return "Concluído";
  if (order.status === "cancelled") return "Cancelado";
  if (order.deliveryStage === "aguardando-coleta") return "Aguardando coleta";
  if (order.deliveryStage === "em-transporte") return "Em transporte";
  if (order.deliveryStage === "disponivel-para-retirada") return "P/ retirada";
  return "Ativo";
}

function statusVariant(
  order: AdminOrderSummary,
): "default" | "secondary" | "destructive" {
  if (order.status === "cancelled") return "destructive";
  if (order.status === "active") return "default";
  return "secondary";
}

export function PedidosAdminView() {
  const router = useRouter();
  const [orders, setOrders] = useState<AdminOrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("todos");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchAdminOrders()
      .then((data) => {
        if (!cancelled) setOrders(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof AdminError
              ? err.message
              : "Não foi possível carregar os pedidos.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!orders) return [];
    const term = search.trim().toLowerCase();
    return orders
      .filter(FILTERS.find((f) => f.id === filter)?.test ?? (() => true))
      .filter(
        (o) =>
          !term ||
          o.id.slice(0, 8).toLowerCase().includes(term) ||
          o.customerEmail.toLowerCase().includes(term),
      );
  }, [orders, filter, search]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Pedidos</h1>
        <Input
          placeholder="Buscar por código ou e-mail"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="sm:w-72"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              filter === f.id
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50",
            )}
          >
            {f.label}
            {orders && ` · ${orders.filter(f.test).length}`}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!orders && !error && <p className="text-sm text-slate-500">Carregando...</p>}

      {orders && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Valor pago</th>
                <th className="px-4 py-2 font-medium">Data</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Nenhum pedido encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr
                    key={order.id}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() => router.push(`/admin/pedidos/${order.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {order.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {order.customerName || order.customerEmail}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={statusVariant(order)}>{statusLabel(order)}</Badge>
                        {order.hasPendingCharge && (
                          <span
                            title="Cobrança de loja extra pendente"
                            className="h-1.5 w-1.5 rounded-full bg-amber-500"
                          />
                        )}
                        {order.hasOpenTicket && (
                          <span
                            title="Chamado em aberto"
                            className="h-1.5 w-1.5 rounded-full bg-red-500"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatBRL(order.totalPaidBRL)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(order.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm">
                        Ver
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

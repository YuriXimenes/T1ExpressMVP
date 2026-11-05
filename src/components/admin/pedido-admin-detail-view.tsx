"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OrderItemsBreakdown } from "@/components/sections/order-items-breakdown";
import { MoveOrderMenu, useOrderMover } from "@/components/admin/pedidos/move-order";
import { OrderTimeline } from "@/components/admin/pedidos/order-timeline";
import { ConferenciaCard } from "@/components/admin/pedidos/conferencia-card";
import { CustodyCard } from "@/components/admin/pedidos/custody-card";
import { LabelCard } from "@/components/admin/pedidos/label-card";
import { OrderRoutesCard } from "@/components/admin/pedidos/order-routes-card";
import { OrderOccurrencesCard } from "@/components/admin/pedidos/order-occurrences-card";
import { useCatalog } from "@/lib/catalog/provider";
import { getOrderStatusLabel } from "@/lib/order-helpers";
import { allowedTargets } from "@/lib/admin/order-moves";
import { useCan } from "@/lib/admin/access-provider";
import { cn } from "@/lib/utils";
import type { OrderEvent } from "@/lib/admin/order-events";
import {
  AdminError,
  fetchAdminOrder,
  fetchOrderEvents,
  fetchOrderHandling,
  setTicketResolved,
  type AdminOrder,
  type OrderHandling,
} from "@/lib/admin/api";

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export function PedidoAdminDetailView({ orderId }: { orderId: string }) {
  const { stores: freightStores, coletaPartners } = useCatalog();
  const [order, setOrder] = useState<AdminOrder | null | undefined>(undefined);
  const [events, setEvents] = useState<OrderEvent[] | null>(null);
  const [handling, setHandling] = useState<OrderHandling | null>(null);
  const [handlingError, setHandlingError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const mover = useOrderMover(load);
  const canAnswerTickets = useCan("chamados", "edit");
  const canMoveOrders = useCan("pedidos", "edit");

  async function load() {
    try {
      const [data, timeline] = await Promise.all([
        fetchAdminOrder(orderId),
        fetchOrderEvents(orderId),
      ]);
      setOrder(data);
      setEvents(timeline);
    } catch (err) {
      setError(
        err instanceof AdminError ? err.message : "Não foi possível carregar o pedido.",
      );
    }
    await loadHandling();
  }

  // Separado do pedido: se a conferência falhar, o resto da tela continua de pé.
  async function loadHandling() {
    try {
      setHandling(await fetchOrderHandling(orderId));
      setHandlingError(null);
    } catch (err) {
      setHandlingError(
        err instanceof AdminError
          ? err.message
          : "Não foi possível carregar conferência e custódia.",
      );
    }
  }

  async function refreshAfterHandling() {
    await loadHandling();
    setEvents(await fetchOrderEvents(orderId));
  }

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function runAction(action: () => Promise<unknown>) {
    if (isWorking) return;
    setIsWorking(true);
    setActionError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setActionError(
        err instanceof AdminError ? err.message : "Não foi possível concluir a ação.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (order === undefined) {
    return <p className="text-sm text-slate-500">Carregando...</p>;
  }
  if (order === null) {
    return (
      <div className="text-center">
        <p className="text-slate-600">Pedido não encontrado.</p>
        <Button size="sm" className="mt-4" asChild>
          <Link href="/admin/pedidos">Voltar para Pedidos</Link>
        </Button>
      </div>
    );
  }

  const origins = freightStores.filter((s) => order.originStoreIds.includes(s.id));
  const originPartners = coletaPartners.filter((p) =>
    order.originStoreIds.includes(p.id),
  );
  const destination = freightStores.find((s) => s.id === order.destinationStoreId);
  const storeName = (code: string) =>
    freightStores.find((s) => s.id === code)?.name ?? code;
  const canMove = allowedTargets(order).length > 0 && canMoveOrders;
  const shownError = actionError ?? mover.error;

  return (
    <div>
      <Button type="button" variant="ghost" asChild className="-ml-2">
        <Link href="/admin/pedidos">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar para Pedidos
        </Link>
      </Button>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-xl font-semibold text-slate-900">
          Pedido #{order.id.slice(0, 8).toUpperCase()}
        </h1>
        <Badge variant={order.status === "cancelled" ? "destructive" : "secondary"}>
          {getOrderStatusLabel(order)}
        </Badge>
      </div>
      <p className="text-sm text-slate-500">
        {order.customerName} · {order.customerEmail} · solicitado em{" "}
        {new Date(order.createdAt).toLocaleDateString("pt-BR")}
      </p>

      {shownError && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {shownError}
        </p>
      )}
      {order.status === "cancelled" && order.cancelReason && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Motivo do cancelamento: {order.cancelReason}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <div className="space-y-4">
          <Card className="gap-3 p-6">
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              Ações
            </p>
            {canMove ? (
              <>
                <MoveOrderMenu order={order} mover={mover} className="self-start" />
                <p className="text-xs text-slate-500">
                  Avançar para a próxima etapa é direto. Voltar, pular etapa, concluir
                  antes da retirada e cancelar pedem motivo, que fica na linha do tempo.
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Pedido finalizado: não há mais mudanças de etapa.
              </p>
            )}
          </Card>

          <Card className="gap-4 p-6">
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              Linha do tempo
            </p>
            {events ? (
              <OrderTimeline events={events} storeName={storeName} />
            ) : (
              <p className="text-sm text-slate-500">Carregando...</p>
            )}
          </Card>

          <Card className="gap-3 p-6">
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              Informações do pedido
            </p>
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                Lojas de coleta
              </p>
              <div className="flex flex-wrap gap-2">
                {origins.map((store) => (
                  <span
                    key={store.id}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700"
                  >
                    {store.name}
                  </span>
                ))}
              </div>
            </div>
            {destination && (
              <div className="space-y-1">
                <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Loja de retirada
                </p>
                <p className="text-sm text-slate-700">{destination.name}</p>
              </div>
            )}
            {order.deliveryNote && (
              <div className="space-y-1">
                <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Observação de entrega
                </p>
                <p className="text-sm text-slate-700">{order.deliveryNote}</p>
              </div>
            )}
          </Card>

          <Card className="gap-2 p-6 text-sm">
            <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
              Valores
            </p>
            <div className="flex justify-between">
              <span className="text-slate-600">Total dos itens (informativo)</span>
              <span className="font-medium text-slate-900">
                {formatBRL(order.itemsTotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Frete T1 (cotado)</span>
              <span className="font-medium text-slate-900">
                {formatBRL(order.quote.priceBRL)}
              </span>
            </div>
            {order.coupon && (
              <div className="flex justify-between">
                <span className="text-slate-600">Cupom {order.coupon.code}</span>
                <span className="font-medium text-emerald-600">
                  -{formatBRL(order.coupon.discountBRL)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-600">Seguro</span>
              <span className="font-medium text-slate-900">
                {order.insurance.extraCoverageOptedIn
                  ? `Adicional (${formatBRL(order.insurance.extraCostBRL)})`
                  : `Básico (${formatBRL(0)})`}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2">
              <span className="font-semibold text-slate-900">Pago no pedido</span>
              <span className="font-bold text-slate-900">
                {formatBRL(order.amountDueBRL)}
              </span>
            </div>
            {order.storeCharges.filter((c) => c.status === "paid").length > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-600">Cobranças de loja extra pagas</span>
                <span className="font-medium text-slate-900">
                  {formatBRL(
                    order.storeCharges
                      .filter((c) => c.status === "paid")
                      .reduce((sum, c) => sum + c.amountBRL, 0),
                  )}
                </span>
              </div>
            )}
            <p className="pt-1 text-xs text-slate-400">
              Concorrentes cotados:{" "}
              {order.quote.competitors.map((c) => c.label).join(", ") || "—"}
            </p>
          </Card>

          {order.supportTickets.length > 0 && (
            <Card className="gap-3 p-6">
              <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                Chamados de suporte
              </p>
              {order.supportTickets.map((ticket) => (
                <div key={ticket.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {ticket.subject}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {new Date(ticket.createdAt).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <Badge variant={ticket.resolved ? "secondary" : "default"}>
                      {ticket.resolved ? "Respondido" : "Pendente"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{ticket.message}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn("mt-2", !canAnswerTickets && "hidden")}
                    disabled={isWorking || !canAnswerTickets}
                    onClick={() =>
                      void runAction(() => setTicketResolved(ticket.id, !ticket.resolved))
                    }
                  >
                    Marcar como {ticket.resolved ? "pendente" : "respondido"}
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {handlingError && <p className="text-sm text-red-600">{handlingError}</p>}
          {handling && (
            <>
              <LabelCard orderId={order.id} handling={handling} />
              <ConferenciaCard
                order={order}
                handling={handling}
                storeName={storeName}
                onChanged={refreshAfterHandling}
              />
              <CustodyCard
                orderId={order.id}
                handling={handling}
                onChanged={refreshAfterHandling}
              />
              <OrderRoutesCard orderId={order.id} refreshKey={handling} />
              <OrderOccurrencesCard orderId={order.id} />
            </>
          )}
          <OrderItemsBreakdown
            originPartners={originPartners}
            ordersByStore={order.ordersByStore}
          />

          {order.storeCharges.length > 0 && (
            <Card className="gap-3 p-6">
              <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                Cobranças de loja extra
              </p>
              {order.storeCharges.map((charge) => (
                <div
                  key={charge.id}
                  className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm first:border-t-0 first:pt-0"
                >
                  <span className="text-slate-600">
                    {charge.storeIds
                      .map(
                        (code) => freightStores.find((s) => s.id === code)?.name ?? code,
                      )
                      .join(", ")}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant={charge.status === "paid" ? "secondary" : "default"}>
                      {charge.status === "paid" ? "Paga" : "Pendente"}
                    </Badge>
                    <span className="font-medium text-slate-900">
                      {formatBRL(charge.amountBRL)}
                    </span>
                  </span>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
      {mover.dialog}
    </div>
  );
}

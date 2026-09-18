"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LifeBuoy, Plus, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { OrderStatusTracker } from "@/components/sections/order-status-tracker";
import { OrderItemsBreakdown } from "@/components/sections/order-items-breakdown";
import { StoreOrderBuilder } from "@/components/sections/store-order-builder";
import { AddStoreFlow } from "@/components/sections/add-store-flow";
import { FreightStorePickerDialog } from "@/components/shared/freight-store-picker-dialog";
import { InfoTooltip } from "@/components/shared/info-tooltip";
import { useAuth } from "@/lib/auth";
import { useMockOrders } from "@/lib/mock-orders";
import { makePedidoGroup, computeTotalPaidBRL } from "@/lib/order-helpers";
import { EXTRA_ORIGIN_STORE_FEE_BRL } from "@/lib/data/freight-simulation";
import { useCatalog } from "@/lib/catalog/provider";
import { cn } from "@/lib/utils";
import type { PedidoGroup } from "@/lib/types/order";

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export function OrderDetailView({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { isLoggedIn, isReady } = useAuth();
  const { orders, markCompleted, addGroupToStore, addTicket } = useMockOrders();
  const { stores: freightStores, coletaPartners } = useCatalog();
  const order = orders.find((candidate) => candidate.id === orderId);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [newStoreIds, setNewStoreIds] = useState<string[] | null>(null);
  const [addingStoreId, setAddingStoreId] = useState<string | null>(null);
  const [draftGroups, setDraftGroups] = useState<PedidoGroup[]>([]);
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");

  useEffect(() => {
    if (isReady && !isLoggedIn) router.replace(`/login?next=%2Fpedidos%2F${orderId}`);
  }, [isReady, isLoggedIn, orderId, router]);

  if (!isLoggedIn) return null;

  if (!order) {
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-bold text-slate-900">Pedido não encontrado</h1>
        <p className="mt-2 text-slate-600">Não encontramos esse pedido na sua conta.</p>
        <Button size="lg" className="mt-6" asChild>
          <Link href="/conta">Voltar para Minha conta</Link>
        </Button>
      </div>
    );
  }

  if (newStoreIds) {
    return (
      <AddStoreFlow
        order={order}
        newStoreIds={newStoreIds}
        onCancel={() => setNewStoreIds(null)}
      />
    );
  }

  const origins = freightStores.filter((store) =>
    order.originStoreIds.includes(store.id),
  );
  const originPartners = coletaPartners.filter((partner) =>
    order.originStoreIds.includes(partner.id),
  );
  const destination = freightStores.find(
    (store) => store.id === order.destinationStoreId,
  );
  const pendingCharge = order.storeCharges.find(
    (charge) => charge.status === "pending-payment",
  );
  const paidCharges = order.storeCharges.filter((charge) => charge.status === "paid");
  const requestedDate = new Date(order.createdAt).toLocaleDateString("pt-BR");
  const availableStores = freightStores.filter(
    (store) =>
      !order.originStoreIds.includes(store.id) && store.id !== order.destinationStoreId,
  );
  const canModifyOrder =
    order.status === "pending-payment" ||
    (order.status === "active" && order.deliveryStage === "aguardando-coleta");
  const insuranceLabel = order.insurance.extraCoverageOptedIn
    ? `Adicional (${formatBRL(order.insurance.extraCostBRL)})`
    : `Básico (${formatBRL(0)})`;

  function startAddingPedido(storeId: string) {
    setAddingStoreId(storeId);
    setDraftGroups([makePedidoGroup()]);
  }

  function cancelAddingPedido() {
    setAddingStoreId(null);
    setDraftGroups([]);
  }

  function saveAddingPedido() {
    if (!addingStoreId) return;
    for (const group of draftGroups) {
      addGroupToStore(order!.id, addingStoreId, group);
    }
    cancelAddingPedido();
  }

  function handleAddStores(ids: string[]) {
    if (ids.length === 0) return;
    setNewStoreIds(ids);
  }

  function handleOpenTicket() {
    if (!ticketSubject.trim() || !ticketMessage.trim()) return;
    addTicket(order!.id, {
      id: crypto.randomUUID(),
      subject: ticketSubject.trim(),
      message: ticketMessage.trim(),
      createdAt: new Date().toISOString(),
    });
    setTicketSubject("");
    setTicketMessage("");
    setTicketDialogOpen(false);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Button type="button" variant="ghost" asChild className="-ml-2">
        <Link href="/conta">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar para Minha conta
        </Link>
      </Button>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-2xl font-bold text-slate-900">
          Pedido #{order.id.slice(0, 8).toUpperCase()}
        </h1>
        <p className="text-slate-600">Solicitado em {requestedDate}</p>
      </div>

      {pendingCharge && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">
            Cobrança pendente: {formatBRL(pendingCharge.amountBRL)}
          </p>
          <p className="mt-1 text-sm text-amber-700">
            Pague para liberar a coleta na{pendingCharge.storeIds.length > 1 ? "s" : ""}{" "}
            loja
            {pendingCharge.storeIds.length > 1 ? "s" : ""} adicionada
            {pendingCharge.storeIds.length > 1 ? "s" : ""}.
          </p>
          <Button size="sm" className="mt-3" asChild>
            <Link href={`/pagamento?order=${order.id}&extraCharge=${pendingCharge.id}`}>
              Pagar agora
            </Link>
          </Button>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <div className="space-y-4">
          <OrderStatusTracker
            order={order}
            onMarkCompleted={() => markCompleted(order!.id)}
          />

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
                    className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pr-3 pl-1.5 text-sm font-medium text-slate-700"
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full",
                        store.logoOnDark && "bg-slate-900",
                      )}
                    >
                      <Image
                        src={store.logo}
                        alt=""
                        width={24}
                        height={24}
                        className="h-full w-full object-contain"
                      />
                    </span>
                    {store.name}
                  </span>
                ))}
              </div>
            </div>

            {destination && (
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Loja de retirada
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full",
                      destination.logoOnDark && "bg-slate-900",
                    )}
                  >
                    <Image
                      src={destination.logo}
                      alt=""
                      width={32}
                      height={32}
                      className="h-full w-full object-contain"
                    />
                  </span>
                  <span className="font-medium text-slate-900">{destination.name}</span>
                </div>
              </div>
            )}

            {order.deliveryNote && (
              <div className="space-y-1 border-t border-slate-100 pt-4">
                <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Observação de entrega
                </p>
                <p className="text-sm text-slate-700">{order.deliveryNote}</p>
              </div>
            )}
          </Card>

          <Card className="gap-3 p-6">
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              Valores
            </p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Total dos itens (informativo)</span>
              <span className="font-medium text-slate-900">
                {formatBRL(order.itemsTotal)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Frete pago</span>
              <span className="font-medium text-slate-900">
                {formatBRL(order.amountDueBRL)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-slate-600">
                Seguro
                <InfoTooltip label="Sobre a cobertura do seguro">
                  Cobre até {formatBRL(order.insurance.coverageAmountBRL)} do valor total
                  dos itens.
                </InfoTooltip>
              </span>
              <span className="font-medium text-slate-900">{insuranceLabel}</span>
            </div>
            {order.coupon && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Cupom</span>
                <span className="font-medium text-slate-900">
                  {order.coupon.code} (
                  {order.coupon.type === "percent"
                    ? `${order.coupon.value}%`
                    : formatBRL(order.coupon.discountBRL)}
                  )
                </span>
              </div>
            )}
            {paidCharges.map((charge) => (
              <div key={charge.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  Lojas adicionadas (
                  {freightStores
                    .filter((store) => charge.storeIds.includes(store.id))
                    .map((store) => store.name)
                    .join(", ")}
                  )
                </span>
                <span className="font-medium text-slate-900">
                  {formatBRL(charge.amountBRL)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-base">
              <span className="font-semibold text-slate-900">Total pago no pedido</span>
              <span className="text-brand-700 font-bold">
                {formatBRL(computeTotalPaidBRL(order))}
              </span>
            </div>
          </Card>

          <Card className="gap-3 p-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 font-semibold text-slate-900">
                  <LifeBuoy className="text-brand-600 h-4 w-4" aria-hidden="true" />
                  Precisa de ajuda?
                </p>
                <p className="text-sm text-slate-600">
                  Abra um chamado e nosso suporte entra em contato.
                </p>
              </div>
              <Dialog open={ticketDialogOpen} onOpenChange={setTicketDialogOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="shrink-0">
                    Abrir chamado
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Abrir chamado de suporte</DialogTitle>
                    <DialogDescription>
                      Conte o que aconteceu com o pedido #
                      {order.id.slice(0, 8).toUpperCase()}.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="ticket-subject">Assunto</Label>
                      <Input
                        id="ticket-subject"
                        value={ticketSubject}
                        onChange={(event) => setTicketSubject(event.target.value)}
                        placeholder="Ex.: Atraso na coleta"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ticket-message">Mensagem</Label>
                      <Textarea
                        id="ticket-message"
                        rows={4}
                        value={ticketMessage}
                        onChange={(event) => setTicketMessage(event.target.value)}
                        placeholder="Descreva o problema..."
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      onClick={handleOpenTicket}
                      disabled={!ticketSubject.trim() || !ticketMessage.trim()}
                    >
                      Enviar chamado
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {order.supportTickets.length > 0 && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                {[...order.supportTickets].reverse().map((ticket) => (
                  <div key={ticket.id} className="rounded-lg bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">
                        {ticket.subject}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(ticket.createdAt).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{ticket.message}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <OrderItemsBreakdown
            originPartners={originPartners}
            ordersByStore={order.ordersByStore}
            renderStoreFooter={
              canModifyOrder
                ? (partner) =>
                    addingStoreId === partner.id ? (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-slate-900">
                          Novo pedido em {partner.name}
                        </p>
                        <StoreOrderBuilder
                          groups={draftGroups}
                          onChange={setDraftGroups}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveAddingPedido}>
                            Salvar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelAddingPedido}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => startAddingPedido(partner.id)}
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Adicionar pedido em {partner.name}
                      </Button>
                    )
                : undefined
            }
            footer={
              canModifyOrder ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPickerOpen(true)}
                >
                  <Store className="h-4 w-4" aria-hidden="true" />
                  Adicionar nova loja de coleta
                </Button>
              ) : undefined
            }
          />
          <FreightStorePickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            stores={availableStores}
            selectedIds={[]}
            onConfirm={handleAddStores}
            title="Adicionar loja de coleta"
            description={`Cada loja nova adicionada ao pedido tem uma cobrança de ${formatBRL(EXTRA_ORIGIN_STORE_FEE_BRL)}.`}
          />
        </div>
      </div>
    </div>
  );
}

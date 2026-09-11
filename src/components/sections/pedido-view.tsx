"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PedidoStoreRow } from "@/components/sections/pedido-store-row";
import { PedidoSummary } from "@/components/sections/pedido-summary";
import {
  StoreOrderBuilder,
  makePedidoGroup,
  orderGroupTotal,
} from "@/components/sections/store-order-builder";
import { useAuth } from "@/lib/auth";
import { usePendingOrder, clearPendingOrder } from "@/lib/pending-order";
import { createMockOrder } from "@/lib/mock-orders";
import { computeInsuranceInfo, BASE_INSURANCE_COVERAGE_BRL } from "@/lib/insurance";
import { applyCoupon, type CouponResult } from "@/lib/data/coupons";
import { freightStores } from "@/lib/data/freight-stores";
import { coletaPartners } from "@/lib/data/coleta-partners";
import { cn } from "@/lib/utils";
import type { PedidoGroup } from "@/lib/types/order";
import type { MockOrder } from "@/lib/types/mock-order";

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export function PedidoView() {
  const router = useRouter();
  const { isLoggedIn, user } = useAuth();
  const order = usePendingOrder();

  const origins = order
    ? freightStores.filter((store) => order.originStoreIds.includes(store.id))
    : [];
  const originPartners = order
    ? coletaPartners.filter((partner) => order.originStoreIds.includes(partner.id))
    : [];
  const destination = order
    ? freightStores.find((store) => store.id === order.destinationStoreId)
    : undefined;

  const [ordersByStore, setOrdersByStore] = useState<Record<string, PedidoGroup[]>>({});
  const [seededOrigins, setSeededOrigins] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [insuranceOptedIn, setInsuranceOptedIn] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponResult | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const originsKey = origins.map((store) => store.id).join(",");
  if (originsKey && seededOrigins !== originsKey) {
    setSeededOrigins(originsKey);
    setOrdersByStore((prev) => {
      const next = { ...prev };
      for (const store of origins) {
        if (!next[store.id]) next[store.id] = [makePedidoGroup()];
      }
      return next;
    });
    if (!selectedStoreId || !origins.some((store) => store.id === selectedStoreId)) {
      setSelectedStoreId(origins[0]?.id ?? null);
    }
  }

  useEffect(() => {
    if (!isLoggedIn) router.replace("/login?next=%2Fpedido");
  }, [isLoggedIn, router]);

  if (!isLoggedIn) return null;

  if (!order) {
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-bold text-slate-900">
          Nenhuma simulação em andamento
        </h1>
        <p className="mt-2 text-slate-600">
          Simule um frete primeiro pra começar a criação do pedido.
        </p>
        <Button size="lg" className="mt-6" asChild>
          <Link href="/simular-frete">Simular frete</Link>
        </Button>
      </div>
    );
  }

  const itemsTotal = origins.reduce((sum, store) => {
    const groups = ordersByStore[store.id] ?? [];
    return sum + groups.reduce((groupSum, group) => groupSum + orderGroupTotal(group), 0);
  }, 0);
  const insuranceInfo = computeInsuranceInfo(itemsTotal);
  const insuranceExtraCostBRL = insuranceOptedIn ? insuranceInfo.extraCostBRL : 0;
  const freightAfterDiscountBRL = Math.max(
    order.quote.priceBRL - (appliedCoupon?.discountBRL ?? 0),
    0,
  );
  const amountDueBRL = freightAfterDiscountBRL + insuranceExtraCostBRL;
  const selectedStore = originPartners.find((partner) => partner.id === selectedStoreId);

  function handleApplyCoupon() {
    const result = applyCoupon(couponCode, order!.quote.priceBRL);
    if (!result) {
      setAppliedCoupon(null);
      setCouponError("Cupom inválido.");
      return;
    }
    setAppliedCoupon(result);
    setCouponError(null);
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError(null);
  }

  function handleConfirm() {
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const newOrder: MockOrder = {
      id,
      createdAt: nowIso,
      status: "pending-payment",
      originStoreIds: order!.originStoreIds,
      destinationStoreId: order!.destinationStoreId,
      ordersByStore,
      deliveryNote,
      quote: order!.quote,
      itemsTotal,
      insurance: {
        extraCoverageOptedIn: insuranceOptedIn,
        coverageAmountBRL: insuranceOptedIn
          ? insuranceInfo.coverageNeededBRL
          : BASE_INSURANCE_COVERAGE_BRL,
        extraCostBRL: insuranceExtraCostBRL,
      },
      coupon: appliedCoupon
        ? {
            code: appliedCoupon.coupon.code,
            type: appliedCoupon.coupon.type,
            value: appliedCoupon.coupon.value,
            discountBRL: appliedCoupon.discountBRL,
          }
        : undefined,
      freightAfterDiscountBRL,
      amountDueBRL,
      storeCharges: [],
      supportTickets: [],
    };
    createMockOrder(newOrder);
    clearPendingOrder();
    router.push(`/pagamento?order=${id}`);
  }

  if (showSummary) {
    return (
      <PedidoSummary
        originPartners={originPartners}
        ordersByStore={ordersByStore}
        deliveryNote={deliveryNote}
        onDeliveryNoteChange={setDeliveryNote}
        destinationName={destination?.name}
        freightPriceBRL={order.quote.priceBRL}
        freightDaysLabel={`${order.quote.estimatedDaysMin} dias úteis`}
        itemsTotal={itemsTotal}
        insuranceOptedIn={insuranceOptedIn}
        onInsuranceOptedInChange={setInsuranceOptedIn}
        insuranceExtraCostBRL={insuranceExtraCostBRL}
        couponCode={couponCode}
        onCouponCodeChange={setCouponCode}
        appliedCoupon={appliedCoupon}
        couponError={couponError}
        onApplyCoupon={handleApplyCoupon}
        onRemoveCoupon={handleRemoveCoupon}
        amountDueBRL={amountDueBRL}
        onBack={() => setShowSummary(false)}
        onConfirm={handleConfirm}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-900">
        {user ? `Olá, ${user.name}` : "Seu pedido"}
      </h1>
      <p className="mt-1 text-slate-600">
        Liste abaixo o que deve ser recolhido em cada loja antes de confirmar o pedido.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[40%_60%] lg:items-start">
        <div className="space-y-4">
          <Card className="gap-4 p-6">
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              Resumo do pedido
            </p>

            <div className="space-y-3">
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

            <div className="bg-brand-50 relative overflow-hidden rounded-lg px-4 py-3">
              <PackageCheck
                className="text-brand-600 pointer-events-none absolute top-1/2 right-3 h-24 w-24 -translate-y-1/2 opacity-20"
                strokeWidth={1.25}
                aria-hidden="true"
              />
              <div className="relative z-10">
                <p className="text-brand-700 text-xs font-medium uppercase">Frete T1</p>
                <p className="text-lg font-bold text-slate-900">
                  {formatBRL(order.quote.priceBRL)}
                </p>
                <p className="text-sm text-slate-600">
                  {order.quote.estimatedDaysMin} dias úteis
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <Button size="lg" className="w-full" onClick={() => setShowSummary(true)}>
                Finalizar
              </Button>
            </div>
          </Card>

          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
              Selecione a loja para montar o pedido
            </p>
            <div className="flex flex-col gap-3">
              {originPartners.map((partner) => (
                <PedidoStoreRow
                  key={partner.id}
                  partner={partner}
                  isSelected={partner.id === selectedStoreId}
                  onSelect={() => setSelectedStoreId(partner.id)}
                  groups={ordersByStore[partner.id] ?? []}
                />
              ))}
            </div>
          </div>
        </div>

        {selectedStore && (
          <Card className="gap-4 p-6">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full",
                  selectedStore.onDark && "bg-slate-900",
                )}
              >
                <Image
                  src={selectedStore.logo}
                  alt=""
                  width={32}
                  height={32}
                  className="h-full w-full object-contain"
                />
              </span>
              <h2 className="font-semibold text-slate-900">{selectedStore.name}</h2>
            </div>

            <StoreOrderBuilder
              groups={ordersByStore[selectedStore.id] ?? []}
              onChange={(groups) =>
                setOrdersByStore((prev) => ({ ...prev, [selectedStore.id]: groups }))
              }
            />
          </Card>
        )}
      </div>
    </div>
  );
}

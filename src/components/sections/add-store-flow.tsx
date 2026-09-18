"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OrderItemsBreakdown } from "@/components/sections/order-items-breakdown";
import { InsuranceTierCard } from "@/components/sections/insurance-tier-card";
import {
  StoreOrderBuilder,
  orderGroupTotal,
} from "@/components/sections/store-order-builder";
import { useMockOrders } from "@/lib/mock-orders";
import { makePedidoGroup } from "@/lib/order-helpers";
import { computeInsuranceInfo } from "@/lib/insurance";
import { EXTRA_ORIGIN_STORE_FEE_BRL } from "@/lib/data/freight-simulation";
import { useCatalog } from "@/lib/catalog/provider";
import { cn } from "@/lib/utils";
import type { PedidoGroup } from "@/lib/types/order";
import type { MockOrder } from "@/lib/types/mock-order";

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export function AddStoreFlow({
  order,
  newStoreIds,
  onCancel,
}: {
  order: MockOrder;
  newStoreIds: string[];
  onCancel: () => void;
}) {
  const router = useRouter();
  const { addStore } = useMockOrders();
  const { coletaPartners } = useCatalog();
  const newPartners = coletaPartners.filter((partner) =>
    newStoreIds.includes(partner.id),
  );

  const [draftOrdersByStore, setDraftOrdersByStore] = useState<
    Record<string, PedidoGroup[]>
  >(() => Object.fromEntries(newStoreIds.map((id) => [id, [makePedidoGroup()]])));
  const [showSummary, setShowSummary] = useState(false);
  const [insuranceOptedIn, setInsuranceOptedIn] = useState(false);

  const addedItemsTotal = newStoreIds.reduce((sum, storeId) => {
    const groups = draftOrdersByStore[storeId] ?? [];
    return sum + groups.reduce((groupSum, group) => groupSum + orderGroupTotal(group), 0);
  }, 0);
  const previousItemsTotal = order.itemsTotal;
  const newItemsTotal = previousItemsTotal + addedItemsTotal;
  const newInsuranceInfo = computeInsuranceInfo(newItemsTotal);
  const needsInsuranceUpgrade =
    newInsuranceInfo.coverageNeededBRL > order.insurance.coverageAmountBRL;
  const insuranceUpgradeCostBRL = insuranceOptedIn
    ? Math.max(0, newInsuranceInfo.extraCostBRL - order.insurance.extraCostBRL)
    : 0;
  const storeFeeBRL = EXTRA_ORIGIN_STORE_FEE_BRL * newStoreIds.length;
  const amountDueBRL = storeFeeBRL + insuranceUpgradeCostBRL;

  function handleConfirm() {
    const chargeId = addStore(order.id, {
      storeIds: newStoreIds,
      draftOrdersByStore,
      itemsTotalAdded: addedItemsTotal,
      amountBRL: amountDueBRL,
      insuranceUpgrade:
        needsInsuranceUpgrade && insuranceOptedIn
          ? {
              coverageAmountBRL: newInsuranceInfo.coverageNeededBRL,
              extraCostBRL: newInsuranceInfo.extraCostBRL,
            }
          : undefined,
    });
    router.push(`/pagamento?order=${order.id}&extraCharge=${chargeId}`);
  }

  if (showSummary) {
    return (
      <div className="mx-auto max-w-2xl">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowSummary(false)}
          className="-ml-2"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar e editar
        </Button>

        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Confira a{newPartners.length > 1 ? "s novas lojas" : " nova loja"}
        </h1>
        <p className="mt-1 text-slate-600">
          Revise os itens e o valor antes de seguir para o pagamento.
        </p>

        <div className="mt-6">
          <OrderItemsBreakdown
            originPartners={newPartners}
            ordersByStore={draftOrdersByStore}
          />
        </div>

        <Card className="mt-4 gap-3 p-6">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Total dos itens do pedido
          </p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Antes desta adição</span>
            <span className="font-medium text-slate-900">
              {formatBRL(previousItemsTotal)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Depois desta adição</span>
            <span className="font-medium text-slate-900">{formatBRL(newItemsTotal)}</span>
          </div>
        </Card>

        {needsInsuranceUpgrade && (
          <div className="mt-4">
            <InsuranceTierCard
              itemsTotal={newItemsTotal}
              currentCoverageAmountBRL={order.insurance.coverageAmountBRL}
              currentExtraCostBRL={order.insurance.extraCostBRL}
              optedIn={insuranceOptedIn}
              onOptedInChange={setInsuranceOptedIn}
            />
          </div>
        )}

        <Card className="mt-4 gap-3 p-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">
              Taxa da{newStoreIds.length > 1 ? "s novas lojas" : " nova loja"}
            </span>
            <span className="font-medium text-slate-900">{formatBRL(storeFeeBRL)}</span>
          </div>
          {insuranceOptedIn && insuranceUpgradeCostBRL > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Upgrade de seguro</span>
              <span className="font-medium text-slate-900">
                +{formatBRL(insuranceUpgradeCostBRL)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-base">
            <span className="font-semibold text-slate-900">Total a pagar agora</span>
            <span className="text-brand-700 font-bold">{formatBRL(amountDueBRL)}</span>
          </div>

          <Button size="lg" className="mt-2 w-full" onClick={handleConfirm}>
            Ir para pagamento
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Button type="button" variant="ghost" onClick={onCancel} className="-ml-2">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Cancelar
      </Button>

      <h1 className="mt-2 text-2xl font-bold text-slate-900">
        Adicionar {newPartners.length > 1 ? "novas lojas de coleta" : "loja de coleta"}
      </h1>
      <p className="mt-1 text-slate-600">
        Informe o que será coletado nessa{newPartners.length > 1 ? "s lojas" : " loja"}.
      </p>

      <div className="mt-6 space-y-4">
        {newPartners.map((partner) => (
          <Card key={partner.id} className="gap-4 p-6">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full",
                  partner.onDark && "bg-slate-900",
                )}
              >
                <Image
                  src={partner.logo}
                  alt=""
                  width={32}
                  height={32}
                  className="h-full w-full object-contain"
                />
              </span>
              <h2 className="font-semibold text-slate-900">{partner.name}</h2>
            </div>

            <StoreOrderBuilder
              groups={draftOrdersByStore[partner.id] ?? []}
              onChange={(groups) =>
                setDraftOrdersByStore((prev) => ({ ...prev, [partner.id]: groups }))
              }
            />
          </Card>
        ))}
      </div>

      <Button size="lg" className="mt-4 w-full" onClick={() => setShowSummary(true)}>
        Continuar
      </Button>
    </div>
  );
}

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OrderItemsBreakdown } from "@/components/sections/order-items-breakdown";
import { InsuranceTierCard } from "@/components/sections/insurance-tier-card";
import { BASE_INSURANCE_COVERAGE_BRL } from "@/lib/insurance";
import type { PickupPartner } from "@/lib/types/pickup-partner";
import type { PedidoGroup } from "@/lib/types/order";
import type { CouponResult } from "@/lib/data/coupons";

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export function PedidoSummary({
  originPartners,
  ordersByStore,
  deliveryNote,
  onDeliveryNoteChange,
  destinationName,
  freightPriceBRL,
  freightDaysLabel,
  itemsTotal,
  insuranceOptedIn,
  onInsuranceOptedInChange,
  insuranceExtraCostBRL,
  couponCode,
  onCouponCodeChange,
  appliedCoupon,
  couponError,
  onApplyCoupon,
  onRemoveCoupon,
  amountDueBRL,
  onBack,
  onConfirm,
}: {
  originPartners: PickupPartner[];
  ordersByStore: Record<string, PedidoGroup[]>;
  deliveryNote: string;
  onDeliveryNoteChange: (value: string) => void;
  destinationName?: string;
  freightPriceBRL: number;
  freightDaysLabel: string;
  itemsTotal: number;
  insuranceOptedIn: boolean;
  onInsuranceOptedInChange: (value: boolean) => void;
  insuranceExtraCostBRL: number;
  couponCode: string;
  onCouponCodeChange: (value: string) => void;
  appliedCoupon: CouponResult | null;
  couponError: string | null;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
  amountDueBRL: number;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <Button type="button" variant="ghost" onClick={onBack} className="-ml-2">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar e editar
      </Button>

      <h1 className="mt-2 text-2xl font-bold text-slate-900">Confira seu pedido</h1>
      <p className="mt-1 text-slate-600">
        Revise tudo antes de enviar — depois disso não será possível editar por aqui.
      </p>

      <div className="mt-6">
        <OrderItemsBreakdown
          originPartners={originPartners}
          ordersByStore={ordersByStore}
        />
      </div>

      <Card className="mt-4 gap-2 p-6">
        <Label htmlFor="delivery-note">Observação para entrega</Label>
        <Textarea
          id="delivery-note"
          rows={3}
          value={deliveryNote}
          onChange={(event) => onDeliveryNoteChange(event.target.value)}
          placeholder="Ex.: entregar no período da tarde, portaria 24h, etc. (opcional)"
        />
      </Card>

      <div className="mt-4">
        <InsuranceTierCard
          itemsTotal={itemsTotal}
          currentCoverageAmountBRL={BASE_INSURANCE_COVERAGE_BRL}
          currentExtraCostBRL={0}
          optedIn={insuranceOptedIn}
          onOptedInChange={onInsuranceOptedInChange}
        />
      </div>

      <Card className="mt-4 gap-3 p-6">
        {destinationName && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Loja de retirada</span>
            <span className="font-medium text-slate-900">{destinationName}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">Total dos itens (informativo)</span>
          <span className="font-medium text-slate-900">{formatBRL(itemsTotal)}</span>
        </div>

        <div className="border-t border-slate-100 pt-3">
          {appliedCoupon ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                Cupom{" "}
                <span className="font-medium text-slate-900">
                  {appliedCoupon.coupon.code}
                </span>{" "}
                aplicado
              </span>
              <button
                type="button"
                onClick={onRemoveCoupon}
                className="text-brand-600 text-xs font-medium hover:underline"
              >
                Remover
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={couponCode}
                onChange={(event) => onCouponCodeChange(event.target.value)}
                placeholder="Cupom de desconto"
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={onApplyCoupon}>
                Aplicar
              </Button>
            </div>
          )}
          {couponError && <p className="mt-1.5 text-sm text-red-600">{couponError}</p>}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">Valor da entrega ({freightDaysLabel})</span>
          <span className="font-medium text-slate-900">{formatBRL(freightPriceBRL)}</span>
        </div>
        {appliedCoupon && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Desconto do cupom</span>
            <span className="font-medium text-emerald-600">
              -{formatBRL(appliedCoupon.discountBRL)}
            </span>
          </div>
        )}
        {insuranceOptedIn && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Seguro adicional</span>
            <span className="font-medium text-slate-900">
              +{formatBRL(insuranceExtraCostBRL)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-base">
          <span className="font-semibold text-slate-900">Total a pagar</span>
          <span className="text-brand-700 font-bold">{formatBRL(amountDueBRL)}</span>
        </div>

        <Button size="lg" className="mt-2 w-full" onClick={onConfirm}>
          Realizar pedido
        </Button>
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PaymentMethodPanel } from "@/components/shared/payment-method-panel";
import { useAuth } from "@/lib/auth";
import { useMockOrders } from "@/lib/mock-orders";
import { freightStores } from "@/lib/data/freight-stores";
import { EXTRA_ORIGIN_STORE_FEE_BRL } from "@/lib/data/freight-simulation";
import type { PaymentMethod } from "@/lib/types/mock-order";

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function NoticeScreen({
  title,
  description,
  showCheck,
}: {
  title: string;
  description: string;
  showCheck?: boolean;
}) {
  return (
    <div className="mx-auto max-w-md text-center">
      {showCheck && (
        <span className="bg-brand-50 mx-auto flex h-12 w-12 items-center justify-center rounded-full">
          <Check className="text-brand-600 h-6 w-6" aria-hidden="true" />
        </span>
      )}
      <h1 className="mt-4 text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mt-2 text-slate-600">{description}</p>
      <Button size="lg" className="mt-6" asChild>
        <Link href="/conta">Ir para Minha conta</Link>
      </Button>
    </div>
  );
}

export function PagamentoView({
  orderId,
  extraChargeId,
}: {
  orderId: string | null;
  extraChargeId: string | null;
}) {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const { orders, markActive, resolveCharge } = useMockOrders();
  const order = orderId
    ? orders.find((candidate) => candidate.id === orderId)
    : undefined;
  const charge = extraChargeId
    ? order?.storeCharges.find((candidate) => candidate.id === extraChargeId)
    : undefined;

  const [processing, setProcessing] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) router.replace("/login?next=%2Fpagamento");
  }, [isLoggedIn, router]);

  useEffect(() => {
    if (!succeeded) return;
    const target = extraChargeId ? `/pedidos/${orderId}` : "/conta";
    const timeout = setTimeout(() => router.push(target), 1500);
    return () => clearTimeout(timeout);
  }, [succeeded, extraChargeId, orderId, router]);

  if (!isLoggedIn) return null;

  if (!order) {
    return (
      <NoticeScreen
        title="Pedido não encontrado"
        description="Não encontramos esse pedido. Ele pode já ter sido pago ou o link está incorreto."
      />
    );
  }

  if (extraChargeId) {
    if (!charge || charge.status !== "pending-payment") {
      return (
        <NoticeScreen
          title="Cobrança não encontrada"
          description="Essa cobrança já foi paga ou o link está incorreto."
          showCheck={!!charge}
        />
      );
    }

    const newStores = freightStores.filter((store) => charge.storeIds.includes(store.id));
    const pixCode = `00020126T1EXPRESS-CHARGE-${charge.id}5204000053039865802BR5913T1 Express6009RIODEJANEIRO`;

    const handlePay = (method: PaymentMethod) => {
      setProcessing(true);
      setTimeout(() => {
        resolveCharge(order.id, charge.id, method);
        setProcessing(false);
        setSucceeded(true);
      }, 1200);
    };

    if (succeeded) {
      return (
        <div className="mx-auto max-w-md text-center">
          <span className="bg-brand-50 mx-auto flex h-12 w-12 items-center justify-center rounded-full">
            <Check className="text-brand-600 h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Pagamento aprovado!</h1>
          <p className="mt-2 text-slate-600">Redirecionando para o pedido...</p>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold text-slate-900">Pagamento</h1>
        <p className="mt-1 text-slate-600">
          Cobrança pela{newStores.length > 1 ? "s" : ""} nova
          {newStores.length > 1 ? "s" : ""} loja{newStores.length > 1 ? "s" : ""} de
          coleta adicionada
          {newStores.length > 1 ? "s" : ""} ao pedido.
        </p>

        <Card className="mt-6 gap-3 p-6">
          <div className="text-sm text-slate-600">
            {newStores.map((store) => store.name).join(", ")}
          </div>
          {charge.insuranceUpgrade && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                Seguro (cobertura de{" "}
                {formatBRL(charge.insuranceUpgrade.coverageAmountBRL)})
              </span>
              <span className="font-medium text-slate-900">
                +
                {formatBRL(
                  charge.amountBRL - EXTRA_ORIGIN_STORE_FEE_BRL * charge.storeIds.length,
                )}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-base">
            <span className="font-semibold text-slate-900">Total a pagar</span>
            <span className="text-brand-700 font-bold">
              {formatBRL(charge.amountBRL)}
            </span>
          </div>
        </Card>

        <PaymentMethodPanel pixCode={pixCode} processing={processing} onPay={handlePay} />
      </div>
    );
  }

  if (order.status !== "pending-payment") {
    return (
      <NoticeScreen
        title="Esse pedido já foi pago"
        description="Acompanhe o andamento em Minha conta."
        showCheck
      />
    );
  }

  const destination = freightStores.find(
    (store) => store.id === order.destinationStoreId,
  );
  const pixCode = `00020126T1EXPRESS-PEDIDO-${order.id}5204000053039865802BR5913T1 Express6009RIODEJANEIRO`;

  const handlePay = (method: PaymentMethod) => {
    setProcessing(true);
    setTimeout(() => {
      markActive(order.id, method);
      setProcessing(false);
      setSucceeded(true);
    }, 1200);
  };

  if (succeeded) {
    return (
      <div className="mx-auto max-w-md text-center">
        <span className="bg-brand-50 mx-auto flex h-12 w-12 items-center justify-center rounded-full">
          <Check className="text-brand-600 h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Pagamento aprovado!</h1>
        <p className="mt-2 text-slate-600">Redirecionando para Minha conta...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold text-slate-900">Pagamento</h1>
      <p className="mt-1 text-slate-600">
        Falta só o pagamento do frete pra confirmar seu pedido.
      </p>

      <Card className="mt-6 gap-3 p-6">
        {destination && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Loja de retirada</span>
            <span className="font-medium text-slate-900">{destination.name}</span>
          </div>
        )}
        {order.insurance.extraCoverageOptedIn && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Seguro adicional</span>
            <span className="font-medium text-slate-900">
              +{formatBRL(order.insurance.extraCostBRL)}
            </span>
          </div>
        )}
        {order.coupon && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Cupom {order.coupon.code}</span>
            <span className="font-medium text-emerald-600">
              -{formatBRL(order.coupon.discountBRL)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-base">
          <span className="font-semibold text-slate-900">Total a pagar</span>
          <span className="text-brand-700 font-bold">
            {formatBRL(order.amountDueBRL)}
          </span>
        </div>
      </Card>

      <PaymentMethodPanel pixCode={pixCode} processing={processing} onPay={handlePay} />
    </div>
  );
}

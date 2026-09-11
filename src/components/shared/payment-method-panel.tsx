"use client";

import { useState } from "react";
import { CreditCard, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/types/mock-order";

export function PaymentMethodPanel({
  pixCode,
  processing,
  onPay,
}: {
  pixCode: string;
  processing: boolean;
  onPay: (method: PaymentMethod) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("pix");

  return (
    <>
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          aria-pressed={method === "pix"}
          onClick={() => setMethod("pix")}
          className={cn(
            "flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border-2 text-sm font-bold transition-colors",
            method === "pix"
              ? "!border-brand-700 !bg-brand-600 !text-white !shadow-lg"
              : "border-transparent !bg-slate-100 !text-slate-500 hover:!text-slate-800",
          )}
        >
          <QrCode className="h-4 w-4" aria-hidden="true" />
          Pix
        </button>
        <button
          type="button"
          aria-pressed={method === "credit-card"}
          onClick={() => setMethod("credit-card")}
          className={cn(
            "flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border-2 text-sm font-bold transition-colors",
            method === "credit-card"
              ? "!border-brand-700 !bg-brand-600 !text-white !shadow-lg"
              : "border-transparent !bg-slate-100 !text-slate-500 hover:!text-slate-800",
          )}
        >
          <CreditCard className="h-4 w-4" aria-hidden="true" />
          Cartão de crédito
        </button>
      </div>

      {method === "pix" ? (
        <Card key="pix" className="mt-4 gap-3 p-6 text-center">
          <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-lg bg-slate-100">
            <QrCode className="h-20 w-20 text-slate-300" aria-hidden="true" />
          </div>
          <p className="text-sm text-slate-600">
            Escaneie o QR code ou copie o código Pix abaixo.
          </p>
          <div className="space-y-1.5 text-left">
            <Label htmlFor="pix-code">Pix copia e cola</Label>
            <Input id="pix-code" readOnly value={pixCode} className="text-xs" />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigator.clipboard.writeText(pixCode)}
          >
            Copiar código
          </Button>
          <Button
            size="lg"
            className="w-full"
            onClick={() => onPay("pix")}
            disabled={processing}
          >
            {processing ? "Processando..." : "Já paguei"}
          </Button>
        </Card>
      ) : (
        <Card key="cartao" className="mt-4 gap-3 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="card-number">Número do cartão</Label>
            <Input id="card-number" placeholder="0000 0000 0000 0000" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="card-expiry">Validade</Label>
              <Input id="card-expiry" placeholder="MM/AA" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-cvv">CVV</Label>
              <Input id="card-cvv" placeholder="000" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-name">Nome impresso no cartão</Label>
            <Input id="card-name" placeholder="Como está no cartão" />
          </div>
          <Button
            size="lg"
            className="mt-2 w-full"
            onClick={() => onPay("credit-card")}
            disabled={processing}
          >
            {processing ? "Processando..." : "Pagar"}
          </Button>
        </Card>
      )}
    </>
  );
}

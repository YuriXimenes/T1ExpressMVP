"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { OrderHandling } from "@/lib/admin/api";

/** Etiqueta do pacote e situação do código de retirada do cliente. */
export function LabelCard({
  orderId,
  handling,
}: {
  orderId: string;
  handling: OrderHandling;
}) {
  const pickup = handling.pickup;
  const locked = pickup?.lockedUntil && new Date(pickup.lockedUntil) > new Date();

  return (
    <Card className="gap-3 p-6">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
        Etiqueta e retirada
      </p>
      {!pickup ? (
        <p className="text-sm text-slate-500">
          A etiqueta e o código de retirada aparecem depois que o cliente paga.
        </p>
      ) : (
        <>
          <Button asChild size="sm" variant="outline" className="self-start">
            <Link href={`/admin/pedidos/${orderId}/etiqueta`} target="_blank">
              <Printer className="h-4 w-4" aria-hidden="true" />
              Imprimir etiqueta
            </Link>
          </Button>
          <div className="text-sm text-slate-600">
            <p>
              Código do cliente:{" "}
              <span className="font-mono font-semibold tracking-widest text-slate-900">
                {pickup.pickupCode}
              </span>
            </p>
            <p className="mt-1">
              {pickup.usedAt
                ? `Usado em ${new Date(pickup.usedAt).toLocaleString("pt-BR")}.`
                : locked
                  ? `Travado por tentativas erradas até ${new Date(pickup.lockedUntil!).toLocaleTimeString("pt-BR")}.`
                  : pickup.failedAttempts > 0
                    ? `Aguardando retirada · ${pickup.failedAttempts} tentativa(s) errada(s).`
                    : "Aguardando retirada."}
            </p>
          </div>
          <p className="text-xs text-slate-400">
            Na loja, o lojista lê o QR do pacote e digita o código que o cliente mostra.
          </p>
        </>
      )}
    </Card>
  );
}

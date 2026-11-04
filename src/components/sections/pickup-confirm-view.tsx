"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PickupError,
  confirmPickup,
  lookupPickup,
  type PickupLookup,
} from "@/lib/pickup";

const STATE_MESSAGES: Record<string, string> = {
  not_ready:
    "Este pedido ainda não foi liberado para retirada. Não entregue o pacote por enquanto.",
  done: "Este pedido já foi retirado.",
  cancelled: "Este pedido foi cancelado. Não entregue o pacote.",
};

/** Aberta pelo QR do pacote: o lojista digita o código que o cliente mostra. */
export function PickupConfirmView({ token }: { token: string }) {
  const [info, setInfo] = useState<PickupLookup | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    lookupPickup(token)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof PickupError ? err.message : "Não foi possível abrir o pedido.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setFeedback("O código tem 6 números.");
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const result = await confirmPickup(token, code);
      if (result.ok) {
        setConfirmed(true);
      } else if (result.locked) {
        setFeedback("Muitas tentativas erradas. Aguarde 15 minutos e tente de novo.");
        setCode("");
      } else {
        setFeedback(
          `Código errado. Restam ${result.attemptsLeft} tentativa(s) antes de travar.`,
        );
        setCode("");
      }
    } catch (err) {
      setFeedback(
        err instanceof PickupError
          ? err.message
          : "Não foi possível confirmar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  let body: React.ReactNode;
  if (loadError) {
    body = <p className="text-sm text-red-600">{loadError}</p>;
  } else if (!info) {
    body = <p className="text-sm text-slate-500">Carregando...</p>;
  } else if (!info.found) {
    body = (
      <div className="flex flex-col items-center gap-2 text-center">
        <PackageX className="h-10 w-10 text-slate-400" aria-hidden="true" />
        <p className="text-slate-700">Este QR não é de um pacote da T1 Express.</p>
      </div>
    );
  } else if (confirmed) {
    body = (
      <div className="flex flex-col items-center gap-2 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-600" aria-hidden="true" />
        <p className="text-lg font-semibold text-slate-900">Retirada confirmada</p>
        <p className="text-sm text-slate-600">
          Pode entregar o pacote #{info.orderCode} para{" "}
          {info.customerFirstName || "o cliente"}.
        </p>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-2xl font-bold text-slate-900">Pedido #{info.orderCode}</p>
          <p className="text-sm text-slate-600">
            {info.storeName}
            {info.customerFirstName && ` · Cliente: ${info.customerFirstName}`}
          </p>
        </div>
        {info.state !== "ready" ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {STATE_MESSAGES[info.state ?? ""] ??
              "Este pedido não pode ser retirado agora."}
          </p>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pickup-code">Código de retirada do cliente</Label>
              <Input
                id="pickup-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="h-12 text-center font-mono text-2xl tracking-[0.4em]"
              />
              <p className="text-xs text-slate-500">
                Peça ao cliente o código que aparece no pedido dele, no site da T1
                Express.
              </p>
            </div>
            {feedback && (
              <p role="alert" className="text-sm text-red-600">
                {feedback}
              </p>
            )}
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? "Confirmando..." : "Confirmar retirada"}
            </Button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-10">
      <h1 className="mb-4 text-sm font-medium tracking-wide text-slate-500 uppercase">
        Retirada T1 Express
      </h1>
      <Card className="p-6">{body}</Card>
    </div>
  );
}

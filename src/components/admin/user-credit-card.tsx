"use client";

import { useEffect, useState } from "react";
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
} from "@/components/ui/dialog";
import { CreditEntries, formatCreditBRL } from "@/components/credit/credit-statement";
import { useCan } from "@/lib/admin/access-provider";
import { AdminError, adjustUserCredit, fetchUserCredit } from "@/lib/admin/api";
import type { CreditStatement } from "@/lib/orders/api";
import { cn } from "@/lib/utils";

function AdjustDialog({
  userId,
  balance,
  onClose,
  onDone,
}: {
  userId: string;
  balance: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"dar" | "tirar">("dar");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const n = Number(amount.trim().replace(",", "."));
    if (!Number.isFinite(n) || n <= 0)
      return setError("Informe um valor maior que zero.");
    if (mode === "tirar" && n > balance)
      return setError(
        `O saldo é ${formatCreditBRL(balance)}: não dá para tirar mais que isso.`,
      );
    if (note.trim().length < 3) return setError("Informe o motivo do ajuste.");
    setBusy(true);
    setError(null);
    try {
      await adjustUserCredit(userId, mode === "dar" ? n : -n, note.trim());
      onDone();
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Não foi possível ajustar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar crédito</DialogTitle>
          <DialogDescription>
            Saldo atual: {formatCreditBRL(balance)}. O cliente vê o ajuste e o motivo no
            extrato.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2" role="radiogroup" aria-label="Tipo de ajuste">
            {(
              [
                ["dar", "Dar crédito"],
                ["tirar", "Tirar crédito"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={mode === v}
                onClick={() => setMode(v)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-medium",
                  mode === v
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="credit-amount">Valor (R$)</Label>
            <Input
              id="credit-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="credit-note">Motivo</Label>
            <Textarea
              id="credit-note"
              rows={2}
              maxLength={500}
              value={note}
              placeholder="Ex.: cortesia pelo atraso na entrega"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? "Salvando..." : "Salvar ajuste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Saldo e extrato de crédito do cliente, no detalhe do usuário. */
export function UserCreditCard({ userId }: { userId: string }) {
  const canEdit = useCan("usuarios", "edit");
  const [statement, setStatement] = useState<CreditStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);

  function load() {
    fetchUserCredit(userId)
      .then(setStatement)
      .catch((err) =>
        setError(err instanceof AdminError ? err.message : "Não foi possível carregar."),
      );
  }
  useEffect(() => {
    queueMicrotask(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <Card className="gap-3 p-6 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Crédito do cliente
          </p>
          {statement && (
            <p className="text-lg font-bold text-slate-900">
              {formatCreditBRL(statement.balance)}
            </p>
          )}
        </div>
        {canEdit && statement && (
          <Button size="sm" variant="outline" onClick={() => setAdjusting(true)}>
            Ajustar crédito
          </Button>
        )}
      </div>
      {error && <p className="text-red-600">{error}</p>}
      {!statement && !error && <p className="text-slate-500">Carregando...</p>}
      {statement && (
        <div className="max-h-72 overflow-y-auto">
          <CreditEntries
            entries={statement.entries}
            orderHref={(id) => `/admin/pedidos/${id}`}
            showAuthor
          />
        </div>
      )}
      {adjusting && statement && (
        <AdjustDialog
          userId={userId}
          balance={statement.balance}
          onClose={() => setAdjusting(false)}
          onDone={() => {
            setAdjusting(false);
            load();
          }}
        />
      )}
    </Card>
  );
}

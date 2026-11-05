"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/components/shared/price";
import { dayKey } from "@/lib/admin/dashboard";
import { FinanceError, financeFileUrl, type PaymentInput } from "@/lib/finance/api";
import { shiftMonth } from "@/lib/finance/rules";
import { monthLabel } from "@/lib/partners/rules";
import { cn } from "@/lib/utils";

export const money = (v?: number | null) =>
  v === undefined || v === null ? "—" : formatBRL(v);

export const dateBR = (iso?: string) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR")
    : "—";

export const toNumber = (v: string) => Number(v.replace(/\./g, "").replace(",", "."));

/** ‹ Novembro de 2026 › */
export function MonthPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (month: string) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label="Mês anterior"
        onClick={() => onChange(shiftMonth(value, -1))}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
      <span className="min-w-36 text-center text-sm font-medium text-slate-800">
        {monthLabel(value)}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label="Próximo mês"
        onClick={() => onChange(shiftMonth(value, 1))}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

const STATUS_TONES: Record<string, string> = {
  pendente: "bg-amber-50 text-amber-800",
  aberto: "bg-amber-50 text-amber-800",
  a_pagar: "bg-amber-50 text-amber-800",
  em_analise: "bg-sky-50 text-sky-800",
  aprovada: "bg-sky-50 text-sky-800",
  aprovado: "bg-sky-50 text-sky-800",
  paga: "bg-emerald-50 text-emerald-800",
  pago: "bg-emerald-50 text-emerald-800",
  recusada: "bg-red-50 text-red-700",
  negado: "bg-red-50 text-red-700",
  cancelado: "bg-slate-100 text-slate-600",
};

export function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_TONES[status] ?? "bg-slate-100 text-slate-600",
      )}
    >
      {label}
    </span>
  );
}

/** Abre o comprovante (link temporário gerado na hora). */
export function ReceiptLink({
  path,
  label = "comprovante",
}: {
  path?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  if (!path) return null;
  return (
    <button
      type="button"
      disabled={busy}
      className="text-brand-700 inline-flex items-center gap-0.5 text-xs font-medium hover:underline"
      onClick={async () => {
        setBusy(true);
        const url = await financeFileUrl(path);
        setBusy(false);
        if (url) window.open(url, "_blank", "noopener");
      }}
    >
      <FileText className="h-3 w-3" aria-hidden="true" />
      {label}
    </button>
  );
}

/** Registrar um pagamento: valor (opcional), data, comprovante e observação. */
export function PaymentDialog({
  open,
  title,
  description,
  suggestedAmount,
  askAmount = true,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  suggestedAmount?: number;
  askAmount?: boolean;
  onClose: () => void;
  onConfirm: (input: PaymentInput) => Promise<void>;
}) {
  // Quem usa passa uma `key` diferente a cada abertura: o formulário começa limpo.
  const [amount, setAmount] = useState(() =>
    suggestedAmount !== undefined ? String(suggestedAmount).replace(".", ",") : "",
  );
  const [paidAt, setPaidAt] = useState(() => dayKey(new Date()));
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState<File | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    const value = askAmount ? toNumber(amount) : 0;
    if (askAmount && !(value >= 0 && Number.isFinite(value) && amount.trim() !== "")) {
      setError("Informe o valor pago.");
      return;
    }
    if (!paidAt) {
      setError("Informe a data do pagamento.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ amount: value, paidAt, note: note.trim() || undefined, receipt });
      onClose();
    } catch (err) {
      setError(err instanceof FinanceError ? err.message : "Não foi possível registrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className={cn("grid gap-3", askAmount ? "grid-cols-2" : "grid-cols-1")}>
            {askAmount && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-amount">Valor pago (R$)</Label>
                <Input
                  id="pay-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                {suggestedAmount !== undefined && (
                  <p className="text-xs text-slate-500">
                    Calculado: {money(suggestedAmount)}
                  </p>
                )}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-date">Data do pagamento</Label>
              <Input
                id="pay-date"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-receipt">Comprovante (foto ou PDF, opcional)</Label>
            <Input
              id="pay-receipt"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setReceipt(e.target.files?.[0])}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-note">Observação (opcional)</Label>
            <Input
              id="pay-note"
              maxLength={500}
              value={note}
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
          <Button disabled={busy} onClick={() => void confirm()}>
            {busy ? "Registrando..." : "Registrar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Kpi({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "red" | "green" | "amber";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span
        className={cn(
          "text-xl font-semibold tracking-tight tabular-nums",
          tone === "red"
            ? "text-red-600"
            : tone === "green"
              ? "text-emerald-700"
              : tone === "amber"
                ? "text-amber-600"
                : "text-slate-900",
        )}
      >
        {value}
      </span>
      {detail && <span className="text-xs text-slate-500">{detail}</span>}
    </div>
  );
}

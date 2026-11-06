"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { payoutReceiptUrl, type EarningsMonth } from "@/lib/driver/api";
import { cn } from "@/lib/utils";

const brl = (n: number | undefined | null) =>
  `R$ ${(n ?? 0).toFixed(2).replace(".", ",")}`;
const monthLabel = (m: string) =>
  new Date(`${m}-15T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
const dayBR = (d: string) => d.slice(0, 10).split("-").reverse().join("/");

function Line({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className={cn("flex justify-between gap-3 text-sm", muted && "text-slate-500")}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** Aba Ganhos (só quando o admin liberou na Equipe): mesma conta da Equipe e de Despesas. */
export function DriverEarnings({ months }: { months: EarningsMonth[] }) {
  const [error, setError] = useState<string | null>(null);
  const current = months.find((m) => m.current) ?? months[0];
  const previous = months.filter((m) => m !== current);

  async function openReceipt(path: string) {
    setError(null);
    try {
      window.open(await payoutReceiptUrl(path), "_blank", "noopener");
    } catch {
      setError("Não foi possível abrir o comprovante.");
    }
  }

  if (!current) return null;

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-semibold text-slate-900">Ganhos</h1>

      <Card className="gap-3 p-5">
        <div>
          <p className="text-xs font-medium tracking-wide text-slate-500 capitalize uppercase">
            {monthLabel(current.month)} · até agora
          </p>
          <p className="text-3xl font-bold text-slate-900 tabular-nums">
            {brl(current.total)}
          </p>
          <p className="text-sm text-slate-600">
            Pagamento previsto para {dayBR(current.dueDate)} (5º dia útil do mês seguinte)
          </p>
        </div>
        <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
          {current.fixed > 0 && <Line label="Fixo mensal" value={brl(current.fixed)} />}
          <Line
            label={`Viagens concluídas (${current.trips})`}
            value={brl(current.tripCost)}
          />
          {current.tripList.map((t) => (
            <Line
              key={t.id}
              muted
              label={`· ${dayBR(t.day)}${t.km !== undefined ? ` · ${t.km.toLocaleString("pt-BR")} km` : ""}`}
              value={brl(t.cost)}
            />
          ))}
          {current.adjustments.map((a) => (
            <Line
              key={a.id}
              label={a.description}
              value={`${a.amount < 0 ? "-" : ""}${brl(Math.abs(a.amount))}`}
            />
          ))}
        </div>
        <p className="text-xs text-slate-500">
          O valor do mês muda conforme as viagens são concluídas. Dúvidas sobre os
          valores: fale com a T1.
        </p>
      </Card>

      {previous.length > 0 && (
        <Card className="gap-0 p-0">
          <p className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">
            Meses anteriores
          </p>
          <ul className="divide-y divide-slate-100">
            {previous.map((m) => (
              <li
                key={m.month}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-900 capitalize">
                    {monthLabel(m.month)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {m.payout
                      ? `Pago em ${dayBR(m.payout.paidAt)}`
                      : m.total > 0
                        ? `A pagar · previsto ${dayBR(m.dueDate)}`
                        : "Sem valores"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      m.payout ? "text-emerald-700" : "text-slate-900",
                    )}
                  >
                    {brl(m.payout?.amount ?? m.total)}
                  </span>
                  {m.payout?.receiptPath && (
                    <button
                      type="button"
                      onClick={() => void openReceipt(m.payout!.receiptPath!)}
                      className="text-brand-600 rounded p-1 hover:bg-slate-100"
                      aria-label={`Comprovante de ${monthLabel(m.month)}`}
                    >
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

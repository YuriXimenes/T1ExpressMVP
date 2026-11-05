"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { formatBRL } from "@/components/shared/price";
import { signedUrls, type Statement, type StoreFinance } from "@/lib/partners/api";
import { monthLabel, storePayRuleLabel } from "@/lib/partners/rules";
import { cn } from "@/lib/utils";

const dayMonth = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });

function qtyText(line: Statement["lines"][number]): string {
  switch (line.kind) {
    case "por_retirada":
      return `${line.qty} retirada(s) × ${formatBRL(line.amount)}`;
    case "por_coleta":
      return `${line.qty} pedido(s) × ${formatBRL(line.amount)}`;
    case "por_pacote_dia":
      return `${line.qty} pacote-dia × ${formatBRL(line.amount)}`;
    case "percentual_frete":
      return `${line.amount}% de ${formatBRL(line.qty)} de frete`;
    default:
      return "fixo no mês";
  }
}

/** Próximo recebimento, mês atual detalhado e histórico (admin e área da loja). */
export function FinancePanel({ finance }: { finance: StoreFinance }) {
  const { next, current } = finance;
  const months = [finance.previous, ...finance.history];
  const [receipts, setReceipts] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const paths = months
      .map((m) => m.payout?.receiptPath)
      .filter((p): p is string => !!p);
    if (paths.length === 0) return;
    let cancelled = false;
    void signedUrls(paths).then((urls) => !cancelled && setReceipts(urls));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finance]);

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border p-4",
          next.late ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50",
        )}
      >
        <CalendarClock
          className={cn(
            "mt-0.5 h-5 w-5 shrink-0",
            next.late ? "text-red-700" : "text-emerald-700",
          )}
          aria-hidden="true"
        />
        <div>
          <p
            className={cn(
              "text-sm font-semibold",
              next.late ? "text-red-900" : "text-emerald-900",
            )}
          >
            Próximo recebimento: {dayMonth(next.date)} · {formatBRL(next.amount)}
            {next.estimated && " (estimado)"}
          </p>
          <p className={cn("text-xs", next.late ? "text-red-800" : "text-emerald-800")}>
            Referente a {monthLabel(next.month).toLowerCase()}.{" "}
            {next.late
              ? "O pagamento passou da data prevista."
              : next.estimated
                ? "O mês ainda está em andamento: o valor pode mudar até o fechamento."
                : "Pago no 5º dia útil do mês seguinte."}
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700">
          {monthLabel(current.month)} (em andamento): {formatBRL(current.total)}
        </p>
        {current.lines.length === 0 ? (
          <p className="text-xs text-slate-500">Sem regras de remuneração cadastradas.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {current.lines.map((line, i) => (
              <li
                key={i}
                className="flex flex-wrap justify-between gap-x-3 text-slate-600"
              >
                <span>
                  {storePayRuleLabel(line.kind)}{" "}
                  <span className="text-xs text-slate-400">({qtyText(line)})</span>
                </span>
                <span className="font-medium text-slate-800">
                  {formatBRL(line.total)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1.5 font-medium">Mês</th>
              <th className="py-1.5 font-medium">Retiradas</th>
              <th className="py-1.5 font-medium">Coletas</th>
              <th className="py-1.5 text-right font-medium">Valor</th>
              <th className="py-1.5 text-right font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className="border-t border-slate-100">
                <td className="py-2 text-slate-800">{monthLabel(m.month)}</td>
                <td className="py-2 text-slate-600">{m.pickups}</td>
                <td className="py-2 text-slate-600">{m.collects}</td>
                <td className="py-2 text-right text-slate-800">{formatBRL(m.total)}</td>
                <td className="py-2 text-right">
                  {m.payout ? (
                    <span className="text-emerald-700">
                      Pago {formatBRL(m.payout.amount)} em {dayMonth(m.payout.paidAt)}
                      {m.payout.receiptPath && receipts.get(m.payout.receiptPath) && (
                        <>
                          {" · "}
                          <a
                            href={receipts.get(m.payout.receiptPath)}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            comprovante
                          </a>
                        </>
                      )}
                    </span>
                  ) : m.total > 0 ? (
                    <span className="text-amber-700">A pagar</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

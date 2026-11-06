"use client";

import Link from "next/link";
import type { CreditEntry, CreditKind } from "@/lib/orders/api";
import { cn } from "@/lib/utils";

export const CREDIT_KIND_LABELS: Record<CreditKind, string> = {
  ocorrencia: "Crédito de ocorrência",
  ajuste: "Ajuste",
  uso: "Usado em pedido",
  estorno: "Devolvido (pedido cancelado)",
};

export function formatCreditBRL(value: number) {
  return `R$ ${Math.abs(value).toFixed(2).replace(".", ",")}`;
}

function dateBR(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Extrato de crédito: entradas em verde, saídas em cinza. */
export function CreditEntries({
  entries,
  orderHref,
  showAuthor = false,
}: {
  entries: CreditEntry[];
  /** Link do pedido (o cliente e o admin abrem telas diferentes). */
  orderHref: (orderId: string) => string;
  showAuthor?: boolean;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">Nenhuma movimentação ainda.</p>;
  }
  return (
    <ul className="divide-y divide-slate-100">
      {entries.map((e) => (
        <li key={e.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{CREDIT_KIND_LABELS[e.kind]}</p>
            <p className="text-xs text-slate-500">
              {dateBR(e.createdAt)}
              {e.occurrenceNumber && ` · OC-${e.occurrenceNumber}`}
              {e.orderId && (
                <>
                  {" · "}
                  <Link
                    href={orderHref(e.orderId)}
                    className="text-brand-600 hover:underline"
                  >
                    pedido #{e.orderId.slice(0, 8).toUpperCase()}
                  </Link>
                </>
              )}
              {showAuthor && e.createdByName && ` · por ${e.createdByName}`}
            </p>
            {e.note && <p className="mt-0.5 text-xs text-slate-600">{e.note}</p>}
          </div>
          <span
            className={cn(
              "shrink-0 font-semibold tabular-nums",
              e.amount > 0 ? "text-emerald-600" : "text-slate-500",
            )}
          >
            {e.amount > 0 ? "+" : "-"}
            {formatCreditBRL(e.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}

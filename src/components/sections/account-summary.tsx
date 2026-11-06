"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { History, PackageSearch, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreditEntries, formatCreditBRL } from "@/components/credit/credit-statement";
import { fetchMyCredit, type CreditStatement } from "@/lib/orders/api";
import { cn } from "@/lib/utils";

/**
 * Resumo da conta: no celular, uma faixa compacta de 3 números acima das abas;
 * no PC, uma coluna lateral fixa com o crédito e o atalho para um novo frete.
 */
export function AccountSummary({
  activeCount,
  historyCount,
  onSelectTab,
}: {
  activeCount: number;
  historyCount: number;
  onSelectTab: (tab: "ativos" | "historico") => void;
}) {
  const [credit, setCredit] = useState<CreditStatement | null>(null);
  const [showStatement, setShowStatement] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      fetchMyCredit()
        .then(setCredit)
        .catch(() => setCredit(null));
    });
  }, []);

  const balance = credit?.balance ?? 0;
  const stats = [
    {
      key: "ativos",
      label: "Pedidos ativos",
      value: String(activeCount),
      icon: PackageSearch,
      onClick: () => onSelectTab("ativos"),
    },
    {
      key: "historico",
      label: "No histórico",
      value: String(historyCount),
      icon: History,
      onClick: () => onSelectTab("historico"),
    },
    {
      key: "credito",
      label: "Crédito",
      value: formatCreditBRL(balance),
      icon: Wallet,
      onClick: () => setShowStatement(true),
    },
  ] as const;

  return (
    <>
      <Card className="gap-0 p-0 lg:gap-4 lg:p-5">
        <p className="hidden text-xs font-medium tracking-wide text-slate-500 uppercase lg:block">
          Resumo
        </p>
        <ul className="grid grid-cols-3 divide-x divide-slate-100 lg:grid-cols-1 lg:gap-2 lg:divide-x-0">
          {stats.map(({ key, label, value, icon: Icon, onClick }) => (
            <li key={key}>
              <button
                type="button"
                onClick={onClick}
                className={cn(
                  "flex w-full flex-col items-center gap-0.5 px-2 py-3 text-center hover:bg-slate-50",
                  "lg:flex-row lg:items-center lg:gap-3 lg:rounded-lg lg:px-3 lg:py-2.5 lg:text-left",
                  key === "credito" &&
                    balance > 0 &&
                    "lg:bg-brand-50 lg:hover:bg-brand-50/70",
                )}
              >
                <span
                  className={cn(
                    "hidden h-9 w-9 shrink-0 items-center justify-center rounded-full lg:flex",
                    key === "credito"
                      ? "bg-brand-100 text-brand-700"
                      : "bg-slate-100 text-slate-600",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 lg:flex-1">
                  <span className="block text-[11px] text-slate-500 lg:text-xs">
                    {label}
                  </span>
                  <span
                    className={cn(
                      "block text-base font-bold tabular-nums lg:text-lg",
                      key === "credito" && balance > 0
                        ? "text-brand-700"
                        : "text-slate-900",
                    )}
                  >
                    {value}
                  </span>
                </span>
                {key === "credito" && (
                  <span className="text-brand-600 hidden text-xs font-medium lg:inline">
                    Extrato
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {balance > 0 && (
          <p className="hidden text-xs text-slate-500 lg:block">
            Use o crédito no próximo pedido: ao finalizar, marque &ldquo;Usar meu
            crédito&rdquo;.
          </p>
        )}
        <Button asChild className="hidden w-full lg:inline-flex">
          <Link href="/simular-frete">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo frete
          </Link>
        </Button>
      </Card>

      <Dialog open={showStatement} onOpenChange={setShowStatement}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Seu crédito: {formatCreditBRL(balance)}</DialogTitle>
            <DialogDescription>
              {balance > 0
                ? "Use no próximo pedido: na hora de finalizar, marque “Usar meu crédito”. Se o pedido for cancelado, o crédito volta."
                : "Créditos que a T1 der para você (por exemplo, numa ocorrência) aparecem aqui."}
            </DialogDescription>
          </DialogHeader>
          <CreditEntries
            entries={credit?.entries ?? []}
            orderHref={(id) => `/pedidos/${id}`}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  FinanceError,
  fetchFinanceOverview,
  type FinanceMonth,
  type FinanceOverview,
} from "@/lib/finance/api";
import {
  EXPENSE_GROUPS,
  EXPENSE_GROUP_LABELS,
  currentMonthKey,
} from "@/lib/finance/rules";
import { monthLabel } from "@/lib/partners/rules";
import { cn } from "@/lib/utils";
import {
  Kpi,
  MonthPicker,
  dateBR,
  money,
} from "@/components/admin/financeiro/finance-ui";

/** Financeiro › Visão geral: receita, custos e margem do mês, histórico e o que pagar. */
export function VisaoGeralView() {
  const [month, setMonth] = useState(currentMonthKey);
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      setData(null);
      fetchFinanceOverview(month)
        .then((d) => !cancelled && setData(d))
        .catch(
          (err) =>
            !cancelled &&
            setError(
              err instanceof FinanceError ? err.message : "Não foi possível carregar.",
            ),
        );
    });
    return () => {
      cancelled = true;
    };
  }, [month]);

  const m = data?.month;
  const p = data?.payables;
  const maxBar = Math.max(
    1,
    ...(data?.history ?? []).flatMap((h) => [h.revenue.total, h.costs.total]),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Visão financeira</h1>
          <p className="text-sm text-slate-500">
            Receita dos pedidos pagos no mês, custos da operação e margem. Repasses entram
            pelo mês de referência; despesas, pela competência; sinistros e reembolsos,
            pela data do pagamento.
          </p>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {!data && !error && <p className="text-sm text-slate-500">Carregando...</p>}

      {m && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Receita"
              value={money(m.revenue.total)}
              detail={`${money(m.revenue.discounts)} em cupons já descontados`}
            />
            <Kpi label="Custos" value={money(m.costs.total)} />
            <Kpi
              label="Margem"
              value={money(m.margin)}
              detail={
                m.marginPct !== undefined
                  ? `${m.marginPct}% da receita`
                  : "sem receita no mês"
              }
              tone={m.margin < 0 ? "red" : "green"}
            />
            <Kpi
              label="Repasses do mês"
              value={money(m.costs.stores + m.costs.team)}
              detail={`lojas ${money(m.costs.stores)} · equipe ${money(m.costs.team)}`}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="gap-3 p-5">
              <h2 className="font-semibold text-slate-900">Receita</h2>
              <Rows
                rows={[
                  ["Fretes", m.revenue.freight],
                  ["Seguro adicional", m.revenue.insurance],
                  ["Lojas extras pagas", m.revenue.storeCharges],
                ]}
                total={m.revenue.total}
              />
            </Card>
            <Card className="gap-3 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold text-slate-900">Custos</h2>
                <Link
                  href="/admin/financeiro/despesas"
                  className="text-brand-700 text-xs font-medium hover:underline"
                >
                  Ver detalhe em Despesas
                </Link>
              </div>
              <Rows
                rows={[
                  ["Combustível das viagens", m.costs.fuel],
                  ["Repasses a lojas", m.costs.stores],
                  ["Repasses à equipe", m.costs.team],
                  ...EXPENSE_GROUPS.map(
                    (g) =>
                      [
                        `Despesas · ${EXPENSE_GROUP_LABELS[g]}`,
                        m.costs.expenses[g] ?? 0,
                      ] as [string, number],
                  ),
                  ["Sinistros pagos", m.costs.claims],
                  ["Reembolsos pagos", m.costs.refunds],
                ]}
                total={m.costs.total}
              />
            </Card>
          </div>

          {p && (
            <Card className="gap-3 p-5">
              <h2 className="font-semibold text-slate-900">A pagar agora</h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Payable
                  label={`Repasses a lojas (${monthLabel(p.closedMonth).toLowerCase()})`}
                  value={p.stores}
                  detail={`até ${dateBR(p.dueDate)}`}
                  href="/admin/financeiro/despesas"
                />
                <Payable
                  label={`Repasses à equipe (${monthLabel(p.closedMonth).toLowerCase()})`}
                  value={p.team}
                  detail={`até ${dateBR(p.dueDate)}`}
                  href="/admin/financeiro/despesas"
                />
                <Payable
                  label="Despesas aprovadas"
                  value={p.expenses}
                  detail={`${p.pendingExpenses} aguardando aprovação`}
                  href="/admin/financeiro/despesas"
                />
                <Payable
                  label="Sinistros aprovados"
                  value={p.claims}
                  detail={`${p.openClaims} em aberto ou análise`}
                  href="/admin/financeiro/sinistros"
                />
                <Payable
                  label="Reembolsos a clientes"
                  value={p.refunds}
                  href="/admin/financeiro/despesas"
                />
              </div>
            </Card>
          )}

          <Card className="gap-3 p-5">
            <h2 className="font-semibold text-slate-900">Últimos 6 meses</h2>
            <div className="flex flex-col gap-2">
              {(data?.history ?? []).map((h) => (
                <HistoryRow
                  key={h.month}
                  h={h}
                  max={maxBar}
                  current={h.month === month}
                />
              ))}
            </div>
            <p className="flex gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="bg-brand-500 h-2 w-3 rounded-sm" /> receita
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-3 rounded-sm bg-slate-400" /> custos
              </span>
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function Rows({ rows, total }: { rows: [string, number][]; total: number }) {
  return (
    <dl className="flex flex-col gap-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3">
          <dt className="text-slate-600">{label}</dt>
          <dd className="text-slate-800 tabular-nums">{money(value)}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-3 border-t border-slate-100 pt-1.5 font-semibold">
        <dt className="text-slate-900">Total</dt>
        <dd className="text-slate-900 tabular-nums">{money(total)}</dd>
      </div>
    </dl>
  );
}

function Payable({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: number;
  detail?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-xl border border-slate-200 p-3 hover:border-slate-300"
    >
      <span className="text-xs text-slate-500">{label}</span>
      <span
        className={cn(
          "text-lg font-semibold tabular-nums",
          value > 0 ? "text-amber-700" : "text-slate-900",
        )}
      >
        {money(value)}
      </span>
      {detail && <span className="text-xs text-slate-400">{detail}</span>}
    </Link>
  );
}

function HistoryRow({
  h,
  max,
  current,
}: {
  h: FinanceMonth;
  max: number;
  current: boolean;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr_110px] items-center gap-3 text-xs">
      <span className={cn("text-slate-600", current && "font-semibold text-slate-900")}>
        {monthLabel(h.month)}
      </span>
      <div className="flex flex-col gap-0.5">
        <span
          className="bg-brand-500 h-2.5 rounded-sm"
          style={{
            width: `${(h.revenue.total / max) * 100}%`,
            minWidth: h.revenue.total > 0 ? 3 : 0,
          }}
        />
        <span
          className="h-2.5 rounded-sm bg-slate-400"
          style={{
            width: `${(h.costs.total / max) * 100}%`,
            minWidth: h.costs.total > 0 ? 3 : 0,
          }}
        />
      </div>
      <span
        className={cn(
          "text-right tabular-nums",
          h.margin < 0 ? "text-red-600" : "text-emerald-700",
        )}
      >
        {money(h.margin)}
      </span>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { formatBRL } from "@/components/shared/price";
import { StatTile, formatNumber, formatPct } from "@/components/admin/survey-charts";
import { PeriodFilter, usePeriodFilter } from "@/components/admin/period-filter";
import { AdminError, fetchDashboardOrders } from "@/lib/admin/api";
import { summarizeDashboard, type DashboardOrder } from "@/lib/admin/dashboard";
import { fetchOccurrenceSummary, type OccurrenceSummary } from "@/lib/occurrences/api";
import { fetchFinanceOverview, type FinanceOverview } from "@/lib/finance/api";
import { currentMonthKey } from "@/lib/finance/rules";
import { fetchMetricsSummary, type MetricsSummary } from "@/lib/metrics/api";
import { rate } from "@/lib/metrics/rules";
import { fetchDashboardOps, type DashboardOps } from "@/lib/routes/api";
import { stopReasonLabel } from "@/lib/routes/planning";

const count = (n: number) => n.toLocaleString("pt-BR");

function Block({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {children}
      </div>
    </section>
  );
}

export function DashboardView() {
  const [orders, setOrders] = useState<DashboardOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [occurrences, setOccurrences] = useState<OccurrenceSummary | null>(null);
  const [finance, setFinance] = useState<FinanceOverview | null>(null);
  const periodFilter = usePeriodFilter("30d");
  const { period } = periodFilter;
  const [metrics, setMetrics] = useState<{ key: string; data: MetricsSummary } | null>(
    null,
  );
  const metricsKey = `${period.from ?? ""}|${period.to ?? ""}`;
  const [ops, setOps] = useState<{ key: string; data: DashboardOps } | null>(null);

  // Indicadores operacionais (0026): sem a migração ou sem permissão, fica "—".
  useEffect(() => {
    let cancelled = false;
    const [from, to] = metricsKey.split("|");
    fetchDashboardOps(from || undefined, to || undefined)
      .then((data) => !cancelled && setOps({ key: metricsKey, data }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [metricsKey]);
  const op = ops?.key === metricsKey ? ops.data : null;

  // Plataforma (0024): só aparece para quem vê Indicadores.
  useEffect(() => {
    let cancelled = false;
    const [from, to] = metricsKey.split("|");
    fetchMetricsSummary({ from: from || undefined, to: to || undefined })
      .then((data) => !cancelled && setMetrics({ key: metricsKey, data }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [metricsKey]);

  useEffect(() => {
    let cancelled = false;
    // Ocorrências e pontos (0018): sem a migração ou sem permissão, fica "—".
    fetchOccurrenceSummary()
      .then((data) => !cancelled && setOccurrences(data))
      .catch(() => undefined);
    // Financeiro (0022) do mês corrente: sem a migração ou sem permissão, fica "—".
    fetchFinanceOverview(currentMonthKey())
      .then((data) => !cancelled && setFinance(data))
      .catch(() => undefined);
    fetchDashboardOrders()
      .then((data) => {
        if (!cancelled) setOrders(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof AdminError
              ? err.message
              : "Não foi possível carregar os dados.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(
    () => (orders ? summarizeDashboard(orders, period) : null),
    // period é recriado a cada render; as pontas bastam como dependência.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, period.from, period.to],
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Visão geral da operação. Os valores consideram pedidos pagos e não cancelados,
            pela data de criação (horário de Brasília).
          </p>
        </div>
        <PeriodFilter state={periodFilter} idPrefix="dash" />
      </div>

      <p className="-mt-4 text-xs text-slate-400">
        Filtros por parceiro e por entregador chegam com os módulos de Parceiros e de
        Rotas.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!summary && !error && <p className="text-sm text-slate-500">Carregando...</p>}

      {summary && (
        <>
          <Block title="Visão geral" subtitle="Pedidos pagos no período">
            <StatTile label="Pedidos" value={count(summary.general.orders)} />
            <StatTile
              label="Valor em cartas"
              value={formatBRL(summary.general.cardsValueBRL)}
              detail="declarado pelos clientes"
            />
            <StatTile
              label="Receita de frete"
              value={formatBRL(summary.general.freightBRL)}
            />
            <StatTile
              label="Receita de seguro"
              value={formatBRL(summary.general.insuranceBRL)}
            />
            <StatTile
              label="Receita total"
              value={formatBRL(summary.general.revenueBRL)}
              detail="frete + seguro"
            />
            <StatTile
              label="Descontos de cupom"
              value={formatBRL(summary.general.couponDiscountBRL)}
            />
          </Block>

          <Block title="Visão comercial" subtitle="Pedidos criados no período">
            <StatTile
              label="Pedidos criados"
              value={count(summary.commercial.created)}
              detail={`${count(summary.commercial.pendingPayment)} aguardando pagamento`}
            />
            <StatTile
              label="Pedidos pagos"
              value={count(summary.commercial.paid)}
              detail={
                summary.commercial.conversionPct !== null
                  ? `${formatPct(summary.commercial.conversionPct)} dos criados`
                  : undefined
              }
            />
            <StatTile
              label="Concluídos"
              value={count(summary.commercial.completed)}
              detail={`${count(summary.commercial.cancelled)} cancelado(s)`}
            />
            <StatTile
              label="Clientes"
              value={count(summary.commercial.customers)}
              detail={`${count(summary.commercial.newCustomers)} novos · ${count(summary.commercial.returningCustomers)} recorrentes`}
            />
            <StatTile
              label="Frete médio"
              value={
                summary.commercial.avgFreightBRL !== null
                  ? formatBRL(summary.commercial.avgFreightBRL)
                  : "—"
              }
              detail="por pedido pago"
            />
            <StatTile
              label="Ticket médio"
              value={
                summary.commercial.avgTicketBRL !== null
                  ? formatBRL(summary.commercial.avgTicketBRL)
                  : "—"
              }
              detail="frete + seguro por pedido"
            />
          </Block>

          {metrics && (
            <Block
              title="Plataforma"
              subtitle="Simulações de frete feitas no período"
              action={
                <Link
                  href="/admin/plataforma/indicadores"
                  className="text-brand-600 text-xs font-medium hover:underline"
                >
                  Ver indicadores
                </Link>
              }
            >
              <StatTile
                label="Simulações"
                value={count(metrics.data.simulations)}
                detail={`${count(metrics.data.visitors)} navegadores`}
              />
              <StatTile
                label="Viraram pedido pago"
                value={
                  rate(metrics.data.paid, metrics.data.simulations) === null
                    ? "—"
                    : formatPct(rate(metrics.data.paid, metrics.data.simulations)!)
                }
                detail={`${count(metrics.data.paid)} pedido(s)`}
              />
              <StatTile
                label="Simulações que falharam"
                value={count(metrics.data.failed)}
                detail="rota sem preço de concorrente"
              />
              <StatTile label="Novos cadastros" value={count(metrics.data.signups)} />
            </Block>
          )}

          <Block
            title="Visão operacional"
            subtitle="Situação de agora, independente do período"
          >
            <StatTile
              label="Em andamento"
              value={count(summary.operational.inProgress)}
            />
            <StatTile
              label="Aguardando coleta"
              value={count(summary.operational.awaitingCollection)}
            />
            <StatTile
              label="Em transporte"
              value={count(summary.operational.inTransit)}
              detail="indo coletar, a caminho da central ou indo ao ponto"
            />
            <StatTile label="Na central" value={count(summary.operational.atCentral)} />
            <StatTile
              label="Disponível p/ retirada"
              value={count(summary.operational.readyForPickup)}
            />
            <StatTile
              label="Aguardando pagamento"
              value={count(summary.operational.awaitingPayment)}
              detail={`${count(summary.operational.pendingCharges)} com loja extra a pagar`}
            />
            <StatTile
              label="Chamados em aberto"
              value={count(summary.operational.openTickets)}
            />
          </Block>

          <Block title="Visão financeira" subtitle="Custos e resultado da operação">
            <StatTile
              label="Receita líquida"
              value={formatBRL(summary.general.revenueBRL)}
              detail="já descontados os cupons"
            />
            <StatTile
              label="Custos operacionais"
              value={finance ? formatBRL(finance.month.costs.fuel) : "—"}
              detail="combustível das viagens · mês atual"
            />
            <StatTile
              label="Despesas"
              value={finance ? formatBRL(finance.month.costs.expensesTotal) : "—"}
              detail={
                finance
                  ? `${finance.payables.pendingExpenses} aguardando aprovação · mês atual`
                  : "mês atual"
              }
            />
            <StatTile
              label="Repasses"
              value={
                finance
                  ? formatBRL(finance.month.costs.stores + finance.month.costs.team)
                  : "—"
              }
              detail="lojas e equipe · mês atual"
            />
            <StatTile
              label="Margem"
              value={finance ? formatBRL(finance.month.margin) : "—"}
              detail={
                finance?.month.marginPct !== undefined &&
                finance?.month.marginPct !== null
                  ? `${finance.month.marginPct}% da receita · mês atual`
                  : "mês atual"
              }
            />
            <StatTile
              label="Sinistros"
              value={finance ? formatBRL(finance.payables.claims) : "—"}
              detail={
                finance
                  ? `aprovados a pagar · ${finance.payables.openClaims} em análise`
                  : "a pagar"
              }
            />
          </Block>

          <Block title="Desempenho" subtitle="Prazos e qualidade da operação">
            <StatTile
              label="Do pagamento à conclusão"
              value={
                summary.performance.avgDaysToCompleteDays !== null
                  ? `${formatNumber(summary.performance.avgDaysToCompleteDays)} dias`
                  : "—"
              }
              detail="média dos concluídos no período"
            />
            <StatTile
              label="Coletas no prazo"
              value={
                op && rate(op.collectOnTime, op.collectTotal) !== null
                  ? formatPct(rate(op.collectOnTime, op.collectTotal)!)
                  : "—"
              }
              detail={
                op
                  ? `${count(op.collectOnTime)} de ${count(op.collectTotal)} paradas de coleta`
                  : "até 1 h depois do horário previsto"
              }
            />
            <StatTile
              label="Paradas não realizadas"
              value={op ? count(op.stopsFailed) : "—"}
              detail={
                op
                  ? op.stopsFailed > 0 && op.failedTopReason
                    ? `mais comum: ${stopReasonLabel(op.failedTopReason)}`
                    : `de ${count(op.stopsEnded)} paradas encerradas`
                  : "coletas e entregas"
              }
            />
            <StatTile
              label="Custo por rota"
              value={op?.tripCostAvg != null ? formatBRL(op.tripCostAvg) : "—"}
              detail={
                op
                  ? `${count(op.tripsDone)} viagem(ns)${op.costPerKm != null ? ` · ${formatBRL(op.costPerKm)}/km` : ""}`
                  : "entregador + combustível por viagem"
              }
            />
            <StatTile
              label="Divergências na conferência"
              value={
                op && rate(op.ordersDivergent, op.ordersChecked) !== null
                  ? formatPct(rate(op.ordersDivergent, op.ordersChecked)!)
                  : "—"
              }
              detail={
                op
                  ? `${count(op.ordersDivergent)} de ${count(op.ordersChecked)} pedidos conferidos`
                  : "pedidos com item faltando ou a mais"
              }
            />
            <StatTile
              label="Ocorrências em aberto"
              value={
                occurrences
                  ? formatNumber(occurrences.aberta + occurrences.emAnalise)
                  : "—"
              }
              detail={
                occurrences
                  ? `${formatNumber(occurrences.overdue)} com prazo vencido · agora`
                  : "abertas e em análise"
              }
            />
            <StatTile
              label="Prazo de guarda vencido"
              value={occurrences ? formatNumber(occurrences.guardExpired) : "—"}
              detail="pacotes esperando retirada além do prazo"
            />
          </Block>
        </>
      )}
    </div>
  );
}

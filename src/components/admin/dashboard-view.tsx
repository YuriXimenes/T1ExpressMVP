"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Clock } from "lucide-react";
import { formatBRL } from "@/components/shared/price";
import { StatTile, formatNumber, formatPct } from "@/components/admin/survey-charts";
import { PeriodFilter, usePeriodFilter } from "@/components/admin/period-filter";
import { AdminError, fetchDashboardOrders } from "@/lib/admin/api";
import { summarizeDashboard, type DashboardOrder } from "@/lib/admin/dashboard";

const count = (n: number) => n.toLocaleString("pt-BR");

function Block({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {children}
      </div>
    </section>
  );
}

/** Indicador que depende de um módulo ainda não construído: sem número inventado. */
function PendingTile({ label, module }: { label: string; module: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-dashed border-slate-300 p-4">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-2xl font-semibold text-slate-300">—</span>
      <span className="flex items-center gap-1 text-xs text-slate-400">
        <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
        Chega com {module}
      </span>
    </div>
  );
}

export function DashboardView() {
  const [orders, setOrders] = useState<DashboardOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const periodFilter = usePeriodFilter("30d");
  const { period } = periodFilter;

  useEffect(() => {
    let cancelled = false;
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
            />
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
            <PendingTile label="Custos operacionais" module="o Financeiro" />
            <PendingTile label="Despesas" module="o Financeiro" />
            <PendingTile label="Repasses" module="o Financeiro" />
            <PendingTile label="Margem" module="o Financeiro" />
            <PendingTile label="Sinistros" module="o Financeiro" />
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
            <PendingTile label="Coletas no prazo" module="Coletas e rotas" />
            <PendingTile label="Paradas não realizadas" module="Coletas e rotas" />
            <PendingTile label="Custo por rota" module="Coletas e rotas" />
            <PendingTile label="Divergências na conferência" module="a Conferência" />
            <PendingTile label="Ocorrências" module="as Ocorrências" />
          </Block>
        </>
      )}
    </div>
  );
}

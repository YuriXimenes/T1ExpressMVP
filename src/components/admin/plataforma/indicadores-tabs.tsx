"use client";

import { useState } from "react";
import Link from "next/link";
import { StatTile } from "@/components/admin/survey-charts";
import { CHART_COLORS } from "@/components/admin/survey-charts";
import { Badge } from "@/components/ui/badge";
import type { DashboardPeriod } from "@/lib/admin/dashboard";
import {
  fetchAbandoned,
  fetchComparatorHealth,
  fetchCustomerMetrics,
  fetchDemand,
  fetchFunnel,
  fetchPricingMetrics,
  fetchStoreRequests,
} from "@/lib/metrics/api";
import {
  COMPARATOR_ISSUES,
  SAVINGS_BUCKETS,
  biggestDrop,
  funnelSteps,
  rate,
} from "@/lib/metrics/rules";
import { cn } from "@/lib/utils";
import {
  BarList,
  CsvButton,
  DailyColumns,
  MetricState,
  Section,
  Table,
  brl,
  count,
  dateTimeBR,
  dayBR,
  pct,
  td,
  tdNum,
  useMetric,
} from "@/components/admin/plataforma/metrics-ui";

const periodKey = (p: DashboardPeriod) => `${p.from ?? ""}|${p.to ?? ""}`;
const fileSuffix = (p: DashboardPeriod) => `${p.from ?? "inicio"}_${p.to ?? "hoje"}`;

// --- Funil ---------------------------------------------------------------------------------

export function FunnelTab({ period }: { period: DashboardPeriod }) {
  const state = useMetric(() => fetchFunnel(period), periodKey(period));
  return (
    <MetricState state={state}>
      {() => {
        const f = state!.data!;
        const steps = funnelSteps(f);
        const drop = biggestDrop(steps);
        const max = Math.max(1, f.simulations);
        return (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile
                label="Simulações"
                value={count(f.simulations)}
                detail={`${count(f.visitors)} navegadores diferentes`}
              />
              <StatTile
                label="Viraram pedido pago"
                value={pct(rate(f.paid, f.simulations))}
                detail={`${count(f.paid)} de ${count(f.simulations)}`}
              />
              <StatTile
                label="Simulações que falharam"
                value={count(f.failed)}
                detail="rota sem preço de concorrente (veja Comparador)"
              />
              <StatTile
                label="Pedidos sem simulação"
                value={count(f.ordersWithoutSimulation)}
                detail="feitos antes do registro ou por outro caminho"
              />
            </div>

            <Section
              title="Funil de conversão"
              subtitle="Simulações feitas no período e até onde cada uma chegou."
              action={
                <CsvButton
                  filename={`funil_${fileSuffix(period)}.csv`}
                  header={[
                    "Etapa",
                    "Quantidade",
                    "% da etapa anterior",
                    "% das simulações",
                  ]}
                  rows={steps.map((s) => [s.label, s.count, s.fromPrevious, s.fromTop])}
                />
              }
            >
              <ol className="flex flex-col gap-3">
                {steps.map((s) => (
                  <li key={s.key} className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                      <span>
                        <span className="font-medium text-slate-900">{s.label}</span>{" "}
                        <span className="text-xs text-slate-500">{s.hint}</span>
                      </span>
                      <span className="tabular-nums">
                        <span className="font-semibold text-slate-900">
                          {count(s.count)}
                        </span>
                        {s.fromPrevious !== null && (
                          <span
                            className={cn(
                              "ml-2 text-xs",
                              drop?.key === s.key
                                ? "font-medium text-amber-700"
                                : "text-slate-500",
                            )}
                          >
                            {pct(s.fromPrevious)} da etapa anterior
                            {drop?.key === s.key && " · maior perda"}
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="h-3 rounded-full bg-slate-100">
                      <span
                        className="block h-3 rounded-r-[4px]"
                        style={{
                          width: `${(s.count / max) * 100}%`,
                          background: CHART_COLORS.accent,
                        }}
                      />
                    </span>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-slate-500">
                &ldquo;Chegaram ao pedido&rdquo; só conta quem já estava logado: quem
                precisou criar conta e desistiu fica entre &ldquo;Continuaram&rdquo; e
                essa etapa. {count(f.cancelled)} pedido(s) dessas simulações foram
                cancelados.
              </p>
            </Section>

            <Section
              title="Por dia"
              subtitle="Simulações, pedidos criados e pedidos pagos em cada dia."
              action={
                <CsvButton
                  filename={`funil_por_dia_${fileSuffix(period)}.csv`}
                  header={["Dia", "Simulações", "Pedidos criados", "Pedidos pagos"]}
                  rows={f.daily.map((d) => [d.day, d.simulations, d.orders, d.paid])}
                />
              }
            >
              <DailyColumns
                days={f.daily.map((d) => d.day)}
                series={[
                  {
                    label: "Simulações",
                    color: CHART_COLORS.muted,
                    values: f.daily.map((d) => d.simulations),
                  },
                  {
                    label: "Pedidos pagos",
                    color: CHART_COLORS.accent,
                    values: f.daily.map((d) => d.paid),
                  },
                ]}
              />
            </Section>
          </div>
        );
      }}
    </MetricState>
  );
}

// --- Demanda -------------------------------------------------------------------------------

export function DemandTab({ period }: { period: DashboardPeriod }) {
  const state = useMetric(() => fetchDemand(period), periodKey(period));
  const [onlyLost, setOnlyLost] = useState(false);
  return (
    <MetricState state={state}>
      {() => {
        const d = state!.data!;
        const routes = onlyLost
          ? d.routes.filter((r) => r.simulations >= 3 && r.orders === 0)
          : d.routes;
        const storeItems = (list: typeof d.origins) =>
          list.slice(0, 10).map((s) => ({
            key: s.code,
            label: s.name,
            value: s.simulations,
            detail: `${count(s.orders)} pedido(s)${s.failed ? ` · ${count(s.failed)} falha(s)` : ""}`,
          }));
        return (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Section
                title="Lojas de coleta mais buscadas"
                subtitle="Simulações no período"
              >
                <BarList
                  items={storeItems(d.origins)}
                  empty="Sem simulações no período."
                />
              </Section>
              <Section
                title="Pontos de retirada mais buscados"
                subtitle="Simulações no período"
              >
                <BarList
                  items={storeItems(d.destinations)}
                  empty="Sem simulações no período."
                />
              </Section>
            </div>
            <Section
              title="Rotas"
              subtitle="As 100 rotas mais simuladas. Conversão = pedidos pagos ÷ simulações."
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={onlyLost}
                      onChange={(e) => setOnlyLost(e.target.checked)}
                      className="accent-brand-600"
                    />
                    Só as que não convertem
                  </label>
                  <CsvButton
                    filename={`rotas_${fileSuffix(period)}.csv`}
                    header={[
                      "Rota",
                      "Lojas",
                      "Simulações",
                      "Navegadores",
                      "Falhas",
                      "Pedidos",
                      "Pagos",
                      "Conversão (%)",
                      "Frete médio",
                      "Última",
                    ]}
                    rows={routes.map((r) => [
                      r.label,
                      r.storeCount,
                      r.simulations,
                      r.visitors,
                      r.failed,
                      r.orders,
                      r.paid,
                      rate(r.paid, r.simulations),
                      r.avgPrice,
                      r.lastAt,
                    ])}
                  />
                </div>
              }
            >
              <Table
                head={[
                  "Rota",
                  "Simulações",
                  "Pedidos",
                  "Pagos",
                  "Conversão",
                  "Frete",
                  "Última",
                ]}
                isEmpty={routes.length === 0}
                empty={
                  onlyLost
                    ? "Nenhuma rota com 3+ simulações sem pedido."
                    : "Sem simulações no período."
                }
              >
                {routes.map((r) => (
                  <tr key={r.key}>
                    <td className={td}>
                      <p className="text-slate-900">{r.label}</p>
                      <p className="text-xs text-slate-500">
                        {r.storeCount} loja(s) · {count(r.visitors)} navegador(es)
                        {r.failed > 0 && (
                          <span className="text-amber-700">
                            {" "}
                            · {count(r.failed)} falha(s)
                          </span>
                        )}
                      </p>
                    </td>
                    <td className={tdNum}>{count(r.simulations)}</td>
                    <td className={tdNum}>{count(r.orders)}</td>
                    <td className={tdNum}>{count(r.paid)}</td>
                    <td className={tdNum}>{pct(rate(r.paid, r.simulations))}</td>
                    <td className={tdNum}>{brl(r.avgPrice)}</td>
                    <td className={`${td} text-xs whitespace-nowrap text-slate-500`}>
                      {dateTimeBR(r.lastAt)}
                    </td>
                  </tr>
                ))}
              </Table>
            </Section>
          </div>
        );
      }}
    </MetricState>
  );
}

// --- Preço x concorrentes --------------------------------------------------------------------

export function PricingTab({ period }: { period: DashboardPeriod }) {
  const state = useMetric(() => fetchPricingMetrics(period), periodKey(period));
  return (
    <MetricState state={state}>
      {() => {
        const p = state!.data!;
        const buckets = SAVINGS_BUCKETS.map((b) => ({
          ...b,
          row: p.bySavings.find((x) => x.bucket === b.id) ?? {
            simulations: 0,
            orders: 0,
            paid: 0,
          },
        }));
        const stores = [1, 2, 3, 4].map((n) => ({
          n,
          row: p.byStoreCount.find((x) => x.stores === n),
        }));
        return (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Frete médio da T1" value={brl(p.avgPrice)} />
              <StatTile
                label="Economia média mostrada"
                value={brl(p.avgSavings)}
                detail="contra o concorrente mais barato"
              />
              <StatTile
                label="T1 foi a mais barata"
                value={pct(rate(p.cheapest, p.simulations))}
                detail={`${count(p.cheapest)} de ${count(p.simulations)} simulações`}
              />
              <StatTile
                label="Média dos concorrentes"
                value={brl(p.avgLoggi)}
                detail={`Loggi · Uber ${brl(p.avgUber)} · Correios ${brl(p.avgCorreios)}`}
              />
            </div>
            <Section
              title="Conversão por economia"
              subtitle="Quanto mais a T1 economiza, mais gente fecha? Conversão = pagos ÷ simulações."
              action={
                <CsvButton
                  filename={`preco_${fileSuffix(period)}.csv`}
                  header={[
                    "Grupo",
                    "Faixa",
                    "Simulações",
                    "Pedidos",
                    "Pagos",
                    "Conversão (%)",
                  ]}
                  rows={[
                    ...buckets.map((b) => [
                      "Economia",
                      b.label,
                      b.row.simulations,
                      b.row.orders,
                      b.row.paid,
                      rate(b.row.paid, b.row.simulations),
                    ]),
                    ...stores.map((s) => [
                      "Lojas",
                      s.n === 4 ? "4 ou mais" : String(s.n),
                      s.row?.simulations ?? 0,
                      s.row?.orders ?? 0,
                      s.row?.paid ?? 0,
                      rate(s.row?.paid ?? 0, s.row?.simulations ?? 0),
                    ]),
                  ]}
                />
              }
            >
              <Table
                head={["Faixa", "Simulações", "Pedidos", "Pagos", "Conversão"]}
                isEmpty={
                  p.simulations === 0 && buckets.every((b) => b.row.simulations === 0)
                }
                empty="Sem simulações no período."
              >
                {buckets.map((b) => (
                  <tr key={b.id}>
                    <td className={td}>{b.label}</td>
                    <td className={tdNum}>{count(b.row.simulations)}</td>
                    <td className={tdNum}>{count(b.row.orders)}</td>
                    <td className={tdNum}>{count(b.row.paid)}</td>
                    <td className={tdNum}>{pct(rate(b.row.paid, b.row.simulations))}</td>
                  </tr>
                ))}
              </Table>
            </Section>
            <Section
              title="Conversão por número de lojas"
              subtitle="Pedidos com mais lojas custam mais e economizam mais."
            >
              <Table
                head={[
                  "Lojas de coleta",
                  "Simulações",
                  "Frete médio",
                  "Pagos",
                  "Conversão",
                ]}
                isEmpty={stores.every((s) => !s.row)}
                empty="Sem simulações no período."
              >
                {stores.map((s) => (
                  <tr key={s.n}>
                    <td className={td}>{s.n === 4 ? "4 ou mais" : s.n}</td>
                    <td className={tdNum}>{count(s.row?.simulations)}</td>
                    <td className={tdNum}>{brl(s.row?.avgPrice)}</td>
                    <td className={tdNum}>{count(s.row?.paid)}</td>
                    <td className={tdNum}>
                      {pct(rate(s.row?.paid ?? 0, s.row?.simulations ?? 0))}
                    </td>
                  </tr>
                ))}
              </Table>
              {p.withoutUber > 0 && (
                <p className="text-xs text-slate-500">
                  {count(p.withoutUber)} simulação(ões) sem preço de Uber cadastrado para
                  a rota.
                </p>
              )}
            </Section>
          </div>
        );
      }}
    </MetricState>
  );
}

// --- Clientes ---------------------------------------------------------------------------------

export function CustomersTab({ period }: { period: DashboardPeriod }) {
  const state = useMetric(() => fetchCustomerMetrics(period), periodKey(period));
  return (
    <MetricState state={state}>
      {() => {
        const c = state!.data!;
        return (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile
                label="Novos cadastros"
                value={count(c.signups)}
                detail={`${count(c.signupsWithOrder)} já fizeram pedido pago`}
              />
              <StatTile
                label="Clientes que pagaram"
                value={count(c.buyers)}
                detail={`${count(c.firstTimeBuyers)} pela 1ª vez · ${count(c.repeatBuyers)} recompra`}
              />
              <StatTile
                label="Recompra (geral)"
                value={pct(rate(c.repeatTotal, c.customersTotal))}
                detail={`${count(c.repeatTotal)} de ${count(c.customersTotal)} clientes com 2+ pedidos`}
              />
              <StatTile
                label="Do cadastro ao 1º pedido"
                value={
                  c.avgDaysToFirstOrder === null
                    ? "—"
                    : `${c.avgDaysToFirstOrder.toLocaleString("pt-BR")} dias`
                }
                detail="média de quem pagou o 1º pedido no período"
              />
            </div>
            <Section
              title="Cadastros por dia"
              action={
                <CsvButton
                  filename={`clientes_${fileSuffix(period)}.csv`}
                  header={["Dia", "Novos cadastros"]}
                  rows={c.daily.map((d) => [d.day, d.signups])}
                />
              }
            >
              <DailyColumns
                days={c.daily.map((d) => d.day)}
                series={[
                  {
                    label: "Cadastros",
                    color: CHART_COLORS.accent,
                    values: c.daily.map((d) => d.signups),
                  },
                ]}
              />
            </Section>
          </div>
        );
      }}
    </MetricState>
  );
}

// --- Simulações abandonadas ------------------------------------------------------------------

export function AbandonedTab({ period }: { period: DashboardPeriod }) {
  const state = useMetric(() => fetchAbandoned(period), periodKey(period));
  return (
    <MetricState state={state}>
      {() => {
        const list = state!.data!;
        return (
          <Section
            title="Simulações abandonadas"
            subtitle="Clientes logados cuja última simulação do período não virou pedido. Quem simulou sem login não aparece (não há contato)."
            action={
              <CsvButton
                filename={`abandonadas_${fileSuffix(period)}.csv`}
                header={[
                  "Cliente",
                  "E-mail",
                  "Telefone",
                  "Rota",
                  "Frete",
                  "Economia",
                  "Quando",
                  "Chegou ao pedido",
                  "Simulações no período",
                ]}
                rows={list.map((a) => [
                  a.name,
                  a.email,
                  a.phone,
                  a.route,
                  a.price,
                  a.savings,
                  a.simulatedAt,
                  a.reachedOrderPage ? "sim" : "não",
                  a.simulations,
                ])}
              />
            }
          >
            <Table
              head={["Cliente", "Rota", "Frete", "Quando", "Etapa"]}
              isEmpty={list.length === 0}
              empty="Ninguém abandonou no período."
            >
              {list.map((a) => (
                <tr key={a.userId}>
                  <td className={td}>
                    <Link
                      href={`/admin/usuarios/${a.userId}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {a.name}
                    </Link>
                    <p className="text-xs break-all text-slate-500">
                      {a.email}
                      {a.phone && ` · ${a.phone}`}
                    </p>
                  </td>
                  <td className={td}>
                    <p className="text-slate-700">{a.route}</p>
                    {a.simulations > 1 && (
                      <p className="text-xs text-slate-500">
                        {a.simulations} simulações no período
                      </p>
                    )}
                  </td>
                  <td className={tdNum}>
                    {a.failed ? (
                      <span className="text-xs text-amber-700">falhou</span>
                    ) : (
                      brl(a.price)
                    )}
                  </td>
                  <td className={`${td} text-xs whitespace-nowrap text-slate-500`}>
                    {dateTimeBR(a.simulatedAt)}
                  </td>
                  <td className={td}>
                    <Badge variant="outline" className="font-normal">
                      {a.reachedOrderPage ? "Montou o pedido" : "Só simulou"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </Table>
            <p className="text-xs text-slate-500">
              Para incentivar, abra a ficha do cliente e use &ldquo;Ajustar
              crédito&rdquo;, ou crie um cupom em Financeiro › Cupons.
            </p>
          </Section>
        );
      }}
    </MetricState>
  );
}

// --- Lojas pedidas --------------------------------------------------------------------------------

const PARTNER_STATUS = {
  parceira: {
    label: "Já é parceira",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  negociacao: { label: "Em negociação", tone: "border-sky-200 bg-sky-50 text-sky-700" },
} as const;

export function StoreRequestsTab() {
  const state = useMetric(() => fetchStoreRequests(), "all");
  return (
    <MetricState state={state}>
      {() => {
        const list = state!.data!;
        return (
          <Section
            title="Lojas pedidas pelos clientes"
            subtitle="Sugestões do formulário “sugerir loja” e lojas indicadas no perfil, agrupadas pelo nome (todas as datas)."
            action={
              <CsvButton
                filename="lojas_pedidas.csv"
                header={[
                  "Loja",
                  "Pedidos",
                  "Pelo formulário",
                  "Por clientes no perfil",
                  "Endereços",
                  "Último pedido",
                  "Situação",
                ]}
                rows={list.map((s) => [
                  s.name,
                  s.total,
                  s.suggestions,
                  s.customers,
                  (s.addresses ?? []).join(" | "),
                  s.lastAt,
                  s.partnerStatus
                    ? PARTNER_STATUS[s.partnerStatus].label
                    : s.contacted
                      ? "Contatada"
                      : "",
                ])}
              />
            }
          >
            <Table
              head={["Loja", "Pedidos", "Formulário", "Perfil", "Último", "Situação"]}
              isEmpty={list.length === 0}
              empty="Nenhuma loja sugerida ainda."
            >
              {list.map((s) => (
                <tr key={s.name}>
                  <td className={td}>
                    <p className="font-medium text-slate-900">{s.name}</p>
                    {(s.addresses ?? []).map((a) => (
                      <p key={a} className="text-xs text-slate-500">
                        {a}
                      </p>
                    ))}
                  </td>
                  <td className={tdNum}>{count(s.total)}</td>
                  <td className={tdNum}>{count(s.suggestions)}</td>
                  <td className={tdNum}>{count(s.customers)}</td>
                  <td className={`${td} text-xs whitespace-nowrap text-slate-500`}>
                    {dayBR(s.lastAt)}
                  </td>
                  <td className={td}>
                    {s.partnerStatus ? (
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                          PARTNER_STATUS[s.partnerStatus].tone,
                        )}
                      >
                        {PARTNER_STATUS[s.partnerStatus].label}
                      </span>
                    ) : s.contacted ? (
                      <span className="text-xs text-slate-500">Contatada</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </Section>
        );
      }}
    </MetricState>
  );
}

// --- Saúde do comparador -------------------------------------------------------------------------

export function ComparatorTab() {
  const state = useMetric(() => fetchComparatorHealth(90), "90");
  return (
    <MetricState state={state}>
      {() => {
        const h = state!.data!;
        return (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile
                label="Sem preço cadastrado"
                value={count(h.missingRoute)}
                detail="a simulação falha"
              />
              <StatTile
                label="Sem preço de Uber"
                value={count(h.missingUber)}
                detail="mostra sem comparar com Uber"
              />
              <StatTile
                label="Desatualizados"
                value={count(h.stale)}
                detail={`sem revisão há mais de ${h.staleDays} dias`}
              />
              <StatTile
                label="Pares avaliados"
                value={count(h.pairs)}
                detail="loja de coleta × ponto de retirada (publicados)"
              />
            </div>
            <Section
              title="O que corrigir"
              subtitle={
                <>
                  Primeiro os pares que fazem a simulação falhar, dos mais procurados para
                  os menos (simulações dos últimos 90 dias). Os preços são editados em{" "}
                  <Link
                    href="/admin/plataforma/comparador"
                    className="text-brand-600 hover:underline"
                  >
                    Comparador de fretes
                  </Link>
                  .
                </>
              }
              action={
                <CsvButton
                  filename="saude_comparador.csv"
                  header={[
                    "Loja de coleta",
                    "Ponto de retirada",
                    "Problema",
                    "Simulações (90 dias)",
                    "Falhas",
                    "Atualizado em",
                  ]}
                  rows={h.items.map((i) => [
                    i.originName,
                    i.destName,
                    COMPARATOR_ISSUES[i.issue].label,
                    i.simulations,
                    i.failed,
                    i.updatedAt,
                  ])}
                />
              }
            >
              <Table
                head={["Rota", "Problema", "Simulações", "Atualizado em"]}
                isEmpty={h.items.length === 0}
                empty="Tudo certo: todas as rotas têm preço atualizado."
              >
                {h.items.map((i) => (
                  <tr key={`${i.originCode}>${i.destCode}`}>
                    <td className={td}>
                      {i.originName} → {i.destName}
                    </td>
                    <td className={td}>
                      <p
                        className={cn(
                          "font-medium",
                          i.issue === "sem_rota" ? "text-red-700" : "text-amber-700",
                        )}
                      >
                        {COMPARATOR_ISSUES[i.issue].label}
                      </p>
                      <p className="text-xs text-slate-500">
                        {COMPARATOR_ISSUES[i.issue].hint}
                      </p>
                    </td>
                    <td className={tdNum}>
                      {count(i.simulations)}
                      {i.failed > 0 && (
                        <span className="block text-xs text-red-700">
                          {count(i.failed)} falharam
                        </span>
                      )}
                    </td>
                    <td className={`${td} text-xs whitespace-nowrap text-slate-500`}>
                      {i.updatedAt ? dayBR(i.updatedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </Table>
            </Section>
          </div>
        );
      }}
    </MetricState>
  );
}

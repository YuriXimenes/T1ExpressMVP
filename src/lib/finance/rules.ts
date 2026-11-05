/** Regras do financeiro (espelho da 0022_finance.sql). */

export type ExpenseGroup = "operacao" | "pessoal" | "administrativo" | "comercial";
export type ExpenseStatus = "pendente" | "aprovada" | "recusada" | "paga";
export type ClaimStatus = "aberto" | "em_analise" | "aprovado" | "pago" | "negado";
export type RefundStatus = "a_pagar" | "pago" | "cancelado";

export const EXPENSE_GROUP_LABELS: Record<ExpenseGroup, string> = {
  operacao: "Operação",
  pessoal: "Pessoal",
  administrativo: "Administrativo",
  comercial: "Comercial e marketing",
};
export const EXPENSE_GROUPS = Object.keys(EXPENSE_GROUP_LABELS) as ExpenseGroup[];

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  recusada: "Recusada",
  paga: "Paga",
};

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  aberto: "Aberto",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  pago: "Pago",
  negado: "Negado",
};

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  a_pagar: "A pagar",
  pago: "Pago",
  cancelado: "Cancelado",
};

export const claimCode = (n: number) => `SN-${n}`;
export const expenseCode = (n: number) => `DS-${n}`;

/** Repasse da pessoa da Equipe: viagens (entregador) + fixo mensal + avulsos. */
export function teamTotal(
  tripCost: number,
  fixed: number,
  adjustments: number[],
): number {
  return round2(tripCost + fixed + adjustments.reduce((a, b) => a + b, 0));
}

export interface ClaimItemValue {
  price: number;
  priceMode: "unit" | "total";
  quantity: number;
  affected: number;
}

/** Valor declarado afetado (unit: preço × qtd afetada; total: proporcional). */
export function claimDeclared(items: ClaimItemValue[]): number {
  return round2(
    items.reduce(
      (sum, it) =>
        sum +
        (it.priceMode === "total"
          ? (it.price * it.affected) / it.quantity
          : it.price * it.affected),
      0,
    ),
  );
}

/** Sugestão de indenização: o menor entre o declarado afetado e a cobertura do seguro. */
export const claimSuggestion = (declared: number, coverage: number) =>
  round2(Math.min(declared, coverage));

/** Margem e % (null quando não há receita). */
export function margin(
  revenue: number,
  costs: number,
): { value: number; pct: number | null } {
  const value = round2(revenue - costs);
  return { value, pct: revenue > 0 ? Math.round((value / revenue) * 1000) / 10 : null };
}

export const round2 = (v: number) => Math.round(v * 100) / 100;

/** "2026-11" do dia de hoje em Brasília. */
export function currentMonthKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(now);
}

/** Soma `delta` meses a "AAAA-MM". */
export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Soma dos custos automáticos do mês (igual aos da Visão geral, sem as despesas lançadas). */
export function autoTotal(auto: {
  fuel: { total: number };
  team: { total: number };
  stores: { total: number };
  claims: { total: number };
  refunds: { total: number };
}): number {
  return round2(
    auto.fuel.total +
      auto.team.total +
      auto.stores.total +
      auto.claims.total +
      auto.refunds.total,
  );
}

/** Despesas lançadas que contam como custo: aprovadas e pagas. */
export function manualCosts(expenses: { status: string; amount: number }[]): number {
  return round2(
    expenses
      .filter((e) => e.status === "aprovada" || e.status === "paga")
      .reduce((sum, e) => sum + e.amount, 0),
  );
}

import { addDays } from "@/lib/operating-calendar";
import type { DeliveryStage, MockOrderStatus } from "@/lib/types/mock-order";

/** O que o dashboard precisa de cada pedido (lido em `fetchDashboardOrders`). */
export interface DashboardOrder {
  userId: string;
  createdAt: string;
  status: MockOrderStatus;
  paidAt?: string;
  completedAt?: string;
  deliveryStage?: DeliveryStage;
  /** Valor declarado das cartas, já somando as lojas extras pagas. */
  itemsTotalBRL: number;
  /** Seguro adicional cobrado, já somando os upgrades pagos. */
  insuranceBRL: number;
  couponDiscountBRL: number;
  /** Pagamento inicial + cobranças de loja extra pagas. */
  receivedBRL: number;
  hasOpenTicket: boolean;
  hasPendingCharge: boolean;
}

/** Período por dia de Brasília ("AAAA-MM-DD"), com as pontas incluídas; sem ponta = aberto. */
export interface DashboardPeriod {
  from?: string;
  to?: string;
}

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia (de Brasília) de um instante, no formato "AAAA-MM-DD". */
export function dayKey(at: Date | string): string {
  return dayFormatter.format(new Date(at));
}

export function inPeriod(at: string, period: DashboardPeriod): boolean {
  const key = dayKey(at);
  return (!period.from || key >= period.from) && (!period.to || key <= period.to);
}

export type PeriodPreset = "hoje" | "7d" | "30d" | "mes" | "tudo";

export const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "mes", label: "Este mês" },
  { id: "tudo", label: "Tudo" },
];

export function presetPeriod(
  preset: PeriodPreset,
  now: Date = new Date(),
): DashboardPeriod {
  const today = dayKey(now);
  switch (preset) {
    case "hoje":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "mes":
      return { from: `${today.slice(0, 8)}01`, to: today };
    case "tudo":
      return {};
  }
}

/** Pago e não cancelado: é o que entra nos valores (cancelado pago vira estorno). */
export function isRevenueOrder(order: DashboardOrder): boolean {
  return !!order.paidAt && order.status !== "cancelled";
}

const cents = (value: number) => Math.round(value * 100) / 100;
const sum = (orders: DashboardOrder[], value: (o: DashboardOrder) => number) =>
  cents(orders.reduce((total, o) => total + value(o), 0));

export interface DashboardSummary {
  general: {
    /** Pedidos pagos e não cancelados criados no período. */
    orders: number;
    cardsValueBRL: number;
    freightBRL: number;
    insuranceBRL: number;
    revenueBRL: number;
    couponDiscountBRL: number;
  };
  commercial: {
    created: number;
    paid: number;
    pendingPayment: number;
    completed: number;
    cancelled: number;
    /** Pagos ÷ criados, em %; `null` sem pedidos. */
    conversionPct: number | null;
    customers: number;
    newCustomers: number;
    returningCustomers: number;
    avgFreightBRL: number | null;
    avgTicketBRL: number | null;
  };
  /** Situação de agora, independente do período. */
  operational: {
    inProgress: number;
    awaitingPayment: number;
    awaitingCollection: number;
    inTransit: number;
    readyForPickup: number;
    openTickets: number;
    pendingCharges: number;
  };
  performance: {
    /** Média de dias entre o pagamento e a conclusão, nos concluídos do período. */
    avgDaysToCompleteDays: number | null;
  };
}

export function summarizeDashboard(
  orders: DashboardOrder[],
  period: DashboardPeriod,
): DashboardSummary {
  const created = orders.filter((o) => inPeriod(o.createdAt, period));
  const revenue = created.filter(isRevenueOrder);

  // Freguês novo: o 1º pedido pago da vida dele caiu no período. Quem já tinha
  // pedido pago antes do início do período conta como recorrente.
  const firstPaidAt = new Map<string, string>();
  for (const o of orders) {
    if (!isRevenueOrder(o)) continue;
    const prev = firstPaidAt.get(o.userId);
    if (!prev || o.createdAt < prev) firstPaidAt.set(o.userId, o.createdAt);
  }
  const customers = new Set(revenue.map((o) => o.userId));
  let newCustomers = 0;
  for (const id of customers) {
    if (inPeriod(firstPaidAt.get(id)!, period)) newCustomers++;
  }

  const freightOf = (o: DashboardOrder) => Math.max(0, o.receivedBRL - o.insuranceBRL);
  const freightBRL = sum(revenue, freightOf);
  const revenueBRL = sum(revenue, (o) => o.receivedBRL);

  const completedTimes = created
    .filter((o) => o.status === "completed" && o.paidAt && o.completedAt)
    .map(
      (o) =>
        (new Date(o.completedAt!).getTime() - new Date(o.paidAt!).getTime()) / 86_400_000,
    );

  const active = orders.filter((o) => o.status === "active");
  const stage = (s: DeliveryStage) => active.filter((o) => o.deliveryStage === s).length;

  return {
    general: {
      orders: revenue.length,
      cardsValueBRL: sum(revenue, (o) => o.itemsTotalBRL),
      freightBRL,
      insuranceBRL: sum(revenue, (o) => o.insuranceBRL),
      revenueBRL,
      couponDiscountBRL: sum(revenue, (o) => o.couponDiscountBRL),
    },
    commercial: {
      created: created.length,
      paid: created.filter((o) => !!o.paidAt).length,
      pendingPayment: created.filter((o) => o.status === "pending-payment").length,
      completed: created.filter((o) => o.status === "completed").length,
      cancelled: created.filter((o) => o.status === "cancelled").length,
      conversionPct: created.length
        ? (created.filter((o) => !!o.paidAt).length / created.length) * 100
        : null,
      customers: customers.size,
      newCustomers,
      returningCustomers: customers.size - newCustomers,
      avgFreightBRL: revenue.length ? cents(freightBRL / revenue.length) : null,
      avgTicketBRL: revenue.length ? cents(revenueBRL / revenue.length) : null,
    },
    operational: {
      inProgress: active.length,
      awaitingPayment: orders.filter((o) => o.status === "pending-payment").length,
      awaitingCollection: stage("aguardando-coleta"),
      inTransit: stage("em-transporte"),
      readyForPickup: stage("disponivel-para-retirada"),
      openTickets: orders.filter((o) => o.hasOpenTicket).length,
      pendingCharges: orders.filter((o) => o.hasPendingCharge).length,
    },
    performance: {
      avgDaysToCompleteDays: completedTimes.length
        ? completedTimes.reduce((a, b) => a + b, 0) / completedTimes.length
        : null,
    },
  };
}

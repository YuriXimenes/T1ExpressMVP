import { describe, expect, it } from "vitest";
import {
  dayKey,
  inPeriod,
  presetPeriod,
  summarizeDashboard,
  type DashboardOrder,
} from "@/lib/admin/dashboard";

function order(partial: Partial<DashboardOrder>): DashboardOrder {
  return {
    userId: "u1",
    createdAt: "2026-10-10T15:00:00Z",
    status: "active",
    paidAt: "2026-10-10T15:05:00Z",
    deliveryStage: "aguardando-coleta",
    itemsTotalBRL: 100,
    insuranceBRL: 0,
    couponDiscountBRL: 0,
    receivedBRL: 12,
    hasOpenTicket: false,
    hasPendingCharge: false,
    ...partial,
  };
}

describe("período", () => {
  it("usa o dia de Brasília, não o UTC", () => {
    // 01h UTC do dia 11 ainda é dia 10 em Brasília (UTC−3).
    expect(dayKey("2026-10-11T01:00:00Z")).toBe("2026-10-10");
    expect(
      inPeriod("2026-10-11T01:00:00Z", { from: "2026-10-10", to: "2026-10-10" }),
    ).toBe(true);
    expect(inPeriod("2026-10-11T04:00:00Z", { to: "2026-10-10" })).toBe(false);
    expect(inPeriod("2020-01-01T12:00:00Z", {})).toBe(true);
  });

  it("atalhos contam o dia de hoje", () => {
    const now = new Date("2026-11-02T15:00:00Z");
    expect(presetPeriod("hoje", now)).toEqual({ from: "2026-11-02", to: "2026-11-02" });
    expect(presetPeriod("7d", now)).toEqual({ from: "2026-10-27", to: "2026-11-02" });
    expect(presetPeriod("30d", now)).toEqual({ from: "2026-10-04", to: "2026-11-02" });
    expect(presetPeriod("mes", now)).toEqual({ from: "2026-11-01", to: "2026-11-02" });
    expect(presetPeriod("tudo", now)).toEqual({});
  });
});

describe("resumo do dashboard", () => {
  const orders: DashboardOrder[] = [
    // u1: já tinha pedido pago antes do período → recorrente.
    order({ userId: "u1", createdAt: "2026-09-01T15:00:00Z", status: "completed" }),
    order({
      userId: "u1",
      itemsTotalBRL: 250,
      insuranceBRL: 1.5,
      receivedBRL: 16.5,
      couponDiscountBRL: 3,
    }),
    // u2: 1º pedido pago no período → novo; concluído em 2 dias.
    order({
      userId: "u2",
      status: "completed",
      deliveryStage: "disponivel-para-retirada",
      paidAt: "2026-10-10T12:00:00Z",
      completedAt: "2026-10-12T12:00:00Z",
      receivedBRL: 15,
    }),
    // Não pago: conta como criado, fica fora dos valores.
    order({
      userId: "u3",
      status: "pending-payment",
      paidAt: undefined,
      receivedBRL: 12,
    }),
    // Cancelado depois de pago: fora dos valores.
    order({ userId: "u4", status: "cancelled", receivedBRL: 12 }),
    order({ userId: "u5", deliveryStage: "em-transporte", hasOpenTicket: true }),
  ];
  const period = { from: "2026-10-01", to: "2026-10-31" };
  const s = summarizeDashboard(orders, period);

  it("valores só de pedidos pagos e não cancelados do período", () => {
    expect(s.general).toEqual({
      orders: 3,
      cardsValueBRL: 450,
      // (16,5 − 1,5) + 15 + 12
      freightBRL: 42,
      insuranceBRL: 1.5,
      revenueBRL: 43.5,
      couponDiscountBRL: 3,
    });
  });

  it("funil e clientes novos × recorrentes", () => {
    expect(s.commercial).toMatchObject({
      created: 5,
      paid: 4,
      pendingPayment: 1,
      completed: 1,
      cancelled: 1,
      conversionPct: 80,
      customers: 3,
      newCustomers: 2,
      returningCustomers: 1,
      avgFreightBRL: 14,
      avgTicketBRL: 14.5,
    });
  });

  it("operação mostra a situação de agora, em qualquer período", () => {
    const now = summarizeDashboard(orders, { from: "2030-01-01" });
    expect(now.general.orders).toBe(0);
    expect(now.commercial.conversionPct).toBeNull();
    expect(now.operational).toEqual({
      inProgress: 2,
      awaitingPayment: 1,
      awaitingCollection: 1,
      inTransit: 1,
      readyForPickup: 0,
      openTickets: 1,
      pendingCharges: 0,
    });
  });

  it("tempo médio do pagamento à conclusão", () => {
    expect(s.performance.avgDaysToCompleteDays).toBe(2);
  });
});

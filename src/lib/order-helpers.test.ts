import { describe, expect, it } from "vitest";
import { computeTotalPaidBRL, getOrderStatusLabel } from "@/lib/order-helpers";
import type { MockOrder, StoreCharge } from "@/lib/types/mock-order";

function makeOrder(overrides: Partial<MockOrder> = {}): MockOrder {
  return {
    id: "order-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "pending-payment",
    originStoreIds: ["fs-01"],
    destinationStoreId: "fs-02",
    ordersByStore: {},
    deliveryNote: "",
    quote: {
      priceBRL: 12,
      estimatedDaysMin: 3,
      estimatedDaysMax: 3,
      distanceLabel: "",
      competitors: [],
    },
    itemsTotal: 0,
    insurance: { extraCoverageOptedIn: false, coverageAmountBRL: 100, extraCostBRL: 0 },
    freightAfterDiscountBRL: 12,
    amountDueBRL: 12,
    storeCharges: [],
    supportTickets: [],
    ...overrides,
  };
}

function makeCharge(overrides: Partial<StoreCharge> = {}): StoreCharge {
  return {
    id: "charge-1",
    storeIds: ["fs-03"],
    amountBRL: 3,
    status: "pending-payment",
    createdAt: "2026-01-01T00:00:00.000Z",
    draftOrdersByStore: {},
    itemsTotalAdded: 0,
    ...overrides,
  };
}

describe("getOrderStatusLabel", () => {
  it("mostra o rótulo certo por status/etapa", () => {
    expect(getOrderStatusLabel(makeOrder({ status: "pending-payment" }))).toBe(
      "Aguardando pagamento",
    );
    expect(getOrderStatusLabel(makeOrder({ status: "completed" }))).toBe("Concluído");
    expect(
      getOrderStatusLabel(
        makeOrder({ status: "active", deliveryStage: "em-transporte" }),
      ),
    ).toBe("Em transporte");
  });
});

describe("computeTotalPaidBRL", () => {
  it("soma o pedido com as cobranças de loja extra já pagas", () => {
    const order = makeOrder({
      amountDueBRL: 12,
      storeCharges: [
        makeCharge({ amountBRL: 3, status: "paid" }),
        makeCharge({ id: "charge-2", amountBRL: 5, status: "pending-payment" }),
      ],
    });
    expect(computeTotalPaidBRL(order)).toBe(15);
  });
});

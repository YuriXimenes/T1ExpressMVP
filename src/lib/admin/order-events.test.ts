import { describe, expect, it } from "vitest";
import { actorLabel, describeEvent, type OrderEvent } from "@/lib/admin/order-events";

function event(partial: Partial<OrderEvent>): OrderEvent {
  return {
    id: "e1",
    orderId: "o1",
    createdAt: "2026-11-03T15:00:00Z",
    actorKind: "admin",
    kind: "created",
    details: {},
    backfilled: false,
    ...partial,
  };
}

describe("texto dos eventos", () => {
  it("etapa, conclusão e cancelamento", () => {
    expect(
      describeEvent(
        event({
          kind: "stage_changed",
          fromValue: "em-transporte-retirada",
          toValue: "disponivel-para-retirada",
        }),
      ),
    ).toEqual({
      title: "Etapa alterada",
      detail: "Em transporte para retirada → Disponível para retirada",
    });
    expect(
      describeEvent(event({ kind: "completed", fromValue: "disponivel-para-retirada" })),
    ).toEqual({ title: "Pedido concluído", detail: undefined });
    expect(
      describeEvent(event({ kind: "completed", fromValue: "em-transporte" })).detail,
    ).toBe('Concluído direto de "A caminho da central"');
    expect(
      describeEvent(
        event({
          kind: "cancelled",
          fromValue: "pending-payment",
          details: { timeUnknown: true },
        }),
      ).detail,
    ).toBe('Estava em "Aguardando pagamento" · data do cancelamento não registrada');
  });

  it("valores e lojas extras", () => {
    expect(
      describeEvent(
        event({ kind: "paid", details: { amountDueBRL: 15, paymentMethod: "pix" } }),
      ).detail,
    ).toBe("R$ 15,00 · Pix");
    expect(
      describeEvent(
        event({ kind: "items_added", fromValue: "100.00", toValue: "150.50" }),
      ).detail,
    ).toBe("R$ 100,00 → R$ 150,50");
    expect(
      describeEvent(
        event({ kind: "insurance_changed", fromValue: "100.00", toValue: "200.00" }),
      ).detail,
    ).toBe("Cobertura · R$ 100,00 → R$ 200,00");
    expect(
      describeEvent(
        event({
          kind: "store_charge_paid",
          toValue: "3.00",
          details: { storeCodes: ["fs-01", "fs-02"], paymentMethod: "credit-card" },
        }),
        (code) => (code === "fs-01" ? "Loja A" : "Loja B"),
      ),
    ).toEqual({
      title: "Loja extra paga",
      detail: "Loja A, Loja B · R$ 3,00 · Cartão de crédito",
    });
  });

  it("chamados mostram o assunto", () => {
    expect(
      describeEvent(event({ kind: "ticket_resolved", details: { subject: "Atraso" } })),
    ).toEqual({ title: "Chamado respondido", detail: "Atraso" });
  });

  it("quem fez", () => {
    expect(actorLabel({ actorKind: "admin", actorName: "Yuri" })).toBe("Admin · Yuri");
    expect(actorLabel({ actorKind: "customer" })).toBe("Cliente");
    expect(actorLabel({ actorKind: "system", actorName: "x" })).toBe("Sistema");
  });
});

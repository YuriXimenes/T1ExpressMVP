import { describe, expect, it } from "vitest";
import {
  allowedTargets,
  columnOf,
  moveRule,
  type MovableOrder,
  type OrderMoveTarget,
} from "@/lib/admin/order-moves";

const coleta: MovableOrder = { status: "active", deliveryStage: "aguardando-coleta" };
const transporte: MovableOrder = { status: "active", deliveryStage: "em-transporte" };
const retirada: MovableOrder = {
  status: "active",
  deliveryStage: "disponivel-para-retirada",
};
const pendente: MovableOrder = { status: "pending-payment" };

const ok = (needsReason: boolean) => ({ allowed: true, needsReason });

describe("colunas", () => {
  it("pedido ativo fica na coluna da etapa; os outros, na do status", () => {
    expect(columnOf(transporte)).toBe("em-transporte");
    expect(columnOf(pendente)).toBe("pending-payment");
    expect(columnOf({ status: "completed", deliveryStage: "em-transporte" })).toBe(
      "completed",
    );
    expect(columnOf({ status: "cancelled" })).toBe("cancelled");
  });
});

describe("regras de movimento", () => {
  it("avançar uma etapa não pede motivo", () => {
    expect(moveRule(coleta, "em-transporte")).toEqual(ok(false));
    expect(moveRule(transporte, "disponivel-para-retirada")).toEqual(ok(false));
    expect(moveRule(retirada, "completed")).toEqual(ok(false));
  });

  it("voltar ou pular etapa pede motivo", () => {
    expect(moveRule(coleta, "disponivel-para-retirada")).toEqual(ok(true));
    expect(moveRule(transporte, "aguardando-coleta")).toEqual(ok(true));
    expect(moveRule(retirada, "aguardando-coleta")).toEqual(ok(true));
    expect(moveRule(retirada, "em-transporte")).toEqual(ok(true));
  });

  it("concluir antes da retirada pede motivo", () => {
    expect(moveRule(coleta, "completed")).toEqual(ok(true));
    expect(moveRule(transporte, "completed")).toEqual(ok(true));
  });

  it("cancelar sempre pede motivo", () => {
    for (const order of [pendente, coleta, transporte, retirada]) {
      expect(moveRule(order, "cancelled")).toEqual(ok(true));
    }
  });

  it("mesma etapa, pagamento e pedidos finalizados são recusados", () => {
    expect(moveRule(transporte, "em-transporte").allowed).toBe(false);
    const targets: OrderMoveTarget[] = [
      "aguardando-coleta",
      "em-transporte",
      "disponivel-para-retirada",
      "completed",
    ];
    for (const target of targets) {
      expect(moveRule(pendente, target).allowed).toBe(false);
    }
    for (const status of ["completed", "cancelled"] as const) {
      for (const target of [...targets, "cancelled" as const]) {
        expect(moveRule({ status }, target).allowed).toBe(false);
      }
    }
  });

  it("lista os destinos permitidos na ordem das colunas", () => {
    expect(allowedTargets(transporte)).toEqual([
      { target: "aguardando-coleta", needsReason: true },
      { target: "disponivel-para-retirada", needsReason: false },
      { target: "completed", needsReason: true },
      { target: "cancelled", needsReason: true },
    ]);
    expect(allowedTargets(pendente)).toEqual([
      { target: "cancelled", needsReason: true },
    ]);
    expect(allowedTargets({ status: "completed" })).toEqual([]);
  });
});

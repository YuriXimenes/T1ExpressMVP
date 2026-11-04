import { describe, expect, it } from "vitest";
import {
  LABEL_SIZES,
  DEFAULT_LABEL_SIZE,
  checkSummary,
  custodyLabel,
  divergenceText,
  pickupUrl,
} from "@/lib/admin/handling";
import { fitWithin } from "@/lib/photo-resize";

describe("conferência", () => {
  it("conta divergências só por quantidade", () => {
    expect(
      checkSummary([
        { expectedQty: 2, receivedQty: 2 },
        { expectedQty: 2, receivedQty: 1 },
        { expectedQty: 1, receivedQty: 3 },
      ]),
    ).toEqual({ checked: 3, divergent: 2 });
    expect(divergenceText({ expectedQty: 2, receivedQty: 1 })).toBe("Recebemos 1 de 2");
  });
});

describe("custódia e etiqueta", () => {
  it("rótulos e endereço do QR", () => {
    expect(custodyLabel("entregue_no_ponto")).toBe("Entregue no ponto de retirada");
    expect(custodyLabel("desconhecida")).toBe("desconhecida");
    expect(pickupUrl("https://t1.example/", "abc")).toBe(
      "https://t1.example/retirada/abc",
    );
    expect(LABEL_SIZES[DEFAULT_LABEL_SIZE]).toMatchObject({
      widthMm: 100,
      heightMm: 150,
    });
  });
});

describe("redimensionar foto", () => {
  it("reduz pelo lado maior e mantém a proporção", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it("não aumenta foto pequena", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

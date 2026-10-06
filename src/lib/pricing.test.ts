import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING, orderFreightBRL } from "@/lib/pricing";

describe("orderFreightBRL", () => {
  it("com os preços padrão: R$12 + R$3 por loja além da primeira", () => {
    expect(orderFreightBRL(1, DEFAULT_PRICING)).toBe(12);
    expect(orderFreightBRL(3, DEFAULT_PRICING)).toBe(18);
  });

  it("usa os valores configurados, inclusive tudo zerado", () => {
    const pricing = { ...DEFAULT_PRICING, baseBRL: 10, extraStoreBRL: 2.5 };
    expect(orderFreightBRL(3, pricing)).toBe(15);
    const free = {
      baseBRL: 0,
      extraStoreBRL: 0,
      addedStoreBRL: 0,
      insurancePer100BRL: 0,
    };
    expect(orderFreightBRL(5, free)).toBe(0);
  });
});

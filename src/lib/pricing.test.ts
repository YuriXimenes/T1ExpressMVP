import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRICING,
  classifyPricingVersions,
  orderFreightBRL,
  type PricingVersion,
} from "@/lib/pricing";

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

describe("classifyPricingVersions", () => {
  const v = (id: string, from: string, created = from): PricingVersion => ({
    ...DEFAULT_PRICING,
    id,
    effectiveFrom: from,
    createdAt: created,
  });
  const now = Date.parse("2026-11-06T12:00:00Z");

  it("a vigente é a última que já começou; futuras ficam agendadas", () => {
    const map = classifyPricingVersions(
      [
        v("a", "2026-01-01T00:00:00Z"),
        v("b", "2026-10-01T00:00:00Z"),
        v("c", "2026-11-07T00:00:00Z"),
      ],
      now,
    );
    expect(map.get("a")).toBe("anterior");
    expect(map.get("b")).toBe("vigente");
    expect(map.get("c")).toBe("agendado");
  });

  it("mesmo início: vale a criada por último", () => {
    const map = classifyPricingVersions(
      [
        v("x", "2026-11-06T10:00:00Z", "2026-11-06T10:00:00Z"),
        v("y", "2026-11-06T10:00:00Z", "2026-11-06T10:00:05Z"),
      ],
      now,
    );
    expect(map.get("y")).toBe("vigente");
    expect(map.get("x")).toBe("anterior");
  });
});

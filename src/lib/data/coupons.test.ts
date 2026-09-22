import { describe, expect, it } from "vitest";
import { applyCoupon, coupons } from "@/lib/data/coupons";

describe("applyCoupon", () => {
  it("aplica cupom percentual", () => {
    const result = applyCoupon("T1BEMVINDO10", 12, coupons);
    expect(result?.discountBRL).toBe(1.2);
  });

  it("aplica cupom de valor fixo", () => {
    const result = applyCoupon("T1FRETE5", 12, coupons);
    expect(result?.discountBRL).toBe(5);
  });

  it("não deixa o desconto passar do valor do frete", () => {
    const result = applyCoupon("T1FRETE5", 3, coupons);
    expect(result?.discountBRL).toBe(3);
  });

  it("aceita minúsculas e ignora espaços nas pontas", () => {
    expect(applyCoupon(" t1frete5 ", 12, coupons)?.discountBRL).toBe(5);
  });

  it("devolve null para cupom inexistente", () => {
    expect(applyCoupon("NAOEXISTE", 12, coupons)).toBeNull();
  });
});

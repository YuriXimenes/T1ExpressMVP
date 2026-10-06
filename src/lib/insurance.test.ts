import { describe, expect, it } from "vitest";
import { computeInsuranceInfo } from "@/lib/insurance";

describe("computeInsuranceInfo", () => {
  it("cobertura básica (sem custo extra) até R$100", () => {
    expect(computeInsuranceInfo(0, 1)).toEqual({
      needsExtraCoverage: false,
      coverageNeededBRL: 100,
      extraCostBRL: 0,
    });
    expect(computeInsuranceInfo(100, 1)).toEqual({
      needsExtraCoverage: false,
      coverageNeededBRL: 100,
      extraCostBRL: 0,
    });
  });

  it("arredonda para o próximo múltiplo de R$100 e cobra R$1 a cada R$100 extra", () => {
    expect(computeInsuranceInfo(100.01, 1)).toEqual({
      needsExtraCoverage: true,
      coverageNeededBRL: 200,
      extraCostBRL: 1,
    });
    expect(computeInsuranceInfo(200, 1)).toEqual({
      needsExtraCoverage: true,
      coverageNeededBRL: 200,
      extraCostBRL: 1,
    });
    expect(computeInsuranceInfo(999.99, 1)).toEqual({
      needsExtraCoverage: true,
      coverageNeededBRL: 1000,
      extraCostBRL: 9,
    });
  });

  it("usa o custo por R$100 configurado (inclusive R$0 = seguro gratuito)", () => {
    expect(computeInsuranceInfo(450, 2.5).extraCostBRL).toBe(10);
    expect(computeInsuranceInfo(999.99, 0)).toEqual({
      needsExtraCoverage: true,
      coverageNeededBRL: 1000,
      extraCostBRL: 0,
    });
  });
});

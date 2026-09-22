import { describe, expect, it } from "vitest";
import { computeInsuranceInfo } from "@/lib/insurance";

describe("computeInsuranceInfo", () => {
  it("cobertura básica (sem custo extra) até R$100", () => {
    expect(computeInsuranceInfo(0)).toEqual({
      needsExtraCoverage: false,
      coverageNeededBRL: 100,
      extraCostBRL: 0,
    });
    expect(computeInsuranceInfo(100)).toEqual({
      needsExtraCoverage: false,
      coverageNeededBRL: 100,
      extraCostBRL: 0,
    });
  });

  it("arredonda para o próximo múltiplo de R$100 e cobra R$1 a cada R$100 extra", () => {
    expect(computeInsuranceInfo(100.01)).toEqual({
      needsExtraCoverage: true,
      coverageNeededBRL: 200,
      extraCostBRL: 1,
    });
    expect(computeInsuranceInfo(200)).toEqual({
      needsExtraCoverage: true,
      coverageNeededBRL: 200,
      extraCostBRL: 1,
    });
    expect(computeInsuranceInfo(999.99)).toEqual({
      needsExtraCoverage: true,
      coverageNeededBRL: 1000,
      extraCostBRL: 9,
    });
  });
});

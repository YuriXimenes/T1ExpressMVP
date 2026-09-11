export const BASE_INSURANCE_COVERAGE_BRL = 100;
const EXTRA_COST_PER_100_BRL = 1;

export interface InsuranceInfo {
  needsExtraCoverage: boolean;
  /** Cobertura necessária pra cobrir o total dos itens, arredondada pra cima em múltiplos de R$100. */
  coverageNeededBRL: number;
  extraCostBRL: number;
}

export function computeInsuranceInfo(itemsTotal: number): InsuranceInfo {
  if (itemsTotal <= BASE_INSURANCE_COVERAGE_BRL) {
    return {
      needsExtraCoverage: false,
      coverageNeededBRL: BASE_INSURANCE_COVERAGE_BRL,
      extraCostBRL: 0,
    };
  }

  const coverageNeededBRL = Math.ceil(itemsTotal / 100) * 100;
  const extraCostBRL =
    ((coverageNeededBRL - BASE_INSURANCE_COVERAGE_BRL) / 100) * EXTRA_COST_PER_100_BRL;
  return { needsExtraCoverage: true, coverageNeededBRL, extraCostBRL };
}

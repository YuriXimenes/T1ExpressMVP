export const BASE_INSURANCE_COVERAGE_BRL = 100;

export interface InsuranceInfo {
  needsExtraCoverage: boolean;
  /** Cobertura necessária pra cobrir o total dos itens, arredondada pra cima em múltiplos de R$100. */
  coverageNeededBRL: number;
  extraCostBRL: number;
}

/**
 * `perHundredBRL`: custo a cada R$100 de cobertura acima da básica
 * (`catalog.pricing.insurancePer100BRL`, configurado no admin).
 */
export function computeInsuranceInfo(
  itemsTotal: number,
  perHundredBRL: number,
): InsuranceInfo {
  if (itemsTotal <= BASE_INSURANCE_COVERAGE_BRL) {
    return {
      needsExtraCoverage: false,
      coverageNeededBRL: BASE_INSURANCE_COVERAGE_BRL,
      extraCostBRL: 0,
    };
  }

  const coverageNeededBRL = Math.ceil(itemsTotal / 100) * 100;
  const extraCostBRL =
    ((coverageNeededBRL - BASE_INSURANCE_COVERAGE_BRL) / 100) * perHundredBRL;
  return { needsExtraCoverage: true, coverageNeededBRL, extraCostBRL };
}

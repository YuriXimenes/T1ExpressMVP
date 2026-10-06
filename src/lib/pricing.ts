/**
 * Preços da T1 configurados pelo admin (tabela `pricing_settings`). O banco é
 * quem cobra de verdade (`create_order`, `add_store_charge`); o app usa estes
 * mesmos valores só para mostrar a prévia antes de o pedido existir.
 */
export interface Pricing {
  /** Frete da 1ª loja de coleta do pedido. */
  baseBRL: number;
  /** Cada loja de coleta além da primeira, na criação do pedido. */
  extraStoreBRL: number;
  /** Cada loja nova adicionada a um pedido já aberto. */
  addedStoreBRL: number;
  /** Seguro: custo a cada R$100 de cobertura acima dos R$100 inclusos. */
  insurancePer100BRL: number;
}

/** Valores de antes de o preço ficar configurável — usados se o banco falhar. */
export const DEFAULT_PRICING: Pricing = {
  baseBRL: 12,
  extraStoreBRL: 3,
  addedStoreBRL: 3,
  insurancePer100BRL: 1,
};

/** Frete da T1 para um pedido novo com `originCount` lojas de coleta. */
export function orderFreightBRL(originCount: number, pricing: Pricing): number {
  return pricing.baseBRL + Math.max(0, originCount - 1) * pricing.extraStoreBRL;
}

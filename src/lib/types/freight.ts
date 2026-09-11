export interface FreightQuoteRequest {
  originStoreIds: string[];
  destinationStoreId: string;
}

export interface CompetitorQuote {
  carrier: "uber" | "loggi" | "correios";
  label: string;
  etaLabel: string;
  totalBRL: number;
}

export interface FreightQuoteResult {
  priceBRL: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  distanceLabel: string;
  competitors: CompetitorQuote[];
  /** Presente só quando a T1 é de fato mais barata que o concorrente mais barato disponível. */
  cheapestSavingsBRL?: number;
}

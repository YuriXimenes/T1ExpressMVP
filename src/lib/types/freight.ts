export interface FreightQuoteRequest {
  originStoreId: string;
  destinationStoreId: string;
}

export interface FreightQuoteResult {
  priceBRL: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  distanceLabel: string;
}

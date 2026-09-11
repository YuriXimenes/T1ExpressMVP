import type { FreightQuoteResult } from "@/lib/types/freight";

export interface PendingOrder {
  originStoreIds: string[];
  destinationStoreId: string;
  quote: FreightQuoteResult;
}

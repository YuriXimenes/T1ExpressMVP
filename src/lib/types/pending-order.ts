import type { FreightQuoteResult } from "@/lib/types/freight";

export interface PendingOrder {
  originStoreIds: string[];
  destinationStoreId: string;
  quote: FreightQuoteResult;
  /** Simulação registrada (indicadores); liga o pedido criado a ela. */
  simulationId?: string;
}

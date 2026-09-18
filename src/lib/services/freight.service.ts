import { simulateFreight, type FreightPricingData } from "@/lib/data/freight-simulation";
import type { FreightQuoteRequest, FreightQuoteResult } from "@/lib/types/freight";

export async function getFreightQuote(
  request: FreightQuoteRequest,
  pricing: FreightPricingData,
): Promise<FreightQuoteResult> {
  return simulateFreight(request, pricing);
}

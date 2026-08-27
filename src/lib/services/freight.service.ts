import { simulateFreight } from "@/lib/data/freight-simulation";
import type { FreightQuoteRequest, FreightQuoteResult } from "@/lib/types/freight";

export async function getFreightQuote(
  request: FreightQuoteRequest,
): Promise<FreightQuoteResult> {
  return simulateFreight(request);
}

import { stores } from "@/lib/data/stores";
import type { FreightQuoteRequest, FreightQuoteResult } from "@/lib/types/freight";

/** Hash simples e determinístico (mesma entrada sempre gera o mesmo número). */
function hashPair(a: string, b: string): number {
  const combined = [a, b].sort().join("|");
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function simulateFreight({
  originStoreId,
  destinationStoreId,
}: FreightQuoteRequest): FreightQuoteResult {
  const origin = stores.find((s) => s.id === originStoreId);
  const destination = stores.find((s) => s.id === destinationStoreId);

  if (!origin || !destination) {
    throw new Error("Loja de origem ou destino inválida.");
  }

  const variation = hashPair(originStoreId, destinationStoreId) % 100;

  if (origin.id === destination.id) {
    return {
      priceBRL: 0,
      estimatedDaysMin: 0,
      estimatedDaysMax: 0,
      distanceLabel: "Mesma loja",
    };
  }

  const sameCity = origin.city === destination.city && origin.state === destination.state;
  const sameState = origin.state === destination.state;

  if (sameCity) {
    return {
      priceBRL: 18.9 + variation / 10,
      estimatedDaysMin: 1,
      estimatedDaysMax: 2,
      distanceLabel: `${origin.city} - ${origin.city}`,
    };
  }

  if (sameState) {
    return {
      priceBRL: 32.9 + variation / 5,
      estimatedDaysMin: 2,
      estimatedDaysMax: 4,
      distanceLabel: `${origin.city} - ${destination.city} (${origin.state})`,
    };
  }

  return {
    priceBRL: 49.9 + variation / 2.5,
    estimatedDaysMin: 3,
    estimatedDaysMax: 7,
    distanceLabel: `${origin.city}/${origin.state} - ${destination.city}/${destination.state}`,
  };
}

import type {
  CompetitorQuote,
  FreightQuoteRequest,
  FreightQuoteResult,
} from "@/lib/types/freight";
import type { FreightRouteQuote } from "@/lib/types/freight-route";
import type { FreightStore } from "@/lib/types/freight-store";

/** Custo marginal de cada loja de coleta além da primeira — usado tanto na cotação quanto para adicionar lojas depois do pedido feito. */
export const EXTRA_ORIGIN_STORE_FEE_BRL = 3;

/** Dados de referência que alimentam a cotação (vêm do catálogo). */
export interface FreightPricingData {
  stores: FreightStore[];
  routes: FreightRouteQuote[];
  correiosFlatRateBRL: number;
}

export function simulateFreight(
  { originStoreIds, destinationStoreId }: FreightQuoteRequest,
  {
    stores: freightStores,
    routes: freightRoutes,
    correiosFlatRateBRL: CORREIOS_FLAT_RATE_BRL,
  }: FreightPricingData,
): FreightQuoteResult {
  const origins = originStoreIds.map((id) => {
    const store = freightStores.find((s) => s.id === id);
    if (!store) throw new Error("Loja de origem inválida.");
    return store;
  });

  const destination = freightStores.find(
    (s) => s.id === destinationStoreId && s.isPickupPoint,
  );
  if (!destination) {
    throw new Error("Ponto de retirada inválido.");
  }

  const routes = origins.map((origin) => {
    const route = freightRoutes.find(
      (r) => r.originStoreId === origin.id && r.destinationStoreId === destinationStoreId,
    );
    if (!route) throw new Error("Rota sem cotação de concorrentes cadastrada.");
    return route;
  });

  const priceBRL = 12 + Math.max(0, origins.length - 1) * EXTRA_ORIGIN_STORE_FEE_BRL;

  const loggiTotal = routes.reduce((sum, r) => sum + r.loggiBRL, 0);
  const correiosTotal = CORREIOS_FLAT_RATE_BRL * origins.length;
  const uberTotal = routes.every((r) => r.uberBRL !== undefined)
    ? routes.reduce((sum, r) => sum + (r.uberBRL ?? 0), 0)
    : undefined;

  const competitors: CompetitorQuote[] = [
    {
      carrier: "loggi",
      label: "Loggi Express",
      etaLabel: "~3 horas",
      totalBRL: loggiTotal,
    },
    {
      carrier: "correios",
      label: "Correios (Carta Registrada)",
      etaLabel: "~4 dias úteis",
      totalBRL: correiosTotal,
    },
  ];
  if (uberTotal !== undefined) {
    competitors.unshift({
      carrier: "uber",
      label: "Uber",
      etaLabel: "~3 horas",
      totalBRL: uberTotal,
    });
  }

  const cheapest = competitors.reduce((min, c) => (c.totalBRL < min.totalBRL ? c : min));
  const cheapestSavingsBRL =
    priceBRL < cheapest.totalBRL ? cheapest.totalBRL - priceBRL : undefined;

  return {
    priceBRL,
    estimatedDaysMin: 3,
    estimatedDaysMax: 3,
    distanceLabel: `${origins.map((s) => s.name).join(", ")} → ${destination.name}`,
    competitors,
    cheapestSavingsBRL,
  };
}

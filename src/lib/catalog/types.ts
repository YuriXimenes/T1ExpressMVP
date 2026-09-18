import type { BrazilState } from "@/lib/data/brazil-states";
import type { Coupon } from "@/lib/data/coupons";
import type { FreightRouteQuote } from "@/lib/types/freight-route";
import type { FreightStore } from "@/lib/types/freight-store";
import type { ComparisonCarrier, ComparisonRow } from "@/lib/types/market-comparison";
import type { PickupPartner } from "@/lib/types/pickup-partner";
import type { StoreLogo } from "@/lib/types/store-logo";

/**
 * Dados de referência (lojas, preços de rota, comparativo, cupons, estados)
 * servidos ao app inteiro. Vêm do Supabase quando disponível e, se algo falhar,
 * caem automaticamente nos dados estáticos de src/lib/data/*.
 */
export interface Catalog {
  source: "supabase" | "static";
  stores: FreightStore[];
  coletaPartners: PickupPartner[];
  pickupPartners: PickupPartner[];
  storeLogos: StoreLogo[];
  freightRoutes: FreightRouteQuote[];
  correiosFlatRateBRL: number;
  marketComparison: {
    carriers: ComparisonCarrier[];
    rows: ComparisonRow[];
  };
  coupons: Coupon[];
  brazilStates: BrazilState[];
}

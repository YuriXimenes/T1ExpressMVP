import { brazilStates } from "@/lib/data/brazil-states";
import { coletaPartners } from "@/lib/data/coleta-partners";
import { coupons } from "@/lib/data/coupons";
import { freightStores } from "@/lib/data/freight-stores";
import { CORREIOS_FLAT_RATE_BRL, freightRoutes } from "@/lib/data/freight-routes";
import {
  marketComparisonCarriers,
  marketComparisonRows,
} from "@/lib/data/market-comparison";
import { pickupPartners } from "@/lib/data/pickup-partners";
import { storeLogos } from "@/lib/data/store-logos";
import type { Catalog } from "./types";

/** Fallback: exatamente os dados que o app usava antes de existir o banco. */
export const staticCatalog: Catalog = {
  source: "static",
  stores: freightStores,
  coletaPartners,
  pickupPartners,
  storeLogos,
  freightRoutes,
  correiosFlatRateBRL: CORREIOS_FLAT_RATE_BRL,
  marketComparison: {
    carriers: marketComparisonCarriers,
    rows: marketComparisonRows,
  },
  coupons,
  brazilStates,
};

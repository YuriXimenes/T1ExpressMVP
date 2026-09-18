import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { ComparisonRow, ComparisonStatus } from "@/lib/types/market-comparison";
import type { FreightRouteQuote } from "@/lib/types/freight-route";
import type { FreightStore } from "@/lib/types/freight-store";
import type { PickupPartner } from "@/lib/types/pickup-partner";
import type { Catalog } from "./types";

const REVALIDATE_SECONDS = 300;
const REQUEST_TIMEOUT_MS = 5000;

interface StoreRow {
  id: string;
  code: string;
  name: string;
  address: string;
  neighborhood: string | null;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
  logo_path: string | null;
  logo_on_dark: boolean;
  is_pickup_point: boolean;
  pickup_sort_order: number | null;
}

interface RouteRow {
  origin_store_id: string;
  destination_store_id: string;
  loggi_brl: number | string;
  uber_brl: number | string | null;
}

interface ComparisonCarrierRow {
  id: string;
  name: string;
  is_highlighted: boolean;
  sort_order: number;
}

interface ComparisonRowRow {
  id: string;
  label: string;
  sort_order: number;
}

interface ComparisonValueRow {
  row_id: string;
  carrier_id: string;
  status: ComparisonStatus | null;
  text: string;
  detail: string | null;
}

interface CouponRow {
  code: string;
  type: "percent" | "flat";
  value: number | string;
  label: string;
}

interface StateRow {
  uf: string;
  name: string;
}

const byPtBr = (a: string, b: string) => a.localeCompare(b, "pt-BR");

function createCatalogClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Variáveis do Supabase não configuradas.");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          next: { revalidate: REVALIDATE_SECONDS },
        }),
    },
  });
}

function must<T>(
  result: { data: T[] | null; error: { message: string } | null },
  what: string,
) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (!result.data || result.data.length === 0) throw new Error(`${what}: sem dados.`);
  return result.data;
}

/** Lança em qualquer falha ou inconsistência — quem chama cai no catálogo estático. */
export async function loadCatalogFromSupabase(): Promise<Catalog> {
  const supabase = createCatalogClient();

  const [stores, routes, flatRates, carriers, rows, values, coupons, states] =
    await Promise.all([
      supabase
        .from("stores")
        .select(
          "id, code, name, address, neighborhood, city, state, lat, lng, logo_path, logo_on_dark, is_pickup_point, pickup_sort_order",
        )
        .order("code"),
      supabase
        .from("freight_routes")
        .select("origin_store_id, destination_store_id, loggi_brl, uber_brl"),
      supabase.from("carrier_flat_rates").select("carrier, flat_rate_brl"),
      supabase.from("comparison_carriers").select("*").order("sort_order"),
      supabase.from("comparison_rows").select("*").order("sort_order"),
      supabase.from("comparison_values").select("*"),
      supabase.from("coupons").select("code, type, value, label").eq("active", true),
      supabase.from("brazil_states").select("uf, name"),
    ]);

  const storeRows = must<StoreRow>(stores, "stores");
  const routeRows = must<RouteRow>(routes, "freight_routes");
  const flatRateRows = must<{ carrier: string; flat_rate_brl: number | string }>(
    flatRates,
    "carrier_flat_rates",
  );
  const carrierRows = must<ComparisonCarrierRow>(carriers, "comparison_carriers");
  const comparisonRows = must<ComparisonRowRow>(rows, "comparison_rows");
  const valueRows = must<ComparisonValueRow>(values, "comparison_values");
  const couponRows = must<CouponRow>(coupons, "coupons");
  const stateRows = must<StateRow>(states, "brazil_states");

  const codeById = new Map(storeRows.map((s) => [s.id, s.code]));

  const freightStores: FreightStore[] = storeRows.map((s) => ({
    id: s.code,
    name: s.name,
    address: s.address,
    logo: s.logo_path ?? "",
    ...(s.logo_on_dark ? { logoOnDark: true } : {}),
    isPickupPoint: s.is_pickup_point,
  }));

  const toPartner = (s: StoreRow): PickupPartner => {
    if (s.lat === null || s.lng === null) {
      throw new Error(`stores: ${s.code} sem coordenadas.`);
    }
    return {
      id: s.code,
      name: s.name,
      neighborhood: s.neighborhood ?? "",
      city: s.city,
      state: s.state,
      address: s.address,
      logo: s.logo_path ?? "",
      ...(s.logo_on_dark ? { onDark: true } : {}),
      coordinates: { lat: Number(s.lat), lng: Number(s.lng) },
    };
  };

  const coletaPartners = storeRows.map(toPartner);
  const pickupPartners = storeRows
    .filter((s) => s.is_pickup_point)
    .sort(
      (a, b) =>
        (a.pickup_sort_order ?? Number.MAX_SAFE_INTEGER) -
        (b.pickup_sort_order ?? Number.MAX_SAFE_INTEGER),
    )
    .map(toPartner);

  const storeLogos = [...storeRows]
    .sort((a, b) => byPtBr(a.name, b.name))
    .map((s) => ({
      name: s.name,
      src: s.logo_path ?? "",
      ...(s.logo_on_dark ? { onDark: true } : {}),
    }));

  const freightRoutes: FreightRouteQuote[] = routeRows.map((r) => {
    const originStoreId = codeById.get(r.origin_store_id);
    const destinationStoreId = codeById.get(r.destination_store_id);
    if (!originStoreId || !destinationStoreId) {
      throw new Error("freight_routes: rota referencia loja inexistente.");
    }
    return {
      originStoreId,
      destinationStoreId,
      loggiBRL: Number(r.loggi_brl),
      ...(r.uber_brl !== null ? { uberBRL: Number(r.uber_brl) } : {}),
    };
  });

  const correios = flatRateRows.find((r) => r.carrier === "correios");
  if (!correios) throw new Error("carrier_flat_rates: correios ausente.");

  const marketCarriers = carrierRows.map((c) => ({
    id: c.id,
    name: c.name,
    ...(c.is_highlighted ? { highlight: true } : {}),
  }));

  const marketRows: ComparisonRow[] = comparisonRows.map((row) => ({
    label: row.label,
    values: carrierRows.map((carrier) => {
      const v = valueRows.find((x) => x.row_id === row.id && x.carrier_id === carrier.id);
      if (!v) throw new Error(`comparison_values: faltando valor em "${row.label}".`);
      return {
        ...(v.status ? { status: v.status } : {}),
        text: v.text,
        ...(v.detail ? { detail: v.detail } : {}),
      };
    }),
  }));

  return {
    source: "supabase",
    stores: freightStores,
    coletaPartners,
    pickupPartners,
    storeLogos,
    freightRoutes,
    correiosFlatRateBRL: Number(correios.flat_rate_brl),
    marketComparison: { carriers: marketCarriers, rows: marketRows },
    coupons: couponRows.map((c) => ({
      code: c.code,
      type: c.type,
      value: Number(c.value),
      label: c.label,
    })),
    brazilStates: [...stateRows].sort((a, b) => byPtBr(a.name, b.name)),
  };
}

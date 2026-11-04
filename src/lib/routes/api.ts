"use client";

import { createBrowserClient } from "@/lib/supabase/client";
import { ORDER_PHOTO_BUCKET, friendlyAdminError, rpc } from "@/lib/admin/api";

/** Planejamento, rotas, viagens e cadastros da operação (0017_routes.sql). */

export type RouteKind = "coleta" | "entrega";

// --- Planejamento ---------------------------------------------------------------

export interface BacklogRow {
  orderId: string;
  storeCode: string;
  openRouteId?: string;
}

interface BacklogDbRow {
  order_id: string;
  store_code: string;
  open_route_id: string | null;
}

export async function fetchBacklog(kind: RouteKind): Promise<BacklogRow[]> {
  const rows = await rpc<BacklogDbRow[]>(
    kind === "coleta" ? "admin_collection_backlog" : "admin_delivery_backlog",
    {},
  );
  return (rows ?? []).map((r) => ({
    orderId: r.order_id,
    storeCode: r.store_code,
    openRouteId: r.open_route_id ?? undefined,
  }));
}

export interface StoreClosure {
  storeCode: string;
  day: string;
  note?: string;
}

export async function fetchClosures(fromDay: string): Promise<StoreClosure[]> {
  const { data, error } = await createBrowserClient()
    .from("store_closures" as never)
    .select("day, note, store:stores(code)")
    .gte("day", fromDay)
    .returns<{ day: string; note: string | null; store: { code: string } | null }[]>();
  if (error) throw friendlyAdminError(error);
  return (data ?? []).map((r) => ({
    storeCode: r.store?.code ?? "",
    day: r.day,
    note: r.note ?? undefined,
  }));
}

export async function setStoreClosure(
  storeCode: string,
  day: string,
  closed: boolean,
  note?: string,
) {
  await rpc<void>("admin_set_store_closure", {
    p_store_code: storeCode,
    p_day: day,
    p_closed: closed,
    p_note: note ?? null,
  });
}

/** Paradas na ordem: cada uma com a loja e os pedidos daquela loja. */
export async function createRoute(
  kind: RouteKind,
  day: string,
  stops: { storeCode: string; orderIds: string[] }[],
): Promise<string> {
  return rpc<string>("admin_create_route", { p_kind: kind, p_day: day, p: stops });
}

// --- Rotas e viagens ---------------------------------------------------------------

export interface StopOrder {
  orderId: string;
  result?: "coletado" | "nao_coletado" | "entregue" | "nao_entregue";
}

export interface StopPhoto {
  id: string;
  url: string;
}

export interface RouteStop {
  id: string;
  position: number;
  storeCode: string;
  status: string;
  plannedAt?: string;
  doneAt?: string;
  reason?: string;
  note?: string;
  contactName?: string;
  lat?: number;
  lng?: number;
  orders: StopOrder[];
  photos: StopPhoto[];
}

export interface RouteSummary {
  id: string;
  kind: RouteKind;
  day: string;
  tripId?: string;
  position: number;
  status: string;
  stops: RouteStop[];
}

export interface Trip {
  id: string;
  day: string;
  status: string;
  driverId: string;
  /** Vem de fetchDrivers (a Equipe só é legível por quem vê Pessoas). */
  driverName: string;
  vehicleId?: string;
  vehicleName?: string;
  plannedStartAt?: string;
  plannedEndAt?: string;
  startedAt?: string;
  finishedAt?: string;
  odometerStart?: number;
  odometerEnd?: number;
  kmSource: string;
  plannedKm?: number;
  actualKm?: number;
  fuelPrice?: number;
  kmPerLiter?: number;
  plannedFuelCost?: number;
  plannedDriverCost?: number;
  actualFuelCost?: number;
  actualDriverCost?: number;
  notes?: string;
  cancelReason?: string;
  routes: RouteSummary[];
}

const num = (v: number | string | null | undefined) =>
  v === null || v === undefined ? undefined : Number(v);

interface StopRow {
  id: string;
  position: number;
  status: string;
  planned_at: string | null;
  done_at: string | null;
  reason: string | null;
  note: string | null;
  contact_name: string | null;
  lat: number | null;
  lng: number | null;
  store: { code: string } | null;
  orders: { order_id: string; result: StopOrder["result"] | null }[];
  photos?: { id: string; path: string }[];
}

interface RouteRow {
  id: string;
  kind: RouteKind;
  day: string;
  trip_id: string | null;
  position: number;
  status: string;
  stops: StopRow[];
}

const ROUTE_SELECT = `id, kind, day, trip_id, position, status,
  stops:route_stops(id, position, status, planned_at, done_at, reason, note, contact_name, lat, lng,
    store:stores(code), orders:route_stop_orders(order_id, result), photos:stop_photos(id, path))`;

function mapRoute(r: RouteRow, urls: Map<string, string>): RouteSummary {
  return {
    id: r.id,
    kind: r.kind,
    day: r.day,
    tripId: r.trip_id ?? undefined,
    position: r.position,
    status: r.status,
    stops: [...r.stops]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        id: s.id,
        position: s.position,
        storeCode: s.store?.code ?? "",
        status: s.status,
        plannedAt: s.planned_at ?? undefined,
        doneAt: s.done_at ?? undefined,
        reason: s.reason ?? undefined,
        note: s.note ?? undefined,
        contactName: s.contact_name ?? undefined,
        lat: s.lat ?? undefined,
        lng: s.lng ?? undefined,
        orders: s.orders.map((o) => ({
          orderId: o.order_id,
          result: o.result ?? undefined,
        })),
        photos: (s.photos ?? [])
          .map((p) => ({ id: p.id, url: urls.get(p.path) ?? "" }))
          .filter((p) => p.url),
      })),
  };
}

async function photoUrls(routes: RouteRow[]): Promise<Map<string, string>> {
  const paths = routes.flatMap((r) =>
    r.stops.flatMap((s) => (s.photos ?? []).map((p) => p.path)),
  );
  if (paths.length === 0) return new Map();
  const { data } = await createBrowserClient()
    .storage.from(ORDER_PHOTO_BUCKET)
    .createSignedUrls(paths, 3600);
  return new Map(
    (data ?? []).flatMap((d) =>
      d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [],
    ),
  );
}

/** Rotas de um intervalo de dias (com ou sem viagem), sem as canceladas. */
export async function fetchRoutes(
  fromDay: string,
  toDay: string,
): Promise<RouteSummary[]> {
  const { data, error } = await createBrowserClient()
    .from("routes" as never)
    .select(ROUTE_SELECT)
    .gte("day", fromDay)
    .lte("day", toDay)
    .neq("status", "cancelada")
    .order("day")
    .returns<RouteRow[]>();
  if (error) throw friendlyAdminError(error);
  return (data ?? []).map((r) => mapRoute(r, new Map()));
}

interface TripRow {
  id: string;
  day: string;
  status: string;
  driver_id: string;
  vehicle_id: string | null;
  planned_start_at: string | null;
  planned_end_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  odometer_start: number | string | null;
  odometer_end: number | string | null;
  km_source: string;
  planned_km: number | string | null;
  actual_km: number | string | null;
  fuel_price: number | string | null;
  km_per_liter: number | string | null;
  planned_fuel_cost: number | string | null;
  planned_driver_cost: number | string | null;
  actual_fuel_cost: number | string | null;
  actual_driver_cost: number | string | null;
  notes: string | null;
  cancel_reason: string | null;
  vehicle: { name: string; plate: string | null } | null;
  routes: RouteRow[];
}

const TRIP_SELECT = `id, day, status, driver_id, vehicle_id, planned_start_at, planned_end_at,
  started_at, finished_at, odometer_start, odometer_end, km_source, planned_km, actual_km,
  fuel_price, km_per_liter, planned_fuel_cost, planned_driver_cost, actual_fuel_cost,
  actual_driver_cost, notes, cancel_reason,
  vehicle:vehicles(name, plate),
  routes(${ROUTE_SELECT})`;

function mapTrip(t: TripRow, urls: Map<string, string>): Trip {
  return {
    id: t.id,
    day: t.day,
    status: t.status,
    driverId: t.driver_id,
    driverName: "",
    vehicleId: t.vehicle_id ?? undefined,
    vehicleName: t.vehicle
      ? `${t.vehicle.name}${t.vehicle.plate ? ` · ${t.vehicle.plate}` : ""}`
      : undefined,
    plannedStartAt: t.planned_start_at ?? undefined,
    plannedEndAt: t.planned_end_at ?? undefined,
    startedAt: t.started_at ?? undefined,
    finishedAt: t.finished_at ?? undefined,
    odometerStart: num(t.odometer_start),
    odometerEnd: num(t.odometer_end),
    kmSource: t.km_source,
    plannedKm: num(t.planned_km),
    actualKm: num(t.actual_km),
    fuelPrice: num(t.fuel_price),
    kmPerLiter: num(t.km_per_liter),
    plannedFuelCost: num(t.planned_fuel_cost),
    plannedDriverCost: num(t.planned_driver_cost),
    actualFuelCost: num(t.actual_fuel_cost),
    actualDriverCost: num(t.actual_driver_cost),
    notes: t.notes ?? undefined,
    cancelReason: t.cancel_reason ?? undefined,
    routes: [...t.routes]
      .filter((r) => r.status !== "cancelada")
      .sort((a, b) => a.position - b.position)
      .map((r) => mapRoute(r, urls)),
  };
}

export async function fetchTrips(fromDay: string, toDay: string): Promise<Trip[]> {
  const { data, error } = await createBrowserClient()
    .from("trips" as never)
    .select(TRIP_SELECT)
    .gte("day", fromDay)
    .lte("day", toDay)
    .order("day", { ascending: false })
    .returns<TripRow[]>();
  if (error) throw friendlyAdminError(error);
  return (data ?? []).map((t) => mapTrip(t, new Map()));
}

export async function fetchTrip(id: string): Promise<Trip | null> {
  const { data, error } = await createBrowserClient()
    .from("trips" as never)
    .select(TRIP_SELECT)
    .eq("id", id)
    .maybeSingle<TripRow>();
  if (error) throw friendlyAdminError(error);
  if (!data) return null;
  return mapTrip(data, await photoUrls(data.routes));
}

export interface TripInput {
  day: string;
  driverId: string;
  vehicleId?: string;
  routeIds: string[];
  /** "HH:MM", horário de Brasília. */
  plannedStart?: string;
  notes?: string;
}

export async function saveTrip(tripId: string | null, input: TripInput): Promise<string> {
  return rpc<string>("admin_save_trip", { p_trip: tripId, p: input });
}

export async function sendTrip(tripId: string) {
  await rpc<void>("admin_send_trip", { p_trip: tripId });
}

export async function cancelTrip(tripId: string, reason: string) {
  await rpc<void>("admin_cancel_trip", { p_trip: tripId, p_reason: reason });
}

export async function setTripOdometer(tripId: string, start: number, end: number) {
  await rpc<void>("admin_set_trip_odometer", {
    p_trip: tripId,
    p_start: start,
    p_end: end,
  });
}

export async function reorderStops(routeId: string, stopIds: string[]) {
  await rpc<void>("admin_reorder_stops", { p_route: routeId, p_stop_ids: stopIds });
}

export async function removeRouteOrder(stopId: string, orderId: string) {
  await rpc<void>("admin_remove_route_order", { p_stop: stopId, p_order: orderId });
}

export async function cancelRoute(routeId: string) {
  await rpc<void>("admin_cancel_route", { p_route: routeId });
}

/** Rotas em que um pedido entrou (detalhe do pedido). */
export async function fetchOrderRoutes(orderId: string): Promise<
  {
    routeId: string;
    kind: RouteKind;
    day: string;
    routeStatus: string;
    tripId?: string;
    storeCode: string;
    stopStatus: string;
    result?: StopOrder["result"];
    reason?: string;
  }[]
> {
  const { data, error } = await createBrowserClient()
    .from("route_stop_orders" as never)
    .select(
      "result, stop:route_stops(status, reason, store:stores(code), route:routes(id, kind, day, status, trip_id))",
    )
    .eq("order_id", orderId)
    .returns<
      {
        result: StopOrder["result"] | null;
        stop: {
          status: string;
          reason: string | null;
          store: { code: string } | null;
          route: {
            id: string;
            kind: RouteKind;
            day: string;
            status: string;
            trip_id: string | null;
          } | null;
        } | null;
      }[]
    >();
  if (error) throw friendlyAdminError(error);
  return (data ?? [])
    .filter((r) => r.stop?.route)
    .map((r) => ({
      routeId: r.stop!.route!.id,
      kind: r.stop!.route!.kind,
      day: r.stop!.route!.day,
      routeStatus: r.stop!.route!.status,
      tripId: r.stop!.route!.trip_id ?? undefined,
      storeCode: r.stop!.store?.code ?? "",
      stopStatus: r.stop!.status,
      result: r.result ?? undefined,
      reason: r.stop!.reason ?? undefined,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

// --- Cadastros ----------------------------------------------------------------------

export interface Driver {
  id: string;
  name: string;
  hasAccount: boolean;
  active: boolean;
}

export async function fetchDrivers(): Promise<Driver[]> {
  const rows = await rpc<
    { id: string; name: string; has_account: boolean; active: boolean }[]
  >("admin_list_drivers", {});
  return (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    hasAccount: r.has_account,
    active: r.active,
  }));
}

export interface Vehicle {
  id: string;
  name: string;
  plate?: string;
  kmPerLiter: number;
  active: boolean;
}

export async function fetchVehicles(): Promise<Vehicle[]> {
  const { data, error } = await createBrowserClient()
    .from("vehicles" as never)
    .select("id, name, plate, km_per_liter, active")
    .order("name")
    .returns<
      {
        id: string;
        name: string;
        plate: string | null;
        km_per_liter: number | string;
        active: boolean;
      }[]
    >();
  if (error) throw friendlyAdminError(error);
  return (data ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    plate: v.plate ?? undefined,
    kmPerLiter: Number(v.km_per_liter),
    active: v.active,
  }));
}

export async function upsertVehicle(
  vehicleId: string | null,
  input: { name: string; plate?: string; kmPerLiter: number; active: boolean },
): Promise<string> {
  return rpc<string>("admin_upsert_vehicle", { p_vehicle: vehicleId, p: input });
}

export interface FuelPrice {
  day: string;
  pricePerLiter: number;
}

export async function fetchFuelPrices(): Promise<FuelPrice[]> {
  const { data, error } = await createBrowserClient()
    .from("fuel_prices" as never)
    .select("day, price_per_liter")
    .order("day", { ascending: false })
    .limit(60)
    .returns<{ day: string; price_per_liter: number | string }[]>();
  if (error) throw friendlyAdminError(error);
  return (data ?? []).map((f) => ({
    day: f.day,
    pricePerLiter: Number(f.price_per_liter),
  }));
}

export async function setFuelPrice(day: string, price: number) {
  await rpc<void>("admin_set_fuel_price", { p_day: day, p_price: price });
}

export interface OpsSettings {
  baseName: string;
  baseLat?: number;
  baseLng?: number;
  roadFactor: number;
  avgSpeedKmh: number;
  stopMinutes: number;
}

export async function fetchOpsSettings(): Promise<OpsSettings> {
  const { data, error } = await createBrowserClient()
    .from("ops_settings" as never)
    .select("base_name, base_lat, base_lng, road_factor, avg_speed_kmh, stop_minutes")
    .eq("id", 1)
    .maybeSingle<{
      base_name: string;
      base_lat: number | null;
      base_lng: number | null;
      road_factor: number | string;
      avg_speed_kmh: number | string;
      stop_minutes: number;
    }>();
  if (error) throw friendlyAdminError(error);
  return {
    baseName: data?.base_name ?? "Base T1",
    baseLat: data?.base_lat ?? undefined,
    baseLng: data?.base_lng ?? undefined,
    roadFactor: Number(data?.road_factor ?? 1.3),
    avgSpeedKmh: Number(data?.avg_speed_kmh ?? 25),
    stopMinutes: data?.stop_minutes ?? 10,
  };
}

export async function updateOpsSettings(input: OpsSettings) {
  await rpc<void>("admin_update_ops_settings", {
    p: {
      baseName: input.baseName,
      baseLat: input.baseLat ?? "",
      baseLng: input.baseLng ?? "",
      roadFactor: input.roadFactor,
      avgSpeedKmh: input.avgSpeedKmh,
      stopMinutes: input.stopMinutes,
    },
  });
}

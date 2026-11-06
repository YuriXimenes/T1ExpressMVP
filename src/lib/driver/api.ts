"use client";

import { createBrowserClient } from "@/lib/supabase/client";
import { resizeImage } from "@/lib/photo-resize";

/** Área do entregador (/entregador): só funções `driver_*` da 0017. */
export class DriverError extends Error {}

function friendly(error: { message?: string; code?: string }): DriverError {
  if (error.code === "P0001" && error.message) return new DriverError(error.message);
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("failed to fetch") || message.includes("network")) {
    return new DriverError("Sem conexão. Confira a internet e tente de novo.");
  }
  return new DriverError("Não foi possível concluir. Tente novamente.");
}

async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await createBrowserClient().rpc(name as never, args as never);
  if (error) throw friendly(error);
  return data as T;
}

export interface DriverAccess {
  memberId: string;
  name: string;
}

export async function fetchDriverAccess(): Promise<DriverAccess | null> {
  const { data, error } = await createBrowserClient().rpc("my_driver_access" as never);
  // Banco ainda sem a 0017: ninguém é entregador.
  if (error?.code === "PGRST202") return null;
  if (error) throw friendly(error);
  return (data as DriverAccess | null) ?? null;
}

export interface DriverStopOrder {
  orderId: string;
  code: string;
  customerFirstName?: string;
  result?: "coletado" | "nao_coletado" | "entregue" | "nao_entregue";
}

export interface DriverStop {
  id: string;
  position: number;
  status: string;
  plannedAt?: string;
  doneAt?: string;
  reason?: string;
  note?: string;
  contactName?: string;
  store: {
    name: string;
    address: string;
    neighborhood?: string;
    city: string;
    lat?: number;
    lng?: number;
  };
  orders: DriverStopOrder[];
}

export interface DriverRoute {
  id: string;
  kind: "coleta" | "entrega";
  status: string;
  stops: DriverStop[];
}

export interface DriverTrip {
  id: string;
  day: string;
  status: string;
  vehicle?: string;
  plannedStartAt?: string;
  startedAt?: string;
  finishedAt?: string;
  odometerStart?: number;
  plannedKm?: number;
  actualKm?: number;
  notes?: string;
  lastPosition?: { lat: number; lng: number; at: string };
  /** Só no histórico. */
  stopsDone?: number;
  stopsFailed?: number;
  routes: DriverRoute[];
}

export async function fetchDriverTrips(): Promise<DriverTrip[]> {
  return (await call<DriverTrip[]>("driver_trips")) ?? [];
}

export interface Position {
  lat: number;
  lng: number;
}

/** Posição do celular, se a pessoa permitir; sem permissão ou sem sinal, segue sem. */
export function currentPosition(timeoutMs = 8000): Promise<Position | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation)
    return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

export async function startTrip(tripId: string, odometer: number, at: Position | null) {
  await call<void>("driver_start_trip", {
    p_trip: tripId,
    p_odometer: odometer,
    p_lat: at?.lat ?? null,
    p_lng: at?.lng ?? null,
  });
}

export async function finishTrip(tripId: string, odometer: number, at: Position | null) {
  await call<void>("driver_finish_trip", {
    p_trip: tripId,
    p_odometer: odometer,
    p_lat: at?.lat ?? null,
    p_lng: at?.lng ?? null,
  });
}

export interface StopRecord {
  orders: { orderId: string; ok: boolean }[];
  contactName?: string;
  reason?: string;
  note?: string;
  at: Position | null;
}

export async function recordStop(stopId: string, record: StopRecord) {
  await call<void>("driver_record_stop", {
    p_stop: stopId,
    p: {
      orders: record.orders,
      contactName: record.contactName ?? "",
      reason: record.reason ?? "",
      note: record.note ?? "",
      lat: record.at?.lat ?? "",
      lng: record.at?.lng ?? "",
    },
  });
}

export async function deliverByToken(
  token: string,
  contactName: string | undefined,
  at: Position | null,
): Promise<{ ok: boolean; orderCode: string }> {
  return call("driver_deliver_by_token", {
    p_token: token,
    p: { contactName: contactName ?? "", lat: at?.lat ?? "", lng: at?.lng ?? "" },
  });
}

/** Foto do pacote na parada: reduz no celular, envia e registra. */
export async function uploadStopPhoto(stopId: string, file: File) {
  let blob: Blob;
  try {
    blob = await resizeImage(file);
  } catch {
    throw new DriverError("Não foi possível ler essa foto. Tente outra.");
  }
  const supabase = createBrowserClient();
  const path = `stops/${stopId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from("order-photos")
    .upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new DriverError("Não foi possível enviar a foto. Tente novamente.");
  try {
    await call<string>("driver_add_stop_photo", { p_stop: stopId, p_path: path });
  } catch (err) {
    await supabase.storage.from("order-photos").remove([path]);
    throw err;
  }
}

// --- Mapa, GPS, histórico e ganhos (0026) ----------------------------------------

export interface TripTrack {
  tripId: string;
  status: string;
  day: string;
  driverName: string;
  startedAt?: string;
  finishedAt?: string;
  /** Pontos [lat, lng] em ordem. */
  path: [number, number][];
  last?: { lat: number; lng: number; at: string; source: string; accuracy?: number };
  stops: {
    id: string;
    routeKind: "coleta" | "entrega";
    position: number;
    status: string;
    doneAt?: string;
    name: string;
    address: string;
    lat?: number;
    lng?: number;
  }[];
}

export async function fetchDriverTripTrack(tripId: string): Promise<TripTrack> {
  return call<TripTrack>("driver_trip_track", { p_trip: tripId });
}

/** Grava a posição; devolve false quando o banco descarta (rápido demais ou imprecisa). */
export async function trackPosition(
  tripId: string,
  lat: number,
  lng: number,
  accuracy?: number,
): Promise<boolean> {
  return call<boolean>("driver_track_position", {
    p_trip: tripId,
    p_lat: lat,
    p_lng: lng,
    p_accuracy: accuracy ?? null,
  });
}

export async function fetchDriverHistory(): Promise<DriverTrip[]> {
  return (await call<DriverTrip[]>("driver_trip_history")) ?? [];
}

export interface EarningsMonth {
  month: string;
  current: boolean;
  dueDate: string;
  trips: number;
  tripCost: number;
  fixed: number;
  adjustments: { id: string; amount: number; description: string }[];
  adjustmentsTotal: number;
  total: number;
  payout: { amount: number; paidAt: string; receiptPath?: string; note?: string } | null;
  tripList: {
    id: string;
    day: string;
    km?: number;
    cost?: number;
    finishedAt?: string;
  }[];
}

export type DriverEarnings =
  { enabled: false } | { enabled: true; months: EarningsMonth[] };

export async function fetchDriverEarnings(): Promise<DriverEarnings> {
  try {
    return await call<DriverEarnings>("driver_earnings");
  } catch {
    // Banco sem a 0026 ou sem permissão: a aba não aparece.
    return { enabled: false };
  }
}

/** Link temporário do comprovante (só o do próprio entregador, pela política do banco). */
export async function payoutReceiptUrl(path: string): Promise<string> {
  const { data, error } = await createBrowserClient()
    .storage.from("finance-docs")
    .createSignedUrl(path, 60 * 10);
  if (error || !data) throw new DriverError("Não foi possível abrir o comprovante.");
  return data.signedUrl;
}

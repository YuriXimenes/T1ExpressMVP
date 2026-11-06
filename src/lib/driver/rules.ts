/** Regras puras do app do entregador (aba Hoje, mapa e GPS). */

export interface TripLike {
  id: string;
  day: string;
  status: string;
}

/**
 * Aba Hoje: "A fazer" = enviadas e em andamento (inclusive de dias anteriores,
 * marcadas como atrasadas); "Concluídas" = concluídas de hoje. A em andamento vem
 * primeiro.
 */
export function splitTodayTrips<T extends TripLike>(trips: T[], today: string) {
  const todo = trips
    .filter((t) => t.status === "enviada" || t.status === "em_andamento")
    .sort(
      (a, b) =>
        Number(b.status === "em_andamento") - Number(a.status === "em_andamento") ||
        a.day.localeCompare(b.day),
    );
  const done = trips.filter((t) => t.status === "concluida");
  return {
    todo,
    done,
    /** A separação só aparece quando há mais de uma viagem no dia. */
    showSections: todo.length + done.length > 1,
    isLate: (t: T) => t.day < today,
  };
}

/** Viagem que o mapa mostra: a em andamento ou a próxima a fazer. */
export function mapTrip<T extends TripLike>(trips: T[]): T | undefined {
  return (
    trips.find((t) => t.status === "em_andamento") ??
    trips
      .filter((t) => t.status === "enviada")
      .sort((a, b) => a.day.localeCompare(b.day))[0]
  );
}

export type StopTone = "pendente" | "feita" | "falhou";

export function stopTone(status: string): StopTone {
  if (status === "atendida" || status === "parcial") return "feita";
  if (status === "nao_realizada") return "falhou";
  return "pendente";
}

export const STOP_TONE_COLORS: Record<StopTone, string> = {
  pendente: "#2563eb",
  feita: "#16a34a",
  falhou: "#dc2626",
};

/** Distância em metros entre dois pontos (haversine). */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const GPS_INTERVAL_MS = 30_000;
export const GPS_DISTANCE_M = 100;
export const GPS_MAX_ACCURACY_M = 200;

/** Envia a posição se passaram 30 s ou andou 100 m desde o último envio, com boa precisão. */
export function shouldSendPosition(
  last: { lat: number; lng: number; at: number } | null,
  next: { lat: number; lng: number; at: number; accuracy?: number },
): boolean {
  if (next.accuracy !== undefined && next.accuracy > GPS_MAX_ACCURACY_M) return false;
  if (!last) return true;
  if (next.at - last.at < 15_000) return false;
  return (
    next.at - last.at >= GPS_INTERVAL_MS || distanceMeters(last, next) >= GPS_DISTANCE_M
  );
}

/** "agora", "há 3 min", "há 2 h". */
export function agoLabel(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

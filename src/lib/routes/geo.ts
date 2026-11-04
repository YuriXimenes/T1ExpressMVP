/** Distâncias para o planejamento (mesma conta de `_km_between` na 0017). */

export interface Point {
  lat: number;
  lng: number;
}

const EARTH_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Distância em linha reta (haversine), em km. */
export function kmBetween(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_KM * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Km aproximado de um percurso: base → paradas → base, cada trecho em linha
 * reta × fator de ruas. Parada sem coordenada é pulada (não soma nada).
 */
export function routeKm(
  stops: (Point | null | undefined)[],
  base: Point | null | undefined,
  roadFactor: number,
): number {
  let km = 0;
  let prev: Point | null = base ?? null;
  for (const stop of stops) {
    if (!stop) continue;
    if (prev) km += kmBetween(prev, stop) * roadFactor;
    prev = stop;
  }
  if (prev && base && prev !== base) km += kmBetween(prev, base) * roadFactor;
  return Math.round(km * 100) / 100;
}

/**
 * Sugestão de ordem: começa pela mais perto da base e vai sempre para a mais
 * perto da anterior (vizinho mais próximo). Sem coordenada, vai para o fim.
 */
export function suggestOrder<T>(
  items: T[],
  pointOf: (item: T) => Point | null | undefined,
  base: Point | null | undefined,
): T[] {
  const withPoint = items.filter((i) => pointOf(i));
  const without = items.filter((i) => !pointOf(i));
  const result: T[] = [];
  let current = base ?? (withPoint[0] ? pointOf(withPoint[0])! : null);
  const left = [...withPoint];
  while (left.length > 0) {
    let best = 0;
    if (current) {
      let bestKm = Infinity;
      left.forEach((item, index) => {
        const km = kmBetween(current!, pointOf(item)!);
        if (km < bestKm) {
          bestKm = km;
          best = index;
        }
      });
    }
    const [next] = left.splice(best, 1);
    result.push(next);
    current = pointOf(next)!;
  }
  return [...result, ...without];
}

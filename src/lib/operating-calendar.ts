/**
 * Calendário operacional da T1: coletas e entregas só às segundas, quartas e
 * sextas, em horário de Brasília, pulando feriados e dias sem operação.
 * Tudo em "chaves" de data `AAAA-MM-DD` para não depender do fuso do navegador.
 */

/** 0 = domingo … 6 = sábado. */
export const OPERATING_WEEKDAYS = [1, 3, 5];

/** Pedido a partir desta hora (de Brasília) vale como se fosse do dia seguinte. */
export const COLLECTION_CUTOFF_HOUR = 18;

/**
 * Folgas da T1 além dos feriados (formato "AAAA-MM-DD"): inclua aqui qualquer
 * dia em que não haverá coleta nem entrega.
 */
export const CLOSED_DATES: string[] = [];

const TIME_ZONE = "America/Sao_Paulo";

export interface Schedule {
  /** Dia em que a coleta acontece ("AAAA-MM-DD"). */
  collect: string;
  /** Dia em que o pedido fica disponível para retirada. */
  pickup: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function parseKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

function utcDate(key: string): Date {
  const { y, m, d } = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(key: string, days: number): string {
  const date = utcDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return keyOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function weekdayOf(key: string): number {
  return utcDate(key).getUTCDay();
}

/** Dia e hora no horário de Brasília. */
function saoPauloParts(date: Date): { key: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    key: keyOf(Number(parts.year), Number(parts.month), Number(parts.day)),
    hour: Number(parts.hour),
  };
}

/** Páscoa (algoritmo de Meeus/Jones/Butcher). */
function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return keyOf(year, month, day);
}

const holidayCache = new Map<number, Set<string>>();

/** Feriados nacionais, os que mudam todo ano e os do Rio de Janeiro. */
export function holidaysOf(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const fixed = [
    [1, 1], // Confraternização Universal
    [1, 20], // São Sebastião (Rio de Janeiro)
    [4, 21], // Tiradentes
    [4, 23], // São Jorge (Rio de Janeiro)
    [5, 1], // Dia do Trabalho
    [9, 7], // Independência
    [10, 12], // Nossa Senhora Aparecida
    [11, 2], // Finados
    [11, 15], // Proclamação da República
    [11, 20], // Consciência Negra
    [12, 25], // Natal
  ].map(([m, d]) => keyOf(year, m, d));
  const easterKey = easter(year);
  const movable = [
    addDays(easterKey, -48), // segunda de Carnaval
    addDays(easterKey, -47), // terça de Carnaval
    addDays(easterKey, -2), // Sexta-feira Santa
    addDays(easterKey, 60), // Corpus Christi
  ];
  const set = new Set([...fixed, ...movable]);
  holidayCache.set(year, set);
  return set;
}

export function isOperatingDay(
  key: string,
  closedDates: string[] = CLOSED_DATES,
): boolean {
  return (
    OPERATING_WEEKDAYS.includes(weekdayOf(key)) &&
    !holidaysOf(parseKey(key).y).has(key) &&
    !closedDates.includes(key)
  );
}

/** Primeiro dia de operação a partir de `key`, inclusive. */
function firstOperatingDayFrom(key: string, closedDates: string[]): string {
  let day = key;
  for (let i = 0; i < 60; i++) {
    if (isOperatingDay(day, closedDates)) return day;
    day = addDays(day, 1);
  }
  throw new Error("Sem dia de operação nos próximos 60 dias.");
}

/**
 * Coleta e retirada de um pedido feito em `orderedAt`:
 * - coleta: o primeiro dia de operação a partir do dia do pedido (do dia
 *   seguinte, se o pedido saiu a partir do horário de corte);
 * - retirada: o próximo dia de operação depois da coleta.
 */
export function computeSchedule(
  orderedAt: Date | string,
  options: { closedDates?: string[]; cutoffHour?: number } = {},
): Schedule {
  const closedDates = options.closedDates ?? CLOSED_DATES;
  const cutoff = options.cutoffHour ?? COLLECTION_CUTOFF_HOUR;
  const { key, hour } = saoPauloParts(new Date(orderedAt));
  const start = hour >= cutoff ? addDays(key, 1) : key;
  const collect = firstOperatingDayFrom(start, closedDates);
  const pickup = firstOperatingDayFrom(addDays(collect, 1), closedDates);
  return { collect, pickup };
}

/** "segunda-feira, 19/10/2026". */
export function formatScheduleDate(key: string): string {
  const text = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(utcDate(key));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "19/10/2026". */
export function formatShortDate(key: string): string {
  const { y, m, d } = parseKey(key);
  return `${pad(d)}/${pad(m)}/${y}`;
}

/** "19/10/2026 às 15:30", no horário de Brasília. */
export function formatOrderMoment(orderedAt: Date | string): string {
  const date = new Date(orderedAt);
  const day = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${day} às ${time}`;
}

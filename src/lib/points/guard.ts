/** Prazo de guarda dos pacotes no ponto de retirada (0018_points_occurrences.sql). */

export type GuardState = "ok" | "today" | "expired";

const dayKeySP = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

/** Vencido (passou do prazo), vence hoje (dia de Brasília) ou no prazo. */
export function guardState(
  guardUntil: string | undefined,
  now: Date = new Date(),
): GuardState {
  if (!guardUntil) return "ok";
  const until = new Date(guardUntil);
  if (until.getTime() < now.getTime()) return "expired";
  return dayKeySP(until) === dayKeySP(now) ? "today" : "ok";
}

export const GUARD_STATE_LABELS: Record<GuardState, string> = {
  ok: "No prazo",
  today: "Vence hoje",
  expired: "Prazo vencido",
};

/** Dias inteiros desde que o pacote chegou ao ponto. */
export function daysWaiting(
  availableAt: string | undefined,
  now: Date = new Date(),
): number {
  if (!availableAt) return 0;
  return Math.max(
    0,
    Math.floor((now.getTime() - new Date(availableAt).getTime()) / 86_400_000),
  );
}

/** 30,5 h → "1 dia e 7 h"; 5 h → "5 h". */
export function hoursLabel(hours: number | undefined): string {
  if (hours === undefined || Number.isNaN(hours)) return "—";
  const total = Math.round(hours);
  if (total < 24) return `${total} h`;
  const days = Math.floor(total / 24);
  const rest = total % 24;
  return `${days} ${days === 1 ? "dia" : "dias"}${rest ? ` e ${rest} h` : ""}`;
}

export const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

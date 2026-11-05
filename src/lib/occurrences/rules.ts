import { addDays, holidaysOf, weekdayOf } from "@/lib/operating-calendar";

/** Regras das ocorrências (espelho da 0018_points_occurrences.sql). */

export type OccurrenceStatus = "aberta" | "em_analise" | "resolvida" | "encerrada";
export type OccurrenceActor = "admin" | "driver" | "customer" | "store" | "system";
export type ResolutionKind =
  | "reembolso"
  | "sinistro"
  | "reenvio"
  | "devolucao_loja"
  | "credito"
  | "cupom"
  | "prorrogacao_guarda"
  | "sem_acao";

export const OCCURRENCE_STATUS_LABELS: Record<OccurrenceStatus, string> = {
  aberta: "Aberta",
  em_analise: "Em análise",
  resolvida: "Resolvida",
  encerrada: "Encerrada",
};

export const OCCURRENCE_STATUSES = Object.keys(
  OCCURRENCE_STATUS_LABELS,
) as OccurrenceStatus[];

export const OCCURRENCE_ACTOR_LABELS: Record<OccurrenceActor, string> = {
  admin: "Equipe T1",
  driver: "Entregador",
  customer: "Cliente",
  store: "Loja",
  system: "Sistema",
};

export const RESOLUTION_LABELS: Record<ResolutionKind, string> = {
  reembolso: "Reembolso",
  sinistro: "Sinistro",
  reenvio: "Reenvio",
  devolucao_loja: "Devolução à loja",
  credito: "Crédito",
  cupom: "Cupom",
  prorrogacao_guarda: "Prorrogar prazo de retirada",
  sem_acao: "Sem ação",
};

/** Resoluções que pedem valor em reais (ou % no cupom). */
export const RESOLUTIONS_WITH_AMOUNT: ResolutionKind[] = [
  "reembolso",
  "sinistro",
  "credito",
  "cupom",
];

const TIME_ZONE = "America/Sao_Paulo";

function saoPauloKey(date: Date): { key: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    key: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

export function isBusinessDay(key: string): boolean {
  const weekday = weekdayOf(key);
  return weekday >= 1 && weekday <= 5 && !holidaysOf(Number(key.slice(0, 4))).has(key);
}

/** Mesmo horário de Brasília, `days` dias úteis depois (seg a sex, sem feriado). */
export function addBusinessDays(at: Date | string, days: number): Date {
  const { key, time } = saoPauloKey(new Date(at));
  let day = key;
  let count = 0;
  while (count < days) {
    day = addDays(day, 1);
    if (isBusinessDay(day)) count++;
  }
  // Brasília não tem horário de verão desde 2019: UTC-3 fixo.
  return new Date(`${day}T${time}-03:00`);
}

/** Status que a pessoa vê: resolvida com o prazo de 3 dias úteis vencido já é encerrada. */
export function effectiveStatus(
  occurrence: { status: OccurrenceStatus; autoCloseAt?: string },
  now: Date = new Date(),
): OccurrenceStatus {
  if (
    occurrence.status === "resolvida" &&
    occurrence.autoCloseAt &&
    new Date(occurrence.autoCloseAt).getTime() <= now.getTime()
  ) {
    return "encerrada";
  }
  return occurrence.status;
}

export type DueState = "ok" | "soon" | "overdue";

/** Prazo de resolução: vencido, vence em até 24 h, ou no prazo. Sem prazo quando já resolvida. */
export function dueState(
  occurrence: { status: OccurrenceStatus; dueAt: string },
  now: Date = new Date(),
): DueState | null {
  if (occurrence.status === "resolvida" || occurrence.status === "encerrada") return null;
  const left = new Date(occurrence.dueAt).getTime() - now.getTime();
  if (left < 0) return "overdue";
  if (left <= 24 * 3600 * 1000) return "soon";
  return "ok";
}

/** 168 → "7 dias"; 36 → "36 horas"; 24 → "1 dia". */
export function deadlineLabel(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} ${days === 1 ? "dia" : "dias"}`;
  }
  return `${hours} ${hours === 1 ? "hora" : "horas"}`;
}

export const occurrenceCode = (number: number) => `OC-${number}`;

/** "R$ 15,00" ou "15% de desconto" no cupom percentual. */
export function resolutionAmountLabel(
  r: { kind: ResolutionKind; amountBrl?: number; couponType?: "percent" | "flat" },
  formatBRL: (v: number) => string,
): string | null {
  if (r.amountBrl === undefined || r.amountBrl === null) return null;
  if (r.kind === "cupom" && r.couponType === "percent")
    return `${r.amountBrl}% de desconto`;
  return formatBRL(r.amountBrl);
}

import { formatBRL } from "@/components/shared/price";
import { custodyLabel } from "@/lib/admin/handling";

/** Tipos de evento gravados pelos gatilhos de `0014_order_events.sql` (e da 0015). */
export type OrderEventKind =
  | "created"
  | "paid"
  | "stage_changed"
  | "completed"
  | "cancelled"
  | "items_added"
  | "insurance_changed"
  | "store_charge_created"
  | "store_charge_paid"
  | "ticket_opened"
  | "ticket_resolved"
  | "ticket_reopened"
  | "items_checked"
  | "custody"
  | "route"
  | "stop_failed";

/** "store": lojista confirmando a retirada pelo QR do pacote. */
export type OrderEventActorKind = "customer" | "admin" | "store" | "driver" | "system";

export interface OrderEvent {
  id: string;
  orderId: string;
  createdAt: string;
  actorKind: OrderEventActorKind;
  actorName?: string;
  kind: OrderEventKind;
  fromValue?: string;
  toValue?: string;
  reason?: string;
  details: Record<string, unknown>;
  /** Reconstruído das datas antigas (pedido anterior à linha do tempo). */
  backfilled: boolean;
}

export const EVENT_KIND_LABELS: Record<OrderEventKind, string> = {
  created: "Pedido criado",
  paid: "Pagamento confirmado",
  stage_changed: "Etapa alterada",
  completed: "Pedido concluído",
  cancelled: "Pedido cancelado",
  items_added: "Valor declarado alterado",
  insurance_changed: "Seguro alterado",
  store_charge_created: "Loja extra solicitada",
  store_charge_paid: "Loja extra paga",
  ticket_opened: "Chamado aberto",
  ticket_resolved: "Chamado respondido",
  ticket_reopened: "Chamado reaberto",
  items_checked: "Conferência salva",
  custody: "Custódia",
  route: "Rota",
  stop_failed: "Parada não realizada",
};

export const ACTOR_KIND_LABELS: Record<OrderEventActorKind, string> = {
  customer: "Cliente",
  admin: "Admin",
  store: "Loja de retirada",
  driver: "Entregador",
  system: "Sistema",
};

const SITUATION_LABELS: Record<string, string> = {
  "pending-payment": "Aguardando pagamento",
  "aguardando-coleta": "Aguardando coleta",
  "em-transporte": "Em transporte",
  "disponivel-para-retirada": "Disponível para retirada",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const PAYMENT_LABELS: Record<string, string> = {
  pix: "Pix",
  "credit-card": "Cartão de crédito",
};

const situation = (value?: string) =>
  value ? (SITUATION_LABELS[value] ?? value) : undefined;

const money = (value: unknown) => {
  const n = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(n)
    ? formatBRL(n)
    : undefined;
};

const join = (...parts: (string | undefined | false)[]) =>
  parts.filter(Boolean).join(" · ") || undefined;

/** Título e detalhe de um evento, prontos para a tela. */
export function describeEvent(
  event: OrderEvent,
  storeName: (code: string) => string = (code) => code,
): { title: string; detail?: string } {
  const title = EVENT_KIND_LABELS[event.kind];
  const d = event.details;
  const stores = Array.isArray(d.storeCodes)
    ? (d.storeCodes as string[]).map(storeName).join(", ")
    : undefined;

  switch (event.kind) {
    case "created":
      return {
        title,
        detail: join(money(d.amountDueBRL) && `Valor: ${money(d.amountDueBRL)}`),
      };
    case "paid":
      return {
        title,
        detail: join(money(d.amountDueBRL), PAYMENT_LABELS[String(d.paymentMethod)]),
      };
    case "stage_changed":
      return {
        title,
        detail: `${situation(event.fromValue)} → ${situation(event.toValue)}`,
      };
    case "completed":
      return {
        title,
        detail:
          event.actorKind === "store"
            ? "Retirado com o código do cliente"
            : event.fromValue && event.fromValue !== "disponivel-para-retirada"
              ? `Concluído direto de "${situation(event.fromValue)}"`
              : undefined,
      };
    case "cancelled":
      return {
        title,
        detail: join(
          event.fromValue && `Estava em "${situation(event.fromValue)}"`,
          d.timeUnknown === true && "data do cancelamento não registrada",
        ),
      };
    case "items_added":
    case "insurance_changed":
      return {
        title,
        detail: join(
          event.kind === "insurance_changed" && "Cobertura",
          `${money(event.fromValue)} → ${money(event.toValue)}`,
        ),
      };
    case "store_charge_created":
    case "store_charge_paid":
      return {
        title,
        detail: join(
          stores,
          money(event.toValue),
          event.kind === "store_charge_paid" && PAYMENT_LABELS[String(d.paymentMethod)],
        ),
      };
    case "ticket_opened":
    case "ticket_resolved":
    case "ticket_reopened":
      return { title, detail: typeof d.subject === "string" ? d.subject : undefined };
    case "items_checked": {
      const checked = Number(d.checked ?? 0);
      const divergent = Number(d.divergent ?? 0);
      return {
        title,
        detail: join(
          `${checked} ${checked === 1 ? "item" : "itens"}`,
          divergent > 0 ? `${divergent} com divergência` : "tudo conforme o pedido",
        ),
      };
    }
    case "route":
      return {
        title: event.toValue === "removido" ? "Saiu de uma rota" : "Entrou numa rota",
        detail: join(
          d.routeKind === "coleta"
            ? "Coleta"
            : d.routeKind === "entrega"
              ? "Entrega"
              : undefined,
          typeof d.day === "string" &&
            new Date(`${d.day}T12:00:00`).toLocaleDateString("pt-BR"),
          typeof d.storeCode === "string" && storeName(d.storeCode),
          d.cancelled === true && "rota cancelada",
        ),
      };
    case "stop_failed":
      return {
        title:
          event.toValue === "entrega" ? "Entrega não realizada" : "Coleta não realizada",
        detail: join(typeof d.storeCode === "string" && storeName(d.storeCode)),
      };
    case "custody":
      return {
        title: custodyLabel(event.toValue ?? ""),
        detail: join(
          typeof d.storeCode === "string" && storeName(d.storeCode),
          typeof d.location === "string" && d.location,
          typeof d.responsible === "string" && `Responsável: ${d.responsible}`,
          typeof d.note === "string" && d.note,
        ),
      };
  }
}

/** "Cliente · Maria", "Admin · João", "Sistema". */
export function actorLabel(event: Pick<OrderEvent, "actorKind" | "actorName">): string {
  const kind = ACTOR_KIND_LABELS[event.actorKind];
  return event.actorName && event.actorKind !== "system"
    ? `${kind} · ${event.actorName}`
    : kind;
}

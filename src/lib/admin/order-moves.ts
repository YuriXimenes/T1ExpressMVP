import type { DeliveryStage, MockOrderStatus } from "@/lib/types/mock-order";

/** Coluna do Kanban: uma etapa ativa ou um status sem etapa. */
export type OrderColumnId = "pending-payment" | DeliveryStage | "completed" | "cancelled";

/** Destino de um movimento: tudo menos "aguardando pagamento" (pagamento é só do cliente). */
export type OrderMoveTarget = Exclude<OrderColumnId, "pending-payment">;

export const ORDER_COLUMNS: { id: OrderColumnId; label: string }[] = [
  { id: "pending-payment", label: "Aguardando pagamento" },
  { id: "aguardando-coleta", label: "Aguardando coleta" },
  { id: "em-transporte-coleta", label: "Em transporte p/ coleta" },
  { id: "em-transporte", label: "A caminho da central" },
  { id: "recebido-na-central", label: "Recebido na central" },
  { id: "em-transporte-retirada", label: "Em transporte p/ retirada" },
  { id: "disponivel-para-retirada", label: "Disponível p/ retirada" },
  { id: "completed", label: "Concluídos" },
  { id: "cancelled", label: "Cancelados" },
];

/** Nome do destino na frase "Mover para …". */
export const MOVE_TARGET_LABELS: Record<OrderMoveTarget, string> = {
  "aguardando-coleta": "Aguardando coleta",
  "em-transporte-coleta": "Em transporte para coleta",
  "em-transporte": "A caminho da central",
  "recebido-na-central": "Recebido na central",
  "em-transporte-retirada": "Em transporte para retirada",
  "disponivel-para-retirada": "Disponível para retirada",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const STAGES: DeliveryStage[] = [
  "aguardando-coleta",
  "em-transporte-coleta",
  "em-transporte",
  "recebido-na-central",
  "em-transporte-retirada",
  "disponivel-para-retirada",
];

/** Código curto do pedido, como aparece para o cliente ("#1A2B3C4D"). */
export function orderCode(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export interface MovableOrder {
  status: MockOrderStatus;
  deliveryStage?: DeliveryStage;
}

export function columnOf(order: MovableOrder): OrderColumnId {
  if (order.status === "active") return order.deliveryStage ?? "aguardando-coleta";
  return order.status;
}

export type MoveRule =
  { allowed: false; why: string } | { allowed: true; needsReason: boolean };

/**
 * Pode mover o pedido para `target`? Espelho exato de `admin_move_order`
 * (supabase/migrations/0014_order_events.sql): o banco recusa o mesmo que aqui.
 */
export function moveRule(order: MovableOrder, target: OrderMoveTarget): MoveRule {
  if (order.status === "completed" || order.status === "cancelled") {
    return { allowed: false, why: "Este pedido já está finalizado." };
  }
  if (target === "cancelled") return { allowed: true, needsReason: true };
  if (order.status === "pending-payment") {
    return {
      allowed: false,
      why: "O pedido ainda não foi pago: ele só pode ser cancelado.",
    };
  }
  const from = STAGES.indexOf(order.deliveryStage ?? "aguardando-coleta");
  if (target === "completed") {
    return { allowed: true, needsReason: from !== STAGES.length - 1 };
  }
  const to = STAGES.indexOf(target);
  if (to === from) return { allowed: false, why: "O pedido já está nessa etapa." };
  return { allowed: true, needsReason: to !== from + 1 };
}

/** Destinos permitidos, na ordem das colunas (para o menu "Mover para…"). */
export function allowedTargets(
  order: MovableOrder,
): { target: OrderMoveTarget; needsReason: boolean }[] {
  return ORDER_COLUMNS.flatMap(({ id }) => {
    if (id === "pending-payment") return [];
    const rule = moveRule(order, id);
    return rule.allowed ? [{ target: id, needsReason: rule.needsReason }] : [];
  });
}

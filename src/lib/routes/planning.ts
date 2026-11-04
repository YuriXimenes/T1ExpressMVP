/** Planejamento: o que coletar (ou entregar) em cada loja, por prioridade. */

export interface BacklogOrder {
  orderId: string;
  storeCode: string;
  /** Já está numa rota aberta do mesmo tipo. */
  openRouteId?: string;
  customerName: string;
  /** Previsão de retirada: quanto mais cedo, mais urgente. */
  estimatedPickupDate?: string;
  createdAt: string;
}

export interface StoreBacklog {
  storeCode: string;
  orders: BacklogOrder[];
  /** Pedidos que ainda não estão em nenhuma rota. */
  pending: number;
  /** Data mais urgente entre os pedidos pendentes. */
  urgentDate?: string;
}

const urgencyKey = (o: BacklogOrder) => o.estimatedPickupDate ?? o.createdAt;

/** Agrupa por loja; dentro da loja e entre lojas, o mais urgente primeiro. */
export function groupBacklog(orders: BacklogOrder[]): StoreBacklog[] {
  const byStore = new Map<string, BacklogOrder[]>();
  for (const order of orders) {
    const list = byStore.get(order.storeCode) ?? [];
    list.push(order);
    byStore.set(order.storeCode, list);
  }
  return [...byStore.entries()]
    .map(([storeCode, list]) => {
      const sorted = [...list].sort((a, b) => urgencyKey(a).localeCompare(urgencyKey(b)));
      const pending = sorted.filter((o) => !o.openRouteId);
      return {
        storeCode,
        orders: sorted,
        pending: pending.length,
        urgentDate: pending[0] ? urgencyKey(pending[0]) : undefined,
      };
    })
    .sort((a, b) => {
      // Lojas com pendência primeiro, depois a mais urgente.
      if (!!a.pending !== !!b.pending) return a.pending ? -1 : 1;
      return (a.urgentDate ?? "9999").localeCompare(b.urgentDate ?? "9999");
    });
}

export const STOP_REASONS: { id: string; label: string }[] = [
  { id: "loja_fechada", label: "Loja fechada" },
  { id: "pedido_nao_pronto", label: "Pedido não estava pronto" },
  { id: "endereco_errado", label: "Endereço errado" },
  { id: "outro", label: "Outro motivo" },
];

export const stopReasonLabel = (id?: string) =>
  STOP_REASONS.find((r) => r.id === id)?.label ?? id ?? "";

export const TRIP_STATUS_LABELS: Record<string, string> = {
  planejada: "Planejada",
  enviada: "Enviada ao entregador",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const STOP_STATUS_LABELS: Record<string, string> = {
  aguardando: "Aguardando",
  em_deslocamento: "Em deslocamento",
  atendida: "Atendida",
  nao_realizada: "Não realizada",
  parcial: "Parcial",
};

export const ROUTE_KIND_LABELS: Record<string, string> = {
  coleta: "Coleta",
  entrega: "Entrega",
};

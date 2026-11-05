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
  /** Entregas: a conferência já foi salva na central. */
  checked?: boolean;
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

/**
 * Lojas em comum entre duas rotas (pelas paradas). Uma rota de coleta e uma de
 * entrega do mesmo dia que passam na mesma loja deveriam ir na mesma viagem.
 */
export function sharedStores(
  a: { stops: { storeCode: string }[] },
  b: { stops: { storeCode: string }[] },
): string[] {
  const inB = new Set(b.stops.map((s) => s.storeCode));
  return [...new Set(a.stops.map((s) => s.storeCode))].filter((code) => inB.has(code));
}

/** Pares coleta × entrega do mesmo dia com loja em comum, para sinalizar a união. */
export function routePairs<
  R extends { id: string; kind: string; day: string; stops: { storeCode: string }[] },
>(routes: R[]): { coleta: R; entrega: R; stores: string[] }[] {
  const pairs: { coleta: R; entrega: R; stores: string[] }[] = [];
  for (const coleta of routes.filter((r) => r.kind === "coleta")) {
    for (const entrega of routes.filter(
      (r) => r.kind === "entrega" && r.day === coleta.day,
    )) {
      const stores = sharedStores(coleta, entrega);
      if (stores.length > 0) pairs.push({ coleta, entrega, stores });
    }
  }
  return pairs;
}

import { computeSchedule } from "@/lib/operating-calendar";

/**
 * Preços da SIMULAÇÃO da pesquisa: a hipótese que queremos medir, independente
 * do que a aba Preços do admin cobra de verdade hoje (que pode estar R$ 0).
 * Para testar outro valor, é só mudar estas duas constantes.
 */
export const SIMULATION_PRICE = {
  firstStoreBRL: 12,
  extraStoreBRL: 3,
};

/** "R$ 12,00". */
export function brl(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export function simulationTotalBRL(storeCount: number): number {
  return (
    SIMULATION_PRICE.firstStoreBRL +
    Math.max(0, storeCount - 1) * SIMULATION_PRICE.extraStoreBRL
  );
}

export interface Simulation {
  stores: number;
  totalBRL: number;
  /** Momento do pedido usado no cálculo das datas (ISO). */
  orderAt: string;
  /** "AAAA-MM-DD". */
  collectDate: string;
  pickupDate: string;
}

/** Simulação do 1º pedido: valor com os preços da pesquisa e datas pelo calendário da T1. */
export function buildSimulation(order: {
  originStoreIds: string[];
  createdAt: string;
}): Simulation {
  const stores = order.originStoreIds.length;
  const { collect, pickup } = computeSchedule(order.createdAt);
  return {
    stores,
    totalBRL: simulationTotalBRL(stores),
    orderAt: order.createdAt,
    collectDate: collect,
    pickupDate: pickup,
  };
}

/** Chaves gravadas na resposta com o que foi mostrado na tela. */
export const SIMULATION_ANSWER_KEYS = [
  "sim_stores",
  "sim_total_brl",
  "sim_order_at",
  "sim_collect_date",
  "sim_pickup_date",
] as const;

export function simulationAnswers(sim: Simulation) {
  return {
    sim_stores: sim.stores,
    sim_total_brl: sim.totalBRL,
    sim_order_at: sim.orderAt,
    sim_collect_date: sim.collectDate,
    sim_pickup_date: sim.pickupDate,
  };
}

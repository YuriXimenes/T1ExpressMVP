/**
 * Regras puras dos indicadores (Plataforma › Indicadores). O banco agrega; aqui
 * ficam as contas de taxa e os rótulos, para a tela e o CSV dizerem o mesmo.
 */

/** Percentual de `part` sobre `total` (0–100, 1 casa); null quando não há base. */
export function rate(part: number, total: number): number | null {
  if (!total || total <= 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

export interface FunnelCounts {
  simulations: number;
  continued: number;
  orderPage: number;
  ordersCreated: number;
  paid: number;
  completed: number;
}

export interface FunnelStep {
  key: keyof FunnelCounts;
  label: string;
  hint: string;
  count: number;
  /** % sobre a etapa anterior (null na primeira ou sem base). */
  fromPrevious: number | null;
  /** % sobre as simulações. */
  fromTop: number | null;
}

const STEPS: { key: keyof FunnelCounts; label: string; hint: string }[] = [
  { key: "simulations", label: "Simularam", hint: "Calcularam um frete com preço" },
  { key: "continued", label: "Continuaram", hint: "Clicaram para criar o pedido" },
  {
    key: "orderPage",
    label: "Chegaram ao pedido",
    hint: "Já logados, na montagem do pedido",
  },
  {
    key: "ordersCreated",
    label: "Criaram o pedido",
    hint: "Pedido aguardando pagamento",
  },
  { key: "paid", label: "Pagaram", hint: "Pedido pago" },
  { key: "completed", label: "Retiraram", hint: "Pedido concluído" },
];

/** Etapas do funil com a taxa de passagem de cada uma. */
export function funnelSteps(c: FunnelCounts): FunnelStep[] {
  return STEPS.map((s, i) => ({
    ...s,
    count: c[s.key],
    fromPrevious: i === 0 ? null : rate(c[s.key], c[STEPS[i - 1].key]),
    fromTop: rate(c[s.key], c.simulations),
  }));
}

/** Maior perda entre duas etapas seguidas (onde as pessoas mais desistem). */
export function biggestDrop(steps: FunnelStep[]): FunnelStep | null {
  let worst: FunnelStep | null = null;
  for (const s of steps.slice(1)) {
    if (s.fromPrevious === null) continue;
    if (!worst || s.fromPrevious < (worst.fromPrevious ?? 101)) worst = s;
  }
  return worst;
}

export type SavingsBucket =
  "falhou" | "sem_comparacao" | "nao_mais_barata" | "ate_5" | "5_a_15" | "acima_15";

/** Faixas na ordem de exibição (mesmas chaves de `_savings_bucket` no banco). */
export const SAVINGS_BUCKETS: { id: SavingsBucket; label: string }[] = [
  { id: "acima_15", label: "Economia acima de R$ 15" },
  { id: "5_a_15", label: "Economia de R$ 5 a R$ 15" },
  { id: "ate_5", label: "Economia até R$ 5" },
  { id: "nao_mais_barata", label: "T1 não foi a mais barata" },
  { id: "sem_comparacao", label: "Sem preço de concorrente" },
  { id: "falhou", label: "Simulação falhou (rota sem preço)" },
];

/** Espelho de `_savings_bucket` (usado nos testes e em telas sem o banco). */
export function savingsBucket(s: {
  failed: boolean;
  savings?: number | null;
  hasCompetitor: boolean;
}): SavingsBucket {
  if (s.failed) return "falhou";
  if (!s.hasCompetitor) return "sem_comparacao";
  if (s.savings === null || s.savings === undefined) return "nao_mais_barata";
  if (s.savings < 5) return "ate_5";
  if (s.savings < 15) return "5_a_15";
  return "acima_15";
}

/** Chave da rota igual à do banco: códigos de coleta em ordem + ">" + ponto. */
export function routeKey(originCodes: string[], destinationCode: string): string {
  return `${[...new Set(originCodes)].sort().join("+")}>${destinationCode}`;
}

export const COMPARATOR_ISSUES = {
  sem_rota: {
    label: "Sem preço cadastrado",
    hint: "A simulação falha: o cliente vê erro e não consegue seguir.",
  },
  sem_uber: {
    label: "Sem preço de Uber",
    hint: "A simulação funciona, mas sem comparar com o Uber.",
  },
  desatualizado: {
    label: "Preço desatualizado",
    hint: "Valores de Uber e Loggi sem revisão há muito tempo.",
  },
} as const;

export type ComparatorIssue = keyof typeof COMPARATOR_ISSUES;

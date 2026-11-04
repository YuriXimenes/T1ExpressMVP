/** Conferência, fotos, custódia e retirada (migração 0015_order_handling.sql). */

export type ItemKind = "card" | "accessory";

export interface ItemCheck {
  kind: ItemKind;
  itemId: string;
  expectedQty: number;
  receivedQty: number;
  note?: string;
  checkedAt: string;
}

export interface OrderPhoto {
  id: string;
  /** Vazio = foto geral do pacote. */
  itemKind?: ItemKind;
  itemId?: string;
  path: string;
  /** Link temporário (bucket privado). */
  url: string;
  createdAt: string;
}

export type CustodyAction =
  | "coletado_na_loja"
  | "recebido_na_base"
  | "consolidado"
  | "saiu_para_entrega"
  | "entregue_no_ponto"
  | "retirado_pelo_cliente"
  | "outro";

export const CUSTODY_ACTIONS: { id: CustodyAction; label: string }[] = [
  { id: "coletado_na_loja", label: "Coletado na loja" },
  { id: "recebido_na_base", label: "Recebido na base" },
  { id: "consolidado", label: "Consolidado" },
  { id: "saiu_para_entrega", label: "Saiu para entrega" },
  { id: "entregue_no_ponto", label: "Entregue no ponto de retirada" },
  { id: "retirado_pelo_cliente", label: "Retirado pelo cliente" },
  { id: "outro", label: "Outro" },
];

export function custodyLabel(action: string): string {
  return CUSTODY_ACTIONS.find((a) => a.id === action)?.label ?? action;
}

export interface CustodyEvent {
  id: string;
  createdAt: string;
  action: CustodyAction;
  storeCode?: string;
  location?: string;
  responsible?: string;
  note?: string;
  recordedByName?: string;
}

export interface PickupInfo {
  packageToken: string;
  pickupCode: string;
  failedAttempts: number;
  lockedUntil?: string;
  usedAt?: string;
}

export const isDivergent = (check: Pick<ItemCheck, "expectedQty" | "receivedQty">) =>
  check.receivedQty !== check.expectedQty;

export function checkSummary(checks: Pick<ItemCheck, "expectedQty" | "receivedQty">[]): {
  checked: number;
  divergent: number;
} {
  return { checked: checks.length, divergent: checks.filter(isDivergent).length };
}

/** "Recebemos 1 de 2" — frase da divergência, igual para admin e cliente. */
export function divergenceText(
  check: Pick<ItemCheck, "expectedQty" | "receivedQty">,
): string {
  return `Recebemos ${check.receivedQty} de ${check.expectedQty}`;
}

/** Tamanhos de etiqueta da impressora térmica. Trocar o padrão é só mudar aqui. */
export const LABEL_SIZES = {
  "100x150": { widthMm: 100, heightMm: 150, label: "100 × 150 mm" },
  "60x40": { widthMm: 60, heightMm: 40, label: "60 × 40 mm" },
} as const;

export type LabelSize = keyof typeof LABEL_SIZES;
export const DEFAULT_LABEL_SIZE: LabelSize = "100x150";

/** Endereço que vai no QR do pacote. */
export function pickupUrl(origin: string, packageToken: string): string {
  return `${origin.replace(/\/$/, "")}/retirada/${packageToken}`;
}

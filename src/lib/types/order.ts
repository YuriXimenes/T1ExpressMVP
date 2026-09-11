import type { GameTag } from "@/lib/types/signup";

export type PedidoKind = "cartas-avulsas" | "boosters" | "deck-box" | "acessorios";

/** "unit" = preço informado é por unidade; "total" = preço informado já é o total (dividido pela quantidade). */
export type PriceMode = "unit" | "total";

export interface CardLikeItem {
  id: string;
  /** Nome da carta, ou nome da coleção quando for booster/deck box. */
  cardName: string;
  game: GameTag;
  otherGame?: string;
  price: number;
  priceMode: PriceMode;
  quantity: number;
}

export type AccessoryKind =
  "sleeve" | "perfect-fit" | "playmat" | "fichario" | "case" | "outro";

export interface AccessoryItem {
  id: string;
  accessory: AccessoryKind;
  otherAccessory?: string;
  price: number;
  priceMode: PriceMode;
  quantity: number;
}

export interface PedidoGroup {
  id: string;
  kind: PedidoKind;
  orderNumber: string;
  cardItems: CardLikeItem[];
  accessoryItems: AccessoryItem[];
}

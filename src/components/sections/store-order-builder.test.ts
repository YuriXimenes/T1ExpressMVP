import { describe, expect, it } from "vitest";
import { lineTotal, orderGroupTotal } from "@/components/sections/store-order-builder";
import type { AccessoryItem, CardLikeItem, PedidoGroup } from "@/lib/types/order";

function cardItem(overrides: Partial<CardLikeItem> = {}): CardLikeItem {
  return {
    id: "item-1",
    cardName: "Carta",
    game: "magic",
    price: 0,
    priceMode: "unit",
    quantity: 1,
    ...overrides,
  };
}

function accessoryItem(overrides: Partial<AccessoryItem> = {}): AccessoryItem {
  return {
    id: "acc-1",
    accessory: "sleeve",
    price: 0,
    priceMode: "unit",
    quantity: 1,
    ...overrides,
  };
}

describe("lineTotal", () => {
  it("por unidade multiplica preço × quantidade", () => {
    expect(lineTotal({ price: 10, priceMode: "unit", quantity: 3 })).toBe(30);
  });

  it("preço total ignora a quantidade", () => {
    expect(lineTotal({ price: 50, priceMode: "total", quantity: 3 })).toBe(50);
  });
});

describe("orderGroupTotal", () => {
  it("soma os itens de carta quando o grupo não é de acessórios", () => {
    const group: PedidoGroup = {
      id: "g1",
      kind: "cartas-avulsas",
      orderNumber: "",
      cardItems: [
        cardItem({ price: 60, quantity: 2 }),
        cardItem({ id: "item-2", price: 50, quantity: 3, priceMode: "total" }),
      ],
      accessoryItems: [accessoryItem({ price: 999 })], // ignorado neste tipo de grupo
    };
    expect(orderGroupTotal(group)).toBe(170);
  });

  it("soma os itens de acessório quando o grupo é de acessórios", () => {
    const group: PedidoGroup = {
      id: "g2",
      kind: "acessorios",
      orderNumber: "",
      cardItems: [cardItem({ price: 999 })], // ignorado neste tipo de grupo
      accessoryItems: [accessoryItem({ price: 30, quantity: 1 })],
    };
    expect(orderGroupTotal(group)).toBe(30);
  });
});

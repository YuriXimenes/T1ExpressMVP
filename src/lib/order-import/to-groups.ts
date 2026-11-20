import type { GameTag } from "@/lib/types/signup";
import type { PedidoGroup } from "@/lib/types/order";
import type { ImportedItem } from "./parse-order";

/** Grupo ainda não preenchido (o "Pedido 1" vazio que a tela cria sozinha). */
export function isBlankGroup(group: PedidoGroup): boolean {
  return (
    !group.orderNumber.trim() &&
    group.cardItems.every((i) => !i.cardName.trim() && !i.price) &&
    group.accessoryItems.every((i) => !i.price)
  );
}

/** Itens importados → grupo "Cartas avulsas" com o nº do pedido da loja. */
export function importedToGroup(
  items: ImportedItem[],
  orderNumber: string | undefined,
  game: GameTag,
): PedidoGroup {
  return {
    id: crypto.randomUUID(),
    kind: "cartas-avulsas",
    orderNumber: orderNumber ?? "",
    cardItems: items.map((item) => ({
      id: crypto.randomUUID(),
      cardName: item.name,
      game,
      price: item.unitPrice,
      priceMode: "unit" as const,
      quantity: item.quantity,
    })),
    accessoryItems: [],
  };
}

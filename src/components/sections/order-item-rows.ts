import {
  accessoryItemLabel,
  cardItemLabel,
} from "@/components/sections/order-items-breakdown";
import type { ItemKind } from "@/lib/admin/handling";
import type { PedidoGroup } from "@/lib/types/order";

export interface OrderItemRow {
  storeCode: string;
  kind: ItemKind;
  id: string;
  label: string;
  quantity: number;
}

/** Itens do pedido numa lista só, na ordem das lojas e dos grupos (conferência e fotos). */
export function orderItemRows(
  ordersByStore: Record<string, PedidoGroup[]>,
): OrderItemRow[] {
  return Object.entries(ordersByStore).flatMap(([storeCode, groups]) =>
    groups.flatMap((group) =>
      group.kind === "acessorios"
        ? group.accessoryItems.map((item): OrderItemRow => ({
            storeCode,
            kind: "accessory",
            id: item.id,
            label: accessoryItemLabel(item),
            quantity: item.quantity,
          }))
        : group.cardItems.map((item): OrderItemRow => ({
            storeCode,
            kind: "card",
            id: item.id,
            label: cardItemLabel(item),
            quantity: item.quantity,
          })),
    ),
  );
}

import type { CardLikeItem, PedidoGroup } from "@/lib/types/order";
import type { DeliveryStage, MockOrder } from "@/lib/types/mock-order";

export const DELIVERY_STAGES: { id: DeliveryStage; label: string }[] = [
  { id: "aguardando-coleta", label: "Aguardando coleta" },
  { id: "em-transporte", label: "Em transporte" },
  { id: "disponivel-para-retirada", label: "Disponível para retirada" },
];

export function getOrderStatusLabel(order: MockOrder): string {
  if (order.status === "pending-payment") return "Aguardando pagamento";
  if (order.status === "completed") return "Concluído";
  return (
    DELIVERY_STAGES.find((stage) => stage.id === order.deliveryStage)?.label ?? "Ativo"
  );
}

export function computeTotalPaidBRL(order: MockOrder): number {
  const paidChargesTotal = order.storeCharges
    .filter((charge) => charge.status === "paid")
    .reduce((sum, charge) => sum + charge.amountBRL, 0);
  return order.amountDueBRL + paidChargesTotal;
}

export function makeCardItem(): CardLikeItem {
  return {
    id: crypto.randomUUID(),
    cardName: "",
    game: "magic",
    price: 0,
    priceMode: "unit",
    quantity: 1,
  };
}

export function makePedidoGroup(): PedidoGroup {
  return {
    id: crypto.randomUUID(),
    kind: "cartas-avulsas",
    orderNumber: "",
    cardItems: [makeCardItem()],
    accessoryItems: [],
  };
}

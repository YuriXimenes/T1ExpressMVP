import type { PedidoGroup } from "@/lib/types/order";
import type { FreightQuoteResult } from "@/lib/types/freight";

export type MockOrderStatus = "pending-payment" | "active" | "completed";

/** Etapa de entrega dentro do status "active" — avançada manualmente no mock, sem integração real com transportadora. */
export type DeliveryStage =
  "aguardando-coleta" | "em-transporte" | "disponivel-para-retirada";

export type PaymentMethod = "pix" | "credit-card";

export interface AppliedCoupon {
  code: string;
  type: "percent" | "flat";
  value: number;
  /** Valor efetivamente descontado, congelado no momento da aplicação. */
  discountBRL: number;
}

/** Cobrança gerada ao adicionar uma ou mais lojas novas a um pedido já feito. */
export interface StoreCharge {
  id: string;
  storeIds: string[];
  amountBRL: number;
  status: "pending-payment" | "paid";
  createdAt: string;
  paidAt?: string;
  paymentMethod?: PaymentMethod;
  /** Itens informados para a(s) loja(s) nova(s), aplicados a ordersByStore quando o pagamento é confirmado. */
  draftOrdersByStore: Record<string, PedidoGroup[]>;
  /** Valor desses itens — informativo, somado a order.itemsTotal quando pago. */
  itemsTotalAdded: number;
  /** Novo tier de seguro, aplicado a order.insurance quando o pagamento é confirmado. */
  insuranceUpgrade?: { coverageAmountBRL: number; extraCostBRL: number };
}

export interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  createdAt: string;
}

export interface MockOrder {
  id: string;
  createdAt: string;
  status: MockOrderStatus;
  paidAt?: string;
  completedAt?: string;
  deliveryStage?: DeliveryStage;
  /** Previsão de disponibilidade para retirada, calculada a partir do prazo do frete no momento do pagamento. */
  estimatedPickupDate?: string;

  originStoreIds: string[];
  destinationStoreId: string;
  ordersByStore: Record<string, PedidoGroup[]>;
  deliveryNote: string;

  quote: FreightQuoteResult;
  /** Soma dos itens declarados — informativo, nunca cobrado pela plataforma. */
  itemsTotal: number;

  insurance: {
    extraCoverageOptedIn: boolean;
    coverageAmountBRL: number;
    extraCostBRL: number;
  };

  coupon?: AppliedCoupon;

  freightAfterDiscountBRL: number;
  /** Único valor efetivamente cobrado no pagamento. */
  amountDueBRL: number;
  paymentMethod?: PaymentMethod;

  storeCharges: StoreCharge[];
  supportTickets: SupportTicket[];
}

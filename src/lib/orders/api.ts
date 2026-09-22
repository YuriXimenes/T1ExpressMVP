"use client";

import { createBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { CompetitorQuote, FreightQuoteResult } from "@/lib/types/freight";
import type {
  DeliveryStage,
  MockOrder,
  MockOrderStatus,
  PaymentMethod,
  StoreCharge,
  SupportTicket,
} from "@/lib/types/mock-order";
import type {
  AccessoryItem,
  AccessoryKind,
  CardLikeItem,
  PedidoGroup,
  PedidoKind,
  PriceMode,
} from "@/lib/types/order";
import type { GameTag } from "@/lib/types/signup";

/** Erro com mensagem pronta para mostrar ao usuário. */
export class OrderError extends Error {}

function friendlyOrderError(error: { message?: string; code?: string }): OrderError {
  // As funções do banco levantam P0001 com texto já em português e seguro para exibir.
  if (error.code === "P0001" && error.message) return new OrderError(error.message);
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("jwt") || message.includes("not authenticated")) {
    return new OrderError("Sua sessão expirou. Entre novamente.");
  }
  if (message.includes("failed to fetch") || message.includes("network")) {
    return new OrderError("Sem conexão com o servidor. Tente novamente.");
  }
  return new OrderError("Não foi possível concluir. Tente novamente.");
}

// --- Leitura ---------------------------------------------------------------

const GROUP_SELECT = `
  id, kind, order_number, created_at, sort_order,
  store:stores(code),
  card_items:pedido_card_items(id, card_name, game, other_game, price, price_mode, quantity, sort_order),
  accessory_items:pedido_accessory_items(id, accessory, other_accessory, price, price_mode, quantity, sort_order)
`;

const ORDER_SELECT = `
  id, created_at, status, paid_at, completed_at, delivery_stage, estimated_pickup_date,
  delivery_note, items_total_brl, insurance_opted_in, insurance_coverage_brl,
  insurance_extra_cost_brl, coupon_code, coupon_type, coupon_value, coupon_discount_brl,
  freight_after_discount_brl, amount_due_brl, payment_method, quote_price_brl,
  quote_estimated_days_min, quote_estimated_days_max, quote_distance_label,
  quote_cheapest_savings_brl,
  destination:stores!destination_store_id(code),
  origins:order_origin_stores(store:stores(code)),
  competitors:order_quote_competitors(carrier, label, eta_label, total_brl),
  groups:pedido_groups(${GROUP_SELECT}),
  charges:store_charges(
    id, amount_brl, status, created_at, paid_at, payment_method, items_total_added_brl,
    insurance_upgrade_coverage_brl, insurance_upgrade_extra_cost_brl,
    stores:store_charge_stores(store:stores(code)),
    groups:pedido_groups(${GROUP_SELECT})
  ),
  tickets:support_tickets(id, subject, message, created_at)
`;

interface CardItemRow {
  id: string;
  card_name: string;
  game: GameTag;
  other_game: string | null;
  price: number | string;
  price_mode: PriceMode;
  quantity: number;
  sort_order: number;
}

interface AccessoryItemRow {
  id: string;
  accessory: AccessoryKind;
  other_accessory: string | null;
  price: number | string;
  price_mode: PriceMode;
  quantity: number;
  sort_order: number;
}

interface GroupRow {
  id: string;
  kind: PedidoKind;
  order_number: string;
  created_at: string;
  sort_order: number;
  store: { code: string } | null;
  card_items: CardItemRow[];
  accessory_items: AccessoryItemRow[];
}

interface OrderRow {
  id: string;
  created_at: string;
  status: MockOrderStatus;
  paid_at: string | null;
  completed_at: string | null;
  delivery_stage: DeliveryStage | null;
  estimated_pickup_date: string | null;
  delivery_note: string;
  items_total_brl: number | string;
  insurance_opted_in: boolean;
  insurance_coverage_brl: number | string;
  insurance_extra_cost_brl: number | string;
  coupon_code: string | null;
  coupon_type: "percent" | "flat" | null;
  coupon_value: number | string | null;
  coupon_discount_brl: number | string | null;
  freight_after_discount_brl: number | string;
  amount_due_brl: number | string;
  payment_method: PaymentMethod | null;
  quote_price_brl: number | string;
  quote_estimated_days_min: number;
  quote_estimated_days_max: number;
  quote_distance_label: string | null;
  quote_cheapest_savings_brl: number | string | null;
  destination: { code: string } | null;
  origins: { store: { code: string } | null }[];
  competitors: {
    carrier: CompetitorQuote["carrier"];
    label: string;
    eta_label: string;
    total_brl: number | string;
  }[];
  groups: GroupRow[];
  charges: {
    id: string;
    amount_brl: number | string;
    status: "pending-payment" | "paid";
    created_at: string;
    paid_at: string | null;
    payment_method: PaymentMethod | null;
    items_total_added_brl: number | string;
    insurance_upgrade_coverage_brl: number | string | null;
    insurance_upgrade_extra_cost_brl: number | string | null;
    stores: { store: { code: string } | null }[];
    groups: GroupRow[];
  }[];
  tickets: { id: string; subject: string; message: string; created_at: string }[];
}

const CARRIER_ORDER: CompetitorQuote["carrier"][] = ["uber", "loggi", "correios"];

const bySort = (a: { sort_order: number }, b: { sort_order: number }) =>
  a.sort_order - b.sort_order;

function mapGroup(row: GroupRow): PedidoGroup {
  return {
    id: row.id,
    kind: row.kind,
    orderNumber: row.order_number,
    cardItems: [...row.card_items].sort(bySort).map((item): CardLikeItem => ({
      id: item.id,
      cardName: item.card_name,
      game: item.game,
      otherGame: item.other_game ?? undefined,
      price: Number(item.price),
      priceMode: item.price_mode,
      quantity: item.quantity,
    })),
    accessoryItems: [...row.accessory_items].sort(bySort).map((item): AccessoryItem => ({
      id: item.id,
      accessory: item.accessory,
      otherAccessory: item.other_accessory ?? undefined,
      price: Number(item.price),
      priceMode: item.price_mode,
      quantity: item.quantity,
    })),
  };
}

/** Grupos na ordem em que foram criados (created_at, depois a posição dentro da transação). */
function groupByStore(rows: GroupRow[]): Record<string, PedidoGroup[]> {
  const ordered = [...rows].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.sort_order - b.sort_order,
  );
  const result: Record<string, PedidoGroup[]> = {};
  for (const row of ordered) {
    const code = row.store?.code;
    if (!code) continue;
    (result[code] ??= []).push(mapGroup(row));
  }
  return result;
}

function mapOrder(row: OrderRow): MockOrder {
  const charges: StoreCharge[] = [...row.charges]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((charge) => ({
      id: charge.id,
      storeIds: charge.stores.map((s) => s.store?.code).filter((c): c is string => !!c),
      amountBRL: Number(charge.amount_brl),
      status: charge.status,
      createdAt: charge.created_at,
      paidAt: charge.paid_at ?? undefined,
      paymentMethod: charge.payment_method ?? undefined,
      draftOrdersByStore: groupByStore(charge.groups),
      itemsTotalAdded: Number(charge.items_total_added_brl),
      insuranceUpgrade:
        charge.insurance_upgrade_coverage_brl !== null
          ? {
              coverageAmountBRL: Number(charge.insurance_upgrade_coverage_brl),
              extraCostBRL: Number(charge.insurance_upgrade_extra_cost_brl ?? 0),
            }
          : undefined,
    }));

  const tickets: SupportTicket[] = [...row.tickets]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject,
      message: ticket.message,
      createdAt: ticket.created_at,
    }));

  const quote: FreightQuoteResult = {
    priceBRL: Number(row.quote_price_brl),
    estimatedDaysMin: row.quote_estimated_days_min,
    estimatedDaysMax: row.quote_estimated_days_max,
    distanceLabel: row.quote_distance_label ?? "",
    competitors: [...row.competitors]
      .sort((a, b) => CARRIER_ORDER.indexOf(a.carrier) - CARRIER_ORDER.indexOf(b.carrier))
      .map((c) => ({
        carrier: c.carrier,
        label: c.label,
        etaLabel: c.eta_label,
        totalBRL: Number(c.total_brl),
      })),
    cheapestSavingsBRL:
      row.quote_cheapest_savings_brl !== null
        ? Number(row.quote_cheapest_savings_brl)
        : undefined,
  };

  return {
    id: row.id,
    createdAt: row.created_at,
    status: row.status,
    paidAt: row.paid_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    deliveryStage: row.delivery_stage ?? undefined,
    estimatedPickupDate: row.estimated_pickup_date ?? undefined,
    originStoreIds: row.origins
      .map((o) => o.store?.code)
      .filter((c): c is string => !!c)
      .sort(),
    destinationStoreId: row.destination?.code ?? "",
    ordersByStore: groupByStore(row.groups),
    deliveryNote: row.delivery_note,
    quote,
    itemsTotal: Number(row.items_total_brl),
    insurance: {
      extraCoverageOptedIn: row.insurance_opted_in,
      coverageAmountBRL: Number(row.insurance_coverage_brl),
      extraCostBRL: Number(row.insurance_extra_cost_brl),
    },
    coupon:
      row.coupon_code && row.coupon_type
        ? {
            code: row.coupon_code,
            type: row.coupon_type,
            value: Number(row.coupon_value ?? 0),
            discountBRL: Number(row.coupon_discount_brl ?? 0),
          }
        : undefined,
    freightAfterDiscountBRL: Number(row.freight_after_discount_brl),
    amountDueBRL: Number(row.amount_due_brl),
    paymentMethod: row.payment_method ?? undefined,
    storeCharges: charges,
    supportTickets: tickets,
  };
}

/** Pedidos do usuário logado (a RLS já limita ao dono), do mais antigo ao mais novo. */
export async function fetchOrders(): Promise<MockOrder[]> {
  const { data, error } = await createBrowserClient()
    .from("orders")
    .select(ORDER_SELECT)
    .order("created_at", { ascending: true })
    .returns<OrderRow[]>();
  if (error) throw friendlyOrderError(error);
  return (data ?? []).map(mapOrder);
}

// --- Escrita (sempre por funções do banco, que validam e recalculam valores) ---

function toGroupsPayload(
  ordersByStore: Record<string, PedidoGroup[]>,
  storeIds: string[],
) {
  return storeIds.flatMap((storeCode) =>
    (ordersByStore[storeCode] ?? []).map((group) => ({
      storeCode,
      kind: group.kind,
      orderNumber: group.orderNumber,
      cardItems: group.cardItems.map((item) => ({
        cardName: item.cardName,
        game: item.game,
        otherGame: item.otherGame,
        price: item.price,
        priceMode: item.priceMode,
        quantity: item.quantity,
      })),
      accessoryItems: group.accessoryItems.map((item) => ({
        accessory: item.accessory,
        otherAccessory: item.otherAccessory,
        price: item.price,
        priceMode: item.priceMode,
        quantity: item.quantity,
      })),
    })),
  );
}

/** As 7 funções de escrita de pedido chamadas pelo app (as outras — advance_delivery_stage
 * e as _internas — são de uso exclusivo do banco/admin). */
type OrderRpcName = Extract<
  keyof Database["public"]["Functions"],
  | "create_order"
  | "pay_order"
  | "complete_order"
  | "add_groups_to_order"
  | "add_store_charge"
  | "pay_store_charge"
  | "create_support_ticket"
>;

async function rpc<T>(name: OrderRpcName, args: Record<string, unknown>): Promise<T> {
  // O formato de `args` varia por função e já é garantido pelos tipos de
  // entrada de cada chamada (CreateOrderInput, AddStoreChargeInput, etc.) e
  // validado de novo no banco; o cast só contorna o tipo específico que o
  // client gerado espera para cada nome de função.
  const { data, error } = await createBrowserClient().rpc(name, args as never);
  if (error) throw friendlyOrderError(error);
  return data as T;
}

export interface CreateOrderInput {
  originStoreIds: string[];
  destinationStoreId: string;
  ordersByStore: Record<string, PedidoGroup[]>;
  deliveryNote: string;
  quote: FreightQuoteResult;
  insuranceOptedIn: boolean;
  /** Só o código: o desconto é recalculado no servidor. */
  couponCode?: string;
}

/** Cria o pedido "aguardando pagamento" e devolve o id (UUID). */
export function createOrder(input: CreateOrderInput): Promise<string> {
  return rpc<string>("create_order", {
    p: {
      originStoreCodes: input.originStoreIds,
      destinationStoreCode: input.destinationStoreId,
      deliveryNote: input.deliveryNote,
      insuranceOptedIn: input.insuranceOptedIn,
      couponCode: input.couponCode ?? null,
      quote: {
        estimatedDaysMin: input.quote.estimatedDaysMin,
        estimatedDaysMax: input.quote.estimatedDaysMax,
        cheapestSavingsBRL: input.quote.cheapestSavingsBRL ?? null,
        competitors: input.quote.competitors.map((c) => ({
          carrier: c.carrier,
          label: c.label,
          etaLabel: c.etaLabel,
          totalBRL: c.totalBRL,
        })),
      },
      groups: toGroupsPayload(input.ordersByStore, input.originStoreIds),
    },
  });
}

/** Pagamento SIMULADO: só registra o método escolhido (nunca dados de cartão). */
export async function payOrder(orderId: string, method: PaymentMethod) {
  await rpc<void>("pay_order", { p_order: orderId, p_method: method });
}

export async function completeOrder(orderId: string) {
  await rpc<void>("complete_order", { p_order: orderId });
}

export async function addGroupsToStore(
  orderId: string,
  storeId: string,
  groups: PedidoGroup[],
) {
  await rpc<void>("add_groups_to_order", {
    p_order: orderId,
    p_groups: toGroupsPayload({ [storeId]: groups }, [storeId]),
  });
}

export interface AddStoreChargeInput {
  storeIds: string[];
  draftOrdersByStore: Record<string, PedidoGroup[]>;
  /** O cliente só pede o upgrade; o servidor decide se é necessário e quanto custa. */
  insuranceUpgrade: boolean;
}

export function addStoreCharge(
  orderId: string,
  input: AddStoreChargeInput,
): Promise<string> {
  return rpc<string>("add_store_charge", {
    p_order: orderId,
    p: {
      storeCodes: input.storeIds,
      insuranceUpgrade: input.insuranceUpgrade,
      groups: toGroupsPayload(input.draftOrdersByStore, input.storeIds),
    },
  });
}

/** Pagamento SIMULADO da cobrança de loja extra. */
export async function payStoreCharge(chargeId: string, method: PaymentMethod) {
  await rpc<void>("pay_store_charge", { p_charge: chargeId, p_method: method });
}

export function createSupportTicket(
  orderId: string,
  subject: string,
  message: string,
): Promise<string> {
  return rpc<string>("create_support_ticket", {
    p_order: orderId,
    p_subject: subject,
    p_message: message,
  });
}

"use client";

import { createBrowserClient } from "@/lib/supabase/client";
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

/** Erro com mensagem pronta para mostrar ao admin. */
export class AdminError extends Error {}

function friendlyAdminError(error: { message?: string; code?: string }): AdminError {
  if (error.code === "P0001" && error.message) return new AdminError(error.message);
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("failed to fetch") || message.includes("network")) {
    return new AdminError("Sem conexão com o servidor. Tente novamente.");
  }
  return new AdminError("Não foi possível concluir. Tente novamente.");
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await createBrowserClient().rpc(name as never, args as never);
  if (error) throw friendlyAdminError(error);
  return data as T;
}

/** true/false; nunca lança — usado só para decidir se mostra a tela ou redireciona. */
export async function checkIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await createBrowserClient()
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/** Faz o site público reler o catálogo agora, sem esperar o cache de 5 min. */
export async function revalidateCatalog(): Promise<void> {
  const { data } = await createBrowserClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AdminError("Sessão expirada. Entre novamente.");
  let response: Response;
  try {
    response = await fetch("/api/admin/revalidate-catalog", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new AdminError("Não foi possível atualizar o catálogo. Tente novamente.");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new AdminError(body?.error ?? "Não foi possível atualizar o catálogo.");
  }
}

// --- Pedidos -----------------------------------------------------------

export interface AdminOrderSummary {
  id: string;
  createdAt: string;
  status: MockOrderStatus;
  deliveryStage?: DeliveryStage;
  customerName: string;
  customerEmail: string;
  totalPaidBRL: number;
  hasPendingCharge: boolean;
  hasOpenTicket: boolean;
}

interface OrderSummaryRow {
  id: string;
  created_at: string;
  status: MockOrderStatus;
  delivery_stage: DeliveryStage | null;
  amount_due_brl: number | string;
  customer: { name: string; email: string } | null;
  charges: { status: "pending-payment" | "paid"; amount_brl: number | string }[];
  tickets: { resolved: boolean }[];
}

export async function fetchAdminOrders(): Promise<AdminOrderSummary[]> {
  const { data, error } = await createBrowserClient()
    .from("orders")
    .select(
      `id, created_at, status, delivery_stage, amount_due_brl,
       customer:profiles!user_id(name, email),
       charges:store_charges(status, amount_brl),
       tickets:support_tickets(resolved)`,
    )
    .order("created_at", { ascending: false })
    .returns<OrderSummaryRow[]>();
  if (error) throw friendlyAdminError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    status: row.status,
    deliveryStage: row.delivery_stage ?? undefined,
    customerName: row.customer?.name ?? "",
    customerEmail: row.customer?.email ?? "",
    totalPaidBRL:
      Number(row.amount_due_brl) +
      row.charges
        .filter((c) => c.status === "paid")
        .reduce((sum, c) => sum + Number(c.amount_brl), 0),
    hasPendingCharge: row.charges.some((c) => c.status === "pending-payment"),
    hasOpenTicket: row.tickets.some((t) => !t.resolved),
  }));
}

export interface AdminOrder extends MockOrder {
  customerName: string;
  customerEmail: string;
}

const ADMIN_GROUP_SELECT = `
  id, kind, order_number, created_at, sort_order,
  store:stores(code),
  card_items:pedido_card_items(id, card_name, game, other_game, price, price_mode, quantity, sort_order),
  accessory_items:pedido_accessory_items(id, accessory, other_accessory, price, price_mode, quantity, sort_order)
`;

const ADMIN_ORDER_SELECT = `
  id, created_at, status, paid_at, completed_at, cancel_reason, delivery_stage,
  estimated_pickup_date, delivery_note, items_total_brl, insurance_opted_in,
  insurance_coverage_brl, insurance_extra_cost_brl, coupon_code, coupon_type, coupon_value,
  coupon_discount_brl, freight_after_discount_brl, amount_due_brl, payment_method,
  quote_price_brl, quote_estimated_days_min, quote_estimated_days_max, quote_distance_label,
  quote_cheapest_savings_brl,
  customer:profiles!user_id(name, email),
  destination:stores!destination_store_id(code),
  origins:order_origin_stores(store:stores(code)),
  competitors:order_quote_competitors(carrier, label, eta_label, total_brl),
  groups:pedido_groups(${ADMIN_GROUP_SELECT}),
  charges:store_charges(
    id, amount_brl, status, created_at, paid_at, payment_method, items_total_added_brl,
    insurance_upgrade_coverage_brl, insurance_upgrade_extra_cost_brl,
    stores:store_charge_stores(store:stores(code)),
    groups:pedido_groups(${ADMIN_GROUP_SELECT})
  ),
  tickets:support_tickets(id, subject, message, created_at, resolved)
`;

interface AdminCardItemRow {
  id: string;
  card_name: string;
  game: GameTag;
  other_game: string | null;
  price: number | string;
  price_mode: PriceMode;
  quantity: number;
  sort_order: number;
}
interface AdminAccessoryItemRow {
  id: string;
  accessory: AccessoryKind;
  other_accessory: string | null;
  price: number | string;
  price_mode: PriceMode;
  quantity: number;
  sort_order: number;
}
interface AdminGroupRow {
  id: string;
  kind: PedidoKind;
  order_number: string;
  created_at: string;
  sort_order: number;
  store: { code: string } | null;
  card_items: AdminCardItemRow[];
  accessory_items: AdminAccessoryItemRow[];
}
interface AdminOrderRow {
  id: string;
  created_at: string;
  status: MockOrderStatus;
  paid_at: string | null;
  completed_at: string | null;
  cancel_reason: string | null;
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
  customer: { name: string; email: string } | null;
  destination: { code: string } | null;
  origins: { store: { code: string } | null }[];
  competitors: {
    carrier: CompetitorQuote["carrier"];
    label: string;
    eta_label: string;
    total_brl: number | string;
  }[];
  groups: AdminGroupRow[];
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
    groups: AdminGroupRow[];
  }[];
  tickets: {
    id: string;
    subject: string;
    message: string;
    created_at: string;
    resolved: boolean;
  }[];
}

const CARRIER_ORDER: CompetitorQuote["carrier"][] = ["uber", "loggi", "correios"];
const bySort = (a: { sort_order: number }, b: { sort_order: number }) =>
  a.sort_order - b.sort_order;

function mapAdminGroup(row: AdminGroupRow): PedidoGroup {
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

function groupByStore(rows: AdminGroupRow[]): Record<string, PedidoGroup[]> {
  const ordered = [...rows].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.sort_order - b.sort_order,
  );
  const result: Record<string, PedidoGroup[]> = {};
  for (const row of ordered) {
    const code = row.store?.code;
    if (!code) continue;
    (result[code] ??= []).push(mapAdminGroup(row));
  }
  return result;
}

function mapAdminOrder(row: AdminOrderRow): AdminOrder {
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
      resolved: ticket.resolved,
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
    cancelReason: row.cancel_reason ?? undefined,
    deliveryStage: row.delivery_stage ?? undefined,
    estimatedPickupDate: row.estimated_pickup_date ?? undefined,
    customerName: row.customer?.name ?? "",
    customerEmail: row.customer?.email ?? "",
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

export async function fetchAdminOrder(id: string): Promise<AdminOrder | null> {
  const { data, error } = await createBrowserClient()
    .from("orders")
    .select(ADMIN_ORDER_SELECT)
    .eq("id", id)
    .maybeSingle<AdminOrderRow>();
  if (error) throw friendlyAdminError(error);
  return data ? mapAdminOrder(data) : null;
}

export async function cancelOrder(orderId: string, reason?: string): Promise<void> {
  await rpc<void>("admin_cancel_order", { p_order: orderId, p_reason: reason ?? null });
}

export async function completeOrderManually(orderId: string): Promise<void> {
  await rpc<void>("admin_complete_order", { p_order: orderId });
}

export async function advanceDeliveryStage(orderId: string): Promise<DeliveryStage> {
  return rpc<DeliveryStage>("advance_delivery_stage", { p_order: orderId });
}

export async function setTicketResolved(
  ticketId: string,
  resolved: boolean,
): Promise<void> {
  await rpc<void>("admin_set_ticket_resolved", {
    p_ticket_id: ticketId,
    p_resolved: resolved,
  });
}

// --- Formulários públicos ------------------------------------------------

export interface AdminLead {
  id: string;
  storeName: string;
  wantsPickup: boolean;
  wantsDropoff: boolean;
  street: string;
  number: string;
  complement?: string;
  city: string;
  state: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  website?: string;
  games: GameTag[];
  otherGames: string[];
  message?: string;
  contacted: boolean;
  createdAt: string;
}

export async function fetchLeads(): Promise<AdminLead[]> {
  const { data, error } = await createBrowserClient()
    .from("partner_leads")
    .select(
      "id, store_name, wants_pickup, wants_dropoff, street, number, complement, city, state, contact_name, contact_phone, contact_email, website, games, other_games, message, contacted, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw friendlyAdminError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    storeName: r.store_name,
    wantsPickup: r.wants_pickup,
    wantsDropoff: r.wants_dropoff,
    street: r.street,
    number: r.number,
    complement: r.complement ?? undefined,
    city: r.city,
    state: r.state,
    contactName: r.contact_name,
    contactPhone: r.contact_phone,
    contactEmail: r.contact_email,
    website: r.website ?? undefined,
    games: r.games ?? [],
    otherGames: r.other_games ?? [],
    message: r.message ?? undefined,
    contacted: r.contacted,
    createdAt: r.created_at,
  }));
}

export async function setLeadContacted(
  leadId: string,
  contacted: boolean,
): Promise<void> {
  await rpc<void>("admin_set_lead_contacted", {
    p_lead_id: leadId,
    p_contacted: contacted,
  });
}

export interface AdminSuggestion {
  id: string;
  storeName: string;
  storeAddress: string;
  comment?: string;
  contacted: boolean;
  createdAt: string;
}

export async function fetchSuggestions(): Promise<AdminSuggestion[]> {
  const { data, error } = await createBrowserClient()
    .from("store_suggestions")
    .select("id, store_name, store_address, comment, contacted, created_at")
    .order("created_at", { ascending: false });
  if (error) throw friendlyAdminError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    storeName: r.store_name,
    storeAddress: r.store_address,
    comment: r.comment ?? undefined,
    contacted: r.contacted,
    createdAt: r.created_at,
  }));
}

export async function setSuggestionContacted(
  suggestionId: string,
  contacted: boolean,
): Promise<void> {
  await rpc<void>("admin_set_suggestion_contacted", {
    p_suggestion_id: suggestionId,
    p_contacted: contacted,
  });
}

// --- Catálogo: lojas -------------------------------------------------------

export interface AdminStore {
  id: string;
  code: string;
  name: string;
  address: string;
  neighborhood?: string;
  city: string;
  state: string;
  lat?: number;
  lng?: number;
  logoPath?: string;
  logoOnDark: boolean;
  isPickupPoint: boolean;
  pickupSortOrder?: number;
}

export async function fetchStores(): Promise<AdminStore[]> {
  const { data, error } = await createBrowserClient()
    .from("stores")
    .select(
      "id, code, name, address, neighborhood, city, state, lat, lng, logo_path, logo_on_dark, is_pickup_point, pickup_sort_order",
    )
    .order("code");
  if (error) throw friendlyAdminError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    address: r.address,
    neighborhood: r.neighborhood ?? undefined,
    city: r.city,
    state: r.state,
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
    logoPath: r.logo_path ?? undefined,
    logoOnDark: r.logo_on_dark,
    isPickupPoint: r.is_pickup_point,
    pickupSortOrder: r.pickup_sort_order ?? undefined,
  }));
}

export interface StoreInput {
  name: string;
  address: string;
  neighborhood?: string;
  city: string;
  state: string;
  lat?: number;
  lng?: number;
  logoPath?: string;
  logoOnDark: boolean;
  isPickupPoint: boolean;
  pickupSortOrder?: number;
}

export async function upsertStore(
  storeId: string | null,
  input: StoreInput,
): Promise<string> {
  return rpc<string>("admin_upsert_store", { p_store_id: storeId, p: input });
}

export async function deleteStore(storeId: string): Promise<void> {
  await rpc<void>("admin_delete_store", { p_store_id: storeId });
}

// --- Catálogo: rotas de frete -----------------------------------------------

export interface AdminFreightRoute {
  id: string;
  originStoreId: string;
  originStoreCode: string;
  destinationStoreId: string;
  destinationStoreCode: string;
  loggiBRL: number;
  uberBRL?: number;
}

export async function fetchFreightRoutes(): Promise<AdminFreightRoute[]> {
  const { data, error } = await createBrowserClient()
    .from("freight_routes")
    .select(
      "id, origin_store_id, destination_store_id, loggi_brl, uber_brl, origin:stores!origin_store_id(code), destination:stores!destination_store_id(code)",
    )
    .returns<
      {
        id: string;
        origin_store_id: string;
        destination_store_id: string;
        loggi_brl: number | string;
        uber_brl: number | string | null;
        origin: { code: string } | null;
        destination: { code: string } | null;
      }[]
    >();
  if (error) throw friendlyAdminError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    originStoreId: r.origin_store_id,
    originStoreCode: r.origin?.code ?? "",
    destinationStoreId: r.destination_store_id,
    destinationStoreCode: r.destination?.code ?? "",
    loggiBRL: Number(r.loggi_brl),
    uberBRL: r.uber_brl !== null ? Number(r.uber_brl) : undefined,
  }));
}

export interface FreightRouteInput {
  originStoreId: string;
  destinationStoreId: string;
  loggiBrl: number;
  uberBrl?: number;
}

export async function upsertFreightRoute(
  routeId: string | null,
  input: FreightRouteInput,
): Promise<string> {
  return rpc<string>("admin_upsert_freight_route", { p_route_id: routeId, p: input });
}

export async function deleteFreightRoute(routeId: string): Promise<void> {
  await rpc<void>("admin_delete_freight_route", { p_route_id: routeId });
}

// --- Catálogo: Correios ------------------------------------------------------

export async function fetchCorreiosRate(): Promise<number> {
  const { data, error } = await createBrowserClient()
    .from("carrier_flat_rates")
    .select("flat_rate_brl")
    .eq("carrier", "correios")
    .single();
  if (error) throw friendlyAdminError(error);
  return Number(data.flat_rate_brl);
}

export async function updateCorreiosRate(flatRateBRL: number): Promise<void> {
  await rpc<void>("admin_update_correios_rate", { p_flat_rate_brl: flatRateBRL });
}

// --- Catálogo: comparativo ---------------------------------------------------

export interface AdminComparisonCarrier {
  id: string;
  name: string;
  isHighlighted: boolean;
  sortOrder: number;
}

export interface AdminComparisonRow {
  id: string;
  label: string;
  sortOrder: number;
}

export interface AdminComparisonValue {
  rowId: string;
  carrierId: string;
  status?: "positive" | "negative" | "neutral";
  text: string;
  detail?: string;
}

export interface AdminComparison {
  carriers: AdminComparisonCarrier[];
  rows: AdminComparisonRow[];
  values: AdminComparisonValue[];
}

export async function fetchComparison(): Promise<AdminComparison> {
  const client = createBrowserClient();
  const [carriers, rows, values] = await Promise.all([
    client
      .from("comparison_carriers")
      .select("id, name, is_highlighted, sort_order")
      .order("sort_order"),
    client.from("comparison_rows").select("id, label, sort_order").order("sort_order"),
    client.from("comparison_values").select("row_id, carrier_id, status, text, detail"),
  ]);
  if (carriers.error) throw friendlyAdminError(carriers.error);
  if (rows.error) throw friendlyAdminError(rows.error);
  if (values.error) throw friendlyAdminError(values.error);
  return {
    carriers: (carriers.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      isHighlighted: c.is_highlighted,
      sortOrder: c.sort_order,
    })),
    rows: (rows.data ?? []).map((r) => ({
      id: r.id,
      label: r.label,
      sortOrder: r.sort_order,
    })),
    values: (values.data ?? []).map((v) => ({
      rowId: v.row_id,
      carrierId: v.carrier_id,
      status: v.status ?? undefined,
      text: v.text,
      detail: v.detail ?? undefined,
    })),
  };
}

export async function upsertComparisonCarrier(
  carrierId: string,
  input: { name: string; isHighlighted: boolean; sortOrder: number },
): Promise<void> {
  await rpc<void>("admin_upsert_comparison_carrier", {
    p_carrier_id: carrierId,
    p: input,
  });
}

export async function deleteComparisonCarrier(carrierId: string): Promise<void> {
  await rpc<void>("admin_delete_comparison_carrier", { p_carrier_id: carrierId });
}

export async function upsertComparisonRow(
  rowId: string | null,
  input: { label: string; sortOrder: number },
): Promise<string> {
  return rpc<string>("admin_upsert_comparison_row", { p_row_id: rowId, p: input });
}

export async function deleteComparisonRow(rowId: string): Promise<void> {
  await rpc<void>("admin_delete_comparison_row", { p_row_id: rowId });
}

export async function upsertComparisonValue(
  rowId: string,
  carrierId: string,
  input: { status?: "positive" | "negative" | "neutral"; text: string; detail?: string },
): Promise<void> {
  await rpc<void>("admin_upsert_comparison_value", {
    p_row_id: rowId,
    p_carrier_id: carrierId,
    p: input,
  });
}

// --- Catálogo: cupons -----------------------------------------------------

export interface AdminCoupon {
  code: string;
  type: "percent" | "flat";
  value: number;
  label: string;
  active: boolean;
}

export async function fetchCoupons(): Promise<AdminCoupon[]> {
  const { data, error } = await createBrowserClient()
    .from("coupons")
    .select("code, type, value, label, active")
    .order("code");
  if (error) throw friendlyAdminError(error);
  return (data ?? []).map((c) => ({
    code: c.code,
    type: c.type,
    value: Number(c.value),
    label: c.label,
    active: c.active,
  }));
}

export async function upsertCoupon(
  code: string,
  input: { type: "percent" | "flat"; value: number; label: string; active: boolean },
): Promise<void> {
  await rpc<void>("admin_upsert_coupon", { p_code: code, p: input });
}

// --- Administradores --------------------------------------------------------

export interface AdminUser {
  userId: string;
  name: string;
  email: string;
  createdAt: string;
}

export async function fetchAdmins(): Promise<AdminUser[]> {
  const { data, error } = await createBrowserClient()
    .from("admins")
    .select("user_id, created_at, profile:profiles!user_id(name, email)")
    .order("created_at")
    .returns<
      {
        user_id: string;
        created_at: string;
        profile: { name: string; email: string } | null;
      }[]
    >();
  if (error) throw friendlyAdminError(error);
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    name: r.profile?.name ?? "",
    email: r.profile?.email ?? "",
    createdAt: r.created_at,
  }));
}

export async function addAdmin(email: string): Promise<string> {
  return rpc<string>("admin_add_admin", { p_email: email });
}

export async function removeAdmin(userId: string): Promise<void> {
  await rpc<void>("admin_remove_admin", { p_target_user_id: userId });
}

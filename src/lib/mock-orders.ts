"use client";

import { useCallback, useSyncExternalStore } from "react";
import type {
  DeliveryStage,
  MockOrder,
  MockOrderStatus,
  PaymentMethod,
  StoreCharge,
  SupportTicket,
} from "@/lib/types/mock-order";
import type { PedidoGroup } from "@/lib/types/order";

const DELIVERY_STAGE_ORDER: DeliveryStage[] = [
  "aguardando-coleta",
  "em-transporte",
  "disponivel-para-retirada",
];

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

const STORAGE_KEY = "t1-express:mock-orders";

// TODO: substituir por persistência real (com backend) quando ela existir.
// Por enquanto simula os pedidos do usuário salvos localmente no navegador.
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

let cache: { raw: string | null | undefined; orders: MockOrder[] } = {
  raw: undefined,
  orders: [],
};

function readAll(): MockOrder[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (cache.raw === raw) return cache.orders;
  let orders: MockOrder[] = [];
  try {
    const parsed = raw ? (JSON.parse(raw) as MockOrder[]) : [];
    // Pedidos salvos antes dos campos storeCharges/supportTickets/deliveryStage/estimatedPickupDate existirem.
    orders = parsed.map((order) => ({
      ...order,
      storeCharges: order.storeCharges ?? [],
      supportTickets: order.supportTickets ?? [],
      deliveryStage:
        order.deliveryStage ??
        (order.status === "active" ? "aguardando-coleta" : undefined),
      estimatedPickupDate:
        order.estimatedPickupDate ??
        (order.paidAt ? addDays(order.paidAt, order.quote.estimatedDaysMax) : undefined),
    }));
  } catch {
    orders = [];
  }
  cache = { raw, orders };
  return orders;
}

function writeAll(orders: MockOrder[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  emitChange();
}

const EMPTY_ORDERS: MockOrder[] = [];

function getServerSnapshot(): MockOrder[] {
  return EMPTY_ORDERS;
}

export function createMockOrder(order: MockOrder) {
  writeAll([...readAll(), order]);
}

export function getMockOrder(id: string): MockOrder | undefined {
  return readAll().find((order) => order.id === id);
}

export function updateMockOrderStatus(
  id: string,
  status: MockOrderStatus,
  extra?: Partial<
    Pick<
      MockOrder,
      "paidAt" | "completedAt" | "paymentMethod" | "deliveryStage" | "estimatedPickupDate"
    >
  >,
) {
  writeAll(
    readAll().map((order) => (order.id === id ? { ...order, status, ...extra } : order)),
  );
}

function updateMockOrder(id: string, patch: Partial<MockOrder>) {
  writeAll(readAll().map((order) => (order.id === id ? { ...order, ...patch } : order)));
}

export interface AddStoreChargeInput {
  storeIds: string[];
  draftOrdersByStore: Record<string, PedidoGroup[]>;
  itemsTotalAdded: number;
  amountBRL: number;
  insuranceUpgrade?: { coverageAmountBRL: number; extraCostBRL: number };
}

export function addStoreCharge(orderId: string, input: AddStoreChargeInput): string {
  const id = crypto.randomUUID();
  const order = getMockOrder(orderId);
  if (!order) return id;
  const charge: StoreCharge = {
    id,
    storeIds: input.storeIds,
    amountBRL: input.amountBRL,
    status: "pending-payment",
    createdAt: new Date().toISOString(),
    draftOrdersByStore: input.draftOrdersByStore,
    itemsTotalAdded: input.itemsTotalAdded,
    insuranceUpgrade: input.insuranceUpgrade,
  };
  updateMockOrder(orderId, { storeCharges: [...order.storeCharges, charge] });
  return id;
}

export function resolveStoreCharge(
  orderId: string,
  chargeId: string,
  paymentMethod: PaymentMethod,
) {
  const order = getMockOrder(orderId);
  if (!order) return;
  const charge = order.storeCharges.find((candidate) => candidate.id === chargeId);
  if (!charge || charge.status !== "pending-payment") return;

  updateMockOrder(orderId, {
    originStoreIds: [...new Set([...order.originStoreIds, ...charge.storeIds])],
    ordersByStore: { ...order.ordersByStore, ...(charge.draftOrdersByStore ?? {}) },
    itemsTotal: order.itemsTotal + (charge.itemsTotalAdded ?? 0),
    insurance: charge.insuranceUpgrade
      ? {
          extraCoverageOptedIn: true,
          coverageAmountBRL: charge.insuranceUpgrade.coverageAmountBRL,
          extraCostBRL: charge.insuranceUpgrade.extraCostBRL,
        }
      : order.insurance,
    storeCharges: order.storeCharges.map((candidate) =>
      candidate.id === chargeId
        ? {
            ...candidate,
            status: "paid" as const,
            paidAt: new Date().toISOString(),
            paymentMethod,
          }
        : candidate,
    ),
  });
}

export function addPedidoGroupToStore(
  orderId: string,
  storeId: string,
  group: PedidoGroup,
) {
  const order = getMockOrder(orderId);
  if (!order) return;
  updateMockOrder(orderId, {
    ordersByStore: {
      ...order.ordersByStore,
      [storeId]: [...(order.ordersByStore[storeId] ?? []), group],
    },
  });
}

export function advanceDeliveryStage(orderId: string) {
  const order = getMockOrder(orderId);
  if (!order?.deliveryStage) return;
  const currentIndex = DELIVERY_STAGE_ORDER.indexOf(order.deliveryStage);
  const nextStage = DELIVERY_STAGE_ORDER[currentIndex + 1];
  if (!nextStage) return;
  updateMockOrder(orderId, { deliveryStage: nextStage });
}

export function addSupportTicket(orderId: string, ticket: SupportTicket) {
  const order = getMockOrder(orderId);
  if (!order) return;
  updateMockOrder(orderId, { supportTickets: [...order.supportTickets, ticket] });
}

export function useMockOrders() {
  const orders = useSyncExternalStore(subscribe, readAll, getServerSnapshot);

  const create = useCallback((order: MockOrder) => createMockOrder(order), []);

  const markActive = useCallback((id: string, paymentMethod: PaymentMethod) => {
    const order = getMockOrder(id);
    const paidAt = new Date().toISOString();
    updateMockOrderStatus(id, "active", {
      paidAt,
      paymentMethod,
      deliveryStage: "aguardando-coleta",
      estimatedPickupDate: order
        ? addDays(paidAt, order.quote.estimatedDaysMax)
        : undefined,
    });
  }, []);

  const markCompleted = useCallback((id: string) => {
    updateMockOrderStatus(id, "completed", { completedAt: new Date().toISOString() });
  }, []);

  const addStore = useCallback(
    (orderId: string, input: AddStoreChargeInput) => addStoreCharge(orderId, input),
    [],
  );

  const resolveCharge = useCallback(
    (orderId: string, chargeId: string, paymentMethod: PaymentMethod) =>
      resolveStoreCharge(orderId, chargeId, paymentMethod),
    [],
  );

  const addGroupToStore = useCallback(
    (orderId: string, storeId: string, group: PedidoGroup) =>
      addPedidoGroupToStore(orderId, storeId, group),
    [],
  );

  const advanceStage = useCallback(
    (orderId: string) => advanceDeliveryStage(orderId),
    [],
  );

  const addTicket = useCallback(
    (orderId: string, ticket: SupportTicket) => addSupportTicket(orderId, ticket),
    [],
  );

  return {
    orders,
    create,
    markActive,
    markCompleted,
    addStore,
    resolveCharge,
    addGroupToStore,
    advanceStage,
    addTicket,
  };
}

export function useMockOrder(id: string | null) {
  const { orders } = useMockOrders();
  return id ? orders.find((order) => order.id === id) : undefined;
}

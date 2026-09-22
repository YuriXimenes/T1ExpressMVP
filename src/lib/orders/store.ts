"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import type { MockOrder, PaymentMethod } from "@/lib/types/mock-order";
import type { PedidoGroup } from "@/lib/types/order";
import * as api from "@/lib/orders/api";
import type { AddStoreChargeInput, CreateOrderInput } from "@/lib/orders/api";

export type { AddStoreChargeInput, CreateOrderInput };
export { OrderError } from "@/lib/orders/api";

/**
 * Os pedidos vêm do Supabase (a RLS entrega só os do usuário logado). Ficam num
 * store de módulo para todas as telas compartilharem a mesma lista e serem
 * atualizadas juntas depois de cada ação.
 */
export type OrdersStatus = "idle" | "loading" | "ready" | "error";

interface State {
  status: OrdersStatus;
  orders: MockOrder[];
  error: string | null;
  ownerId: string | null;
}

const EMPTY_ORDERS: MockOrder[] = [];
const IDLE: State = { status: "idle", orders: EMPTY_ORDERS, error: null, ownerId: null };

let state: State = IDLE;
let inFlight: Promise<void> | null = null;
let authListening = false;
const listeners = new Set<() => void>();

function setState(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}

function resetOrders() {
  inFlight = null;
  if (state !== IDLE) setState(IDLE);
}

function listenToAuth() {
  if (authListening) return;
  authListening = true;
  createBrowserClient().auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") resetOrders();
    else if (session && state.ownerId && state.ownerId !== session.user.id) resetOrders();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  listenToAuth();
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => IDLE;

/** Recarrega os pedidos. Nunca lança: em caso de falha guarda o erro e mantém a lista antiga. */
export function refreshOrders(): Promise<void> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const { data } = await createBrowserClient().auth.getSession();
    const userId = data.session?.user.id ?? null;
    if (!userId) {
      resetOrders();
      return;
    }
    if (state.ownerId !== userId) {
      setState({ ...IDLE, status: "loading", ownerId: userId });
    } else if (state.status === "idle" || state.status === "error") {
      setState({ ...state, status: "loading", error: null });
    }

    try {
      const orders = await api.fetchOrders();
      // Se o usuário trocou no meio da busca, descarta o resultado.
      if (state.ownerId !== userId) return;
      setState({ status: "ready", orders, error: null, ownerId: userId });
    } catch (err) {
      if (state.ownerId !== userId) return;
      setState({
        ...state,
        status: "error",
        error:
          err instanceof api.OrderError
            ? err.message
            : "Não foi possível carregar seus pedidos.",
      });
    }
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Roda uma escrita e, se deu certo, atualiza a lista antes de devolver. */
async function mutate<T>(action: () => Promise<T>): Promise<T> {
  const result = await action();
  // Uma busca já em andamento pode ter começado antes da escrita: espera ela
  // terminar e busca de novo para não mostrar dados velhos.
  if (inFlight) await inFlight;
  await refreshOrders();
  return result;
}

export function useOrders() {
  const { isReady, isLoggedIn } = useAuth();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (!isReady) return;
    if (!isLoggedIn) {
      resetOrders();
      return;
    }
    if (state.status === "idle") void refreshOrders();
  }, [isReady, isLoggedIn]);

  // Ao voltar para a aba, busca de novo (ex.: a etapa da entrega mudou no admin).
  useEffect(() => {
    if (!isReady || !isLoggedIn) return;
    const onFocus = () => void refreshOrders();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isReady, isLoggedIn]);

  const create = useCallback(
    (input: CreateOrderInput) => mutate(() => api.createOrder(input)),
    [],
  );

  const markActive = useCallback(
    (orderId: string, method: PaymentMethod) =>
      mutate(() => api.payOrder(orderId, method)),
    [],
  );

  const markCompleted = useCallback(
    (orderId: string) => mutate(() => api.completeOrder(orderId)),
    [],
  );

  const addStore = useCallback(
    (orderId: string, input: AddStoreChargeInput) =>
      mutate(() => api.addStoreCharge(orderId, input)),
    [],
  );

  const resolveCharge = useCallback(
    (chargeId: string, method: PaymentMethod) =>
      mutate(() => api.payStoreCharge(chargeId, method)),
    [],
  );

  const addGroupsToStore = useCallback(
    (orderId: string, storeId: string, groups: PedidoGroup[]) =>
      mutate(() => api.addGroupsToStore(orderId, storeId, groups)),
    [],
  );

  const addTicket = useCallback(
    (orderId: string, subject: string, message: string) =>
      mutate(() => api.createSupportTicket(orderId, subject, message)),
    [],
  );

  return {
    orders: snapshot.orders,
    status: snapshot.status,
    error: snapshot.error,
    /** true enquanto a primeira busca ainda não terminou (evita piscar "não encontrado"). */
    isLoading: snapshot.status === "idle" || snapshot.status === "loading",
    refresh: refreshOrders,
    create,
    markActive,
    markCompleted,
    addStore,
    resolveCharge,
    addGroupsToStore,
    addTicket,
  };
}

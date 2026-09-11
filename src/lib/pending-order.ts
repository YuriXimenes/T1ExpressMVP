"use client";

import { useSyncExternalStore } from "react";
import type { PendingOrder } from "@/lib/types/pending-order";

const STORAGE_KEY = "t1-express:pending-order";

// Guarda a simulação de frete que o usuário estava concluindo antes de
// precisar logar/criar conta, para retomar exatamente de onde parou.
export function savePendingOrder(order: PendingOrder) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {
    // sessionStorage indisponível (modo privado, etc.) — segue sem persistir.
  }
}

export function clearPendingOrder() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignora
  }
}

function subscribe() {
  return () => {};
}

let cache: { raw: string | null | undefined; order: PendingOrder | null } = {
  raw: undefined,
  order: null,
};

function getSnapshot(): PendingOrder | null {
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (cache.raw === raw) return cache.order;
  let order: PendingOrder | null = null;
  try {
    order = raw ? (JSON.parse(raw) as PendingOrder) : null;
  } catch {
    order = null;
  }
  cache = { raw, order };
  return order;
}

function getServerSnapshot(): PendingOrder | null {
  return null;
}

export function usePendingOrder() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

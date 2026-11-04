"use client";

import { createBrowserClient } from "@/lib/supabase/client";

/** Página pública do QR do pacote (/retirada/<token>): funções `pickup_*` da 0015. */
export class PickupError extends Error {}

export type PickupState = "not_ready" | "ready" | "done" | "cancelled";

export interface PickupLookup {
  found: boolean;
  orderCode?: string;
  storeName?: string;
  customerFirstName?: string;
  state?: PickupState;
  lockedUntil?: string;
  attemptsLeft?: number;
}

export interface PickupResult {
  ok: boolean;
  locked?: boolean;
  attemptsLeft?: number;
}

function friendly(error: { message?: string; code?: string }): PickupError {
  if (error.code === "P0001" && error.message) return new PickupError(error.message);
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("failed to fetch") || message.includes("network")) {
    return new PickupError("Sem conexão com o servidor. Tente novamente.");
  }
  return new PickupError("Não foi possível concluir. Tente novamente.");
}

export async function lookupPickup(token: string): Promise<PickupLookup> {
  const { data, error } = await createBrowserClient().rpc(
    "pickup_lookup" as never,
    { p_token: token } as never,
  );
  if (error) throw friendly(error);
  return data as PickupLookup;
}

export async function confirmPickup(token: string, code: string): Promise<PickupResult> {
  const { data, error } = await createBrowserClient().rpc(
    "pickup_confirm" as never,
    { p_token: token, p_code: code } as never,
  );
  if (error) throw friendly(error);
  return data as PickupResult;
}

"use client";

import { createBrowserClient } from "@/lib/supabase/client";
import {
  CHECK_SELECT,
  PHOTO_SELECT,
  mapCheck,
  withPhotoUrls,
  type CheckRow,
  type PhotoRow,
} from "@/lib/admin/api";
import type { ItemCheck, OrderPhoto } from "@/lib/admin/handling";

/** O que o cliente vê da operação: código de retirada, conferência e fotos (RLS: só o dono). */
export interface OwnOrderHandling {
  pickupCode?: string;
  pickupUsedAt?: string;
  checks: ItemCheck[];
  photos: OrderPhoto[];
}

export async function fetchOwnOrderHandling(orderId: string): Promise<OwnOrderHandling> {
  const supabase = createBrowserClient();
  const [pickup, checks, photos] = await Promise.all([
    supabase
      .from("order_pickups" as never)
      .select("pickup_code, used_at")
      .eq("order_id", orderId)
      .maybeSingle<{ pickup_code: string; used_at: string | null }>(),
    supabase
      .from("order_item_checks" as never)
      .select(CHECK_SELECT)
      .eq("order_id", orderId)
      .returns<CheckRow[]>(),
    supabase
      .from("order_photos" as never)
      .select(PHOTO_SELECT)
      .eq("order_id", orderId)
      .order("created_at")
      .returns<PhotoRow[]>(),
  ]);
  const failed = [pickup, checks, photos].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  return {
    pickupCode: pickup.data?.pickup_code,
    pickupUsedAt: pickup.data?.used_at ?? undefined,
    checks: (checks.data ?? []).map(mapCheck),
    photos: await withPhotoUrls(photos.data ?? []),
  };
}

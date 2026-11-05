"use client";

import { rpc } from "@/lib/admin/api";

/** Pontos de retirada (0018_points_occurrences.sql). */

export interface PickupPoint {
  code: string;
  name: string;
  address: string;
  neighborhood?: string;
  city: string;
  /** "0" (domingo) … "6" (sábado) → "10:00–19:00". */
  hours: Record<string, string>;
  capacity?: number;
  guardDays: number;
  stored: number;
  expired: number;
  dueToday: number;
  pickups30d: number;
  avgHoursToPickup30d?: number;
}

export async function fetchPickupPoints(): Promise<PickupPoint[]> {
  return (await rpc<PickupPoint[]>("admin_pickup_points", {})) ?? [];
}

export interface PointPackage {
  orderId: string;
  customerName?: string;
  availableAt?: string;
  guardUntil?: string;
  openOccurrenceId?: string;
}

export async function fetchPointPackages(code: string): Promise<PointPackage[]> {
  return (await rpc<PointPackage[]>("admin_point_packages", { p_code: code })) ?? [];
}

export interface PointPickup {
  orderId: string;
  customerName?: string;
  availableAt?: string;
  pickedUpAt: string;
}

export async function fetchPointPickups(
  code: string,
  from: string,
  to: string,
): Promise<PointPickup[]> {
  return (
    (await rpc<PointPickup[]>("admin_point_pickups", {
      p_code: code,
      p_from: from,
      p_to: to,
    })) ?? []
  );
}

export async function updatePickupPoint(
  code: string,
  settings: { hours: Record<string, string>; capacity?: number; guardDays: number },
) {
  await rpc<void>("admin_update_pickup_point", {
    p_code: code,
    p: { ...settings, capacity: settings.capacity ?? "" },
  });
}

export async function extendGuard(orderId: string, date: string, reason: string) {
  await rpc<void>("admin_extend_guard", {
    p_order: orderId,
    p_date: date,
    p_reason: reason,
  });
}

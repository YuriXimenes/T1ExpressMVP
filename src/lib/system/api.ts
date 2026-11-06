"use client";

import { createBrowserClient } from "@/lib/supabase/client";
import type { AuditAction } from "@/lib/system/audit";
import type { ErrorSource } from "@/lib/system/errors";
import type { AdminNotification } from "@/lib/system/notifications";

/** Sistema (0025_system.sql): auditoria, sino, erros e saúde. */

export class SystemError extends Error {}

async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await createBrowserClient().rpc(name as never, args as never);
  if (error) {
    if (error.code === "P0001" && error.message) throw new SystemError(error.message);
    throw new SystemError("Não foi possível carregar. Tente novamente.");
  }
  return data as T;
}

// --- Auditoria -------------------------------------------------------------------

export interface AuditEntry {
  id: number;
  at: string;
  actorId?: string;
  actorName?: string;
  area: string;
  table: string;
  recordId?: string;
  recordLabel?: string;
  action: AuditAction;
  changes: Record<string, { old?: unknown; new?: unknown }>;
  reason?: string;
}

export interface AuditFilters {
  from?: string;
  to?: string;
  actorId?: string;
  area?: string;
  action?: AuditAction | "";
  q?: string;
}

export interface AuditPage {
  items: AuditEntry[];
  nextBefore?: number;
  actors: { id: string; name: string }[];
}

export function fetchAudit(filters: AuditFilters, before?: number): Promise<AuditPage> {
  return call<AuditPage>("admin_audit", { p: { ...filters, before: before ?? "" } });
}

// --- Sino -------------------------------------------------------------------------

export function fetchNotifications(): Promise<{
  items: AdminNotification[];
  unread: number;
}> {
  return call("admin_notifications");
}

export function markNotifications(keys: string[]): Promise<void> {
  return call<void>("admin_mark_notifications", { p_keys: keys });
}

// --- Erros e saúde ---------------------------------------------------------------

export interface AppErrorRow {
  id: string;
  source: ErrorSource;
  message: string;
  stack?: string;
  path?: string;
  userAgent?: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  status: "aberto" | "resolvido";
  resolvedAt?: string;
  resolvedByName?: string;
  reopened: boolean;
}

export function fetchErrors(status?: "aberto" | "resolvido"): Promise<AppErrorRow[]> {
  return call<AppErrorRow[]>("admin_errors", { p_status: status ?? null }).then(
    (r) => r ?? [],
  );
}

export function resolveError(id: string): Promise<void> {
  return call<void>("admin_resolve_error", { p_id: id });
}

export interface SystemHealth {
  dbTime: string;
  schemaVersion: string;
  buckets: string[];
  openErrors: number;
  errors24h: number;
  auditToday: number;
  simulations7d: number;
}

export function fetchSystemHealth(): Promise<SystemHealth> {
  return call<SystemHealth>("system_health");
}

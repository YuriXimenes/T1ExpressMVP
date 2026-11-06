"use client";

import { createBrowserClient } from "@/lib/supabase/client";
import type { DashboardPeriod } from "@/lib/admin/dashboard";
import type { FreightQuoteResult } from "@/lib/types/freight";
import type { ComparatorIssue, SavingsBucket } from "@/lib/metrics/rules";

/** Indicadores da plataforma (0024_platform_metrics.sql). */

export class MetricsError extends Error {}

async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await createBrowserClient().rpc(name as never, args as never);
  if (error) {
    if (error.code === "P0001" && error.message) throw new MetricsError(error.message);
    throw new MetricsError("Não foi possível carregar os indicadores.");
  }
  return data as T;
}

// --- Código do navegador ---------------------------------------------------------

const VISITOR_KEY = "t1-express:visitor";

/**
 * Código aleatório deste navegador (não identifica a pessoa). Sem localStorage
 * (modo privado), vale só para esta aba.
 */
let memoryVisitor: string | null = null;
export function getVisitorId(): string {
  try {
    const saved = window.localStorage.getItem(VISITOR_KEY);
    if (saved && /^[A-Za-z0-9-]{16,64}$/.test(saved)) return saved;
    const id = crypto.randomUUID();
    window.localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    memoryVisitor ??= crypto.randomUUID();
    return memoryVisitor;
  }
}

// --- Registro (site) -------------------------------------------------------------
// Nunca atrapalha o cliente: qualquer falha vira null / é ignorada.

export async function logSimulation(input: {
  originStoreIds: string[];
  destinationStoreId: string;
  quote?: FreightQuoteResult;
  failed?: boolean;
}): Promise<string | null> {
  try {
    const { data, error } = await createBrowserClient().rpc(
      "log_simulation" as never,
      {
        p: {
          visitorId: getVisitorId(),
          originStoreCodes: input.originStoreIds,
          destinationStoreCode: input.destinationStoreId,
          failed: input.failed ?? false,
          quote: input.quote
            ? {
                estimatedDaysMin: input.quote.estimatedDaysMin,
                estimatedDaysMax: input.quote.estimatedDaysMax,
                cheapestSavingsBRL: input.quote.cheapestSavingsBRL ?? null,
                competitors: input.quote.competitors.map((c) => ({
                  carrier: c.carrier,
                  totalBRL: c.totalBRL,
                })),
              }
            : null,
        },
      } as never,
    );
    if (error) return null;
    return (data as string | null) ?? null;
  } catch {
    return null;
  }
}

export type SimulationStep = "continued" | "order_page" | "order";

export async function markSimulation(
  simulationId: string | undefined,
  step: SimulationStep,
  orderId?: string,
): Promise<void> {
  if (!simulationId) return;
  try {
    await createBrowserClient().rpc(
      "mark_simulation" as never,
      {
        p_id: simulationId,
        p_visitor: getVisitorId(),
        p_step: step,
        p_order: orderId ?? null,
      } as never,
    );
  } catch {
    // ignora: indicador não pode atrapalhar o pedido
  }
}

// --- Indicadores (admin) ---------------------------------------------------------

const range = (p: DashboardPeriod) => ({ p_from: p.from ?? null, p_to: p.to ?? null });

export interface FunnelMetrics {
  simulations: number;
  failed: number;
  visitors: number;
  continued: number;
  orderPage: number;
  ordersCreated: number;
  paid: number;
  completed: number;
  cancelled: number;
  loggedIn: number;
  ordersWithoutSimulation: number;
  daily: { day: string; simulations: number; orders: number; paid: number }[];
}

export interface DemandStore {
  code: string;
  name: string;
  simulations: number;
  orders: number;
  failed: number;
}

export interface DemandRoute {
  key: string;
  label: string;
  storeCount: number;
  simulations: number;
  visitors: number;
  failed: number;
  orders: number;
  paid: number;
  avgPrice: number | null;
  lastAt: string;
}

export interface DemandMetrics {
  origins: DemandStore[];
  destinations: DemandStore[];
  routes: DemandRoute[];
}

export interface PricingRow {
  simulations: number;
  orders: number;
  paid: number;
}

export interface PricingMetrics {
  simulations: number;
  avgPrice: number | null;
  avgSavings: number | null;
  cheapest: number;
  withoutUber: number;
  avgUber: number | null;
  avgLoggi: number | null;
  avgCorreios: number | null;
  bySavings: (PricingRow & { bucket: SavingsBucket })[];
  byStoreCount: (PricingRow & { stores: number; avgPrice: number | null })[];
}

export interface CustomerMetrics {
  signups: number;
  signupsWithOrder: number;
  buyers: number;
  firstTimeBuyers: number;
  repeatBuyers: number;
  paidOrders: number;
  avgDaysToFirstOrder: number | null;
  customersTotal: number;
  repeatTotal: number;
  daily: { day: string; signups: number }[];
}

export interface AbandonedSimulation {
  userId: string;
  name: string;
  email: string;
  phone?: string;
  route: string;
  routeKey: string;
  price?: number;
  savings?: number;
  failed: boolean;
  simulatedAt: string;
  reachedOrderPage: boolean;
  simulations: number;
}

export interface StoreRequest {
  name: string;
  total: number;
  suggestions: number;
  customers: number;
  addresses?: string[];
  lastAt: string;
  contacted: boolean;
  partnerStatus?: "parceira" | "negociacao";
}

export interface ComparatorHealth {
  pairs: number;
  missingRoute: number;
  missingUber: number;
  stale: number;
  staleDays: number;
  items: {
    originCode: string;
    originName: string;
    destCode: string;
    destName: string;
    issue: ComparatorIssue;
    updatedAt?: string;
    simulations: number;
    failed: number;
  }[];
}

export interface MetricsSummary {
  simulations: number;
  failed: number;
  visitors: number;
  paid: number;
  signups: number;
}

export const fetchFunnel = (p: DashboardPeriod) =>
  call<FunnelMetrics>("admin_metrics_funnel", range(p));
export const fetchDemand = (p: DashboardPeriod) =>
  call<DemandMetrics>("admin_metrics_demand", range(p));
export const fetchPricingMetrics = (p: DashboardPeriod) =>
  call<PricingMetrics>("admin_metrics_pricing", range(p));
export const fetchCustomerMetrics = (p: DashboardPeriod) =>
  call<CustomerMetrics>("admin_metrics_customers", range(p));
export const fetchAbandoned = async (p: DashboardPeriod) =>
  (await call<AbandonedSimulation[]>("admin_metrics_abandoned", range(p))) ?? [];
export const fetchStoreRequests = async () =>
  (await call<StoreRequest[]>("admin_metrics_store_requests")) ?? [];
export const fetchComparatorHealth = (staleDays = 90) =>
  call<ComparatorHealth>("admin_metrics_comparator", { p_stale_days: staleDays });
export const fetchMetricsSummary = (p: DashboardPeriod) =>
  call<MetricsSummary>("admin_metrics_summary", range(p));

"use client";

import {
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  CircleDollarSign,
  CircleSlash,
  ClipboardCheck,
  FilePlus2,
  MessageSquare,
  PackagePlus,
  Route,
  ShieldCheck,
  Store,
  Truck,
  type LucideIcon,
} from "lucide-react";
import {
  actorLabel,
  describeEvent,
  type OrderEvent,
  type OrderEventKind,
} from "@/lib/admin/order-events";
import { cn } from "@/lib/utils";

export const EVENT_ICONS: Record<OrderEventKind, LucideIcon> = {
  created: FilePlus2,
  paid: CircleDollarSign,
  stage_changed: ArrowRightLeft,
  completed: CheckCircle2,
  cancelled: Ban,
  items_added: PackagePlus,
  insurance_changed: ShieldCheck,
  store_charge_created: Store,
  store_charge_paid: Store,
  ticket_opened: MessageSquare,
  ticket_resolved: MessageSquare,
  ticket_reopened: MessageSquare,
  items_checked: ClipboardCheck,
  custody: Truck,
  route: Route,
  stop_failed: CircleSlash,
};

export function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Linha do tempo de um pedido, do mais recente ao mais antigo. */
export function OrderTimeline({
  events,
  storeName,
}: {
  events: OrderEvent[];
  storeName: (code: string) => string;
}) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">Nenhum evento registrado ainda.</p>;
  }
  // Pedido anterior à linha do tempo: as mudanças de etapa daquela época não existem.
  const hasBackfill = events.some((e) => e.backfilled);

  return (
    <div>
      <ol className="relative flex flex-col gap-4">
        {events.map((event, index) => {
          const Icon = EVENT_ICONS[event.kind];
          const { title, detail } = describeEvent(event, storeName);
          return (
            <li key={event.id} className="relative flex gap-3">
              {index < events.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute top-8 bottom-[-1rem] left-[15px] w-px bg-slate-200"
                />
              )}
              <span
                className={cn(
                  "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-white",
                  event.kind === "cancelled"
                    ? "border-red-200 text-red-600"
                    : event.actorKind === "admin"
                      ? "border-brand-200 text-brand-700"
                      : "border-slate-200 text-slate-500",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-sm font-medium text-slate-900">{title}</p>
                {detail && <p className="text-sm text-slate-600">{detail}</p>}
                {event.reason && (
                  <p className="mt-1 rounded-md bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700">
                    <span className="font-medium">Motivo:</span> {event.reason}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-slate-400">
                  {actorLabel(event)} · {formatEventTime(event.createdAt)}
                  {event.backfilled && " · reconstruído"}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {hasBackfill && (
        <p className="mt-4 text-xs text-slate-400">
          Pedido anterior à linha do tempo: os eventos &ldquo;reconstruídos&rdquo; vêm das
          datas que já estavam salvas. Mudanças de etapa feitas antes disso não foram
          registradas.
        </p>
      )}
    </div>
  );
}

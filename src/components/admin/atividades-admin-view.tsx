"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PeriodFilter, usePeriodFilter } from "@/components/admin/period-filter";
import { EVENT_ICONS, formatEventTime } from "@/components/admin/pedidos/order-timeline";
import { useCatalog } from "@/lib/catalog/provider";
import { AdminError, fetchEventFeed, type FeedEvent } from "@/lib/admin/api";
import {
  ACTOR_KIND_LABELS,
  EVENT_KIND_LABELS,
  actorLabel,
  describeEvent,
  type OrderEventActorKind,
  type OrderEventKind,
} from "@/lib/admin/order-events";
import { orderCode } from "@/lib/admin/order-moves";

const ALL = "all";
const PAGE = 100;

export function AtividadesAdminView() {
  const { stores } = useCatalog();
  const periodFilter = usePeriodFilter("7d");
  const { period } = periodFilter;
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<OrderEventKind | typeof ALL>(ALL);
  const [actor, setActor] = useState<OrderEventActorKind | typeof ALL>(ALL);
  const [store, setStore] = useState(ALL);
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let cancelled = false;
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => {
      setEvents(null);
      setError(null);
      setShown(PAGE);
      fetchEventFeed({ from: period.from, to: period.to })
        .then((data) => {
          if (!cancelled) setEvents(data);
        })
        .catch((err) => {
          if (!cancelled) {
            setError(
              err instanceof AdminError
                ? err.message
                : "Não foi possível carregar o histórico.",
            );
          }
        });
    });
    return () => {
      cancelled = true;
    };
  }, [period.from, period.to]);

  const storeName = (code: string) => stores.find((s) => s.id === code)?.name ?? code;

  const filtered = useMemo(() => {
    if (!events) return [];
    const term = search.trim().toLowerCase().replace(/^#/, "");
    return events.filter(
      (e) =>
        (kind === ALL || e.kind === kind) &&
        (actor === ALL || e.actorKind === actor) &&
        (store === ALL ||
          e.destinationStoreId === store ||
          e.originStoreIds.includes(store)) &&
        (!term ||
          e.orderId.slice(0, 8).toLowerCase().includes(term) ||
          e.customerName.toLowerCase().includes(term) ||
          e.customerEmail.toLowerCase().includes(term) ||
          (e.actorName ?? "").toLowerCase().includes(term)),
    );
  }, [events, kind, actor, store, search]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Atividades dos pedidos</h1>
        <p className="text-sm text-slate-500">
          Tudo o que aconteceu com os pedidos: quem fez, quando e por quê.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-2 lg:flex-1 xl:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="feed-search" className="text-xs text-slate-500">
              Buscar
            </Label>
            <Input
              id="feed-search"
              placeholder="Pedido, cliente ou admin"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <FilterSelect
            id="feed-kind"
            label="Tipo"
            value={kind}
            onChange={(v) => setKind(v as OrderEventKind | typeof ALL)}
            options={Object.entries(EVENT_KIND_LABELS).map(([id, label]) => ({
              id,
              label,
            }))}
          />
          <FilterSelect
            id="feed-actor"
            label="Quem fez"
            value={actor}
            onChange={(v) => setActor(v as OrderEventActorKind | typeof ALL)}
            options={Object.entries(ACTOR_KIND_LABELS).map(([id, label]) => ({
              id,
              label,
            }))}
          />
          <FilterSelect
            id="feed-store"
            label="Loja"
            value={store}
            onChange={setStore}
            options={[...stores]
              .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
              .map((s) => ({ id: s.id, label: s.name }))}
          />
        </div>
        <PeriodFilter state={periodFilter} idPrefix="feed" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!events && !error && <p className="text-sm text-slate-500">Carregando...</p>}

      {events && (
        <>
          <p className="-mt-2 text-xs text-slate-500">
            {filtered.length.toLocaleString("pt-BR")} evento(s)
          </p>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">
                Nenhum evento encontrado.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filtered.slice(0, shown).map((event) => {
                  const Icon = EVENT_ICONS[event.kind];
                  const { title, detail } = describeEvent(event, storeName);
                  return (
                    <li key={event.id}>
                      <Link
                        href={`/admin/pedidos/${event.orderId}`}
                        className="flex gap-3 px-4 py-3 hover:bg-slate-50"
                      >
                        <Icon
                          className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-slate-900">
                            <span className="font-semibold">
                              #{orderCode(event.orderId)}
                            </span>{" "}
                            <span className="text-slate-500">
                              {event.customerName || event.customerEmail}
                            </span>
                            {" · "}
                            <span className="font-medium">{title}</span>
                          </p>
                          {detail && <p className="text-sm text-slate-600">{detail}</p>}
                          {event.reason && (
                            <p className="text-sm text-slate-700">
                              <span className="font-medium">Motivo:</span> {event.reason}
                            </p>
                          )}
                          <p className="text-xs text-slate-400">
                            {actorLabel(event)} · {formatEventTime(event.createdAt)}
                            {event.backfilled && " · reconstruído"}
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {filtered.length > shown && (
            <Button
              type="button"
              variant="outline"
              className="self-center"
              onClick={() => setShown((n) => n + PAGE)}
            >
              Carregar mais
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs text-slate-500">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-8 w-full bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

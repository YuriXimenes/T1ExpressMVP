"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCatalog } from "@/lib/catalog/provider";
import { useCan } from "@/lib/admin/access-provider";
import { AdminError, fetchAdminOrders, type AdminOrderSummary } from "@/lib/admin/api";
import { dayKey } from "@/lib/admin/dashboard";
import { orderCode } from "@/lib/admin/order-moves";
import { addDays, isOperatingDay } from "@/lib/operating-calendar";
import { suggestOrder } from "@/lib/routes/geo";
import { groupBacklog, type BacklogOrder } from "@/lib/routes/planning";
import {
  createRoute,
  fetchBacklog,
  fetchClosures,
  fetchOpsSettings,
  setStoreClosure,
  type RouteKind,
  type StoreClosure,
} from "@/lib/routes/api";
import { cn } from "@/lib/utils";

/** Próximo dia de operação (seg/qua/sex, sem feriado), a partir de hoje. */
export function nextOperatingDay(from: string = dayKey(new Date())): string {
  let day = from;
  for (let i = 0; i < 14 && !isOperatingDay(day); i++) day = addDays(day, 1);
  return day;
}

const shortDate = (iso?: string) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      })
    : "—";

export function PlanejamentoView() {
  const { stores, coletaPartners } = useCatalog();
  const canCreate = useCan("coletas", "create");
  const canEdit = useCan("coletas", "edit");
  const [kind, setKind] = useState<RouteKind>("coleta");
  const [view, setView] = useState<"loja" | "pedido">("loja");
  const [day, setDay] = useState(nextOperatingDay);
  const [rows, setRows] = useState<BacklogOrder[] | null>(null);
  const [closures, setClosures] = useState<StoreClosure[]>([]);
  const [base, setBase] = useState<{ lat: number; lng: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(nextKind: RouteKind = kind) {
    setError(null);
    try {
      const [backlog, orders, closed, settings] = await Promise.all([
        fetchBacklog(nextKind),
        fetchAdminOrders(),
        fetchClosures(dayKey(new Date())),
        fetchOpsSettings(),
      ]);
      const byId = new Map(orders.map((o) => [o.id, o]));
      setRows(
        backlog.map((b) => {
          const order = byId.get(b.orderId) as AdminOrderSummary | undefined;
          return {
            orderId: b.orderId,
            storeCode: b.storeCode,
            openRouteId: b.openRouteId,
            checked: b.checked,
            customerName: order?.customerName || order?.customerEmail || "",
            estimatedPickupDate: order?.estimatedPickupDate,
            createdAt: order?.createdAt ?? "",
          };
        }),
      );
      setClosures(closed);
      setBase(
        settings.baseLat !== undefined && settings.baseLng !== undefined
          ? { lat: settings.baseLat, lng: settings.baseLng }
          : null,
      );
    } catch (err) {
      setError(
        err instanceof AdminError
          ? err.message
          : "Não foi possível carregar o planejamento.",
      );
    }
  }

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchKind(next: RouteKind) {
    setKind(next);
    setSelected(new Set());
    setRows(null);
    setMessage(null);
    void load(next);
  }

  const storeName = (code: string) => stores.find((s) => s.id === code)?.name ?? code;
  const pointOf = (code: string) =>
    coletaPartners.find((p) => p.id === code)?.coordinates;
  const closedOn = (code: string) =>
    closures.find((c) => c.storeCode === code && c.day === day);

  // Lojas próximas lado a lado (vizinho mais próximo a partir da base), mas as
  // que têm pendência vêm antes das que já estão todas em rota.
  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = groupBacklog(rows ?? []).filter(
      (g) => !term || storeName(g.storeCode).toLowerCase().includes(term),
    );
    const pending = suggestOrder(
      all.filter((g) => g.pending > 0),
      (g) => pointOf(g.storeCode),
      base,
    );
    return [...pending, ...all.filter((g) => g.pending === 0)];
    // storeName/pointOf dependem só do catálogo, que não muda na tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, base]);

  // Visão por pedido: uma linha por pedido (com as lojas dele). Pendentes
  // primeiro, e entre eles a previsão de retirada mais próxima.
  const orderRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const byOrder = new Map<
      string,
      {
        orderId: string;
        customerName: string;
        estimatedPickupDate?: string;
        checked?: boolean;
        createdAt: string;
        items: { storeCode: string; openRouteId?: string }[];
      }
    >();
    for (const row of rows ?? []) {
      const entry = byOrder.get(row.orderId) ?? {
        orderId: row.orderId,
        customerName: row.customerName,
        estimatedPickupDate: row.estimatedPickupDate,
        checked: row.checked,
        createdAt: row.createdAt,
        items: [],
      };
      entry.items.push({ storeCode: row.storeCode, openRouteId: row.openRouteId });
      byOrder.set(row.orderId, entry);
    }
    return [...byOrder.values()]
      .filter(
        (o) =>
          !term ||
          orderCode(o.orderId).toLowerCase().includes(term) ||
          o.customerName.toLowerCase().includes(term) ||
          o.items.some((i) => storeName(i.storeCode).toLowerCase().includes(term)),
      )
      .sort((a, b) => {
        const aPending = a.items.some((i) => !i.openRouteId) ? 0 : 1;
        const bPending = b.items.some((i) => !i.openRouteId) ? 0 : 1;
        if (aPending !== bPending) return aPending - bPending;
        const aDate = a.estimatedPickupDate ?? "9999";
        const bDate = b.estimatedPickupDate ?? "9999";
        return aDate === bDate
          ? a.createdAt.localeCompare(b.createdAt)
          : aDate.localeCompare(bDate);
      });
    // storeName depende só do catálogo, que não muda na tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search]);

  const key = (storeCode: string, orderId: string) => `${storeCode}|${orderId}`;

  function toggleOrder(orderId: string, storeCodes: string[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const all = storeCodes.every((code) => next.has(key(code, orderId)));
      for (const code of storeCodes) {
        if (all) next.delete(key(code, orderId));
        else next.add(key(code, orderId));
      }
      return next;
    });
  }

  function toggle(storeCode: string, orderId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = key(storeCode, orderId);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleStore(storeCode: string, orderIds: string[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const all = orderIds.every((id) => next.has(key(storeCode, id)));
      for (const id of orderIds) {
        if (all) next.delete(key(storeCode, id));
        else next.add(key(storeCode, id));
      }
      return next;
    });
  }

  async function create() {
    if (busy || selected.size === 0) return;
    const byStore = new Map<string, string[]>();
    for (const k of selected) {
      const [storeCode, orderId] = k.split("|");
      byStore.set(storeCode, [...(byStore.get(storeCode) ?? []), orderId]);
    }
    // Ordem das paradas: vizinho mais próximo a partir da base.
    const stops = suggestOrder(
      [...byStore.entries()].map(([storeCode, orderIds]) => ({ storeCode, orderIds })),
      (s) => pointOf(s.storeCode),
      base,
    );
    setBusy(true);
    setError(null);
    try {
      await createRoute(kind, day, stops);
      setSelected(new Set());
      setMessage(
        `Rota de ${kind} criada para ${shortDate(day)} com ${stops.length} parada(s). Monte a viagem em Rotas e viagens.`,
      );
      await load();
    } catch (err) {
      setError(
        err instanceof AdminError ? err.message : "Não foi possível criar a rota.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleClosure(storeCode: string) {
    const closed = !!closedOn(storeCode);
    try {
      await setStoreClosure(storeCode, day, !closed, closed ? undefined : "Loja fechada");
      setClosures(await fetchClosures(dayKey(new Date())));
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Não foi possível salvar.");
    }
  }

  const selectedStores = new Set([...selected].map((k) => k.split("|")[0])).size;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Planejamento</h1>
        <p className="text-sm text-slate-500">
          Coletas: o que falta buscar em cada loja. Entregas: o que já foi recebido na
          central e vai para o ponto de retirada. Marque os pedidos e crie a rota; depois
          junte as rotas numa viagem em Rotas e viagens.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end sm:justify-between">
        <div
          className="inline-flex self-start rounded-lg border border-slate-200 p-0.5"
          role="group"
          aria-label="Tipo de rota"
        >
          {(["coleta", "entrega"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => switchKind(k)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                kind === k
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50",
              )}
            >
              {k === "coleta" ? "Coletas" : "Entregas"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div
            className="inline-flex rounded-lg border border-slate-200 p-0.5"
            role="group"
            aria-label="Visualização"
          >
            {(["loja", "pedido"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  view === v
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-50",
                )}
              >
                {v === "loja"
                  ? kind === "coleta"
                    ? "Por loja"
                    : "Por ponto"
                  : "Por pedido"}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="plan-search" className="text-xs text-slate-500">
              {view === "pedido"
                ? "Pedido, cliente ou loja"
                : kind === "coleta"
                  ? "Loja"
                  : "Ponto de retirada"}
            </Label>
            <Input
              id="plan-search"
              placeholder="Buscar"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="plan-day" className="text-xs text-slate-500">
              Dia da rota
            </Label>
            <Input
              id="plan-day"
              type="date"
              value={day}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              className="h-8 w-40 text-sm"
            />
          </div>
        </div>
      </div>
      {!isOperatingDay(day) && (
        <p className="-mt-2 flex items-center gap-1.5 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          {shortDate(day)} não é dia de operação (seg, qua e sex, sem feriado).
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {message}{" "}
          <Link href="/admin/pedidos/rotas" className="font-medium underline">
            Ir para Rotas e viagens
          </Link>
        </p>
      )}
      {!rows && !error && <p className="text-sm text-slate-500">Carregando...</p>}

      {rows && groups.length === 0 && (
        <p className="text-sm text-slate-500">
          {kind === "coleta"
            ? "Nada para coletar: todos os pedidos pagos já foram coletados."
            : "Nada para entregar: nenhum pedido recebido na central."}
        </p>
      )}

      {view === "pedido" && orderRows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {orderRows.map((order) => {
            const freeCodes = order.items
              .filter((i) => !i.openRouteId)
              .map((i) => i.storeCode);
            const checkedCount = freeCodes.filter((c) =>
              selected.has(key(c, order.orderId)),
            ).length;
            const allInRoute = freeCodes.length === 0;
            const multi = order.items.length > 1;
            return (
              <li
                key={order.orderId}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border bg-white px-4 py-3 text-sm",
                  allInRoute
                    ? "border-slate-100 bg-slate-50 text-slate-400"
                    : "border-slate-200",
                )}
              >
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    className="accent-brand-600 h-4 w-4"
                    disabled={allInRoute || !canCreate}
                    checked={!allInRoute && checkedCount === freeCodes.length}
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          checkedCount > 0 && checkedCount < freeCodes.length;
                    }}
                    onChange={() => toggleOrder(order.orderId, freeCodes)}
                  />
                  <span className="font-medium text-slate-900">
                    #{orderCode(order.orderId)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{order.customerName}</span>
                  {kind === "entrega" && order.checked === false && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Conferência pendente
                    </span>
                  )}
                  {allInRoute ? (
                    <Badge variant="secondary">Em rota</Badge>
                  ) : (
                    <span className="text-xs text-slate-500">
                      Previsão {shortDate(order.estimatedPickupDate)}
                    </span>
                  )}
                </label>
                <ul className="flex flex-col gap-1 pl-6.5">
                  {order.items.map((item) => {
                    const inRoute = !!item.openRouteId;
                    const closed = closedOn(item.storeCode);
                    return (
                      <li
                        key={item.storeCode}
                        className="flex flex-wrap items-center gap-2 text-xs"
                      >
                        {multi && (
                          <input
                            type="checkbox"
                            aria-label={`Marcar ${storeName(item.storeCode)}`}
                            className="accent-brand-600 h-3.5 w-3.5"
                            disabled={inRoute || !canCreate}
                            checked={selected.has(key(item.storeCode, order.orderId))}
                            onChange={() => toggle(item.storeCode, order.orderId)}
                          />
                        )}
                        <span className="text-slate-600">
                          {storeName(item.storeCode)}
                        </span>
                        {!pointOf(item.storeCode) && (
                          <span className="inline-flex items-center gap-0.5 text-amber-700">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            sem coordenadas
                          </span>
                        )}
                        {closed && kind === "coleta" && (
                          <span className="inline-flex items-center gap-0.5 text-amber-700">
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                            fechada em {shortDate(day)}
                          </span>
                        )}
                        {multi && inRoute && <Badge variant="secondary">Em rota</Badge>}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}

      <div className={cn("grid gap-3 lg:grid-cols-2", view !== "loja" && "hidden")}>
        {groups.map((group) => {
          const closed = closedOn(group.storeCode);
          const free = group.orders.filter((o) => !o.openRouteId).map((o) => o.orderId);
          const hasPoint = !!pointOf(group.storeCode);
          return (
            <Card
              key={group.storeCode}
              className={cn("gap-3 p-4", closed && "border-amber-300")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {storeName(group.storeCode)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {group.pending} pendente(s)
                    {group.urgentDate && ` · mais urgente ${shortDate(group.urgentDate)}`}
                    {!hasPoint && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-amber-700">
                        <MapPin className="h-3 w-3" aria-hidden="true" />
                        sem coordenadas (fica fora do cálculo de km)
                      </span>
                    )}
                  </p>
                </div>
                {kind === "coleta" && canEdit && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void toggleClosure(group.storeCode)}
                  >
                    {closed ? "Reabrir no dia" : "Loja fechada no dia"}
                  </Button>
                )}
              </div>
              {closed && (
                <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  Fechada em {shortDate(day)}
                  {closed.note && ` · ${closed.note}`}
                </p>
              )}
              {canCreate && free.length > 1 && (
                <button
                  type="button"
                  onClick={() => toggleStore(group.storeCode, free)}
                  className="text-brand-700 self-start text-xs font-medium hover:underline"
                >
                  {free.every((id) => selected.has(key(group.storeCode, id)))
                    ? "Desmarcar todos"
                    : "Marcar todos os pendentes"}
                </button>
              )}
              <ul className="flex flex-col gap-1.5">
                {group.orders.map((order) => {
                  const inRoute = !!order.openRouteId;
                  return (
                    <li key={order.orderId}>
                      <label
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm",
                          inRoute
                            ? "border-slate-100 bg-slate-50 text-slate-400"
                            : "border-slate-200",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="accent-brand-600 h-4 w-4"
                          disabled={inRoute || !canCreate}
                          checked={selected.has(key(group.storeCode, order.orderId))}
                          onChange={() => toggle(group.storeCode, order.orderId)}
                        />
                        <span className="font-medium text-slate-900">
                          #{orderCode(order.orderId)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {order.customerName}
                        </span>
                        {kind === "entrega" && order.checked === false && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Conferência pendente
                          </span>
                        )}
                        {inRoute ? (
                          <Badge variant="secondary">Em rota</Badge>
                        ) : (
                          <span className="text-xs text-slate-500">
                            Previsão {shortDate(order.estimatedPickupDate)}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>

      {canCreate && selected.size > 0 && (
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between md:-mx-8 md:px-8">
          <p className="text-sm text-slate-700">
            {selected.size} pedido(s) em {selectedStores}{" "}
            {kind === "coleta" ? "loja(s)" : "ponto(s)"} · {shortDate(day)}
          </p>
          <Button type="button" disabled={busy} onClick={() => void create()}>
            {busy ? "Criando..." : `Criar rota de ${kind}`}
          </Button>
        </div>
      )}
    </div>
  );
}

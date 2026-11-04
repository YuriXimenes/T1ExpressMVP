"use client";

import { useEffect, useMemo, useState } from "react";
import { KanbanSquare, Table2 } from "lucide-react";
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
import { OrdersKanban } from "@/components/admin/pedidos/kanban";
import { OrdersTable } from "@/components/admin/pedidos/table";
import { useOrderMover } from "@/components/admin/pedidos/move-order";
import { useCatalog } from "@/lib/catalog/provider";
import { AdminError, fetchAdminOrders, type AdminOrderSummary } from "@/lib/admin/api";
import { inPeriod } from "@/lib/admin/dashboard";
import { cn } from "@/lib/utils";

type View = "kanban" | "tabela";
const VIEW_KEY = "t1-admin-pedidos-view";
export const ALL = "all";

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "tabela" ? "tabela" : "kanban";
  } catch {
    return "kanban";
  }
}

export function PedidosAdminView() {
  const { stores } = useCatalog();
  const [orders, setOrders] = useState<AdminOrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("kanban");
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState(ALL);
  const [destination, setDestination] = useState(ALL);
  const periodFilter = usePeriodFilter("30d");
  const { period } = periodFilter;

  async function load() {
    try {
      setOrders(await fetchAdminOrders());
    } catch (err) {
      setError(
        err instanceof AdminError ? err.message : "Não foi possível carregar os pedidos.",
      );
    }
  }

  const mover = useOrderMover(load);

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => {
      setView(readView());
      void load();
    });
  }, []);

  function chooseView(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Sem armazenamento: só não lembra a escolha.
    }
  }

  const storeName = (code: string) => stores.find((s) => s.id === code)?.name ?? code;

  const filtered = useMemo(() => {
    if (!orders) return [];
    const term = search.trim().toLowerCase();
    return orders.filter((o) => {
      // No Kanban, quem está em andamento aparece sempre; o período vale para os finalizados.
      const finished = o.status === "completed" || o.status === "cancelled";
      const periodDate = finished ? (o.completedAt ?? o.createdAt) : o.createdAt;
      if ((view === "tabela" || finished) && !inPeriod(periodDate, period)) return false;
      if (origin !== ALL && !o.originStoreIds.includes(origin)) return false;
      if (destination !== ALL && o.destinationStoreId !== destination) return false;
      return (
        !term ||
        o.id.slice(0, 8).toLowerCase().includes(term.replace(/^#/, "")) ||
        o.customerEmail.toLowerCase().includes(term) ||
        o.customerName.toLowerCase().includes(term)
      );
    });
    // period é recriado a cada render; as pontas bastam como dependência.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, search, origin, destination, view, period.from, period.to]);

  // Pontos de retirada de hoje e os que já receberam pedidos (podem ter deixado de ser ponto).
  const pickupStores = stores.filter(
    (s) => s.isPickupPoint || orders?.some((o) => o.destinationStoreId === s.id),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Pedidos</h1>
          <p className="text-sm text-slate-500">
            Arraste o cartão para mudar a etapa, ou use &ldquo;Mover para…&rdquo;.
          </p>
        </div>
        <div
          className="inline-flex self-start rounded-lg border border-slate-200 bg-white p-0.5"
          role="group"
          aria-label="Visualização"
        >
          {(
            [
              { id: "kanban", label: "Kanban", icon: KanbanSquare },
              { id: "tabela", label: "Tabela", icon: Table2 },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => chooseView(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
                view === id
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-3 lg:flex-1">
          <div className="flex flex-col gap-1">
            <Label htmlFor="orders-search" className="text-xs text-slate-500">
              Buscar
            </Label>
            <Input
              id="orders-search"
              placeholder="Código, nome ou e-mail"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <StoreSelect
            id="orders-origin"
            label="Loja de coleta"
            value={origin}
            onChange={setOrigin}
            stores={stores}
          />
          <StoreSelect
            id="orders-destination"
            label="Loja de retirada"
            value={destination}
            onChange={setDestination}
            stores={pickupStores}
          />
        </div>
        <PeriodFilter state={periodFilter} idPrefix="orders" />
      </div>
      <p className="-mt-3 text-xs text-slate-400">
        {view === "kanban"
          ? "Pedidos em andamento aparecem sempre; concluídos e cancelados, só os do período."
          : "Pedidos criados no período (concluídos pela data de conclusão)."}
      </p>

      {mover.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {mover.error}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!orders && !error && <p className="text-sm text-slate-500">Carregando...</p>}

      {orders &&
        (view === "kanban" ? (
          <OrdersKanban orders={filtered} mover={mover} storeName={storeName} />
        ) : (
          <OrdersTable orders={filtered} mover={mover} storeName={storeName} />
        ))}
      {mover.dialog}
    </div>
  );
}

export function StoreSelect({
  id,
  label,
  value,
  onChange,
  stores,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  stores: { id: string; name: string }[];
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
          <SelectItem value={ALL}>Todas</SelectItem>
          {[...stores]
            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
            .map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}

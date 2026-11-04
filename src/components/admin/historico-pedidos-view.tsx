"use client";

import { useEffect, useMemo, useState } from "react";
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
import { ALL, StoreSelect } from "@/components/admin/pedidos-admin-view";
import { OrdersTable } from "@/components/admin/pedidos/table";
import { useOrderMover } from "@/components/admin/pedidos/move-order";
import { formatBRL } from "@/components/shared/price";
import { useCatalog } from "@/lib/catalog/provider";
import { AdminError, fetchAdminOrders, type AdminOrderSummary } from "@/lib/admin/api";
import { inPeriod } from "@/lib/admin/dashboard";

type Outcome = "completed" | "cancelled" | typeof ALL;

/**
 * Pedidos encerrados (concluídos e cancelados), para abrir e rever: itens,
 * conferência, fotos, custódia e a linha do tempo ficam no detalhe de cada um.
 * O que mudou em todos os pedidos, evento a evento, fica em Atividades.
 */
export function HistoricoPedidosView() {
  const { stores } = useCatalog();
  const [orders, setOrders] = useState<AdminOrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState<Outcome>(ALL);
  const [origin, setOrigin] = useState(ALL);
  const [destination, setDestination] = useState(ALL);
  const periodFilter = usePeriodFilter("30d");
  const { period } = periodFilter;
  // Pedido encerrado não muda mais de etapa: o menu "Mover para…" some sozinho.
  const mover = useOrderMover(() => {});

  useEffect(() => {
    let cancelled = false;
    fetchAdminOrders()
      .then((data) => {
        if (!cancelled) {
          setOrders(
            data.filter((o) => o.status === "completed" || o.status === "cancelled"),
          );
        }
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
    return () => {
      cancelled = true;
    };
  }, []);

  const storeName = (code: string) => stores.find((s) => s.id === code)?.name ?? code;

  const filtered = useMemo(() => {
    if (!orders) return [];
    const term = search.trim().toLowerCase().replace(/^#/, "");
    return orders.filter(
      (o) =>
        // Concluído conta pela data de conclusão; cancelado, pela data do pedido.
        inPeriod(o.completedAt ?? o.createdAt, period) &&
        (outcome === ALL || o.status === outcome) &&
        (origin === ALL || o.originStoreIds.includes(origin)) &&
        (destination === ALL || o.destinationStoreId === destination) &&
        (!term ||
          o.id.slice(0, 8).toLowerCase().includes(term) ||
          o.customerName.toLowerCase().includes(term) ||
          o.customerEmail.toLowerCase().includes(term)),
    );
    // period é recriado a cada render; as pontas bastam como dependência.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, search, outcome, origin, destination, period.from, period.to]);

  const completed = filtered.filter((o) => o.status === "completed");
  const cancelledCount = filtered.length - completed.length;
  const destinations = stores.filter((s) =>
    orders?.some((o) => o.destinationStoreId === s.id),
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Histórico de pedidos</h1>
        <p className="text-sm text-slate-500">
          Pedidos encerrados, concluídos ou cancelados. Abra um pedido para rever itens,
          conferência, fotos, custódia e tudo o que aconteceu com ele.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-2 lg:flex-1 xl:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="hist-search" className="text-xs text-slate-500">
              Buscar
            </Label>
            <Input
              id="hist-search"
              placeholder="Código, nome ou e-mail"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="hist-outcome" className="text-xs text-slate-500">
              Situação
            </Label>
            <Select value={outcome} onValueChange={(v) => setOutcome(v as Outcome)}>
              <SelectTrigger id="hist-outcome" className="h-8 w-full bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Concluídos e cancelados</SelectItem>
                <SelectItem value="completed">Concluídos</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <StoreSelect
            id="hist-origin"
            label="Loja de coleta"
            value={origin}
            onChange={setOrigin}
            stores={stores}
          />
          <StoreSelect
            id="hist-destination"
            label="Loja de retirada"
            value={destination}
            onChange={setDestination}
            stores={destinations}
          />
        </div>
        <PeriodFilter state={periodFilter} idPrefix="hist" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!orders && !error && <p className="text-sm text-slate-500">Carregando...</p>}

      {orders && (
        <>
          <p className="-mt-2 text-sm text-slate-600">
            {completed.length} concluído(s) · {cancelledCount} cancelado(s) · recebido nos
            concluídos: {formatBRL(completed.reduce((sum, o) => sum + o.totalPaidBRL, 0))}
          </p>
          <OrdersTable orders={filtered} mover={mover} storeName={storeName} />
          <p className="-mt-2 text-xs text-slate-400">
            Concluídos entram pela data de conclusão; cancelados, pela data do pedido.
          </p>
        </>
      )}
    </div>
  );
}

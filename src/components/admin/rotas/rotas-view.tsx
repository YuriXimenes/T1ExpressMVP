"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatBRL } from "@/components/shared/price";
import { TripFormDialog, brasiliaTime } from "@/components/admin/rotas/trip-form-dialog";
import { nextOperatingDay } from "@/components/admin/rotas/planejamento-view";
import { useCan } from "@/lib/admin/access-provider";
import { AdminError } from "@/lib/admin/api";
import { dayKey } from "@/lib/admin/dashboard";
import { addDays } from "@/lib/operating-calendar";
import { ROUTE_KIND_LABELS, TRIP_STATUS_LABELS } from "@/lib/routes/planning";
import {
  cancelRoute,
  fetchDrivers,
  fetchRoutes,
  fetchTrips,
  fetchVehicles,
  type Driver,
  type RouteSummary,
  type Trip,
  type Vehicle,
} from "@/lib/routes/api";

export const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });

export const money = (v?: number) => (v === undefined || v === null ? "—" : formatBRL(v));

export function tripStatusVariant(
  status: string,
): "default" | "secondary" | "destructive" {
  if (status === "cancelada") return "destructive";
  if (status === "concluida") return "secondary";
  return "default";
}

export function RotasView() {
  const router = useRouter();
  const canCreate = useCan("coletas", "create");
  const canDelete = useCan("coletas", "delete");
  const today = dayKey(new Date());
  const [from, setFrom] = useState(addDays(today, -3));
  const [to, setTo] = useState(addDays(today, 14));
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [freeRoutes, setFreeRoutes] = useState<RouteSummary[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const [t, r, d, v] = await Promise.all([
        fetchTrips(from, to),
        fetchRoutes(from, to),
        fetchDrivers(),
        fetchVehicles(),
      ]);
      const names = new Map(d.map((x) => [x.id, x.name]));
      setTrips(
        t.map((trip) => ({ ...trip, driverName: names.get(trip.driverId) ?? "" })),
      );
      setFreeRoutes(r.filter((route) => !route.tripId && route.status === "aguardando"));
      setDrivers(d);
      setVehicles(v);
      setError(null);
    } catch (err) {
      setError(
        err instanceof AdminError ? err.message : "Não foi possível carregar as rotas.",
      );
    }
  }

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  async function removeRoute(id: string) {
    try {
      await cancelRoute(id);
      await load();
    } catch (err) {
      setError(
        err instanceof AdminError ? err.message : "Não foi possível cancelar a rota.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Rotas e viagens</h1>
          <p className="text-sm text-slate-500">
            A viagem junta as rotas de coleta e de entrega de um entregador no dia. Monte,
            envie para o celular dele e acompanhe parada a parada.
          </p>
        </div>
        {canCreate && (
          <Button type="button" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nova viagem
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="rotas-from" className="text-xs text-slate-500">
            De
          </Label>
          <Input
            id="rotas-from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
            className="h-8 w-40 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rotas-to" className="text-xs text-slate-500">
            Até
          </Label>
          <Input
            id="rotas-to"
            type="date"
            value={to}
            min={from}
            onChange={(e) => e.target.value && setTo(e.target.value)}
            className="h-8 w-40 text-sm"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!trips && !error && <p className="text-sm text-slate-500">Carregando...</p>}

      {freeRoutes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-slate-900">Rotas sem viagem</h2>
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {freeRoutes.map((route) => {
              const orders = new Set(
                route.stops.flatMap((s) => s.orders.map((o) => o.orderId)),
              );
              return (
                <li
                  key={route.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {ROUTE_KIND_LABELS[route.kind]} · {dayLabel(route.day)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {route.stops.length} parada(s) · {orders.size} pedido(s)
                    </p>
                  </div>
                  {canDelete && (
                    <ConfirmDialog
                      trigger={
                        <Button type="button" size="sm" variant="ghost">
                          Cancelar
                        </Button>
                      }
                      title="Cancelar esta rota?"
                      description="Os pedidos voltam para o Planejamento."
                      confirmLabel="Cancelar rota"
                      onConfirm={() => void removeRoute(route.id)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {trips && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-slate-900">Viagens</h2>
          {trips.length === 0 && (
            <p className="text-sm text-slate-500">Nenhuma viagem neste período.</p>
          )}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            {trips.length > 0 && (
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Dia</th>
                    <th className="px-4 py-2 font-medium">Entregador</th>
                    <th className="px-4 py-2 font-medium">Rotas</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 text-right font-medium">Km prev. / real</th>
                    <th className="px-4 py-2 text-right font-medium">
                      Custo prev. / real
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((trip) => {
                    const planned =
                      (trip.plannedFuelCost ?? 0) + (trip.plannedDriverCost ?? 0);
                    const actual =
                      trip.actualDriverCost !== undefined
                        ? (trip.actualFuelCost ?? 0) + trip.actualDriverCost
                        : undefined;
                    return (
                      <tr
                        key={trip.id}
                        className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                        onClick={() => router.push(`/admin/pedidos/rotas/${trip.id}`)}
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {dayLabel(trip.day)}
                          {trip.plannedStartAt && (
                            <span className="ml-1 font-normal text-slate-500">
                              {brasiliaTime(trip.plannedStartAt)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {trip.driverName}
                          {trip.vehicleName && (
                            <span className="block text-xs text-slate-500">
                              {trip.vehicleName}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {trip.routes
                            .map(
                              (r) => `${ROUTE_KIND_LABELS[r.kind]} (${r.stops.length})`,
                            )
                            .join(" + ") || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={tripStatusVariant(trip.status)}>
                            {TRIP_STATUS_LABELS[trip.status] ?? trip.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {trip.plannedKm ?? "—"} / {trip.actualKm ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-900">
                          {money(planned)} / {money(actual)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {creating && (
        <TripFormDialog
          open={creating}
          onOpenChange={setCreating}
          defaultDay={nextOperatingDay()}
          drivers={drivers}
          vehicles={vehicles}
          onSaved={(id) => router.push(`/admin/pedidos/rotas/${id}`)}
        />
      )}
    </div>
  );
}

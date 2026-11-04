"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, MapPin, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PhotoGallery } from "@/components/shared/photo-gallery";
import { TripFormDialog, brasiliaTime } from "@/components/admin/rotas/trip-form-dialog";
import { dayLabel, money, tripStatusVariant } from "@/components/admin/rotas/rotas-view";
import { useCatalog } from "@/lib/catalog/provider";
import { useCan } from "@/lib/admin/access-provider";
import { AdminError } from "@/lib/admin/api";
import { orderCode } from "@/lib/admin/order-moves";
import {
  ROUTE_KIND_LABELS,
  STOP_STATUS_LABELS,
  TRIP_STATUS_LABELS,
  stopReasonLabel,
} from "@/lib/routes/planning";
import {
  cancelTrip,
  fetchDrivers,
  fetchTrip,
  fetchVehicles,
  removeRouteOrder,
  reorderStops,
  sendTrip,
  setTripOdometer,
  type Driver,
  type RouteSummary,
  type Trip,
  type Vehicle,
} from "@/lib/routes/api";
import { cn } from "@/lib/utils";

const RESULT_LABELS: Record<string, string> = {
  coletado: "coletado",
  nao_coletado: "não coletado",
  entregue: "entregue",
  nao_entregue: "não entregue",
};

const errorText = (err: unknown, fallback: string) =>
  err instanceof AdminError ? err.message : fallback;

export function ViagemView({ tripId }: { tripId: string }) {
  const { stores } = useCatalog();
  const canEdit = useCan("coletas", "edit");
  const canDelete = useCan("coletas", "delete");
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [odometer, setOdometer] = useState<{ start: string; end: string } | null>(null);

  async function load() {
    try {
      const [t, d, v] = await Promise.all([
        fetchTrip(tripId),
        fetchDrivers(),
        fetchVehicles(),
      ]);
      setDrivers(d);
      setVehicles(v);
      setTrip(
        t ? { ...t, driverName: d.find((x) => x.id === t.driverId)?.name ?? "" } : null,
      );
    } catch (err) {
      setError(errorText(err, "Não foi possível carregar a viagem."));
    }
  }

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      setError(errorText(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const storeName = (code: string) => stores.find((s) => s.id === code)?.name ?? code;

  if (trip === undefined) {
    return <p className="text-sm text-slate-500">{error ?? "Carregando..."}</p>;
  }
  if (trip === null) {
    return <p className="text-sm text-slate-600">Viagem não encontrada.</p>;
  }

  const planned = trip.status === "planejada";
  const open = trip.status !== "concluida" && trip.status !== "cancelada";
  const plannedTotal = (trip.plannedFuelCost ?? 0) + (trip.plannedDriverCost ?? 0);
  const actualTotal =
    trip.actualDriverCost !== undefined
      ? (trip.actualFuelCost ?? 0) + trip.actualDriverCost
      : undefined;

  function moveStop(route: RouteSummary, index: number, delta: number) {
    const ids = route.stops.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved);
    void run(() => reorderStops(route.id, ids), "Não foi possível reordenar.");
  }

  return (
    <div className="flex flex-col gap-5">
      <Button type="button" variant="ghost" asChild className="-ml-2 self-start">
        <Link href="/admin/pedidos/rotas">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar para Rotas e viagens
        </Link>
      </Button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">
              Viagem de {dayLabel(trip.day)}
            </h1>
            <Badge variant={tripStatusVariant(trip.status)}>
              {TRIP_STATUS_LABELS[trip.status] ?? trip.status}
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            {trip.driverName}
            {trip.vehicleName && ` · ${trip.vehicleName}`}
            {trip.notes && ` · ${trip.notes}`}
          </p>
          {trip.cancelReason && (
            <p className="mt-1 text-sm text-red-600">Cancelada: {trip.cancelReason}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {planned && canEdit && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                Editar
              </Button>
              <ConfirmDialog
                trigger={
                  <Button type="button" disabled={busy}>
                    Enviar ao entregador
                  </Button>
                }
                title="Enviar a viagem ao entregador?"
                description="Ela aparece no celular dele e não pode mais ser editada."
                confirmLabel="Enviar"
                onConfirm={() =>
                  void run(() => sendTrip(trip.id), "Não foi possível enviar.")
                }
              />
            </>
          )}
          {(trip.status === "em_andamento" || trip.status === "concluida") && canEdit && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                setOdometer({
                  start: trip.odometerStart?.toString() ?? "",
                  end: trip.odometerEnd?.toString() ?? "",
                })
              }
            >
              Ajustar odômetro
            </Button>
          )}
          {open && canDelete && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setCancelling(true)}
            >
              Cancelar viagem
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="gap-1 p-4">
          <p className="text-xs font-medium text-slate-500">Horário</p>
          <p className="text-sm text-slate-900">
            Previsto {brasiliaTime(trip.plannedStartAt) || "—"} →{" "}
            {brasiliaTime(trip.plannedEndAt) || "—"}
          </p>
          <p className="text-sm text-slate-600">
            Real {brasiliaTime(trip.startedAt) || "—"} →{" "}
            {brasiliaTime(trip.finishedAt) || "—"}
          </p>
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-xs font-medium text-slate-500">Km</p>
          <p className="text-sm text-slate-900">Previsto {trip.plannedKm ?? "—"} km</p>
          <p className="text-sm text-slate-600">
            Real {trip.actualKm ?? "—"} km
            {trip.actualKm !== undefined &&
              ` (${trip.kmSource === "odometro" ? "odômetro" : trip.kmSource === "gps" ? "GPS" : "estimado"})`}
          </p>
          {trip.odometerStart !== undefined && (
            <p className="text-xs text-slate-400">
              Odômetro {trip.odometerStart} → {trip.odometerEnd ?? "…"}
            </p>
          )}
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-xs font-medium text-slate-500">Combustível</p>
          <p className="text-sm text-slate-900">
            Previsto {money(trip.plannedFuelCost)} · Real {money(trip.actualFuelCost)}
          </p>
          <p className="text-xs text-slate-400">
            {trip.fuelPrice
              ? `Litro ${money(trip.fuelPrice)}`
              : "Sem preço do litro cadastrado"}
            {trip.kmPerLiter ? ` · ${trip.kmPerLiter} km/l` : " · sem veículo"}
          </p>
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-xs font-medium text-slate-500">Entregador e total</p>
          <p className="text-sm text-slate-900">
            Entregador {money(trip.plannedDriverCost)} · {money(trip.actualDriverCost)}
          </p>
          <p className="text-sm font-semibold text-slate-900">
            Total {money(plannedTotal)} · {money(actualTotal)}
          </p>
          <p className="text-xs text-slate-400">
            previsto · real (regras da Equipe, sem o fixo mensal)
          </p>
        </Card>
      </div>

      {trip.routes.map((route) => (
        <Card key={route.id} className="gap-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              {ROUTE_KIND_LABELS[route.kind] === "Coleta" ? "Coletas" : "Entregas"}
            </h2>
            <span className="text-xs text-slate-500">{route.stops.length} parada(s)</span>
          </div>
          <ol className="flex flex-col gap-2">
            {route.stops.map((stop, index) => {
              const editable = planned && canEdit && route.status === "aguardando";
              return (
                <li
                  key={stop.id}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border p-3",
                    stop.status === "nao_realizada"
                      ? "border-red-200 bg-red-50/50"
                      : stop.status === "parcial"
                        ? "border-amber-200 bg-amber-50/50"
                        : "border-slate-200",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">
                        {index + 1}. {storeName(stop.storeCode)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Previsto {brasiliaTime(stop.plannedAt) || "—"}
                        {stop.doneAt && ` · registrado ${brasiliaTime(stop.doneAt)}`}
                        {stop.contactName &&
                          ` · ${route.kind === "coleta" ? "entregou" : "recebeu"}: ${stop.contactName}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge
                        variant={
                          stop.status === "nao_realizada" ? "destructive" : "secondary"
                        }
                      >
                        {STOP_STATUS_LABELS[stop.status] ?? stop.status}
                      </Badge>
                      {editable && (
                        <>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={busy || index === 0}
                            onClick={() => moveStop(route, index, -1)}
                          >
                            <ArrowUp className="h-4 w-4" aria-hidden="true" />
                            <span className="sr-only">Subir parada</span>
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={busy || index === route.stops.length - 1}
                            onClick={() => moveStop(route, index, 1)}
                          >
                            <ArrowDown className="h-4 w-4" aria-hidden="true" />
                            <span className="sr-only">Descer parada</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <ul className="flex flex-wrap gap-1.5">
                    {stop.orders.map((o) => (
                      <li
                        key={o.orderId}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs",
                          o.result === "coletado" || o.result === "entregue"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : o.result
                              ? "border-red-200 bg-red-50 text-red-700"
                              : "border-slate-200 text-slate-700",
                        )}
                      >
                        <Link
                          href={`/admin/pedidos/${o.orderId}`}
                          className="font-medium hover:underline"
                        >
                          #{orderCode(o.orderId)}
                        </Link>
                        {o.result && <span>· {RESULT_LABELS[o.result]}</span>}
                        {editable && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () => removeRouteOrder(stop.id, o.orderId),
                                "Não foi possível tirar o pedido.",
                              )
                            }
                            className="ml-0.5 text-slate-400 hover:text-slate-700"
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                            <span className="sr-only">Tirar o pedido da rota</span>
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {(stop.reason || stop.note) && (
                    <p className="text-sm text-slate-700">
                      {stop.reason && (
                        <span className="font-medium">
                          {stopReasonLabel(stop.reason)}
                        </span>
                      )}
                      {stop.reason && stop.note && " · "}
                      {stop.note}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <PhotoGallery
                      photos={stop.photos.map((p) => ({
                        id: p.id,
                        url: p.url,
                        path: "",
                        createdAt: "",
                      }))}
                      title={storeName(stop.storeCode)}
                    />
                    {stop.lat !== undefined && stop.lng !== undefined && (
                      <a
                        href={`https://www.google.com/maps?q=${stop.lat},${stop.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-700 inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                        Onde foi registrada
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      ))}

      {editing && (
        <TripFormDialog
          open={editing}
          onOpenChange={setEditing}
          trip={trip}
          defaultDay={trip.day}
          drivers={drivers}
          vehicles={vehicles}
          onSaved={() => {
            setEditing(false);
            void load();
          }}
        />
      )}

      <Dialog open={cancelling} onOpenChange={(v) => !busy && setCancelling(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar a viagem?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Rotas sem nada registrado voltam a ficar livres para outra viagem. O que já
            foi registrado fica no histórico.
          </p>
          <Textarea
            rows={2}
            maxLength={500}
            placeholder="Motivo (obrigatório)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setCancelling(false)}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !reason.trim()}
              onClick={() =>
                void run(
                  () => cancelTrip(trip.id, reason),
                  "Não foi possível cancelar.",
                ).then((ok) => ok && setCancelling(false))
              }
            >
              Cancelar viagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!odometer} onOpenChange={(v) => !busy && !v && setOdometer(null)}>
        {odometer && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajustar odômetro</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="odo-start">Inicial</Label>
                <Input
                  id="odo-start"
                  inputMode="decimal"
                  value={odometer.start}
                  onChange={(e) => setOdometer({ ...odometer, start: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="odo-end">Final</Label>
                <Input
                  id="odo-end"
                  inputMode="decimal"
                  value={odometer.end}
                  onChange={(e) => setOdometer({ ...odometer, end: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              O km real e o custo real são recalculados.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setOdometer(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      setTripOdometer(
                        trip.id,
                        Number(odometer.start.replace(",", ".")),
                        Number(odometer.end.replace(",", ".")),
                      ),
                    "Não foi possível salvar o odômetro.",
                  ).then((ok) => ok && setOdometer(null))
                }
              >
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

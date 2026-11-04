"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminError } from "@/lib/admin/api";
import { ROUTE_KIND_LABELS } from "@/lib/routes/planning";
import {
  fetchRoutes,
  saveTrip,
  type Driver,
  type RouteSummary,
  type Trip,
  type Vehicle,
} from "@/lib/routes/api";

const NONE = "none";

/** Horário "HH:MM" em Brasília a partir de um instante. */
export function brasiliaTime(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/** Criar ou editar uma viagem: dia, entregador, veículo, horário e rotas do dia. */
export function TripFormDialog({
  open,
  onOpenChange,
  trip,
  defaultDay,
  drivers,
  vehicles,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip?: Trip;
  defaultDay: string;
  drivers: Driver[];
  vehicles: Vehicle[];
  onSaved: (tripId: string) => void;
}) {
  const [day, setDay] = useState(trip?.day ?? defaultDay);
  const [driverId, setDriverId] = useState(trip?.driverId ?? "");
  const [vehicleId, setVehicleId] = useState(trip?.vehicleId ?? NONE);
  const [start, setStart] = useState(brasiliaTime(trip?.plannedStartAt) || "08:00");
  const [notes, setNotes] = useState(trip?.notes ?? "");
  const [routeIds, setRouteIds] = useState<Set<string>>(
    new Set(trip?.routes.map((r) => r.id) ?? []),
  );
  const [routes, setRoutes] = useState<RouteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchRoutes(day, day)
      .then((list) => {
        if (cancelled) return;
        // Livres neste dia, mais as que já são desta viagem.
        setRoutes(
          list.filter(
            (r) => r.status === "aguardando" && (!r.tripId || r.tripId === trip?.id),
          ),
        );
      })
      .catch(() => !cancelled && setRoutes([]));
    return () => {
      cancelled = true;
    };
  }, [open, day, trip?.id]);

  async function save() {
    if (busy) return;
    if (!driverId) {
      setError("Escolha o entregador.");
      return;
    }
    if (routeIds.size === 0) {
      setError("Escolha ao menos uma rota.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await saveTrip(trip?.id ?? null, {
        day,
        driverId,
        vehicleId: vehicleId === NONE ? undefined : vehicleId,
        routeIds: [...routeIds],
        plannedStart: start || undefined,
        notes: notes.trim() || undefined,
      });
      onSaved(id);
    } catch (err) {
      setError(
        err instanceof AdminError ? err.message : "Não foi possível salvar a viagem.",
      );
    } finally {
      setBusy(false);
    }
  }

  const activeDrivers = drivers.filter((d) => d.active || d.id === trip?.driverId);
  const chosen = drivers.find((d) => d.id === driverId);

  return (
    <Dialog open={open} onOpenChange={(value) => !busy && onOpenChange(value)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{trip ? "Editar viagem" : "Nova viagem"}</DialogTitle>
          <DialogDescription>
            Junte as rotas de coleta e de entrega do dia numa viagem só para o entregador.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="trip-day">Dia</Label>
              <Input
                id="trip-day"
                type="date"
                value={day}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setDay(e.target.value);
                  setRouteIds(new Set());
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="trip-start">Saída prevista</Label>
              <Input
                id="trip-start"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trip-driver">Entregador</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger id="trip-driver" className="w-full">
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {activeDrivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                    {!d.hasAccount && " (sem conta)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {drivers.length === 0 && (
              <p className="text-xs text-slate-500">
                Cadastre o entregador em Pessoas › Equipe, com o tipo
                &ldquo;Entregador&rdquo;.
              </p>
            )}
            {chosen && !chosen.hasAccount && (
              <p className="text-xs text-amber-700">
                Este entregador não tem conta ligada: ele não vai conseguir abrir a viagem
                no celular. Ligue a conta em Pessoas › Equipe.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trip-vehicle">Veículo</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger id="trip-vehicle" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  Sem veículo (sem custo de combustível)
                </SelectItem>
                {vehicles
                  .filter((v) => v.active || v.id === trip?.vehicleId)
                  .map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                      {v.plate && ` · ${v.plate}`} · {v.kmPerLiter} km/l
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Rotas do dia</legend>
            {!routes && <p className="text-sm text-slate-500">Carregando...</p>}
            {routes && routes.length === 0 && (
              <p className="text-sm text-slate-500">
                Nenhuma rota livre neste dia. Crie as rotas no Planejamento.
              </p>
            )}
            {routes?.map((route) => {
              const orders = new Set(
                route.stops.flatMap((s) => s.orders.map((o) => o.orderId)),
              );
              return (
                <label
                  key={route.id}
                  className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="accent-brand-600 h-4 w-4"
                    checked={routeIds.has(route.id)}
                    onChange={() =>
                      setRouteIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(route.id)) next.delete(route.id);
                        else next.add(route.id);
                        return next;
                      })
                    }
                  />
                  <span className="font-medium">{ROUTE_KIND_LABELS[route.kind]}</span>
                  <span className="text-slate-500">
                    {route.stops.length} parada(s) · {orders.size} pedido(s)
                  </span>
                </label>
              );
            })}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trip-notes">Observação para o entregador</Label>
            <Input
              id="trip-notes"
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? "Salvando..." : "Salvar viagem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

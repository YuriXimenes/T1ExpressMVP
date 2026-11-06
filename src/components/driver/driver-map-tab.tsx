"use client";

import { useEffect, useState } from "react";
import { Crosshair, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TripMap } from "@/components/shared/trip-map";
import { fetchDriverTripTrack, type DriverTrip, type TripTrack } from "@/lib/driver/api";
import { STOP_TONE_COLORS } from "@/lib/driver/rules";
import type { GpsState } from "@/components/driver/use-gps-tracking";

function mapsLink(s: { lat?: number; lng?: number; address: string }) {
  const dest =
    s.lat !== undefined && s.lng !== undefined
      ? `${s.lat},${s.lng}`
      : encodeURIComponent(s.address);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

/** Aba Mapa: paradas da viagem, o caminho feito e a posição atual. */
export function DriverMapTab({ trip, gps }: { trip?: DriverTrip; gps: GpsState }) {
  const [track, setTrack] = useState<TripTrack | null>(null);
  const [recenter, setRecenter] = useState(0);
  const tripId = trip?.id;

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    const load = () =>
      fetchDriverTripTrack(tripId)
        .then((t) => !cancelled && setTrack(t))
        .catch(() => undefined);
    queueMicrotask(() => void load());
    const timer = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tripId]);

  if (!trip) {
    return (
      <Card className="p-6 text-center text-sm text-slate-600">
        Nenhuma viagem em andamento ou a fazer. Quando a T1 enviar uma viagem, as paradas
        aparecem aqui no mapa.
      </Card>
    );
  }

  const stops =
    track?.stops ??
    trip.routes.flatMap((r) =>
      r.stops.map((s) => ({
        id: s.id,
        routeKind: r.kind,
        status: s.status,
        name: s.store.name,
        address: `${s.store.address}, ${s.store.city}`,
        lat: s.store.lat,
        lng: s.store.lng,
      })),
    );
  const me =
    gps.position ??
    (track?.last ? { lat: track.last.lat, lng: track.last.lng } : undefined);
  const missing = stops.filter((s) => s.lat === undefined || s.lng === undefined).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-900">Mapa da viagem</h1>
        <Button
          size="sm"
          variant="outline"
          disabled={!me}
          onClick={() => setRecenter((n) => n + 1)}
        >
          <Crosshair className="h-4 w-4" aria-hidden="true" />
          Centralizar em mim
        </Button>
      </div>
      <TripMap
        stops={stops}
        path={track?.path ?? []}
        me={me}
        recenterKey={recenter}
        height={420}
        stopAction={(s) => (
          <a
            href={mapsLink(s)}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, fontWeight: 600, color: "#2563eb" }}
          >
            Abrir no Google Maps
          </a>
        )}
      />
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {(
          [
            ["pendente", "A fazer"],
            ["feita", "Feita"],
            ["falhou", "Não realizada"],
          ] as const
        ).map(([tone, label]) => (
          <li key={tone} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: STOP_TONE_COLORS[tone] }}
              aria-hidden="true"
            />
            {label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-500" aria-hidden="true" />
          Você
        </li>
      </ul>
      {missing > 0 && (
        <p className="text-xs text-amber-700">
          {missing} parada(s) sem localização cadastrada não aparecem no mapa. Use
          &ldquo;Abrir no Google Maps&rdquo; na lista da viagem.
        </p>
      )}
      <p className="flex items-start gap-1.5 text-xs text-slate-500">
        <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Toque numa parada para ver o endereço e abrir a rota no Google Maps.
      </p>
    </div>
  );
}

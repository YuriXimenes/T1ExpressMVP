"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { TripMap } from "@/components/shared/trip-map";
import type { TripTrack } from "@/lib/driver/api";
import { agoLabel } from "@/lib/driver/rules";
import { fetchTripTrack } from "@/lib/routes/api";
import { cn } from "@/lib/utils";

/** Mapa da viagem no admin: ao vivo (a cada 30 s) na em andamento; o caminho feito na concluída. */
export function TripLiveMap({ tripId, live }: { tripId: string; live: boolean }) {
  const [track, setTrack] = useState<TripTrack | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchTripTrack(tripId)
        .then((t) => {
          if (cancelled) return;
          setTrack(t);
          setNow(Date.now());
        })
        .catch(() => !cancelled && setFailed(true));
    queueMicrotask(() => void load());
    if (!live) return () => void (cancelled = true);
    const timer = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tripId, live]);

  if (failed && !track) return null;

  const stale =
    live && track?.last && now - new Date(track.last.at).getTime() > 5 * 60_000;

  return (
    <Card className="gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">
          {live ? "Ao vivo" : "Caminho feito"}
        </h2>
        {track && (
          <p className={cn("text-xs", stale ? "text-amber-700" : "text-slate-500")}>
            {track.last
              ? `Última posição ${now ? agoLabel(track.last.at, now) : ""}${track.last.source === "gps" ? " (GPS)" : " (parada)"}${stale ? " · o app do entregador pode estar fechado" : ""}`
              : live
                ? "Sem posição ainda: o GPS começa quando o entregador abre o app com a viagem iniciada."
                : "Sem posições registradas nesta viagem."}
          </p>
        )}
      </div>
      {!track ? (
        <div className="flex h-60 items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">
          Carregando o mapa...
        </div>
      ) : (
        <TripMap
          stops={track.stops}
          path={track.path}
          me={
            track.last && live ? { lat: track.last.lat, lng: track.last.lng } : undefined
          }
          height={380}
        />
      )}
    </Card>
  );
}

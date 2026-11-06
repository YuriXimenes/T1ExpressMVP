"use client";

import { useEffect, useRef, useState } from "react";
import { trackPosition } from "@/lib/driver/api";
import { shouldSendPosition } from "@/lib/driver/rules";

export type GpsStatus = "desligado" | "procurando" | "ativo" | "negado" | "indisponivel";

export interface GpsState {
  status: GpsStatus;
  /** Última posição do celular (para o mapa), mesmo sem envio. */
  position?: { lat: number; lng: number; accuracy?: number };
  /** Último envio aceito pelo servidor. */
  lastSentAt?: number;
}

/**
 * GPS contínuo enquanto houver viagem em andamento: lê a posição do celular e envia
 * a cada 30 s ou 100 m. Só funciona com o app aberto na tela (limite do navegador).
 */
export function useGpsTracking(tripId: string | undefined): GpsState {
  const [state, setState] = useState<GpsState>({ status: "desligado" });
  const lastSent = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const sending = useRef(false);

  useEffect(() => {
    if (!tripId) {
      queueMicrotask(() => setState({ status: "desligado" }));
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      queueMicrotask(() => setState({ status: "indisponivel" }));
      return;
    }
    queueMicrotask(() => setState((s) => ({ ...s, status: "procurando" })));
    lastSent.current = null;

    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        const next = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          at: Date.now(),
        };
        setState((s) => ({
          ...s,
          status: "ativo",
          position: { lat: next.lat, lng: next.lng, accuracy: next.accuracy },
        }));
        if (sending.current || !shouldSendPosition(lastSent.current, next)) return;
        sending.current = true;
        trackPosition(tripId, next.lat, next.lng, Math.round(next.accuracy))
          .then((saved) => {
            if (saved) {
              lastSent.current = next;
              setState((s) => ({ ...s, lastSentAt: next.at }));
            }
          })
          .catch(() => undefined)
          .finally(() => {
            sending.current = false;
          });
      },
      (err) =>
        setState((s) => ({
          ...s,
          status: err.code === err.PERMISSION_DENIED ? "negado" : "procurando",
        })),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [tripId]);

  return state;
}

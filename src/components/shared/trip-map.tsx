"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

export interface TripMapStop {
  id: string;
  routeKind: "coleta" | "entrega";
  status: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
}

export interface TripMapProps {
  stops: TripMapStop[];
  /** Caminho percorrido, pontos [lat, lng] em ordem. */
  path: [number, number][];
  /** Posição atual (bolinha azul-clara). */
  me?: { lat: number; lng: number };
  /** Mudar este número recentra o mapa em `me`. */
  recenterKey?: number;
  height?: number;
  /** Conteúdo extra no balão da parada (ex.: abrir no Google Maps). */
  stopAction?: (stop: TripMapStop) => ReactNode;
}

/** Mapa da viagem (Leaflet + OpenStreetMap), carregado só no navegador. */
export const TripMap = dynamic<TripMapProps>(
  () => import("@/components/shared/trip-map-inner"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-60 items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">
        Carregando o mapa...
      </div>
    ),
  },
);

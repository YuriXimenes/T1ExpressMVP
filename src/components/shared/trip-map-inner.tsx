"use client";

import { useEffect, useRef } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { STOP_TONE_COLORS, stopTone } from "@/lib/driver/rules";
import type { TripMapProps } from "@/components/shared/trip-map";

const RIO_CENTER: [number, number] = [-22.9068, -43.3];

function numberIcon(n: number, color: string) {
  return L.divIcon({
    className: "",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:${color};color:#fff;font:600 12px system-ui;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">${n}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/** Enquadra paradas e caminho na primeira carga; depois só recentra quando pedido. */
function Controller({
  points,
  me,
  recenterKey,
}: {
  points: [number, number][];
  me?: [number, number];
  recenterKey: number;
}) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || points.length === 0) return;
    fitted.current = true;
    if (points.length === 1) map.setView(points[0], 14);
    else map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 15 });
  }, [map, points]);
  // Recentra só quando o botão é tocado (não a cada nova posição).
  const handled = useRef(0);
  useEffect(() => {
    if (recenterKey > handled.current && me) {
      handled.current = recenterKey;
      map.flyTo(me, Math.max(map.getZoom(), 15), { duration: 0.6 });
    }
  }, [map, me, recenterKey]);
  return null;
}

export default function TripMapInner({
  stops,
  path,
  me,
  recenterKey = 0,
  height = 360,
  stopAction,
}: TripMapProps) {
  const mapped = stops.filter(
    (s): s is typeof s & { lat: number; lng: number } =>
      s.lat !== undefined && s.lng !== undefined,
  );
  const mePoint: [number, number] | undefined = me ? [me.lat, me.lng] : undefined;
  // O enquadramento só acontece na 1ª carga (Controller), então recalcular aqui é barato.
  const points: [number, number][] = [
    ...mapped.map((s) => [s.lat, s.lng] as [number, number]),
    ...path,
    ...(mePoint ? [mePoint] : []),
  ];

  return (
    <MapContainer
      center={points[0] ?? RIO_CENTER}
      zoom={12}
      scrollWheelZoom
      style={{ height, width: "100%" }}
      className="z-0 rounded-xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
      />
      {path.length > 1 && (
        <Polyline
          positions={path}
          pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.7 }}
        />
      )}
      {mapped.map((s, i) => {
        const tone = stopTone(s.status);
        return (
          <Marker
            key={s.id}
            position={[s.lat, s.lng]}
            icon={numberIcon(i + 1, STOP_TONE_COLORS[tone])}
          >
            <Popup>
              <div style={{ minWidth: 180 }}>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {i + 1}. {s.name}
                </p>
                <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 12 }}>
                  {s.address}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 12 }}>
                  {s.routeKind === "coleta" ? "Coleta" : "Entrega"} ·{" "}
                  {tone === "feita"
                    ? "feita"
                    : tone === "falhou"
                      ? "não realizada"
                      : "pendente"}
                </p>
                {stopAction && <div style={{ marginTop: 6 }}>{stopAction(s)}</div>}
              </div>
            </Popup>
          </Marker>
        );
      })}
      {mePoint && (
        <CircleMarker
          center={mePoint}
          radius={9}
          pathOptions={{ color: "#fff", weight: 3, fillColor: "#0ea5e9", fillOpacity: 1 }}
        />
      )}
      <Controller points={points} me={mePoint} recenterKey={recenterKey} />
    </MapContainer>
  );
}

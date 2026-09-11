"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PickupPartner } from "@/lib/types/pickup-partner";

const RIO_CENTER: [number, number] = [-22.9068, -43.3];

function pinIcon(color: string, size: number) {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FlyToSelected({ partner }: { partner?: PickupPartner }) {
  const map = useMap();

  useEffect(() => {
    if (partner) {
      map.flyTo([partner.coordinates.lat, partner.coordinates.lng], 13, {
        duration: 0.6,
      });
    }
  }, [partner, map]);

  return null;
}

function PartnerMarker({
  partner,
  isSelected,
  onSelect,
}: {
  partner: PickupPartner;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const markerRef = useRef<L.Marker>(null);

  useEffect(() => {
    if (isSelected) {
      markerRef.current?.openPopup();
    }
  }, [isSelected]);

  return (
    <Marker
      ref={markerRef}
      position={[partner.coordinates.lat, partner.coordinates.lng]}
      icon={pinIcon(isSelected ? "#1d4ed8" : "#60a5fa", isSelected ? 26 : 18)}
      eventHandlers={{ click: () => onSelect(partner.id) }}
      alt={`${partner.name} — ${partner.neighborhood}`}
    >
      <Popup closeButton={false} offset={[0, -4]}>
        <div className="min-w-40">
          <p className="font-semibold text-slate-900">{partner.name}</p>
          <p className="mt-0.5 text-sm text-slate-600">
            {partner.neighborhood}, {partner.city}
          </p>
          <p className="mt-1 text-xs text-slate-500">{partner.address}</p>
        </div>
      </Popup>
    </Marker>
  );
}

export function RioLeafletMap({
  partners,
  selectedId,
  onSelect,
}: {
  partners: PickupPartner[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const selected = partners.find((partner) => partner.id === selectedId);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100">
      <MapContainer
        center={RIO_CENTER}
        zoom={10}
        scrollWheelZoom={false}
        className="h-[420px] w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, tiles by Humanitarian OSM Team'
          url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
        />

        {partners.map((partner) => (
          <PartnerMarker
            key={partner.id}
            partner={partner}
            isSelected={partner.id === selectedId}
            onSelect={onSelect}
          />
        ))}

        <FlyToSelected partner={selected} />
      </MapContainer>
    </div>
  );
}

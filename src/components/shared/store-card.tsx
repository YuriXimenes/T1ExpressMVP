import { MapPin, PackageCheck, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { FranchiseTag, PartnerStore } from "@/lib/types/store";

const franchiseStyles: Record<FranchiseTag, { label: string; className: string }> = {
  magic: { label: "Magic", className: "bg-purple-100 text-purple-800" },
  yugioh: { label: "Yu-Gi-Oh!", className: "bg-red-100 text-red-800" },
  pokemon: { label: "Pokémon TCG", className: "bg-amber-100 text-amber-800" },
  onepiece: { label: "One Piece Card Game", className: "bg-sky-100 text-sky-800" },
  digimon: { label: "Digimon Card Game", className: "bg-emerald-100 text-emerald-800" },
  outros: { label: "Outros TCGs", className: "bg-slate-100 text-slate-800" },
};

export function StoreCard({ store }: { store: PartnerStore }) {
  return (
    <Card className="gap-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{store.name}</h3>
          <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            {store.city}, {store.state}
          </p>
        </div>
        {store.rating && (
          <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-slate-700">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
            {store.rating.toFixed(1)}
          </span>
        )}
      </div>

      <p className="text-sm text-slate-600">{store.description}</p>

      <div className="flex flex-wrap items-center gap-2">
        {store.franchises.map((franchise) => (
          <Badge
            key={franchise}
            variant="secondary"
            className={franchiseStyles[franchise].className}
          >
            {franchiseStyles[franchise].label}
          </Badge>
        ))}
        {store.isPickupPoint && (
          <Badge className="bg-brand-600 gap-1 text-white">
            <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Ponto de retirada
          </Badge>
        )}
      </div>
    </Card>
  );
}

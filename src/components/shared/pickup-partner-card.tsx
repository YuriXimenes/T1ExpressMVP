import Image from "next/image";
import { MapPin, PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PickupPartner } from "@/lib/types/pickup-partner";

export function PickupPartnerCard({
  partner,
  isSelected,
  onSelect,
  badgeLabel = "Ponto de retirada",
}: {
  partner: PickupPartner;
  isSelected: boolean;
  onSelect: () => void;
  badgeLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={cn(
        "flex w-full flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors",
        isSelected
          ? "border-brand-600 bg-brand-50 ring-brand-100 ring-2"
          : "border-slate-200 bg-white hover:border-slate-300",
      )}
    >
      <span
        className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg",
          partner.onDark && "bg-slate-900",
        )}
      >
        <Image
          src={partner.logo}
          alt={partner.name}
          width={56}
          height={56}
          className="h-full w-full object-contain p-1.5"
        />
      </span>

      <span className="font-semibold text-slate-900">{partner.name}</span>
      <span className="flex items-center gap-1 text-xs text-slate-500">
        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {partner.neighborhood}, {partner.city}
      </span>
      <Badge className="bg-brand-600 mt-1 gap-1 text-white">
        <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />
        {badgeLabel}
      </Badge>
    </button>
  );
}

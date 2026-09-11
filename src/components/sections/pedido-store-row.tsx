import Image from "next/image";
import { Check, ChevronDown } from "lucide-react";
import { orderGroupTotal } from "@/components/sections/store-order-builder";
import { cn } from "@/lib/utils";
import type { PickupPartner } from "@/lib/types/pickup-partner";
import type { PedidoGroup } from "@/lib/types/order";

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export function PedidoStoreRow({
  partner,
  isSelected,
  onSelect,
  groups,
}: {
  partner: PickupPartner;
  isSelected: boolean;
  onSelect: () => void;
  groups: PedidoGroup[];
}) {
  const itemCount = groups.reduce(
    (sum, group) =>
      sum +
      (group.kind === "acessorios"
        ? group.accessoryItems.length
        : group.cardItems.length),
    0,
  );
  const subtotal = groups.reduce((sum, group) => sum + orderGroupTotal(group), 0);
  const hasItems = subtotal > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-expanded={isSelected}
      className={cn(
        "flex w-full flex-col gap-3 rounded-xl border p-3 text-left transition-colors",
        isSelected
          ? "border-brand-600 bg-brand-50 ring-brand-100 ring-2"
          : "border-slate-200 bg-white hover:border-slate-300",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="relative shrink-0">
          <span
            className={cn(
              "flex h-14 w-14 items-center justify-center overflow-hidden rounded-full",
              partner.onDark && "bg-slate-900",
            )}
          >
            <Image
              src={partner.logo}
              alt={partner.name}
              width={56}
              height={56}
              className="h-full w-full object-contain p-2"
            />
          </span>
          {hasItems && (
            <span className="bg-brand-600 absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full text-white ring-2 ring-white">
              <Check className="h-3 w-3" aria-hidden="true" />
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">{partner.name}</p>
          <p className="truncate text-sm text-slate-500">
            {partner.neighborhood}, {partner.city}
          </p>
        </div>

        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform",
            isSelected && "rotate-180",
          )}
          aria-hidden="true"
        />
      </div>

      {isSelected && (
        <div className="border-brand-100 border-t pt-3 text-sm">
          {hasItems ? (
            <div className="flex items-center justify-between">
              <span className="text-slate-600">
                {itemCount} {itemCount === 1 ? "item" : "itens"} adicionados
              </span>
              <span className="font-semibold text-slate-900">{formatBRL(subtotal)}</span>
            </div>
          ) : (
            <p className="text-slate-500">Nenhum item adicionado ainda.</p>
          )}
        </div>
      )}
    </button>
  );
}

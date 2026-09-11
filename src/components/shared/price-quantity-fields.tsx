"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PriceMode } from "@/lib/types/order";

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export function PriceQuantityFields({
  price,
  quantity,
  priceMode,
  onPriceChange,
  onQuantityChange,
  onPriceModeChange,
}: {
  price: number;
  quantity: number;
  priceMode: PriceMode;
  onPriceChange: (price: number) => void;
  onQuantityChange: (quantity: number) => void;
  onPriceModeChange: (mode: PriceMode) => void;
}) {
  const quantityInvalid = !quantity || quantity < 1;
  const unitPrice = priceMode === "total" && quantity > 0 ? price / quantity : null;

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-slate-500">
            R$
          </span>
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="0,00"
            value={price || ""}
            onChange={(event) => onPriceChange(Number(event.target.value) || 0)}
            className="pl-8"
          />
        </div>
        <Input
          type="number"
          min={1}
          placeholder="Quantidade"
          value={quantity || ""}
          onChange={(event) => {
            const raw = event.target.value;
            onQuantityChange(raw === "" ? 0 : Number(raw));
          }}
          aria-invalid={quantityInvalid}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400">Preço é</span>
          <button
            type="button"
            onClick={() => onPriceModeChange("unit")}
            className={cn(
              "rounded-full border px-2 py-0.5 font-medium",
              priceMode === "unit"
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-slate-200 text-slate-500 hover:border-slate-300",
            )}
          >
            por unidade
          </button>
          <button
            type="button"
            onClick={() => onPriceModeChange("total")}
            className={cn(
              "rounded-full border px-2 py-0.5 font-medium",
              priceMode === "total"
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-slate-200 text-slate-500 hover:border-slate-300",
            )}
          >
            total
          </button>
        </div>
        {quantityInvalid && (
          <span className="text-xs font-medium text-red-600">Informe a quantidade</span>
        )}
      </div>

      {unitPrice !== null && (
        <p className="text-xs text-slate-400">{formatBRL(unitPrice)} cada</p>
      )}
    </div>
  );
}

import Image from "next/image";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FreightStore } from "@/lib/types/freight-store";

export function FreightStoreCard({
  store,
  selected,
  disabledLabel,
  onToggle,
}: {
  store: FreightStore;
  selected: boolean;
  disabledLabel?: string;
  onToggle: () => void;
}) {
  const disabled = disabledLabel !== undefined;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "relative flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors",
        disabled
          ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
          : selected
            ? "border-brand-600 bg-brand-50 ring-brand-100 ring-2"
            : "border-slate-200 bg-white hover:border-slate-300",
      )}
    >
      {selected && !disabled && (
        <span className="bg-brand-600 absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white">
          <Check className="h-3 w-3" aria-hidden="true" />
        </span>
      )}
      <span
        className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg",
          store.logoOnDark && "bg-slate-900",
        )}
      >
        <Image
          src={store.logo}
          alt={store.name}
          width={56}
          height={56}
          className="h-full w-full object-contain p-1.5"
        />
      </span>
      <span className="text-xs leading-tight font-medium text-slate-900 sm:text-sm">
        {store.name}
      </span>
      {disabledLabel && (
        <span className="text-[11px] text-slate-400">{disabledLabel}</span>
      )}
    </button>
  );
}

"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PERIOD_PRESETS,
  presetPeriod,
  type DashboardPeriod,
  type PeriodPreset,
} from "@/lib/admin/dashboard";
import { cn } from "@/lib/utils";

export interface PeriodFilterState {
  preset: PeriodPreset | "custom";
  custom: DashboardPeriod;
  /** Período em vigor (recalculado a cada render para os atalhos). */
  period: DashboardPeriod;
  choosePreset: (id: PeriodPreset) => void;
  changeCustom: (edge: "from" | "to", value: string) => void;
}

/** Atalhos (Hoje, 7 dias…) + datas De/Até; mexer nas datas vira período próprio. */
export function usePeriodFilter(initial: PeriodPreset = "30d"): PeriodFilterState {
  const [preset, setPreset] = useState<PeriodPreset | "custom">(initial);
  const [custom, setCustom] = useState<DashboardPeriod>(() => presetPeriod(initial));
  return {
    preset,
    custom,
    period: preset === "custom" ? custom : presetPeriod(preset),
    choosePreset(id) {
      setPreset(id);
      setCustom(presetPeriod(id));
    },
    changeCustom(edge, value) {
      setPreset("custom");
      setCustom((prev) => ({ ...prev, [edge]: value || undefined }));
    },
  };
}

export function PeriodFilter({
  state,
  idPrefix,
  className,
}: {
  state: PeriodFilterState;
  /** Prefixo dos ids dos campos de data (mais de um filtro na mesma página). */
  idPrefix: string;
  className?: string;
}) {
  const { preset, custom, choosePreset, changeCustom } = state;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período">
        {PERIOD_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => choosePreset(p.id)}
            aria-pressed={preset === p.id}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              preset === p.id
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-from`} className="text-xs text-slate-500">
            De
          </Label>
          <Input
            id={`${idPrefix}-from`}
            type="date"
            value={custom.from ?? ""}
            max={custom.to}
            onChange={(e) => changeCustom("from", e.target.value)}
            className="h-8 w-40 bg-white text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-to`} className="text-xs text-slate-500">
            Até
          </Label>
          <Input
            id={`${idPrefix}-to`}
            type="date"
            value={custom.to ?? ""}
            min={custom.from}
            onChange={(e) => changeCustom("to", e.target.value)}
            className="h-8 w-40 bg-white text-sm"
          />
        </div>
      </div>
    </div>
  );
}

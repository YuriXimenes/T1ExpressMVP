"use client";

import type { ReactNode } from "react";
import { Quote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { OptionStat, Testimonial, TextItem } from "@/lib/survey/summary";
import { cn } from "@/lib/utils";

/**
 * Peças do dashboard da pesquisa, em HTML/CSS (sem biblioteca de gráficos).
 * Regras do guia de visualização: barras finas (≤ 24px) com ponta de 4px
 * arredondada e base reta, texto nunca na cor da barra, rótulo de valor na
 * ponta, legenda só quando há mais de uma cor, e tooltip ao passar o mouse.
 */

/** Cores dos gráficos. As do NPS passaram no validador de daltonismo/contraste. */
export const CHART_COLORS = {
  accent: "var(--color-brand-600)",
  muted: "var(--color-brand-300)",
  detractor: "#e34948",
  passive: "#8f8d86",
  promoter: "#2a78d6",
} as const;

export function formatPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

/** Balão do hover: aparece sobre o elemento (`group`) ao passar o mouse ou focar. */
function Tooltip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-64 -translate-x-1/2 rounded-md bg-slate-900 px-2.5 py-1.5 text-left text-xs leading-snug text-white shadow-lg group-focus-within:block group-hover:block"
    >
      <span className="block font-medium">{title}</span>
      <span className="block text-slate-300">{children}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Indicadores (stat tiles)
// ---------------------------------------------------------------------------

export function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
        {value}
      </span>
      {detail && <span className="text-xs text-slate-500">{detail}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barras horizontais (escolha única / múltipla)
// ---------------------------------------------------------------------------

export function HorizontalBars({ options }: { options: OptionStat[] }) {
  const max = Math.max(1, ...options.map((o) => o.count));
  const top = Math.max(...options.map((o) => o.count));

  return (
    <ul className="flex flex-col gap-3">
      {options.map((o) => {
        const isTop = o.count > 0 && o.count === top;
        return (
          <li key={o.value} className="min-w-0">
            <p className="text-sm leading-snug text-slate-700">{o.label}</p>
            {/* A barra usa a largura menos o espaço do rótulo, que fica na ponta dela. */}
            <div className="mt-1 flex h-5 min-w-0 items-center">
              {o.count > 0 && (
                <span
                  tabIndex={0}
                  aria-label={`${o.label}: ${plural(o.count, "resposta", "respostas")}, ${formatPct(o.pct)}`}
                  className="group relative block h-full shrink-0 rounded-r-[4px] outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  style={{
                    width: `max(4px, calc((100% - 6.5rem) * ${o.count / max}))`,
                    background: isTop ? CHART_COLORS.accent : CHART_COLORS.muted,
                  }}
                >
                  <Tooltip title={o.label}>
                    {plural(o.count, "resposta", "respostas")} · {formatPct(o.pct)}
                  </Tooltip>
                </span>
              )}
              <span
                className={cn(
                  "ml-2 shrink-0 text-xs whitespace-nowrap tabular-nums",
                  isTop ? "font-semibold text-slate-900" : "text-slate-500",
                )}
              >
                {o.count} ({formatPct(o.pct)})
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Colunas (escalas 1–5 e 0–10)
// ---------------------------------------------------------------------------

export function ColumnChart({
  points,
  colorFor,
  minLabel,
  maxLabel,
}: {
  points: OptionStat[];
  /** Cor por ponto (NPS); sem isso, todas no azul da marca. */
  colorFor?: (value: number) => string;
  minLabel: string;
  maxLabel: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const dense = points.length > 6;
  const PLOT_H = 160;

  return (
    <div>
      <div
        className="grid items-end gap-1.5 border-b border-slate-200 sm:gap-2"
        style={{
          gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
          height: PLOT_H + 36,
        }}
      >
        {points.map((p) => {
          const h = (p.count / max) * PLOT_H;
          return (
            <div key={p.value} className="flex h-full flex-col items-center justify-end">
              <span className="mb-1 text-xs leading-tight font-semibold text-slate-900 tabular-nums">
                {p.count}
              </span>
              {!dense && (
                <span className="mb-1 text-[11px] leading-tight text-slate-500 tabular-nums">
                  {formatPct(p.pct)}
                </span>
              )}
              <span
                tabIndex={0}
                aria-label={`Nota ${p.label}: ${plural(p.count, "resposta", "respostas")}, ${formatPct(p.pct)}`}
                className="group relative block w-full max-w-6 rounded-t-[4px] outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                style={{
                  height: p.count > 0 ? Math.max(h, 3) : 0,
                  background: colorFor ? colorFor(Number(p.value)) : CHART_COLORS.accent,
                }}
              >
                <Tooltip title={`Nota ${p.label}`}>
                  {plural(p.count, "resposta", "respostas")} · {formatPct(p.pct)}
                </Tooltip>
              </span>
            </div>
          );
        })}
      </div>
      <div
        className="mt-1.5 grid gap-1.5 sm:gap-2"
        style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
      >
        {points.map((p) => (
          <span key={p.value} className="text-center text-xs text-slate-600 tabular-nums">
            {p.label}
          </span>
        ))}
      </div>
      <div className="mt-2 flex justify-between gap-4 text-xs text-slate-500">
        <span>{minLabel}</span>
        <span className="text-right">{maxLabel}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legenda (só para gráficos com mais de uma cor)
// ---------------------------------------------------------------------------

export function Legend({
  items,
}: {
  items: { color: string; label: string; detail?: string }[];
}) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
            style={{ background: item.color }}
            aria-hidden="true"
          />
          <span className="font-medium text-slate-700">{item.label}</span>
          {item.detail && <span className="tabular-nums">{item.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Texto livre e depoimentos
// ---------------------------------------------------------------------------

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

export function TextAnswers({ items }: { items: TextItem[] }) {
  return (
    <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
      {items.map((item, i) => (
        <li key={i} className="rounded-lg bg-slate-50 px-3 py-2.5">
          <p className="text-sm break-words whitespace-pre-line text-slate-800">
            {item.text}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {item.respondentName} · {shortDate(item.date)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function TestimonialList({ items }: { items: Testimonial[] }) {
  return (
    <ul className="max-h-96 space-y-3 overflow-y-auto pr-1">
      {items.map((t, i) => (
        <li key={i} className="rounded-lg border border-slate-200 p-4">
          <Quote className="text-brand-300 h-4 w-4" aria-hidden="true" />
          <p className="mt-1 text-sm break-words whitespace-pre-line text-slate-800">
            {t.message}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">
              — {t.displayName || "Sem nome"}
            </span>
            <span>· {shortDate(t.date)}</span>
            {t.authorized ? (
              <Badge variant="secondary">Autorizou publicar</Badge>
            ) : (
              <Badge variant="outline">Sem autorização</Badge>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

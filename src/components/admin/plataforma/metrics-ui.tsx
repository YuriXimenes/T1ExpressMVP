"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CHART_COLORS, Legend, formatPct } from "@/components/admin/survey-charts";
import { MetricsError } from "@/lib/metrics/api";
import { downloadCsv, toCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

export const count = (n: number | null | undefined) => (n ?? 0).toLocaleString("pt-BR");
export const brl = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `R$ ${n.toFixed(2).replace(".", ",")}`;
export const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : formatPct(n);
/** "AAAA-MM-DD" ou instante ISO → dd/mm/aaaa (instante no fuso de Brasília). */
export const dayBR = (d: string) =>
  d.length <= 10
    ? d.split("-").reverse().join("/")
    : new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
export const dateTimeBR = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });

/**
 * Carrega um indicador quando a chave (período) muda. Devolve null enquanto
 * carrega a chave atual.
 */
export function useMetric<T>(load: () => Promise<T>, key: string) {
  const [state, setState] = useState<{ key: string; data?: T; error?: string } | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      load()
        .then((data) => !cancelled && setState({ key, data }))
        .catch(
          (err) =>
            !cancelled &&
            setState({
              key,
              error:
                err instanceof MetricsError
                  ? err.message
                  : "Não foi possível carregar os indicadores.",
            }),
        );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state?.key === key ? state : null;
}

export function MetricState({
  state,
  children,
}: {
  state: { data?: unknown; error?: string } | null;
  children: () => ReactNode;
}) {
  if (!state) return <p className="text-sm text-slate-500">Carregando...</p>;
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
  return <>{children()}</>;
}

export function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function CsvButton({
  filename,
  header,
  rows,
}: {
  filename: string;
  header: string[];
  rows: (string | number | null | undefined)[][];
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={rows.length === 0}
      onClick={() => downloadCsv(filename, toCsv(header, rows))}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      Exportar CSV
    </Button>
  );
}

/** Lista com barra proporcional (lojas mais buscadas). */
export function BarList({
  items,
  empty,
}: {
  items: { key: string; label: string; value: number; detail?: string }[];
  empty: string;
}) {
  if (items.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((i) => (
        <li key={i.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700">{i.label}</span>
            <span className="shrink-0 font-semibold text-slate-900 tabular-nums">
              {count(i.value)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 flex-1 rounded-full bg-slate-100">
              <span
                className="block h-2 rounded-r-[4px]"
                style={{
                  width: `${(i.value / max) * 100}%`,
                  background: CHART_COLORS.accent,
                }}
              />
            </span>
            {i.detail && (
              <span className="w-32 shrink-0 text-right text-xs text-slate-500">
                {i.detail}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Colunas por dia (uma ou duas séries). O valor do dia sob a seta (ou o foco do
 * teclado) aparece numa linha de leitura acima do gráfico: um balão flutuante
 * seria cortado pela área de rolagem.
 */
export function DailyColumns({
  days,
  series,
}: {
  days: string[];
  series: { label: string; color: string; values: number[] }[];
}) {
  const [active, setActive] = useState<number | null>(null);
  if (days.length === 0)
    return <p className="text-sm text-slate-500">Sem dados no período.</p>;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const H = 140;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {series.length > 1 && (
          <Legend
            items={series.map((s) => ({
              color: s.color,
              label: s.label,
              detail: count(s.values.reduce((a, b) => a + b, 0)),
            }))}
          />
        )}
        <p
          aria-live="polite"
          className="ml-auto min-h-5 rounded-md bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700"
        >
          {active === null ? (
            <span className="text-slate-500">Passe o mouse sobre um dia</span>
          ) : (
            <>
              <span className="font-semibold">{dayBR(days[active])}</span>
              {series.map((s) => (
                <span key={s.label} className="ml-3 tabular-nums">
                  {s.label}:{" "}
                  <span className="font-semibold">{count(s.values[active])}</span>
                </span>
              ))}
            </>
          )}
        </p>
      </div>
      <div className="overflow-x-auto">
        <div
          className="flex items-end gap-1 border-b border-slate-200"
          style={{ height: H + 4, minWidth: days.length * 14 }}
          onMouseLeave={() => setActive(null)}
        >
          {days.map((d, i) => (
            <div
              key={d}
              className={cn(
                "relative flex h-full min-w-2.5 flex-1 items-end justify-center gap-px rounded-t-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
                active === i && "bg-slate-100",
              )}
              tabIndex={0}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${dayBR(d)}: ${series.map((s) => `${s.label} ${s.values[i]}`).join(", ")}`}
            >
              {series.map((s) => (
                <span
                  key={s.label}
                  className="block w-full max-w-3 rounded-t-[3px]"
                  style={{
                    height: s.values[i] ? Math.max((s.values[i] / max) * H, 3) : 0,
                    background: s.color,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>{dayBR(days[0])}</span>
        <span>{dayBR(days[days.length - 1])}</span>
      </div>
    </div>
  );
}

/** Tabela simples com rolagem horizontal no celular. */
export function Table({
  head,
  children,
  empty,
  isEmpty,
}: {
  head: string[];
  children: ReactNode;
  empty: string;
  isEmpty: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            {head.map((h, i) => (
              <th key={`${h}-${i}`} className="px-3 py-2 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isEmpty ? (
            <tr>
              <td colSpan={head.length} className="px-3 py-6 text-center text-slate-500">
                {empty}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export const td = "border-t border-slate-100 px-3 py-2 align-top";
export const tdNum = `${td} text-right tabular-nums`;

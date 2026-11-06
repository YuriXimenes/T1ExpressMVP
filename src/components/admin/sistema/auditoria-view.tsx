"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PeriodFilter, usePeriodFilter } from "@/components/admin/period-filter";
import { CsvButton, dateTimeBR, td } from "@/components/admin/plataforma/metrics-ui";
import { STAFF_AREAS } from "@/lib/admin/access";
import {
  ACTION_LABELS,
  TABLE_LABELS,
  areaLabel,
  fieldLabel,
  formatAuditValue,
  recordHref,
  type AuditAction,
} from "@/lib/system/audit";
import {
  SystemError,
  fetchAudit,
  type AuditEntry,
  type AuditPage,
} from "@/lib/system/api";
import { cn } from "@/lib/utils";

const ACTION_TONE: Record<AuditAction, string> = {
  criou: "border-emerald-200 bg-emerald-50 text-emerald-700",
  alterou: "border-sky-200 bg-sky-50 text-sky-700",
  excluiu: "border-red-200 bg-red-50 text-red-700",
};

const select =
  "h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none";

/** Resumo do que mudou numa linha (até 3 campos). */
function summary(e: AuditEntry): string {
  const keys = Object.keys(e.changes);
  if (e.action !== "alterou") return `${keys.length} campo(s)`;
  const parts = keys.slice(0, 3).map((k) => {
    const c = e.changes[k];
    return `${fieldLabel(k)}: ${formatAuditValue(c.old)} → ${formatAuditValue(c.new)}`;
  });
  return parts.join(" · ") + (keys.length > 3 ? ` · +${keys.length - 3}` : "");
}

/** Sistema › Auditoria: tudo o que a equipe criou, alterou ou excluiu. */
export function AuditoriaView() {
  const periodFilter = usePeriodFilter("7d");
  const { period } = periodFilter;
  const [actorId, setActorId] = useState("");
  const [area, setArea] = useState("");
  const [action, setAction] = useState<AuditAction | "">("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<AuditPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const filters = {
    from: period.from,
    to: period.to,
    actorId: actorId || undefined,
    area: area || undefined,
    action,
    q: query || undefined,
  };
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      setPage(null);
      setError(null);
      fetchAudit(JSON.parse(filterKey))
        .then((p) => !cancelled && setPage(p))
        .catch(
          (err) =>
            !cancelled &&
            setError(
              err instanceof SystemError ? err.message : "Não foi possível carregar.",
            ),
        );
    });
    return () => {
      cancelled = true;
    };
  }, [filterKey]);

  async function loadMore() {
    if (!page?.nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchAudit(JSON.parse(filterKey), page.nextBefore);
      setPage({ ...next, items: [...page.items, ...next.items] });
    } catch (err) {
      setError(err instanceof SystemError ? err.message : "Não foi possível carregar.");
    } finally {
      setLoadingMore(false);
    }
  }

  const items = page?.items ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Auditoria</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Tudo o que a equipe cria, altera ou exclui no backoffice, com o antes e o
            depois. Dados sensíveis (Pix, banco, documentos) aparecem como
            &ldquo;•••&rdquo;. Ações de clientes, lojas e entregadores não entram aqui.
          </p>
        </div>
        <PeriodFilter state={periodFilter} idPrefix="aud" />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <select
          aria-label="Pessoa"
          className={select}
          value={actorId}
          onChange={(e) => setActorId(e.target.value)}
        >
          <option value="">Todas as pessoas</option>
          {(page?.actors ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Área"
          className={select}
          value={area}
          onChange={(e) => setArea(e.target.value)}
        >
          <option value="">Todas as áreas</option>
          {STAFF_AREAS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Ação"
          className={select}
          value={action}
          onChange={(e) => setAction(e.target.value as AuditAction | "")}
        >
          <option value="">Todas as ações</option>
          {(Object.keys(ACTION_LABELS) as AuditAction[]).map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q.trim());
          }}
        >
          <Input
            aria-label="Buscar"
            placeholder="Buscar registro, motivo ou valor"
            className="h-9 w-64"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button type="submit" size="sm" variant="outline">
            Buscar
          </Button>
        </form>
        <div className="ml-auto">
          <CsvButton
            filename={`auditoria_${period.from ?? "inicio"}_${period.to ?? "hoje"}.csv`}
            header={[
              "Quando",
              "Quem",
              "Área",
              "Ação",
              "Tipo",
              "Registro",
              "Campo",
              "Antes",
              "Depois",
              "Motivo",
            ]}
            rows={items.flatMap((e) =>
              Object.entries(e.changes).map(([k, c]) => [
                e.at,
                e.actorName,
                areaLabel(e.area),
                ACTION_LABELS[e.action],
                TABLE_LABELS[e.table] ?? e.table,
                e.recordLabel ?? e.recordId,
                fieldLabel(k),
                c.old === undefined ? "" : formatAuditValue(c.old),
                c.new === undefined ? "" : formatAuditValue(c.new),
                e.reason,
              ]),
            )}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!page && !error && <p className="text-sm text-slate-500">Carregando...</p>}

      {page && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Quando</th>
                <th className="px-3 py-2 font-medium">Quem</th>
                <th className="px-3 py-2 font-medium">Ação</th>
                <th className="px-3 py-2 font-medium">Registro</th>
                <th className="px-3 py-2 font-medium">O que mudou</th>
                <th className="w-8 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    Nenhuma ação registrada com esses filtros.
                  </td>
                </tr>
              )}
              {items.map((e) => {
                const href = recordHref(e.table, e.recordId, e.area);
                const expanded = openId === e.id;
                return (
                  <Fragment key={e.id}>
                    <tr className={cn(expanded && "bg-slate-50")}>
                      <td className={`${td} text-xs whitespace-nowrap text-slate-500`}>
                        {dateTimeBR(e.at)}
                      </td>
                      <td className={`${td} whitespace-nowrap text-slate-900`}>
                        {e.actorName ?? "—"}
                      </td>
                      <td className={td}>
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                            ACTION_TONE[e.action],
                          )}
                        >
                          {ACTION_LABELS[e.action]}
                        </span>
                      </td>
                      <td className={td}>
                        <p className="text-xs text-slate-500">
                          {TABLE_LABELS[e.table] ?? e.table} · {areaLabel(e.area)}
                        </p>
                        {href ? (
                          <Link href={href} className="text-slate-900 hover:underline">
                            {e.recordLabel ?? e.recordId ?? "—"}
                          </Link>
                        ) : (
                          <span className="text-slate-900">
                            {e.recordLabel ?? e.recordId ?? "—"}
                          </span>
                        )}
                      </td>
                      <td className={`${td} max-w-md text-slate-700`}>
                        <p className="line-clamp-2">{summary(e)}</p>
                        {e.reason && (
                          <p className="text-xs text-slate-500">Motivo: {e.reason}</p>
                        )}
                      </td>
                      <td className={td}>
                        <button
                          type="button"
                          aria-label={expanded ? "Fechar detalhe" : "Ver detalhe"}
                          aria-expanded={expanded}
                          onClick={() => setOpenId(expanded ? null : e.id)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 transition-transform",
                              expanded && "rotate-180",
                            )}
                            aria-hidden="true"
                          />
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-slate-50">
                        <td colSpan={6} className="border-t border-slate-100 px-3 py-3">
                          <table className="w-full text-xs">
                            <thead className="text-left text-slate-500">
                              <tr>
                                <th className="py-1 pr-4 font-medium">Campo</th>
                                {e.action !== "criou" && (
                                  <th className="py-1 pr-4 font-medium">Antes</th>
                                )}
                                {e.action !== "excluiu" && (
                                  <th className="py-1 font-medium">Depois</th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(e.changes).map(([k, c]) => (
                                <tr
                                  key={k}
                                  className="border-t border-slate-200 align-top"
                                >
                                  <td className="py-1 pr-4 font-medium text-slate-700">
                                    {fieldLabel(k)}
                                  </td>
                                  {e.action !== "criou" && (
                                    <td className="py-1 pr-4 break-all text-slate-500">
                                      {formatAuditValue(c.old)}
                                    </td>
                                  )}
                                  {e.action !== "excluiu" && (
                                    <td className="py-1 break-all text-slate-900">
                                      {formatAuditValue(c.new)}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {page?.nextBefore && (
        <Button
          variant="outline"
          className="w-fit self-center"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? "Carregando..." : "Carregar mais"}
        </Button>
      )}
    </div>
  );
}

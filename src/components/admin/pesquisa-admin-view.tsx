"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/components/shared/price";
import { AdminError, fetchSurveyResponses } from "@/lib/admin/api";
import { downloadCsv, toCsv } from "@/lib/csv";
import type { SurveyResponse } from "@/lib/survey/api";
import {
  SURVEY_QUESTIONS,
  answerLabel,
  testimonialDisplayName,
} from "@/lib/survey/questions";
import { cn } from "@/lib/utils";

type Filter = "todas" | "concluidas" | "andamento";

function formatDateTime(iso?: string) {
  return iso
    ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "";
}

/** Colunas fixas + uma por pergunta do cadastro — a tabela e o CSV usam a mesma lista. */
const COLUMNS: { label: string; value: (r: SurveyResponse) => string; wide?: boolean }[] =
  [
    { label: "Status", value: (r) => (r.completedAt ? "Concluída" : "Em andamento") },
    { label: "Início", value: (r) => formatDateTime(r.startedAt) },
    { label: "Última atualização", value: (r) => formatDateTime(r.updatedAt) },
    { label: "Nome", value: (r) => r.respondentName },
    { label: "E-mail", value: (r) => r.respondentEmail },
    { label: "Pedido", value: (r) => `#${r.orderCode}` },
    { label: "Lojas de coleta", value: (r) => r.collectStores, wide: true },
    { label: "Itens", value: (r) => r.orderItems, wide: true },
    { label: "Loja de retirada", value: (r) => r.pickupStore },
    { label: "Total dos itens", value: (r) => formatBRL(r.itemsTotalBRL) },
    { label: "Valor pago", value: (r) => formatBRL(r.amountPaidBRL) },
    ...SURVEY_QUESTIONS.map((q) => ({
      // Cabeçalho = pergunta completa, com o número do formulário quando tem.
      label: `${q.number !== undefined ? `${q.number}. ` : ""}${q.label}`,
      value: (r: SurveyResponse) => answerLabel(q, r.answers[q.id]),
      wide: true,
    })),
    {
      label: "Autorizou publicar a mensagem",
      value: (r) =>
        r.answers.testimonial_opt_in === undefined
          ? ""
          : r.answers.testimonial_authorized === true
            ? "Sim"
            : "Não",
    },
    {
      // Já resolvido: o nome cadastrado inteiro, só o primeiro nome ou o nick.
      label: "Identificação na mensagem",
      value: (r) => testimonialDisplayName(r.answers, r.respondentName),
    },
  ];

const FILTERS: { id: Filter; label: string; test: (r: SurveyResponse) => boolean }[] = [
  { id: "todas", label: "Todas", test: () => true },
  { id: "concluidas", label: "Concluídas", test: (r) => !!r.completedAt },
  { id: "andamento", label: "Em andamento", test: (r) => !r.completedAt },
];

export function PesquisaAdminView() {
  const [responses, setResponses] = useState<SurveyResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("todas");

  useEffect(() => {
    let cancelled = false;
    fetchSurveyResponses()
      .then((data) => {
        if (!cancelled) setResponses(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof AdminError
              ? err.message
              : "Não foi possível carregar as respostas.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(
    () => (responses ?? []).filter(FILTERS.find((f) => f.id === filter)!.test),
    [responses, filter],
  );

  function handleDownload() {
    const csv = toCsv(
      COLUMNS.map((c) => c.label),
      filtered.map((r) => COLUMNS.map((c) => c.value(r))),
    );
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`pesquisa-t1-${today}.csv`, csv);
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Pesquisa</h1>
          {responses && (
            <p className="text-sm text-slate-500">
              {responses.length} {responses.length === 1 ? "resposta" : "respostas"} ·{" "}
              {responses.filter((r) => r.completedAt).length} concluída(s)
            </p>
          )}
        </div>
        <Button
          variant="outline"
          onClick={handleDownload}
          disabled={!responses || filtered.length === 0}
          className="w-full sm:w-auto"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Baixar CSV
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              filter === f.id
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50",
            )}
          >
            {f.label}
            {responses && ` · ${responses.filter(f.test).length}`}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!responses && !error && <p className="text-sm text-slate-500">Carregando...</p>}

      {responses && (
        <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200">
          <table className="w-max min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.label}
                    className={cn(
                      "px-4 py-2 align-bottom font-medium",
                      c.wide && "min-w-56",
                    )}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    className="px-4 py-8 text-center text-slate-400"
                  >
                    Nenhuma resposta ainda.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 align-top">
                    {COLUMNS.map((c, i) => (
                      <td
                        key={c.label}
                        className={cn(
                          "px-4 py-3 text-slate-700",
                          c.wide
                            ? "max-w-80 min-w-56 whitespace-normal"
                            : "whitespace-nowrap",
                        )}
                      >
                        {i === 0 ? (
                          <Badge variant={r.completedAt ? "default" : "secondary"}>
                            {c.value(r)}
                          </Badge>
                        ) : (
                          c.value(r) || <span className="text-slate-300">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

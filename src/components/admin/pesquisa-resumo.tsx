"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCatalog } from "@/lib/catalog/provider";
import type { SurveyResponse } from "@/lib/survey/api";
import type { SurveyQuestion } from "@/lib/survey/questions";
import {
  npsGroup,
  summarizeKpis,
  summarizeQuestion,
  summarizeRegionAccuracy,
  summarizeTestimonials,
  surveySections,
  type QuestionSummary,
} from "@/lib/survey/summary";
import {
  CHART_COLORS,
  ColumnChart,
  HorizontalBars,
  Legend,
  StatTile,
  TestimonialList,
  TextAnswers,
  formatNumber,
  formatPct,
} from "@/components/admin/survey-charts";
import { cn } from "@/lib/utils";

const NPS_COLOR = {
  promoter: CHART_COLORS.promoter,
  passive: CHART_COLORS.passive,
  detractor: CHART_COLORS.detractor,
} as const;

const respostas = (n: number) =>
  `${n.toLocaleString("pt-BR")} ${n === 1 ? "resposta" : "respostas"}`;

function QuestionCard({
  question,
  summary,
  extra,
  children,
}: {
  question: SurveyQuestion;
  summary: QuestionSummary;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0 gap-4 p-5 sm:p-6">
      <div>
        <h3 className="font-semibold text-slate-900">
          {question.number !== undefined && (
            <span className="text-brand-600 mr-1.5">{question.number}.</span>
          )}
          {question.label}
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {respostas(summary.respondents)}
          {summary.kind === "choice" && summary.multi && summary.respondents > 0 && (
            <> · cada pessoa podia marcar mais de uma, então a soma passa de 100%</>
          )}
        </p>
      </div>
      {summary.respondents === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Nenhuma resposta ainda.</p>
      ) : (
        <>
          {extra}
          {children}
        </>
      )}
    </Card>
  );
}

/** Aba "Resumo" de /admin/pesquisa: gráficos por pergunta, na ordem do formulário. */
export function PesquisaResumo({ responses }: { responses: SurveyResponse[] }) {
  const { stores } = useCatalog();
  const storeNames = useMemo(() => stores.map((s) => s.name), [stores]);
  const sections = useMemo(() => surveySections(), []);
  // Seções recolhidas (todas abertas por padrão); o resumo do topo não recolhe.
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const allOpen = closed.size === 0;
  const allClosed = closed.size === sections.length;
  const toggle = (id: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const kpis = useMemo(() => summarizeKpis(responses), [responses]);
  const region = useMemo(() => summarizeRegionAccuracy(responses), [responses]);
  const testimonials = useMemo(() => summarizeTestimonials(responses), [responses]);

  if (responses.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500">
        Nenhuma resposta neste filtro ainda.
      </p>
    );
  }

  const { nps } = kpis;

  function renderQuestion(q: SurveyQuestion) {
    const summary = summarizeQuestion(q, responses, { storeNames });

    if (summary.kind === "scale" && q.type === "scale") {
      const isNps = q.id === "nps";
      return (
        <QuestionCard
          key={q.id}
          question={q}
          summary={summary}
          extra={
            isNps ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-slate-600">
                  <span className="text-3xl font-semibold text-slate-900 tabular-nums">
                    {nps.score !== null ? nps.score.toLocaleString("pt-BR") : "—"}
                  </span>{" "}
                  NPS <span className="text-slate-400">(de −100 a 100)</span>
                </p>
                <Legend
                  items={[
                    {
                      color: NPS_COLOR.promoter,
                      label: "Promotores (9–10)",
                      detail: `${nps.promoters} · ${formatPct((nps.promoters / nps.respondents) * 100)}`,
                    },
                    {
                      color: NPS_COLOR.passive,
                      label: "Neutros (7–8)",
                      detail: `${nps.passives} · ${formatPct((nps.passives / nps.respondents) * 100)}`,
                    },
                    {
                      color: NPS_COLOR.detractor,
                      label: "Detratores (0–6)",
                      detail: `${nps.detractors} · ${formatPct((nps.detractors / nps.respondents) * 100)}`,
                    },
                  ]}
                />
              </div>
            ) : (
              summary.mean !== null && (
                <p className="text-sm text-slate-600">
                  Média{" "}
                  <span className="text-2xl font-semibold text-slate-900 tabular-nums">
                    {formatNumber(summary.mean)}
                  </span>{" "}
                  <span className="text-slate-400">de {q.max}</span>
                </p>
              )
            )
          }
        >
          <ColumnChart
            points={summary.points}
            colorFor={isNps ? (v) => NPS_COLOR[npsGroup(v)] : undefined}
            minLabel={q.minLabel}
            maxLabel={q.maxLabel}
          />
        </QuestionCard>
      );
    }

    if (summary.kind === "text") {
      // A mensagem para o site vira a lista de depoimentos, já com a identificação.
      return (
        <QuestionCard key={q.id} question={q} summary={summary}>
          {q.id === "testimonial_message" ? (
            <TestimonialList items={testimonials} />
          ) : (
            <TextAnswers items={summary.items} />
          )}
        </QuestionCard>
      );
    }

    if (summary.kind === "choice") {
      return (
        <QuestionCard
          key={q.id}
          question={q}
          summary={summary}
          extra={
            q.id === "region" &&
            region.suggested > 0 && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <strong className="text-slate-900">
                  {formatPct(region.correctedPct)}
                </strong>{" "}
                corrigiram a região sugerida pelo CEP ({region.corrected} de{" "}
                {region.suggested} que receberam sugestão).
              </p>
            )
          }
        >
          <HorizontalBars options={summary.options} />
        </QuestionCard>
      );
    }
    return null;
  }

  return (
    <div className="flex flex-col gap-10">
      <section aria-label="Indicadores">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
          <StatTile label="Respostas" value={kpis.total.toLocaleString("pt-BR")} />
          <StatTile
            label="Concluídas"
            value={kpis.completed.toLocaleString("pt-BR")}
            detail={`${formatPct(kpis.completionPct)} de conclusão`}
          />
          <StatTile
            label="NPS"
            value={nps.score !== null ? nps.score.toLocaleString("pt-BR") : "—"}
            detail={nps.respondents ? respostas(nps.respondents) : "sem respostas"}
          />
          <StatTile
            label="Facilidade do pedido"
            value={kpis.easeMean !== null ? formatNumber(kpis.easeMean) : "—"}
            detail="média de 1 a 5"
          />
          <StatTile
            label="Resolve um problema real"
            value={kpis.problemFitMean !== null ? formatNumber(kpis.problemFitMean) : "—"}
            detail="média de 1 a 5"
          />
          <StatTile
            label="Fariam o pedido"
            value={kpis.wouldOrderPct !== null ? formatPct(kpis.wouldOrderPct) : "—"}
            detail="“com certeza” ou “provavelmente”, na simulação"
          />
          <StatTile
            label="Querem seguir no piloto"
            value={kpis.pilotYesPct !== null ? formatPct(kpis.pilotYesPct) : "—"}
            detail="responderam “Sim, quero”"
          />
        </div>
      </section>

      <div className="-mb-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Resultados por bloco, na ordem do formulário
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setClosed(new Set())}
            disabled={allOpen}
          >
            <ChevronsUpDown className="h-4 w-4" aria-hidden="true" />
            Expandir tudo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setClosed(new Set(sections.map((s) => s.id)))}
            disabled={allClosed}
          >
            <ChevronsDownUp className="h-4 w-4" aria-hidden="true" />
            Reduzir tudo
          </Button>
        </div>
      </div>

      {sections.map((section) => {
        const open = !closed.has(section.id);
        return (
          <section key={section.id} className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                <button
                  type="button"
                  onClick={() => toggle(section.id)}
                  aria-expanded={open}
                  aria-controls={`panel-${section.id}`}
                  className="group -mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none"
                >
                  <span className="min-w-0">{section.title}</span>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:text-slate-600",
                      open && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </button>
              </h2>
              {open && section.subtitle && (
                <p className="mt-0.5 text-sm text-slate-500">{section.subtitle}</p>
              )}
            </div>
            {open && (
              <div id={`panel-${section.id}`} className="grid gap-4 lg:grid-cols-2">
                {section.questions.map(renderQuestion)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

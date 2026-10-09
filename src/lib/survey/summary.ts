import type { SurveyResponse } from "@/lib/survey/api";
import {
  NO_STORE,
  SURVEY_STEPS,
  isVisible,
  testimonialDisplayName,
  type SurveyAnswerValue,
  type SurveyQuestion,
} from "@/lib/survey/questions";

/**
 * Agregações do dashboard da pesquisa (aba "Resumo" do admin). Funções puras:
 * recebem as respostas e o cadastro e devolvem números — testadas em
 * summary.test.ts. O denominador de cada pergunta é quem a respondeu (as
 * condicionais contam só quem as viu).
 */

export interface OptionStat {
  value: string;
  label: string;
  count: number;
  /** % sobre quem respondeu a pergunta (0–100). */
  pct: number;
}

export interface ChoiceSummary {
  kind: "choice";
  question: SurveyQuestion;
  respondents: number;
  multi: boolean;
  options: OptionStat[];
}

export interface ScaleSummary {
  kind: "scale";
  question: SurveyQuestion;
  respondents: number;
  points: OptionStat[];
  mean: number | null;
}

export interface TextItem {
  text: string;
  respondentName: string;
  date: string;
}

export interface TextSummary {
  kind: "text";
  question: SurveyQuestion;
  respondents: number;
  items: TextItem[];
}

export type QuestionSummary = ChoiceSummary | ScaleSummary | TextSummary;

const pct = (count: number, total: number) => (total > 0 ? (count / total) * 100 : 0);

function isAnswered(value: SurveyAnswerValue | undefined) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Respostas em que a pergunta apareceu e foi respondida. */
function answeredBy(q: SurveyQuestion, responses: SurveyResponse[]) {
  return responses.filter((r) => isVisible(q, r.answers) && isAnswered(r.answers[q.id]));
}

export function summarizeQuestion(
  q: SurveyQuestion,
  responses: SurveyResponse[],
  options: { storeNames?: string[] } = {},
): QuestionSummary {
  const rows = answeredBy(q, responses);
  const total = rows.length;

  if (q.type === "scale") {
    const counts = new Map<number, number>();
    let sum = 0;
    for (const r of rows) {
      const v = Number(r.answers[q.id]);
      counts.set(v, (counts.get(v) ?? 0) + 1);
      sum += v;
    }
    const points: OptionStat[] = [];
    for (let n = q.min; n <= q.max; n++) {
      const count = counts.get(n) ?? 0;
      points.push({ value: String(n), label: String(n), count, pct: pct(count, total) });
    }
    return {
      kind: "scale",
      question: q,
      respondents: total,
      points,
      mean: total ? sum / total : null,
    };
  }

  if (q.type === "text") {
    const items = rows
      .map((r) => ({
        text: String(r.answers[q.id]).trim(),
        respondentName: r.respondentName,
        date: r.updatedAt,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
    return { kind: "text", question: q, respondents: total, items };
  }

  // Escolha única ou múltipla: conta cada opção marcada.
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = r.answers[q.id];
    for (const value of Array.isArray(v) ? v : [String(v)]) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  const known =
    q.type === "multi" && q.optionsFrom === "stores"
      ? [
          ...(options.storeNames ?? []).map((name) => ({ value: name, label: name })),
          ...q.options,
        ]
      : q.options;
  // Valores que não estão mais no cadastro (ex.: opção renomeada) não somem.
  const extras = [...counts.keys()]
    .filter((v) => !known.some((o) => o.value === v))
    .map((v) => ({ value: v, label: v }));

  let stats: OptionStat[] = [...known, ...extras].map((o) => {
    const count = counts.get(o.value) ?? 0;
    return { value: o.value, label: o.label, count, pct: pct(count, total) };
  });

  // Lojas (P17): lista dinâmica — da mais citada para a menos, "Nenhuma" no fim.
  if (q.type === "multi" && q.optionsFrom === "stores") {
    const none = stats.filter((s) => s.value === NO_STORE);
    stats = [
      ...stats
        .filter((s) => s.value !== NO_STORE)
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR")),
      ...none,
    ];
  }

  return {
    kind: "choice",
    question: q,
    respondents: total,
    multi: q.type === "multi",
    options: stats,
  };
}

// ---------------------------------------------------------------------------
// NPS (pergunta 5): promotores 9–10, neutros 7–8, detratores 0–6.
// ---------------------------------------------------------------------------

export interface NpsSummary {
  respondents: number;
  promoters: number;
  passives: number;
  detractors: number;
  /** −100 a 100; null sem respostas. */
  score: number | null;
}

export function npsGroup(value: number): "promoter" | "passive" | "detractor" {
  return value >= 9 ? "promoter" : value >= 7 ? "passive" : "detractor";
}

export function summarizeNps(responses: SurveyResponse[]): NpsSummary {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const r of responses) {
    const v = r.answers.nps;
    if (typeof v !== "number") continue;
    const group = npsGroup(v);
    if (group === "promoter") promoters++;
    else if (group === "passive") passives++;
    else detractors++;
  }
  const total = promoters + passives + detractors;
  return {
    respondents: total,
    promoters,
    passives,
    detractors,
    score: total ? Math.round(((promoters - detractors) / total) * 100) : null,
  };
}

// ---------------------------------------------------------------------------
// Indicadores do topo, região e depoimentos.
// ---------------------------------------------------------------------------

function meanOf(responses: SurveyResponse[], key: string): number | null {
  const values = responses
    .map((r) => r.answers[key])
    .filter((v): v is number => typeof v === "number");
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export interface SurveyKpis {
  total: number;
  completed: number;
  completionPct: number;
  nps: NpsSummary;
  easeMean: number | null;
  problemFitMean: number | null;
  /** % de "Sim, quero" entre quem respondeu a pergunta 24; null sem respostas. */
  pilotYesPct: number | null;
}

export function summarizeKpis(responses: SurveyResponse[]): SurveyKpis {
  const completed = responses.filter((r) => r.completedAt).length;
  const pilot = responses.filter((r) => typeof r.answers.pilot_interest === "string");
  return {
    total: responses.length,
    completed,
    completionPct: pct(completed, responses.length),
    nps: summarizeNps(responses),
    easeMean: meanOf(responses, "ease_score"),
    problemFitMean: meanOf(responses, "problem_fit"),
    pilotYesPct: pilot.length
      ? pct(
          pilot.filter((r) => r.answers.pilot_interest === "Sim, quero").length,
          pilot.length,
        )
      : null,
  };
}

export interface RegionAccuracy {
  /** Respostas em que o CEP sugeriu uma região. */
  suggested: number;
  corrected: number;
  correctedPct: number;
}

/** Quantas pessoas trocaram a região que o CEP sugeriu. */
export function summarizeRegionAccuracy(responses: SurveyResponse[]): RegionAccuracy {
  const suggested = responses.filter(
    (r) =>
      typeof r.answers.region_detected === "string" &&
      typeof r.answers.region === "string",
  );
  const corrected = suggested.filter(
    (r) => r.answers.region !== r.answers.region_detected,
  ).length;
  return {
    suggested: suggested.length,
    corrected,
    correctedPct: pct(corrected, suggested.length),
  };
}

export interface Testimonial {
  message: string;
  displayName: string;
  authorized: boolean;
  date: string;
}

/** Depoimentos para o site (perguntas 26–28), mais recentes primeiro. */
export function summarizeTestimonials(responses: SurveyResponse[]): Testimonial[] {
  return responses
    .filter(
      (r) =>
        r.answers.testimonial_opt_in === "Sim" &&
        typeof r.answers.testimonial_message === "string" &&
        r.answers.testimonial_message.trim() !== "",
    )
    .map((r) => ({
      message: String(r.answers.testimonial_message).trim(),
      displayName: testimonialDisplayName(r.answers, r.respondentName),
      authorized: r.answers.testimonial_authorized === true,
      date: r.updatedAt,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------
// Seções na ordem do formulário.
// ---------------------------------------------------------------------------

export interface SurveySection {
  id: string;
  title: string;
  subtitle?: string;
  questions: SurveyQuestion[];
}

/** Perguntas que não ganham cartão próprio (o nick aparece junto do depoimento). */
const HIDDEN_IN_SUMMARY = new Set(["testimonial_nick"]);

/** As etapas sem bloco viram "Abertura"; cada bloco é uma seção. */
export function surveySections(): SurveySection[] {
  const sections: SurveySection[] = [];
  for (const step of SURVEY_STEPS) {
    const questions = step.questions.filter((q) => !HIDDEN_IN_SUMMARY.has(q.id));
    if (!step.block) {
      const opening = sections.find((s) => s.id === "abertura");
      if (opening) opening.questions.push(...questions);
      else
        sections.push({ id: "abertura", title: "Abertura", questions: [...questions] });
    } else {
      sections.push({
        id: step.id,
        title: `Bloco ${step.block} – ${step.title}`,
        subtitle: step.subtitle,
        questions,
      });
    }
  }
  return sections;
}

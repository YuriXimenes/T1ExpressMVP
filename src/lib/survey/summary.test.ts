import { describe, expect, it } from "vitest";
import type { SurveyResponse } from "@/lib/survey/api";
import { SURVEY_QUESTIONS, type SurveyAnswers } from "@/lib/survey/questions";
import {
  npsGroup,
  summarizeKpis,
  summarizeNps,
  summarizeQuestion,
  summarizeRegionAccuracy,
  summarizeTestimonials,
  surveySections,
  type ChoiceSummary,
  type ScaleSummary,
  type TextSummary,
} from "@/lib/survey/summary";

let seq = 0;
function resp(
  answers: SurveyAnswers,
  extra: Partial<SurveyResponse> = {},
): SurveyResponse {
  seq++;
  return {
    id: `r${seq}`,
    userId: `u${seq}`,
    respondentName: `Pessoa ${seq} Silva`,
    respondentEmail: `p${seq}@x.com`,
    orderCode: "ABC",
    collectStores: "",
    pickupStore: "",
    orderItems: "",
    itemsTotalBRL: 0,
    amountPaidBRL: 0,
    answers,
    startedAt: `2026-10-0${(seq % 9) + 1}T10:00:00Z`,
    updatedAt: `2026-10-0${(seq % 9) + 1}T10:00:00Z`,
    ...extra,
  };
}
const q = (id: string) => SURVEY_QUESTIONS.find((x) => x.id === id)!;

describe("escolha única", () => {
  it("conta e calcula % sobre quem respondeu, na ordem do formulário", () => {
    const s = summarizeQuestion(q("will_use"), [
      resp({ will_use: "Talvez" }),
      resp({ will_use: "Talvez" }),
      resp({ will_use: "Não" }),
      resp({ will_use: "Sim, já no primeiro mês" }),
      resp({}), // não respondeu: fora do denominador
    ]) as ChoiceSummary;
    expect(s.respondents).toBe(4);
    expect(s.options.map((o) => o.label)).toEqual([
      "Sim, já no primeiro mês",
      "Sim, quando surgir uma compra que precise",
      "Talvez",
      "Provavelmente não",
      "Não",
    ]);
    expect(s.options.map((o) => o.count)).toEqual([1, 0, 2, 0, 1]);
    expect(s.options[2].pct).toBe(50);
  });

  it("usa o rótulo da opção e não perde valores fora do cadastro", () => {
    const s = summarizeQuestion(q("participation"), [
      resp({ participation: "real" }),
      resp({ participation: "valor antigo" }),
    ]) as ChoiceSummary;
    expect(s.options[0]).toMatchObject({
      label: "Fiz um pedido real e retirei as cartas",
      count: 1,
    });
    expect(s.options.at(-1)).toMatchObject({ label: "valor antigo", count: 1 });
  });
});

describe("múltipla escolha", () => {
  it("% sobre respondentes: a soma pode passar de 100%", () => {
    const s = summarizeQuestion(q("top_values"), [
      resp({ top_values: ["Ganhar tempo", "Saber o preço antes de pedir"] }),
      resp({ top_values: ["Ganhar tempo"] }),
    ]) as ChoiceSummary;
    expect(s.multi).toBe(true);
    expect(s.respondents).toBe(2);
    expect(s.options.find((o) => o.label === "Ganhar tempo")!.pct).toBe(100);
    expect(s.options.reduce((a, o) => a + o.pct, 0)).toBe(150);
  });

  it("lojas (P17): inclui as do catálogo com zero, ordena por volume e deixa 'Nenhuma' no fim", () => {
    const s = summarizeQuestion(
      q("stores_would_buy"),
      [
        resp({ stores_would_buy: ["Red", "Konklave"] }),
        resp({ stores_would_buy: ["Red"] }),
        resp({ stores_would_buy: ["nenhuma"] }),
      ],
      { storeNames: ["Konklave", "Red", "Arcadia Games"] },
    ) as ChoiceSummary;
    expect(s.options.map((o) => `${o.label}:${o.count}`)).toEqual([
      "Red:2",
      "Konklave:1",
      "Arcadia Games:0",
      "Nenhuma:1",
    ]);
  });
});

describe("escala", () => {
  it("distribuição de 1 a 5 com média", () => {
    const s = summarizeQuestion(q("ease_score"), [
      resp({ ease_score: 5 }),
      resp({ ease_score: 4 }),
      resp({ ease_score: 4 }),
      resp({ ease_score: 1 }),
    ]) as ScaleSummary;
    expect(s.points.map((p) => p.count)).toEqual([1, 0, 0, 2, 1]);
    expect(s.mean).toBe(3.5);
  });

  it("nota 0 conta (NPS de 0 a 10)", () => {
    const s = summarizeQuestion(q("nps"), [
      resp({ nps: 0 }),
      resp({ nps: 10 }),
    ]) as ScaleSummary;
    expect(s.respondents).toBe(2);
    expect(s.points).toHaveLength(11);
    expect(s.points[0]).toMatchObject({ label: "0", count: 1, pct: 50 });
    expect(s.mean).toBe(5);
  });

  it("sem respostas, média nula", () => {
    expect((summarizeQuestion(q("ease_score"), []) as ScaleSummary).mean).toBeNull();
  });
});

describe("NPS", () => {
  it("grupos: 0–6 detrator, 7–8 neutro, 9–10 promotor", () => {
    expect([0, 6, 7, 8, 9, 10].map(npsGroup)).toEqual([
      "detractor",
      "detractor",
      "passive",
      "passive",
      "promoter",
      "promoter",
    ]);
  });

  it("casos conhecidos", () => {
    expect(summarizeNps([resp({ nps: 10 }), resp({ nps: 9 })]).score).toBe(100);
    expect(summarizeNps([resp({ nps: 10 }), resp({ nps: 0 })]).score).toBe(0);
    expect(summarizeNps([resp({ nps: 3 })]).score).toBe(-100);
    expect(
      summarizeNps([
        resp({ nps: 9 }),
        resp({ nps: 8 }),
        resp({ nps: 2 }),
        resp({ nps: 10 }),
      ]),
    ).toMatchObject({ promoters: 2, passives: 1, detractors: 1, score: 25 });
    expect(summarizeNps([resp({})]).score).toBeNull();
  });
});

describe("condicionais", () => {
  it("27/28 contam só quem disse Sim na 26", () => {
    const rows = [
      resp({
        testimonial_opt_in: "Sim",
        testimonial_message: "Muito bom",
        testimonial_display: "primeiro",
      }),
      // Disse Não: mesmo com dado antigo na 28, não entra.
      resp({ testimonial_opt_in: "Não", testimonial_display: "completo" }),
    ];
    const s = summarizeQuestion(q("testimonial_display"), rows) as ChoiceSummary;
    expect(s.respondents).toBe(1);
    expect(
      (summarizeQuestion(q("testimonial_message"), rows) as TextSummary).respondents,
    ).toBe(1);
  });
});

describe("texto livre", () => {
  it("lista as respostas, mais recentes primeiro, ignorando vazias", () => {
    const s = summarizeQuestion(q("suggestion"), [
      resp({ suggestion: "antiga" }, { updatedAt: "2026-10-01T00:00:00Z" }),
      resp({ suggestion: "  " }),
      resp({ suggestion: "nova" }, { updatedAt: "2026-10-05T00:00:00Z" }),
    ]) as TextSummary;
    expect(s.items.map((i) => i.text)).toEqual(["nova", "antiga"]);
  });
});

describe("indicadores, região e depoimentos", () => {
  it("KPIs", () => {
    const k = summarizeKpis([
      resp(
        { ease_score: 4, problem_fit: 5, pilot_interest: "Sim, quero", nps: 10 },
        { completedAt: "x" },
      ),
      resp({ ease_score: 2, problem_fit: 3, pilot_interest: "Talvez", nps: 5 }),
      resp({}),
    ]);
    expect(k).toMatchObject({
      total: 3,
      completed: 1,
      easeMean: 3,
      problemFitMean: 4,
      pilotYesPct: 50,
    });
    expect(k.completionPct).toBeCloseTo(33.33, 1);
    expect(k.nps.score).toBe(0);
  });

  it("região: % de quem corrigiu a sugestão do CEP", () => {
    const acc = summarizeRegionAccuracy([
      resp({ region: "Zona Sul", region_detected: "Zona Sul" }),
      resp({ region: "Centro", region_detected: "Zona Sul" }),
      resp({ region: "Centro", region_detected: null }), // sem sugestão: fora da conta
    ]);
    expect(acc).toEqual({ suggested: 2, corrected: 1, correctedPct: 50 });
  });

  it("depoimentos com a identificação escolhida", () => {
    const t = summarizeTestimonials([
      resp(
        {
          testimonial_opt_in: "Sim",
          testimonial_message: "Show!",
          testimonial_display: "nick",
          testimonial_nick: "Lord",
          testimonial_authorized: true,
        },
        { updatedAt: "2026-10-09T00:00:00Z" },
      ),
      resp({ testimonial_opt_in: "Não" }),
    ]);
    expect(t).toEqual([
      {
        message: "Show!",
        displayName: "Lord",
        authorized: true,
        date: "2026-10-09T00:00:00Z",
      },
    ]);
  });
});

describe("seções", () => {
  it("Abertura + 5 blocos, na ordem do formulário, sem o campo do nick", () => {
    const sections = surveySections();
    expect(sections.map((s) => s.title)).toEqual([
      "Abertura",
      "Bloco 1 – Percepção do negócio",
      "Bloco 2 – Preço e prazo",
      "Bloco 3 – Valor para as lojas",
      "Bloco 4 – Confiança, futuro e compromisso",
      "Bloco 5 – Mensagem para o site e as redes",
    ]);
    expect(sections[0].questions.map((x) => x.id)).toEqual([
      "region",
      "participation",
      "ease_score",
      "ease_reason",
    ]);
    const all = sections.flatMap((s) => s.questions.map((x) => x.id));
    expect(all).not.toContain("testimonial_nick");
    expect(all).toHaveLength(SURVEY_QUESTIONS.length - 1);
  });
});

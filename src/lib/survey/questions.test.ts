import { describe, expect, it } from "vitest";
import {
  SURVEY_QUESTIONS,
  SURVEY_STEPS,
  answerLabel,
  firstPendingStep,
  isOptionDisabled,
  isStepAnswered,
  isVisible,
  stepPayload,
  testimonialDisplayName,
  toggleMulti,
  type MultiQuestion,
  type SingleQuestion,
  type SurveyAnswers,
  type SurveyQuestion,
} from "@/lib/survey/questions";

const step = (id: string) => SURVEY_STEPS.find((s) => s.id === id)!;
const question = <T extends SurveyQuestion>(id: string) =>
  SURVEY_QUESTIONS.find((q) => q.id === id) as T;

describe("cadastro", () => {
  it("ids únicos e válidos para o banco", () => {
    const ids = SURVEY_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]{0,59}$/);
  });

  it("perguntas numeradas vão de 1 a 34, sem buraco", () => {
    const numbers = SURVEY_QUESTIONS.map((q) => q.number).filter(Boolean);
    expect(numbers).toEqual(Array.from({ length: 34 }, (_, i) => i + 1));
  });

  it("cada pergunta condicional aponta para uma pergunta que existe", () => {
    for (const q of SURVEY_QUESTIONS) {
      if (q.showIf) {
        expect(SURVEY_QUESTIONS.some((o) => o.id === q.showIf!.question)).toBe(true);
      }
    }
  });
});

describe("etapa respondida", () => {
  it("exige as obrigatórias e dispensa as opcionais", () => {
    const intro = step("como-funciona");
    expect(isStepAnswered(intro, {})).toBe(false);
    expect(isStepAnswered(intro, { participation: "real" })).toBe(false);
    // sem o motivo da nota (opcional) já basta
    expect(isStepAnswered(intro, { participation: "real", ease_score: 4 })).toBe(true);
  });

  it("nota 0 conta como resposta (NPS)", () => {
    const base: SurveyAnswers = {
      problem_fit: 3,
      top_values: ["Ganhar tempo"],
      vs_alternative: "Igual",
      will_use: "Talvez",
    };
    expect(isStepAnswered(step("bloco-1"), { ...base, nps: 0 })).toBe(true);
    expect(isStepAnswered(step("bloco-1"), base)).toBe(false);
  });

  it("33 e 34 só são exigidas se a 32 for Sim", () => {
    const b5 = step("bloco-6");
    expect(isStepAnswered(b5, { testimonial_opt_in: "Não" })).toBe(true);
    expect(isStepAnswered(b5, { testimonial_opt_in: "Sim" })).toBe(false);
    expect(
      isStepAnswered(b5, {
        testimonial_opt_in: "Sim",
        testimonial_message: "Muito bom!",
        testimonial_display: "primeiro",
      }),
    ).toBe(true);
  });

  it("escolher nick exige digitar o nick", () => {
    const base: SurveyAnswers = {
      testimonial_opt_in: "Sim",
      testimonial_message: "Show",
      testimonial_display: "nick",
    };
    const b5 = step("bloco-6");
    expect(isStepAnswered(b5, base)).toBe(false);
    expect(isStepAnswered(b5, { ...base, testimonial_nick: "  " })).toBe(false);
    expect(isStepAnswered(b5, { ...base, testimonial_nick: "Lord" })).toBe(true);
  });
});

describe("retomada", () => {
  const region = { region: "Zona Sul" };

  it("volta para a 1ª etapa incompleta e termina em SURVEY_STEPS.length", () => {
    expect(firstPendingStep({})).toBe(0);
    expect(firstPendingStep(region)).toBe(1);
    expect(firstPendingStep({ ...region, participation: "real", ease_score: 5 })).toBe(2);
    expect(
      firstPendingStep({
        ...region,
        participation: "real",
        ease_score: 5,
        problem_fit: 4,
      }),
    ).toBe(2);
  });

  it("quem começou antes da pergunta de região volta a ela, sem perder o que respondeu", () => {
    const legacy = { participation: "real", ease_score: 5 };
    expect(firstPendingStep(legacy)).toBe(0);
    const payload = stepPayload(step("confirmacao"), { ...legacy, region: "Centro" });
    expect(payload.region).toBe("Centro");
    expect(payload).not.toHaveProperty("participation"); // a etapa não reescreve as outras
    expect(firstPendingStep({ ...legacy, region: "Centro" })).toBe(2);
  });
});

describe("região", () => {
  const confirm = () => step("confirmacao");

  it("é a 1ª etapa e é obrigatória", () => {
    expect(SURVEY_STEPS[0].id).toBe("confirmacao");
    expect(isStepAnswered(confirm(), {})).toBe(false);
    expect(isStepAnswered(confirm(), { region: "Zona Oeste" })).toBe(true);
  });

  it("tem as 8 regiões da pesquisa mais 'Outra região'", () => {
    const labels =
      question("region").type === "single"
        ? (question("region") as SingleQuestion).options.map((o) => o.label)
        : [];
    expect(labels).toEqual([
      "Grande Tijuca",
      "Zona Norte",
      "Centro",
      "Zona Sul",
      "Zona Oeste",
      "Baixada Fluminense",
      "Niterói ou São Gonçalo",
      "Maricá ou Região dos Lagos",
      "Outra região",
    ]);
  });

  it("grava a região final, o que o CEP detectou e o CEP usado", () => {
    const payload = stepPayload(confirm(), {
      region: "Zona Sul",
      region_detected: "Grande Tijuca",
      region_zip: "20520-054",
    });
    expect(payload).toEqual({
      region: "Zona Sul",
      region_detected: "Grande Tijuca",
      region_zip: "20520-054",
    });
  });

  it("sem detecção, grava nulo no que o CEP não achou", () => {
    const payload = stepPayload(confirm(), { region: "Centro" });
    expect(payload.region_detected).toBeNull();
    expect(payload.region_zip).toBeNull();
  });
});

describe("stepPayload", () => {
  it("zera as condicionais ocultas e registra a autorização", () => {
    const payload = stepPayload(step("bloco-6"), {
      testimonial_opt_in: "Não",
      testimonial_message: "texto antigo",
      testimonial_display: "nick",
      testimonial_nick: "x",
    });
    expect(payload.testimonial_opt_in).toBe("Não");
    expect(payload.testimonial_message).toBeNull();
    expect(payload.testimonial_display).toBeNull();
    expect(payload.testimonial_nick).toBeNull();
    expect(payload.testimonial_authorized).toBe(false);
  });

  it("com Sim, grava a mensagem e a autorização", () => {
    const payload = stepPayload(step("bloco-6"), {
      testimonial_opt_in: "Sim",
      testimonial_message: "Valeu",
      testimonial_display: "completo",
    });
    expect(payload.testimonial_message).toBe("Valeu");
    expect(payload.testimonial_nick).toBeNull();
    expect(payload.testimonial_authorized).toBe(true);
  });
});

describe("múltipla escolha", () => {
  const top = question<MultiQuestion>("top_values"); // até 2
  const stores = question<MultiQuestion>("stores_would_buy"); // exclusiva "nenhuma"
  const services = question<MultiQuestion>("future_services"); // exclusiva "Nenhum"

  it("respeita o limite 'até N' e desmarcar libera", () => {
    let sel: string[] = [];
    sel = toggleMulti(top, sel, "Ganhar tempo");
    sel = toggleMulti(top, sel, "Saber o preço antes de pedir");
    expect(sel).toHaveLength(2);
    expect(toggleMulti(top, sel, "Gastar menos do que indo buscar")).toEqual(sel);
    expect(isOptionDisabled(top, sel, "Gastar menos do que indo buscar")).toBe(true);
    expect(isOptionDisabled(top, sel, "Ganhar tempo")).toBe(false);
    expect(toggleMulti(top, sel, "Ganhar tempo")).toEqual([
      "Saber o preço antes de pedir",
    ]);
  });

  it("'Nenhuma' limpa as lojas marcadas e bloqueia as demais", () => {
    let sel = ["Red", "Konklave"];
    sel = toggleMulti(stores, sel, "nenhuma");
    expect(sel).toEqual(["nenhuma"]);
    expect(isOptionDisabled(stores, sel, "Red")).toBe(true);
    expect(toggleMulti(stores, sel, "Red")).toEqual(["nenhuma"]);
    // desmarcar libera de novo
    sel = toggleMulti(stores, sel, "nenhuma");
    expect(sel).toEqual([]);
    expect(isOptionDisabled(stores, sel, "Red")).toBe(false);
  });

  it("'Nenhum' (serviços) também desmarca as outras e bloqueia", () => {
    let sel = ["Entrega em casa", "Plano mensal com entregas inclusas"];
    sel = toggleMulti(services, sel, "Nenhum");
    expect(sel).toEqual(["Nenhum"]);
    expect(isOptionDisabled(services, sel, "Entrega em casa")).toBe(true);
  });

  it("sem limite, marca quantas quiser", () => {
    const where = question<MultiQuestion>("where_buy");
    let sel: string[] = [];
    for (const o of where.options) sel = toggleMulti(where, sel, o.value);
    expect(sel).toHaveLength(where.options.length);
  });
});

describe("rótulos e identificação", () => {
  it("mostra o texto da opção, não o código", () => {
    const display = question("testimonial_display");
    expect(answerLabel(display, "primeiro")).toContain("Só o primeiro nome");
    expect(answerLabel(question("participation"), "real")).toBe(
      "Fiz um pedido real e retirei as cartas",
    );
    expect(answerLabel(question("stores_would_buy"), ["Red", "nenhuma"])).toBe(
      "Red, Nenhuma",
    );
    expect(answerLabel(question("nps"), 0)).toBe("0");
  });

  it("nome que aparece junto da mensagem", () => {
    const base: SurveyAnswers = { testimonial_opt_in: "Sim" };
    expect(
      testimonialDisplayName(
        { ...base, testimonial_display: "completo" },
        "Ana Maria Souza",
      ),
    ).toBe("Ana Maria Souza");
    expect(
      testimonialDisplayName(
        { ...base, testimonial_display: "primeiro" },
        "Ana Maria Souza",
      ),
    ).toBe("Ana");
    expect(
      testimonialDisplayName(
        { ...base, testimonial_display: "nick", testimonial_nick: " Lord_X " },
        "Ana",
      ),
    ).toBe("Lord_X");
    expect(
      testimonialDisplayName(
        { testimonial_opt_in: "Não", testimonial_display: "completo" },
        "Ana",
      ),
    ).toBe("");
  });
});

describe("bloco Simulação de Caso", () => {
  const sim = () => step("bloco-5");
  const base: SurveyAnswers = {
    sim_decision: "Com certeza faria o pedido pela T1 nessas condições.",
    sim_deadline: "O prazo é adequado; faria o pedido e retiraria nessa data.",
    sim_cost_effect: "Manteria todas as lojas e as cartas selecionadas.",
    sim_alternative: "Utilizaria outro serviço de entrega ou transporte.",
    sim_main_factor: "O preço total do serviço.",
  };

  it("fica entre o Bloco 4 e o mural, com as perguntas 26 a 31", () => {
    const ids = SURVEY_STEPS.map((s) => s.id);
    expect(ids.indexOf("bloco-4")).toBeLessThan(ids.indexOf("bloco-5"));
    expect(ids.indexOf("bloco-5")).toBeLessThan(ids.indexOf("bloco-6"));
    expect(sim().block).toBe(5);
    expect(sim().simulation).toBe(true);
    expect(sim().questions.map((q) => q.number)).toEqual([26, 27, 28, 29, 30, 31]);
    expect(step("bloco-6").block).toBe(6);
    expect(step("bloco-6").questions.map((q) => q.number)).toEqual([
      32,
      33,
      34,
      undefined,
    ]);
  });

  it("a 31 só aparece para quem não tem certeza ou não faria o pedido", () => {
    const q31 = question("sim_what_change");
    const shows = (decision: string) =>
      isVisible(q31, { ...base, sim_decision: decision });
    expect(shows("Com certeza faria o pedido pela T1 nessas condições.")).toBe(false);
    expect(shows("Provavelmente faria o pedido pela T1.")).toBe(false);
    expect(shows("Ainda não tenho certeza.")).toBe(true);
    expect(shows("Provavelmente não faria o pedido pela T1.")).toBe(true);
    expect(shows("Com certeza não faria o pedido pela T1.")).toBe(true);
  });

  it("quem faria o pedido conclui o bloco sem a 31; quem não tem certeza precisa dela", () => {
    expect(isStepAnswered(sim(), base)).toBe(true);
    const unsure = { ...base, sim_decision: "Ainda não tenho certeza." };
    expect(isStepAnswered(sim(), unsure)).toBe(false);
    expect(
      isStepAnswered(sim(), {
        ...unsure,
        sim_what_change: ["Um preço menor pelo serviço."],
      }),
    ).toBe(true);
  });

  it("a 31 é até 2 escolhas e 'Mesmo com essas mudanças…' é uma opção comum", () => {
    const q31 = question<MultiQuestion>("sim_what_change");
    expect(q31.max).toBe(2);
    expect(q31.options).toHaveLength(7);
    let sel: string[] = [];
    for (const o of q31.options.slice(0, 3)) sel = toggleMulti(q31, sel, o.value);
    expect(sel).toHaveLength(2);
  });

  it("grava a 31 como nula quando oculta e leva os dados exibidos na tela", () => {
    const payload = stepPayload(sim(), {
      ...base,
      sim_what_change: ["Um preço menor pelo serviço."],
      sim_stores: 3,
      sim_total_brl: 18,
      sim_order_at: "2026-10-19T13:00:00.000Z",
      sim_collect_date: "2026-10-19",
      sim_pickup_date: "2026-10-21",
    });
    expect(payload.sim_what_change).toBeNull();
    expect(payload).toMatchObject({
      sim_stores: 3,
      sim_total_brl: 18,
      sim_collect_date: "2026-10-19",
      sim_pickup_date: "2026-10-21",
    });
  });

  it("o texto do custo usa os preços da pesquisa", () => {
    expect(question("sim_cost_effect").label).toContain("R$ 12,00 pela primeira loja");
    expect(question("sim_cost_effect").label).toContain(
      "R$ 3,00 por cada loja adicional",
    );
  });

  it("quem já concluiu tudo menos este bloco volta a ele (e só a ele)", () => {
    const answered: SurveyAnswers = {};
    for (const s of SURVEY_STEPS) {
      if (s.id === "bloco-5") continue;
      for (const q of s.questions) {
        if (q.type === "single") answered[q.id] = q.options[0].value;
        else if (q.type === "multi") answered[q.id] = [q.options[0].value];
        else if (q.type === "scale") answered[q.id] = q.min;
        else answered[q.id] = "texto";
      }
    }
    answered.testimonial_opt_in = "Não";
    expect(firstPendingStep(answered)).toBe(
      SURVEY_STEPS.findIndex((s) => s.id === "bloco-5"),
    );
  });
});

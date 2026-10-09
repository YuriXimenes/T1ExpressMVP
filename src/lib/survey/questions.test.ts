import { describe, expect, it } from "vitest";
import {
  SURVEY_QUESTIONS,
  SURVEY_STEPS,
  answerLabel,
  firstPendingStep,
  isOptionDisabled,
  isStepAnswered,
  stepPayload,
  testimonialDisplayName,
  toggleMulti,
  type MultiQuestion,
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

  it("perguntas numeradas vão de 1 a 28, sem buraco", () => {
    const numbers = SURVEY_QUESTIONS.map((q) => q.number).filter(Boolean);
    expect(numbers).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
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

  it("27 e 28 só são exigidas se a 26 for Sim", () => {
    const b5 = step("bloco-5");
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
    const b5 = step("bloco-5");
    expect(isStepAnswered(b5, base)).toBe(false);
    expect(isStepAnswered(b5, { ...base, testimonial_nick: "  " })).toBe(false);
    expect(isStepAnswered(b5, { ...base, testimonial_nick: "Lord" })).toBe(true);
  });
});

describe("retomada", () => {
  it("volta para a 1ª etapa incompleta e termina em SURVEY_STEPS.length", () => {
    expect(firstPendingStep({})).toBe(0);
    expect(firstPendingStep({ participation: "real", ease_score: 5 })).toBe(1);
    expect(
      firstPendingStep({ participation: "real", ease_score: 5, problem_fit: 4 }),
    ).toBe(1);
  });
});

describe("stepPayload", () => {
  it("zera as condicionais ocultas e registra a autorização", () => {
    const payload = stepPayload(step("bloco-5"), {
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
    const payload = stepPayload(step("bloco-5"), {
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

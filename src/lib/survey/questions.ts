import { REGIONS } from "@/lib/survey/regions";
import { SIMULATION_ANSWER_KEYS, SIMULATION_PRICE, brl } from "@/lib/survey/simulation";

/**
 * Cadastro da pesquisa de mercado. Incluir ou mudar uma pergunta é só editar
 * este arquivo: o formulário (/pesquisa), a tabela do admin e o CSV leem daqui.
 * As respostas ficam em `survey_responses.answers`, uma chave por pergunta.
 */

export type SurveyAnswerValue = string | number | boolean | string[] | null;
export type SurveyAnswers = Record<string, SurveyAnswerValue>;

export interface SurveyOption {
  value: string;
  label: string;
}

interface BaseQuestion {
  /** Chave em `answers` — minúsculas, números e "_" (o banco valida). */
  id: string;
  /** Texto da pergunta (também é o título da coluna no admin/CSV). */
  label: string;
  /** Número mostrado ao lado da pergunta (só as dos blocos são numeradas). */
  number?: number;
  /** Dica curta abaixo do texto da pergunta. */
  hint?: string;
  /** Obrigatória por padrão; `false` para as "(Opcional)". */
  required?: boolean;
  /** Só aparece (e só é exigida) quando outra resposta tem este valor. */
  showIf?: { question: string; equals?: string; oneOf?: string[] };
}

export interface SingleQuestion extends BaseQuestion {
  type: "single";
  options: SurveyOption[];
}

export interface MultiQuestion extends BaseQuestion {
  type: "multi";
  options: SurveyOption[];
  /** "Escolha até N". */
  max?: number;
  /** Opção que desmarca e bloqueia todas as outras (ex.: "Nenhuma"). */
  exclusive?: { value: string; hint?: string };
  /** Opções vindas do catálogo, antes das fixas. */
  optionsFrom?: "stores";
}

export interface ScaleQuestion extends BaseQuestion {
  type: "scale";
  min: number;
  max: number;
  minLabel: string;
  maxLabel: string;
}

export interface TextQuestion extends BaseQuestion {
  type: "text";
  maxLength: number;
  placeholder?: string;
  rows?: number;
}

export type SurveyQuestion =
  SingleQuestion | MultiQuestion | ScaleQuestion | TextQuestion;

export interface SurveyStep {
  id: string;
  /** "Bloco 1 de 5" aparece só nos blocos. */
  block?: number;
  title?: string;
  subtitle?: string;
  questions: SurveyQuestion[];
  /** Texto exibido abaixo das perguntas (ex.: autorização de publicação). */
  footnote?: string;
  /** Respostas calculadas ao salvar a etapa (ex.: autorização registrada). */
  derive?: (answers: SurveyAnswers) => SurveyAnswers;
  /** Chaves gravadas junto da etapa que não são perguntas (ex.: região detectada pelo CEP). */
  extraKeys?: string[];
  /** Mostra o resumo do 1º pedido com preço e prazo antes das perguntas. */
  simulation?: boolean;
}

const single = (
  id: string,
  label: string,
  options: (string | [string, string])[],
  extra: Partial<BaseQuestion> = {},
): SingleQuestion => ({
  id,
  label,
  type: "single",
  options: options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : { value: o[0], label: o[1] },
  ),
  ...extra,
});

const multi = (
  id: string,
  label: string,
  options: string[],
  extra: Partial<Omit<MultiQuestion, "id" | "label" | "type" | "options">> = {},
): MultiQuestion => ({
  id,
  label,
  type: "multi",
  options: options.map((o) => ({ value: o, label: o })),
  ...extra,
});

const scale = (
  id: string,
  label: string,
  min: number,
  max: number,
  minLabel: string,
  maxLabel: string,
  extra: Partial<BaseQuestion> = {},
): ScaleQuestion => ({
  id,
  label,
  type: "scale",
  min,
  max,
  minLabel,
  maxLabel,
  ...extra,
});

export const PARTICIPATION_QUESTION: SingleQuestion = {
  id: "participation",
  label: "Como você participou do teste?",
  type: "single",
  options: [
    { value: "real", label: "Fiz um pedido real e retirei as cartas" },
    { value: "simulado", label: "Fiz um pedido simulado na plataforma" },
  ],
};

export const REGION_QUESTION: SingleQuestion = {
  id: "region",
  label: "Em qual região do Rio de Janeiro você mora?",
  type: "single",
  options: REGIONS.map((r) => ({ value: r, label: r })),
};

export const NO_STORE = "nenhuma";

export const TESTIMONIAL_NAME_CHOICES: SurveyOption[] = [
  {
    value: "completo",
    label: "Nome e sobrenome (exibe o nome que está cadastrado na plataforma)",
  },
  {
    value: "primeiro",
    label: "Só o primeiro nome (exibe o 1º nome que está cadastrado na plataforma)",
  },
  { value: "nick", label: "Meu nick" },
];

export const TESTIMONIAL_AUTHORIZATION =
  "Ao enviar, você autoriza a T1 Express a publicar sua mensagem no site e nas redes sociais, com a identificação escolhida. Você pode pedir a remoção quando quiser.";

export const SURVEY_CLOSING =
  "Valeu demais! Você está entre os primeiros jogadores a testar a T1 Express.";

export const SIM_DECISION_OPTIONS = [
  "Com certeza faria o pedido pela T1 nessas condições.",
  "Provavelmente faria o pedido pela T1.",
  "Ainda não tenho certeza.",
  "Provavelmente não faria o pedido pela T1.",
  "Com certeza não faria o pedido pela T1.",
];

/** Quem responde isso na 26 vê a 31 ("o que precisaria mudar"). */
export const SIM_DECISION_NEGATIVE = SIM_DECISION_OPTIONS.slice(2);

/** Etapas na ordem do formulário (depois da confirmação do pedido). */
export const SURVEY_STEPS: SurveyStep[] = [
  {
    // Tela de confirmação do 1º pedido, com a região (detectada pelo CEP).
    id: "confirmacao",
    questions: [REGION_QUESTION],
    extraKeys: ["region_detected", "region_zip"],
  },
  {
    id: "como-funciona",
    questions: [
      PARTICIPATION_QUESTION,
      scale(
        "ease_score",
        "De 1 a 5, quão fácil foi fazer o pedido na plataforma?",
        1,
        5,
        "1 = muito difícil",
        "5 = muito fácil",
      ),
      {
        id: "ease_reason",
        label: "Se quiser, conte o motivo da sua nota.",
        type: "text",
        required: false,
        maxLength: 1000,
        rows: 3,
        placeholder: "Opcional",
      },
    ],
  },
  {
    id: "bloco-1",
    block: 1,
    title: "Percepção do negócio",
    subtitle: "Queremos entender se a T1 resolve um problema de verdade para você.",
    questions: [
      scale(
        "problem_fit",
        "Depois de conhecer como a T1 Express funciona, o quanto ela resolve um problema real seu?",
        1,
        5,
        "1 = não resolve nada",
        "5 = resolve totalmente",
        { number: 1 },
      ),
      multi(
        "top_values",
        "O que mais gera valor para você na T1 Express?",
        [
          "Comprar em lojas distantes sem me deslocar",
          "Juntar compras de várias lojas em uma entrega só",
          "Ganhar tempo",
          "Gastar menos do que indo buscar",
          "Ter acesso a mais cartas e melhores preços",
          "Saber o preço antes de pedir",
        ],
        { number: 2, max: 2 },
      ),
      single(
        "vs_alternative",
        "Comparada ao que você faz hoje quando não pode buscar uma compra (pedir a um amigo, Uber Flash ou 99, Correios), a T1 é:",
        [
          "Muito melhor",
          "Melhor",
          "Igual",
          "Pior",
          "Não tenho uma alternativa porque normalmente não faço esse tipo de compra",
        ],
        { number: 3 },
      ),
      single(
        "will_use",
        "Quando a T1 Express for lançada, você pretende usar?",
        [
          "Sim, já no primeiro mês",
          "Sim, quando surgir uma compra que precise",
          "Talvez",
          "Provavelmente não",
          "Não",
        ],
        { number: 4 },
      ),
      scale(
        "nps",
        "De 0 a 10, qual a chance de você indicar a T1 Express a um amigo que joga TCG?",
        0,
        10,
        "0 = nenhuma chance",
        "10 = com certeza",
        { number: 5 },
      ),
    ],
  },
  {
    id: "bloco-2",
    block: 2,
    title: "Preço e prazo",
    subtitle:
      "A T1 cobra um valor pela 1ª loja do pedido e um valor menor por cada loja adicional. O pedido é sempre entregue na loja parceira que você escolher.",
    questions: [
      single(
        "stores_per_order",
        "Normalmente, em quantas lojas diferentes estariam as cartas de um pedido seu?",
        ["1", "2", "3", "4 ou mais"],
        { number: 6 },
      ),
      single(
        "fair_first_store",
        "Qual valor você considera justo pela 1ª loja do pedido?",
        [
          "Até R$8",
          "R$9 a R$11",
          "R$12 a R$14",
          "R$15 a R$17",
          "R$18 a R$20",
          "Mais de R$20",
        ],
        { number: 7 },
      ),
      single(
        "churn_first_store",
        "A partir de qual valor pela 1ª loja você deixaria de usar a T1?",
        [
          "A partir de R$10",
          "A partir de R$12",
          "A partir de R$15",
          "A partir de R$18",
          "A partir de R$20",
          "A partir de R$25",
        ],
        { number: 8 },
      ),
      single(
        "fair_extra_store",
        "Qual valor você considera justo por cada loja adicional no mesmo pedido?",
        ["Até R$2", "R$3 a R$4", "R$5 a R$6", "R$7 a R$10", "Mais de R$10"],
        { number: 9 },
      ),
      single(
        "max_wait",
        "Para manter o preço baixo, a T1 trabalha com entrega programada. Até quanto tempo você aceitaria esperar para retirar, a partir do pedido?",
        [
          "Só usaria com entrega no mesmo dia",
          "Até o dia seguinte",
          "Até 2 dias",
          "Até 3 ou 4 dias",
          "O prazo não importa se chegar no dia em que vou à loja",
        ],
        { number: 10 },
      ),
      single(
        "orders_per_month",
        "Com a T1 disponível, quantos pedidos você faria por mês, em média?",
        ["Menos de 1", "1", "2 a 3", "4 ou mais"],
        { number: 11 },
      ),
    ],
  },
  {
    id: "bloco-3",
    block: 3,
    title: "Valor para as lojas",
    subtitle: "Como a T1 pode mudar a sua relação com as lojas onde você compra.",
    questions: [
      multi(
        "where_buy",
        "Por onde você normalmente encontra e compra cartas avulsas?",
        [
          "Liga (LigaMagic, LigaPokémon e similares)",
          "Site próprio da loja",
          "WhatsApp ou Instagram da loja",
          "Presencialmente na loja",
          "Grupos e comunidades de jogadores",
        ],
        { number: 12 },
      ),
      single(
        "monthly_spend",
        "Hoje, quanto você gasta por mês com cartas avulsas, somando lojas e outros jogadores?",
        ["Até R$50", "R$51 a R$150", "R$151 a R$300", "R$301 a R$600", "Mais de R$600"],
        { number: 13 },
      ),
      single(
        "skipped_purchases",
        "Nos últimos 3 meses, quantas compras você deixou de fazer por causa da distância ou do deslocamento até a loja?",
        ["Nenhuma", "1", "2 a 3", "4 ou mais"],
        { number: 14 },
      ),
      single(
        "spend_change",
        "Com a T1 disponível, seu gasto mensal com cartas tenderia a:",
        ["Aumentar bastante", "Aumentar um pouco", "Ficar igual", "Diminuir"],
        { number: 15 },
      ),
      single(
        "delivery_behavior",
        "Como a entrega é cobrada por loja e não por carta, num pedido pela T1 você tenderia a:",
        [
          "Juntar mais cartas para aproveitar a mesma entrega",
          "Comprar só o que já compraria",
          "Comprar menos",
        ],
        { number: 16 },
      ),
      {
        id: "stores_would_buy",
        label:
          "Em quais dessas lojas você compraria mais, ou passaria a comprar, se a T1 buscasse para você?",
        type: "multi",
        number: 17,
        optionsFrom: "stores",
        options: [{ value: NO_STORE, label: "Nenhuma" }],
        exclusive: {
          value: NO_STORE,
          hint: "Você indicou que não cogitaria comprar em nenhuma outra loja.",
        },
      },
      single(
        "prefer_t1_store",
        "Na hora de escolher onde comprar, você daria preferência a uma loja atendida pela T1?",
        ["Sim, com certeza", "Provavelmente sim", "Seria indiferente", "Não"],
        { number: 18 },
      ),
      single(
        "partner_perception",
        "Saber que uma loja é parceira da T1 mudaria a sua percepção sobre ela?",
        ["Melhoraria muito", "Melhoraria um pouco", "Não mudaria", "Pioraria"],
        { number: 19 },
      ),
      multi(
        "pickup_activity",
        "Ao retirar um pedido na loja parceira, o que mais você provavelmente faria lá?",
        [
          "Compraria boosters, selados ou acessórios",
          "Compraria cartas avulsas da própria loja",
          "Jogaria ou participaria de um evento",
          "Só retiraria o pedido",
        ],
        { number: 20 },
      ),
    ],
  },
  {
    id: "bloco-4",
    block: 4,
    title: "Confiança, futuro e compromisso",
    subtitle: "O que te faria confiar na T1 e o que você gostaria de ver no futuro.",
    questions: [
      multi(
        "blockers",
        "O que mais poderia te impedir de usar a T1?",
        [
          "O preço",
          "O prazo de entrega",
          "Medo de perda ou dano das cartas",
          "Ainda não conhecer a empresa",
          "Prefiro buscar pessoalmente",
          "As lojas onde compro não serem atendidas",
          "Não ter uma loja parceira perto de mim",
        ],
        { number: 21, max: 2 },
      ),
      multi(
        "trust_boosters",
        "O que mais aumentaria sua confiança para entregar suas compras à T1?",
        [
          "Seguro com reembolso em caso de perda ou dano",
          "Acompanhar cada etapa do pedido pelo WhatsApp",
          "Fotos do pedido na coleta e na entrega",
          "Embalagem própria para cartas (sleeve e toploader)",
          "Lojas conhecidas como parceiras da T1",
          "Avaliações de outros jogadores",
          "Empresa formalizada, com CNPJ e nota fiscal",
          "Atendimento humano pelo WhatsApp",
        ],
        { number: 22, max: 3 },
      ),
      multi(
        "future_services",
        "Quais destes serviços você usaria no futuro?",
        [
          "Entrega em casa",
          "Compra protegida entre jogadores: o vendedor só recebe depois que você recebe as cartas",
          "Enviar cartas para outro jogador deixando o pacote numa loja parceira",
          "Programa de fidelidade com fretes grátis",
          "Plano mensal com entregas inclusas",
          "Entregas para outras cidades, como São Paulo",
          "Nenhum",
        ],
        { number: 23, exclusive: { value: "Nenhum" } },
      ),
      single(
        "pilot_interest",
        "Você quer continuar no piloto, fazendo pedidos reais e pagos nas próximas semanas?",
        ["Sim, quero", "Talvez", "Não"],
        { number: 24 },
      ),
      {
        id: "suggestion",
        label: "Se pudesse mudar ou acrescentar uma coisa na T1, o que seria?",
        type: "text",
        number: 25,
        required: false,
        maxLength: 1000,
        rows: 4,
        placeholder: "Opcional",
      },
    ],
  },
  {
    id: "bloco-5",
    block: 5,
    title: "Simulação de Caso",
    subtitle:
      "Agora que você conhece a plataforma, vamos considerar o seu pedido e as condições do serviço para entender se essa seria uma opção interessante para você.",
    simulation: true,
    extraKeys: [...SIMULATION_ANSWER_KEYS],
    questions: [
      single(
        "sim_decision",
        "Considerando exatamente esse pedido, o preço total do serviço e a data prevista para retirada, se fosse uma compra real, qual seria sua decisão?",
        SIM_DECISION_OPTIONS,
        { number: 26 },
      ),
      single(
        "sim_deadline",
        "Considerando a data que seu pedido estará disponível para retirada, como você avalia esse prazo?",
        [
          "O prazo é adequado; faria o pedido e retiraria nessa data.",
          "O prazo é um pouco longo, mas ainda aceitaria esperar.",
          "Só aceitaria esse prazo se as cartas não fossem urgentes.",
          "O prazo é longo demais; procuraria outra alternativa para conseguir as cartas.",
          "O prazo é longo demais; desistiria da compra.",
        ],
        { number: 27 },
      ),
      single(
        "sim_cost_effect",
        `Sabendo que o serviço custa ${brl(SIMULATION_PRICE.firstStoreBRL)} pela primeira loja e ${brl(SIMULATION_PRICE.extraStoreBRL)} por cada loja adicional, como esse custo influenciaria a forma de montar seu pedido?`,
        [
          "Manteria todas as lojas e as cartas selecionadas.",
          "Tentaria concentrar as compras em menos lojas para pagar menos pelo serviço.",
          "Retiraria algumas cartas do pedido para reduzir o custo total.",
          "Faria o pedido pela T1 apenas se o preço fosse menor.",
          "Preferiria buscar as cartas pessoalmente ou utilizar outra alternativa.",
          "Desistiria deste pedido.",
        ],
        { number: 28 },
      ),
      single(
        "sim_alternative",
        "Se a T1 Express não estivesse disponível para esse pedido, o que você provavelmente faria?",
        [
          "Iria pessoalmente às lojas para buscar as cartas.",
          "Utilizaria outro serviço de entrega ou transporte.",
          "Compraria apenas em algumas das lojas e reduziria o pedido.",
          "Adiaria a compra até conseguir buscar as cartas.",
          "Desistiria de parte ou de toda a compra.",
          "Não faria essa compra de qualquer forma.",
          "Outra situação.",
        ],
        { number: 29 },
      ),
      single(
        "sim_main_factor",
        "Qual fator mais influenciou sua decisão sobre esse pedido?",
        [
          "O preço total do serviço.",
          "A data prevista para retirada.",
          "Poder reunir compras de várias lojas em uma única entrega.",
          "A localização da loja escolhida para retirada.",
          "A confiança e a segurança no transporte das cartas.",
          "Eu normalmente buscaria as cartas pessoalmente.",
          "O pedido simulado não representa uma compra que eu faria.",
          "Outro fator.",
        ],
        { number: 30 },
      ),
      multi(
        "sim_what_change",
        "O que precisaria mudar para que você considerasse fazer esse pedido pela T1 Express?",
        [
          "Um preço menor pelo serviço.",
          "Uma data de retirada mais próxima.",
          "Outra loja parceira para retirar as cartas.",
          "Mais garantias em caso de perda ou dano.",
          "Mais informações sobre o acompanhamento do pedido.",
          "Outra condição.",
          "Mesmo com essas mudanças, eu não utilizaria a T1 para esse pedido.",
        ],
        {
          number: 31,
          max: 2,
          // Só para quem não topou, ou não tem certeza, na pergunta 26.
          showIf: { question: "sim_decision", oneOf: SIM_DECISION_NEGATIVE },
        },
      ),
    ],
  },
  {
    id: "bloco-6",
    block: 6,
    title: "Mensagem para o site e as redes",
    subtitle: "Um espaço para os jogadores que confiaram na T1 desde o início.",
    questions: [
      single(
        "testimonial_opt_in",
        "Você gostaria de deixar uma mensagem para aparecer no site e nas redes da T1 Express, no espaço dos jogadores que confiaram na T1 desde o início?",
        ["Sim", "Não"],
        { number: 32 },
      ),
      {
        id: "testimonial_message",
        label: "Escreva sua mensagem.",
        type: "text",
        number: 33,
        maxLength: 280,
        rows: 4,
        showIf: { question: "testimonial_opt_in", equals: "Sim" },
      },
      {
        id: "testimonial_display",
        label: "Como você quer aparecer junto da mensagem?",
        type: "single",
        number: 34,
        options: TESTIMONIAL_NAME_CHOICES,
        showIf: { question: "testimonial_opt_in", equals: "Sim" },
      },
      {
        id: "testimonial_nick",
        label: "Qual nick você quer que apareça?",
        type: "text",
        maxLength: 40,
        rows: 1,
        placeholder: "Seu nick",
        showIf: { question: "testimonial_display", equals: "nick" },
      },
    ],
    footnote: TESTIMONIAL_AUTHORIZATION,
    // Registra que a pessoa viu e aceitou a autorização ao enviar com "Sim".
    derive: (answers) => ({
      testimonial_authorized: answers.testimonial_opt_in === "Sim",
    }),
  },
];

export const SURVEY_QUESTIONS: SurveyQuestion[] = SURVEY_STEPS.flatMap(
  (s) => s.questions,
);

/** A última pergunta existe: o fim do formulário marca a resposta como concluída. */
export const SURVEY_IS_FINAL = true;

// ---------------------------------------------------------------------------
// Regras (puras, testadas em questions.test.ts)
// ---------------------------------------------------------------------------

/** A pergunta aparece? (as condicionais dependem de outra resposta) */
export function isVisible(q: SurveyQuestion, answers: SurveyAnswers): boolean {
  if (!q.showIf) return true;
  // Também precisa de a pergunta-mãe estar visível (nick só se a 28 aparece).
  const parent = SURVEY_QUESTIONS.find((p) => p.id === q.showIf!.question);
  if (parent && !isVisible(parent, answers)) return false;
  const parentAnswer = answers[q.showIf.question];
  if (q.showIf.oneOf) {
    return typeof parentAnswer === "string" && q.showIf.oneOf.includes(parentAnswer);
  }
  return parentAnswer === q.showIf.equals;
}

export function visibleQuestions(step: SurveyStep, answers: SurveyAnswers) {
  return step.questions.filter((q) => isVisible(q, answers));
}

function isAnswered(q: SurveyQuestion, answers: SurveyAnswers) {
  const v = answers[q.id];
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function isStepAnswered(step: SurveyStep, answers: SurveyAnswers) {
  return visibleQuestions(step, answers).every(
    (q) => q.required === false || isAnswered(q, answers),
  );
}

/** Índice da 1ª etapa ainda não respondida; `SURVEY_STEPS.length` se respondeu tudo. */
export function firstPendingStep(answers: SurveyAnswers) {
  const i = SURVEY_STEPS.findIndex((s) => !isStepAnswered(s, answers));
  return i === -1 ? SURVEY_STEPS.length : i;
}

/** O que gravar ao concluir a etapa: só perguntas visíveis (as ocultas voltam a vazio). */
export function stepPayload(step: SurveyStep, answers: SurveyAnswers): SurveyAnswers {
  const payload: SurveyAnswers = {};
  for (const q of step.questions) {
    const v = answers[q.id];
    payload[q.id] = isVisible(q, answers) && v !== undefined ? v : null;
  }
  for (const key of step.extraKeys ?? []) {
    payload[key] = answers[key] === undefined ? null : answers[key];
  }
  return { ...payload, ...(step.derive?.(answers) ?? {}) };
}

/**
 * Marca/desmarca uma opção de múltipla escolha, respeitando o limite ("até N")
 * e a opção exclusiva ("Nenhuma": limpa as outras e bloqueia as demais).
 */
export function toggleMulti(
  q: MultiQuestion,
  current: string[],
  value: string,
): string[] {
  if (current.includes(value)) return current.filter((v) => v !== value);
  if (q.exclusive?.value === value) return [value];
  if (q.exclusive && current.includes(q.exclusive.value)) return current;
  if (q.max !== undefined && current.length >= q.max) return current;
  return [...current, value];
}

/** Opção desabilitada na tela (limite atingido ou exclusiva marcada). */
export function isOptionDisabled(
  q: MultiQuestion,
  current: string[],
  value: string,
): boolean {
  if (current.includes(value)) return false;
  if (q.exclusive && current.includes(q.exclusive.value)) return true;
  return q.max !== undefined && q.exclusive?.value !== value && current.length >= q.max;
}

/** Texto legível de uma resposta (admin e CSV mostram o rótulo, não o código). */
export function answerLabel(
  q: SurveyQuestion,
  value: SurveyAnswerValue | undefined,
): string {
  if (value === undefined || value === null) return "";
  const options = "options" in q ? q.options : [];
  const toLabel = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map(toLabel).join(", ");
  if (typeof value === "string") return toLabel(value);
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

/** Nome que aparece junto da mensagem para o site (pergunta 28). */
export function testimonialDisplayName(
  answers: SurveyAnswers,
  registeredName: string,
): string {
  if (answers.testimonial_opt_in !== "Sim") return "";
  switch (answers.testimonial_display) {
    case "completo":
      return registeredName.trim();
    case "primeiro":
      return registeredName.trim().split(/\s+/)[0] ?? "";
    case "nick":
      return typeof answers.testimonial_nick === "string"
        ? answers.testimonial_nick.trim()
        : "";
    default:
      return "";
  }
}

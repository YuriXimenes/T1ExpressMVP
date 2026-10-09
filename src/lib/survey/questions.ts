/**
 * Cadastro da pesquisa de mercado. Incluir uma pergunta é só editar este
 * arquivo: o formulário (/pesquisa), a tabela do admin e o CSV leem daqui.
 * As respostas ficam em `survey_responses.answers` com a chave `id`.
 */

export type SurveyAnswerValue = string | number | boolean | string[] | null;
export type SurveyAnswers = Record<string, SurveyAnswerValue>;

export interface SurveyOption {
  value: string;
  label: string;
}

export interface SurveyQuestion {
  /** Chave em `answers` — minúsculas, números e "_" (o banco valida). */
  id: string;
  /** Texto da pergunta (também é o título da coluna no admin/CSV). */
  label: string;
  type: "single";
  options: SurveyOption[];
  required: boolean;
}

export interface SurveyStep {
  id: string;
  questions: SurveyQuestion[];
}

export const PARTICIPATION_QUESTION: SurveyQuestion = {
  id: "participation",
  label: "Como você participou do teste?",
  type: "single",
  required: true,
  options: [
    { value: "real", label: "Fiz um pedido real e retirei as cartas" },
    { value: "simulado", label: "Fiz um pedido simulado na plataforma" },
  ],
};

/** Etapas com perguntas, na ordem do formulário (depois da confirmação do pedido). */
export const SURVEY_STEPS: SurveyStep[] = [
  { id: "como-funciona", questions: [PARTICIPATION_QUESTION] },
];

export const SURVEY_QUESTIONS: SurveyQuestion[] = SURVEY_STEPS.flatMap(
  (s) => s.questions,
);

/**
 * Quando a última pergunta da pesquisa existir, isto vira `true` e o fim do
 * formulário passa a marcar a resposta como concluída (`complete_survey`).
 */
export const SURVEY_IS_FINAL = false;

function isAnswered(q: SurveyQuestion, answers: SurveyAnswers) {
  const v = answers[q.id];
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function isStepAnswered(step: SurveyStep, answers: SurveyAnswers) {
  return step.questions.every((q) => !q.required || isAnswered(q, answers));
}

/** Índice da 1ª etapa ainda não respondida; `SURVEY_STEPS.length` se respondeu tudo. */
export function firstPendingStep(answers: SurveyAnswers) {
  const i = SURVEY_STEPS.findIndex((s) => !isStepAnswered(s, answers));
  return i === -1 ? SURVEY_STEPS.length : i;
}

/** Texto legível de uma resposta (admin e CSV mostram o rótulo, não o código). */
export function answerLabel(
  q: SurveyQuestion,
  value: SurveyAnswerValue | undefined,
): string {
  if (value === undefined || value === null) return "";
  const toLabel = (v: string) => q.options.find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map(toLabel).join(", ");
  if (typeof value === "string") return toLabel(value);
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

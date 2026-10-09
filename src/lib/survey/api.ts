import { createBrowserClient } from "@/lib/supabase/client";
import type { SurveyAnswers } from "@/lib/survey/questions";

export class SurveyError extends Error {}

/** Resposta da pesquisa como gravada no banco (o retrato do pedido vem do servidor). */
export interface SurveyResponse {
  id: string;
  userId: string;
  respondentName: string;
  respondentEmail: string;
  orderId?: string;
  orderCode: string;
  collectStores: string;
  pickupStore: string;
  orderItems: string;
  itemsTotalBRL: number;
  amountPaidBRL: number;
  answers: SurveyAnswers;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface SurveyResponseRow {
  id: string;
  user_id: string;
  respondent_name: string;
  respondent_email: string;
  order_id: string | null;
  order_code: string;
  collect_stores: string;
  pickup_store: string;
  order_items: string;
  items_total_brl: number | string;
  amount_paid_brl: number | string;
  answers: SurveyAnswers | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

export const SURVEY_SELECT =
  "id, user_id, respondent_name, respondent_email, order_id, order_code, collect_stores, pickup_store, order_items, items_total_brl, amount_paid_brl, answers, started_at, updated_at, completed_at";

export function mapSurveyResponse(row: SurveyResponseRow): SurveyResponse {
  return {
    id: row.id,
    userId: row.user_id,
    respondentName: row.respondent_name,
    respondentEmail: row.respondent_email,
    orderId: row.order_id ?? undefined,
    orderCode: row.order_code,
    collectStores: row.collect_stores,
    pickupStore: row.pickup_store,
    orderItems: row.order_items,
    itemsTotalBRL: Number(row.items_total_brl),
    amountPaidBRL: Number(row.amount_paid_brl),
    answers: row.answers ?? {},
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  };
}

function friendly(error: { code?: string; message: string }) {
  return new SurveyError(
    error.code === "P0001" ? error.message : "Não foi possível salvar. Tente novamente.",
  );
}

/**
 * A resposta do usuário logado, ou null se ainda não começou. Filtra pelo
 * próprio id (um admin enxerga todas as linhas pela RLS).
 */
export async function fetchMySurvey(): Promise<SurveyResponse | null> {
  const supabase = createBrowserClient();
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new SurveyError("Sua sessão expirou. Entre novamente.");
  const { data, error } = await supabase
    .from("survey_responses" as never)
    .select(SURVEY_SELECT)
    .eq("user_id", userId)
    .maybeSingle<SurveyResponseRow>();
  if (error) throw new SurveyError("Não foi possível carregar a pesquisa.");
  return data ? mapSurveyResponse(data) : null;
}

/** Confirma o 1º pedido e cria a resposta (o banco tira o retrato do pedido). */
export async function startSurvey(): Promise<void> {
  const { error } = await createBrowserClient().rpc("start_survey" as never);
  if (error) throw friendly(error);
}

export async function saveSurveyAnswers(answers: SurveyAnswers): Promise<void> {
  const { error } = await createBrowserClient().rpc(
    "save_survey_answers" as never,
    { p: answers } as never,
  );
  if (error) throw friendly(error);
}

export async function completeSurvey(): Promise<void> {
  const { error } = await createBrowserClient().rpc("complete_survey" as never);
  if (error) throw friendly(error);
}

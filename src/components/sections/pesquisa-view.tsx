"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardList, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OrderItemsBreakdown } from "@/components/sections/order-items-breakdown";
import { Price } from "@/components/shared/price";
import { useAuth } from "@/lib/auth";
import { useCatalog } from "@/lib/catalog/provider";
import { useOrders } from "@/lib/orders/store";
import { computeTotalPaidBRL } from "@/lib/order-helpers";
import {
  SurveyError,
  completeSurvey,
  fetchMySurvey,
  saveSurveyAnswers,
  startSurvey,
  type SurveyResponse,
} from "@/lib/survey/api";
import {
  SURVEY_CLOSING,
  SURVEY_IS_FINAL,
  SURVEY_STEPS,
  firstPendingStep,
  isStepAnswered,
  stepPayload,
  visibleQuestions,
  type SurveyAnswers,
  type SurveyOption,
} from "@/lib/survey/questions";
import { SurveyQuestionField } from "@/components/sections/survey-question-field";

const HOW_IT_WORKS = [
  "Você compra suas cartas em uma ou mais lojas do Rio, como já faz hoje.",
  "Na plataforma da T1, informa em quais lojas estão seus pedidos e em qual loja parceira quer retirar.",
  "A T1 busca em todas as lojas e junta tudo em uma única entrega.",
  "Você retira tudo na loja parceira escolhida e acompanha cada etapa do pedido.",
];

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl">{children}</div>;
}

export function PesquisaView() {
  const router = useRouter();
  const { isLoggedIn, isReady, user } = useAuth();
  const { orders, isLoading: ordersLoading } = useOrders();
  const { coletaPartners, stores } = useCatalog();
  // Pergunta 17: lojas do catálogo (grava o nome, que o admin e o CSV leem direto).
  const storeOptions: SurveyOption[] = stores.map((st) => ({
    value: st.name,
    label: st.name,
  }));

  const [survey, setSurvey] = useState<SurveyResponse | null>(null);
  const [surveyLoaded, setSurveyLoaded] = useState(false);
  const [draft, setDraft] = useState<SurveyAnswers>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isReady && !isLoggedIn) router.replace("/login?next=%2Fpesquisa");
  }, [isReady, isLoggedIn, router]);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    fetchMySurvey()
      .then((s) => {
        if (cancelled) return;
        setSurvey(s);
        setDraft(s?.answers ?? {});
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof SurveyError ? err.message : "Erro ao carregar.");
        }
      })
      .finally(() => {
        if (!cancelled) setSurveyLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  // "1º pedido" = o mais antigo, igual ao que o banco usa no retrato.
  const firstOrder = useMemo(
    () =>
      [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? undefined,
    [orders],
  );

  if (!isLoggedIn) return null;
  if (!surveyLoaded || ordersLoading) {
    return <p className="py-10 text-center text-sm text-slate-600">Carregando...</p>;
  }

  async function reload() {
    const s = await fetchMySurvey();
    setSurvey(s);
    setDraft(s?.answers ?? {});
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof SurveyError ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  const errorBox = error && (
    <p
      role="alert"
      className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
    >
      {error}
    </p>
  );

  // ---- Etapa 0: confirmar o 1º pedido (antes de existir a resposta) ----------
  if (!survey) {
    if (!firstOrder) {
      return (
        <Shell>
          <div className="py-10 text-center">
            <ClipboardList
              className="mx-auto h-8 w-8 text-slate-300"
              aria-hidden="true"
            />
            <h1 className="mt-3 text-2xl font-bold text-slate-900">Pesquisa</h1>
            <p className="mt-2 text-slate-600">
              A pesquisa fica disponível depois do seu primeiro pedido.
            </p>
            <Button className="mt-6" asChild>
              <Link href="/conta">Voltar para minha conta</Link>
            </Button>
          </div>
        </Shell>
      );
    }

    const originPartners = coletaPartners.filter((p) =>
      firstOrder.originStoreIds.includes(p.id),
    );
    const pickup = stores.find((s) => s.id === firstOrder.destinationStoreId);

    return (
      <Shell>
        <h1 className="text-2xl font-bold text-slate-900">
          Olá{user ? `, ${user.name}` : ""}! Obrigado por participar do teste da T1
          Express!
        </h1>
        <div className="mt-3 space-y-2 text-slate-600">
          <p>
            São perguntas rápidas, quase todas de clique, e levam cerca de 8 minutos. Suas
            respostas vão definir como a T1 vai funcionar, inclusive o preço.
          </p>
          <p>Responda com sinceridade: crítica também ajuda muito.</p>
        </div>

        <h2 className="mt-8 font-semibold text-slate-900">
          Visualizamos que você realizou o seguinte pedido:
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Pedido #{firstOrder.id.slice(0, 8).toUpperCase()} · feito em{" "}
          {new Date(firstOrder.createdAt).toLocaleDateString("pt-BR")}
        </p>

        <div className="mt-4">
          <OrderItemsBreakdown
            originPartners={originPartners}
            ordersByStore={firstOrder.ordersByStore}
          />
        </div>

        <Card className="mt-4 gap-2 p-6 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-600">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              Loja de retirada
            </span>
            <span className="font-medium text-slate-900">{pickup?.name ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-600">Total dos itens (informativo)</span>
            <Price value={firstOrder.itemsTotal} className="font-medium text-slate-900" />
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-2 text-base">
            <span className="font-semibold text-slate-900">Valor do pedido</span>
            <Price
              value={computeTotalPaidBRL(firstOrder)}
              className="text-brand-700 font-bold"
            />
          </div>
        </Card>

        <Card className="mt-6 gap-4 p-6">
          <p className="font-semibold text-slate-900">
            Está certo? Esse foi seu primeiro pedido?
          </p>
          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
            <Button disabled={busy} onClick={() => void run(startSurvey)}>
              {busy ? "Salvando..." : "Sim, está certo. Seguir com a pesquisa"}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/conta">Cancelar</Link>
            </Button>
          </div>
          {errorBox}
        </Card>
      </Shell>
    );
  }

  // ---- Etapas com perguntas ------------------------------------------------
  const stepIndex = firstPendingStep(survey.answers);
  const step = SURVEY_STEPS[stepIndex];

  if (!step) {
    return (
      <Shell>
        <div className="py-10 text-center">
          <CheckCircle2
            className="mx-auto h-10 w-10 text-emerald-500"
            aria-hidden="true"
          />
          <h1 className="mt-3 text-2xl font-bold text-slate-900">Obrigado!</h1>
          <p className="mt-2 text-slate-600">
            {SURVEY_IS_FINAL
              ? SURVEY_CLOSING
              : "Suas respostas até aqui foram salvas. Em breve teremos as próximas perguntas."}
          </p>
          <Button className="mt-6" asChild>
            <Link href="/conta">Voltar para minha conta</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  const totalBlocks = SURVEY_STEPS.filter((s) => s.block).length;
  const isLastStep = stepIndex === SURVEY_STEPS.length - 1;
  const canContinue = isStepAnswered(step, draft);

  async function submitStep() {
    await saveSurveyAnswers(stepPayload(step, draft));
    if (isLastStep && SURVEY_IS_FINAL) await completeSurvey();
  }

  return (
    <Shell>
      {step.block ? (
        <>
          <p className="text-brand-600 text-sm font-semibold">
            Bloco {step.block} de {totalBlocks}
          </p>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={totalBlocks}
            aria-valuenow={step.block}
            aria-label="Progresso da pesquisa"
          >
            <div
              className="bg-brand-600 h-full rounded-full transition-all"
              style={{ width: `${(step.block / totalBlocks) * 100}%` }}
            />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">{step.title}</h1>
          {step.subtitle && <p className="mt-2 text-slate-600">{step.subtitle}</p>}
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-slate-900">
            Como a T1 Express funciona
          </h1>
          <p className="mt-3 text-slate-600">
            A T1 Express é uma logística feita para quem joga TCG. Você compra suas cartas
            onde quiser, e a T1 busca e entrega tudo junto na loja onde você joga.
          </p>
          <ol className="mt-6 space-y-3">
            {HOW_IT_WORKS.map((text, i) => (
              <li key={i} className="flex gap-3">
                <span className="bg-brand-600 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">
                  {i + 1}
                </span>
                <span className="pt-0.5 text-slate-700">{text}</span>
              </li>
            ))}
          </ol>
          <Card className="mt-6 gap-3 p-6 text-sm text-slate-700">
            <p>
              <strong className="text-slate-900">Preço fixo e previsível.</strong> Você
              paga um valor pela 1ª loja do pedido e um valor menor por cada loja
              adicional. Não há cálculo por quilômetro: você sabe o preço antes de pedir.
            </p>
            <p>
              <strong className="text-slate-900">Comprou mais depois?</strong> Enquanto a
              coleta não começou, você pode incluir mais cartas de uma loja que já está no
              pedido sem que ela conte como loja adicional.
            </p>
          </Card>
        </>
      )}

      <Card className="mt-6 gap-6 p-6">
        {visibleQuestions(step, draft).map((q) => (
          <SurveyQuestionField
            key={q.id}
            question={q}
            value={draft[q.id]}
            storeOptions={storeOptions}
            onChange={(v) => setDraft((d) => ({ ...d, [q.id]: v }))}
          />
        ))}
        {step.footnote && (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            {step.footnote}
          </p>
        )}
        <Button
          className="w-full sm:w-fit"
          disabled={!canContinue || busy}
          onClick={() => void run(submitStep)}
        >
          {busy
            ? "Salvando..."
            : !step.block
              ? "Começar a pesquisa"
              : isLastStep && SURVEY_IS_FINAL
                ? "Enviar respostas"
                : "Seguir para o próximo bloco"}
        </Button>
        {errorBox}
      </Card>
    </Shell>
  );
}

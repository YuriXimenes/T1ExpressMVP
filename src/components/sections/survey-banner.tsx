"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchMySurvey, type SurveyResponse } from "@/lib/survey/api";
import { SURVEY_STEPS, firstPendingStep } from "@/lib/survey/questions";

type BannerState = "loading" | "hidden" | "new" | "started";

function stateFor(survey: SurveyResponse | null): BannerState {
  if (!survey) return "new";
  if (survey.completedAt) return "hidden";
  // Respondeu tudo o que existe hoje: some, e volta sozinho quando entrarem
  // perguntas novas em src/lib/survey/questions.ts.
  return firstPendingStep(survey.answers) >= SURVEY_STEPS.length ? "hidden" : "started";
}

/**
 * Convite para a pesquisa de mercado, mostrado em /conta depois do 1º pedido.
 * Não tem botão de fechar: só some quando a pessoa responde.
 */
export function SurveyBanner() {
  const [state, setState] = useState<BannerState>("loading");

  useEffect(() => {
    let cancelled = false;
    fetchMySurvey()
      .then((survey) => {
        if (!cancelled) setState(stateFor(survey));
      })
      .catch(() => {
        // Sem conseguir ler a resposta, convida mesmo assim (/pesquisa lida com o resto).
        if (!cancelled) setState("new");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading" || state === "hidden") return null;

  return (
    <Card className="border-brand-200 bg-brand-50 mt-6 flex-col gap-4 p-5 ring-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:border">
      <div className="flex min-w-0 items-start gap-3">
        <span className="bg-brand-600 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white">
          <ClipboardList className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">
            {state === "started" ? "Falta pouco!" : "Conta pra gente como foi?"}
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            {state === "started"
              ? "Você começou nossa pesquisa. Continue de onde parou e ajude a construir a T1 Express."
              : "Você acabou de fazer seu primeiro pedido. Responda nossa pesquisa e ajude a construir a T1 Express."}
          </p>
        </div>
      </div>
      <Button asChild className="w-full shrink-0 sm:w-auto">
        <Link href="/pesquisa">
          {state === "started" ? "Continuar pesquisa" : "Responder pesquisa"}
        </Link>
      </Button>
    </Card>
  );
}

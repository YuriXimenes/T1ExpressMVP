import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Convite para a pesquisa de mercado, mostrado em /conta depois do 1º pedido.
 * Não tem botão de fechar: só some quando a pessoa já respondeu (`answered`).
 */
export function SurveyBanner({ answered = false }: { answered?: boolean }) {
  if (answered) return null;

  return (
    <Card className="border-brand-200 bg-brand-50 mt-6 flex-col gap-4 p-5 ring-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:border">
      <div className="flex min-w-0 items-start gap-3">
        <span className="bg-brand-600 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white">
          <ClipboardList className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">Conta pra gente como foi?</p>
          <p className="mt-0.5 text-sm text-slate-600">
            Você acabou de fazer seu primeiro pedido. Responda nossa pesquisa e ajude a
            construir a T1 Express.
          </p>
        </div>
      </div>
      <Button asChild className="w-full shrink-0 sm:w-auto">
        <Link href="/pesquisa">Responder pesquisa</Link>
      </Button>
    </Card>
  );
}

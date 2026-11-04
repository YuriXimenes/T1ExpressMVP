"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminError, revalidateCatalog } from "@/lib/admin/api";
import { areaForPath, can } from "@/lib/admin/access";
import { useAccess } from "@/lib/admin/access-provider";

/**
 * Perfil só com "ver" nesta área: os campos e botões de dentro ficam
 * desativados (um <fieldset disabled> desativa tudo de uma vez). O banco recusa
 * de qualquer jeito; aqui é para a tela não oferecer o que não vai funcionar.
 */
export function CatalogEditGuard({ children }: { children: ReactNode }) {
  const access = useAccess();
  const area = areaForPath(usePathname());
  const editable = !area || can(access, area, "edit") || can(access, area, "create");
  if (editable) return <>{children}</>;
  return (
    <>
      <p className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
        Seu perfil só pode ver esta área.
      </p>
      <fieldset disabled className="min-w-0">
        {children}
      </fieldset>
    </>
  );
}

/**
 * Cabeçalho das telas que editam o que o site mostra (lojas, preços, cupons,
 * rotas, comparativo), com o botão que aplica as edições no site na hora.
 */
export function CatalogPage({
  title,
  description,
  guard = true,
  children,
}: {
  title: string;
  description?: string;
  /** false quando a página põe o CatalogEditGuard por dentro (ex.: abas). */
  guard?: boolean;
  children: ReactNode;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleRefresh() {
    setRefreshing(true);
    setFeedback(null);
    try {
      await revalidateCatalog();
      setFeedback({ ok: true, text: "Catálogo atualizado no site." });
    } catch (err) {
      setFeedback({
        ok: false,
        text:
          err instanceof AdminError
            ? err.message
            : "Não foi possível atualizar o catálogo.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="mb-1 text-xl font-semibold text-slate-900">{title}</h1>
          {description && <p className="text-sm text-slate-500">{description}</p>}
          <p className="text-xs text-slate-400">
            Edições aqui podem levar até 5 minutos para aparecer no site (cache do
            catálogo). Para aplicar na hora, use &ldquo;Atualizar catálogo no site&rdquo;.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1 sm:items-end">
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
            <RefreshCw
              className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              aria-hidden="true"
            />
            {refreshing ? "Atualizando..." : "Atualizar catálogo no site"}
          </Button>
          {feedback && (
            <p
              role="status"
              className={feedback.ok ? "text-xs text-green-700" : "text-xs text-red-600"}
            >
              {feedback.text}
            </p>
          )}
        </div>
      </div>
      {guard ? <CatalogEditGuard>{children}</CatalogEditGuard> : children}
    </div>
  );
}

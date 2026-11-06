"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { useCan } from "@/lib/admin/access-provider";
import { fetchComparatorHealth, type ComparatorHealth } from "@/lib/metrics/api";

/** Aviso no Comparador de fretes: rotas sem preço (a simulação falha) e afins. */
export function ComparatorHealthNotice() {
  const canSeeMetrics = useCan("indicadores", "view");
  const [health, setHealth] = useState<ComparatorHealth | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      fetchComparatorHealth(90)
        .then(setHealth)
        .catch(() => setHealth(null));
    });
  }, []);

  if (!health) return null;
  const issues = health.missingRoute + health.missingUber + health.stale;
  if (issues === 0) return null;
  const blocking = health.items.filter((i) => i.issue === "sem_rota").slice(0, 5);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="flex items-start gap-2 font-medium">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {health.missingRoute > 0 &&
            `${health.missingRoute} rota(s) sem preço: a simulação falha para o cliente. `}
          {health.missingUber > 0 && `${health.missingUber} sem preço de Uber. `}
          {health.stale > 0 &&
            `${health.stale} sem revisão há mais de ${health.staleDays} dias.`}
        </span>
      </p>
      {blocking.length > 0 && (
        <ul className="ml-6 list-disc text-amber-800">
          {blocking.map((i) => (
            <li key={`${i.originCode}>${i.destCode}`}>
              {i.originName} → {i.destName}
              {i.simulations > 0 && ` (${i.simulations} simulações em 90 dias)`}
            </li>
          ))}
        </ul>
      )}
      {canSeeMetrics && (
        <Link
          href="/admin/plataforma/indicadores#comparador"
          className="ml-6 w-fit font-medium underline"
        >
          Ver a lista completa
        </Link>
      )}
    </div>
  );
}

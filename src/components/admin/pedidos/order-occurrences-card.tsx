"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCan } from "@/lib/admin/access-provider";
import { fetchOccurrences, type Occurrence } from "@/lib/occurrences/api";
import { OCCURRENCE_ACTOR_LABELS, occurrenceCode } from "@/lib/occurrences/rules";
import {
  OccurrenceDueBadge,
  OccurrenceStatusBadge,
  dateTime,
} from "@/components/occurrences/occurrence-thread";
import { NewOccurrenceDialog } from "@/components/admin/ocorrencias/new-occurrence-dialog";

/** Ocorrências do pedido, com atalho para abrir uma nova. */
export function OrderOccurrencesCard({ orderId }: { orderId: string }) {
  const router = useRouter();
  const canView = useCan("ocorrencias", "view");
  const canCreate = useCan("ocorrencias", "create");
  const [list, setList] = useState<Occurrence[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchOccurrences(orderId)
      .then((data) => !cancelled && setList(data))
      // Sem a migração (ou sem permissão), o cartão fica vazio.
      .catch(() => !cancelled && setList([]));
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!list || (list.length === 0 && !canCreate)) return null;

  return (
    <Card className="gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Ocorrências</h2>
        {canCreate && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            Abrir ocorrência
          </Button>
        )}
      </div>
      {list.length === 0 && <p className="text-sm text-slate-500">Nenhuma ocorrência.</p>}
      <ul className="flex flex-col gap-2">
        {list.map((o) => {
          const content = (
            <>
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">
                  {occurrenceCode(o.number)}
                </span>
                <span className="text-slate-700">{o.typeName}</span>
                <OccurrenceStatusBadge occurrence={o} />
                <OccurrenceDueBadge occurrence={o} />
              </p>
              <p className="text-xs text-slate-500">
                {OCCURRENCE_ACTOR_LABELS[o.openedKind]} · {dateTime(o.createdAt)}
              </p>
            </>
          );
          return (
            <li
              key={o.id}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {canView ? (
                <Link
                  href={`/admin/pedidos/ocorrencias/${o.id}`}
                  className="block hover:opacity-80"
                >
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
      <NewOccurrenceDialog
        open={creating}
        onOpenChange={setCreating}
        defaultOrderId={orderId}
        onCreated={(id) => router.push(`/admin/pedidos/ocorrencias/${id}`)}
      />
    </Card>
  );
}

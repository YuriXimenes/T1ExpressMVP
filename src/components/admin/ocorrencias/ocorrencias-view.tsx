"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCan } from "@/lib/admin/access-provider";
import { orderCode } from "@/lib/admin/order-moves";
import {
  OccurrenceError,
  fetchOccurrenceTypes,
  fetchOccurrences,
  type Occurrence,
  type OccurrenceType,
} from "@/lib/occurrences/api";
import {
  OCCURRENCE_ACTOR_LABELS,
  OCCURRENCE_STATUS_LABELS,
  dueState,
  effectiveStatus,
  occurrenceCode,
  type OccurrenceActor,
  type OccurrenceStatus,
} from "@/lib/occurrences/rules";
import { cn } from "@/lib/utils";
import {
  OccurrenceDueBadge,
  OccurrenceStatusBadge,
  dateTime,
} from "@/components/occurrences/occurrence-thread";
import { NewOccurrenceDialog } from "@/components/admin/ocorrencias/new-occurrence-dialog";

const ALL = "all";
type Tab = "abertas" | OccurrenceStatus | "todas";
const TABS: { id: Tab; label: string }[] = [
  { id: "abertas", label: "Em aberto" },
  { id: "aberta", label: "Abertas" },
  { id: "em_analise", label: "Em análise" },
  { id: "resolvida", label: "Resolvidas" },
  { id: "encerrada", label: "Encerradas" },
  { id: "todas", label: "Todas" },
];

function inTab(status: OccurrenceStatus, tab: Tab) {
  if (tab === "todas") return true;
  if (tab === "abertas") return status === "aberta" || status === "em_analise";
  return status === tab;
}

export function OcorrenciasView() {
  const router = useRouter();
  const canCreate = useCan("ocorrencias", "create");
  const [list, setList] = useState<Occurrence[] | null>(null);
  const [types, setTypes] = useState<OccurrenceType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("abertas");
  const [typeId, setTypeId] = useState(ALL);
  const [origin, setOrigin] = useState(ALL);
  const [assignee, setAssignee] = useState(ALL);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const [occ, t] = await Promise.all([
        fetchOccurrences(),
        fetchOccurrenceTypes("all"),
      ]);
      setList(occ);
      setTypes(t);
    } catch (err) {
      setError(
        err instanceof OccurrenceError ? err.message : "Não foi possível carregar.",
      );
    }
  }

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => void load());
  }, []);

  const assignees = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of list ?? [])
      if (o.assigneeId) map.set(o.assigneeId, o.assigneeName ?? "—");
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [list]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(TABS.map((t) => [t.id, 0])) as Record<Tab, number>;
    for (const o of list ?? []) {
      const s = effectiveStatus(o);
      for (const t of TABS) if (inTab(s, t.id)) c[t.id]++;
    }
    return c;
  }, [list]);

  const filtered = useMemo(() => {
    const term = search
      .trim()
      .toLowerCase()
      .replace(/^#|^oc-/, "");
    return (list ?? []).filter((o) => {
      const s = effectiveStatus(o);
      if (!inTab(s, tab)) return false;
      if (typeId !== ALL && o.typeId !== typeId) return false;
      if (origin !== ALL && o.openedKind !== origin) return false;
      if (assignee === "none" && o.assigneeId) return false;
      if (assignee !== ALL && assignee !== "none" && o.assigneeId !== assignee)
        return false;
      if (overdueOnly && dueState({ status: s, dueAt: o.dueAt }) !== "overdue")
        return false;
      if (term) {
        const hay = [
          String(o.number),
          o.orderId ? orderCode(o.orderId).toLowerCase() : "",
          o.typeName.toLowerCase(),
          o.storeName?.toLowerCase() ?? "",
          o.description.toLowerCase(),
        ];
        if (!hay.some((h) => h.includes(term))) return false;
      }
      return true;
    });
  }, [list, tab, typeId, origin, assignee, overdueOnly, search]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Ocorrências</h1>
          <p className="text-sm text-slate-500">
            Problemas da operação abertos pela equipe, entregadores, clientes ou pelo
            sistema. Resolvidas encerram sozinhas depois de 3 dias úteis.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/pedidos/ocorrencias/tipos">
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Tipos
            </Link>
          </Button>
          {canCreate && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nova ocorrência
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Status">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium",
              tab === t.id
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            {t.label} <span className="opacity-70">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <Input
          placeholder="Buscar nº, pedido, loja ou texto"
          aria-label="Buscar"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-56 text-sm"
        />
        <Select value={typeId} onValueChange={setTypeId}>
          <SelectTrigger className="h-8 w-48 text-sm" aria-label="Tipo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os tipos</SelectItem>
            {types.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={origin} onValueChange={setOrigin}>
          <SelectTrigger className="h-8 w-40 text-sm" aria-label="Aberta por">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Aberta por: todos</SelectItem>
            {(Object.keys(OCCURRENCE_ACTOR_LABELS) as OccurrenceActor[]).map((k) => (
              <SelectItem key={k} value={k}>
                {OCCURRENCE_ACTOR_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="h-8 w-44 text-sm" aria-label="Responsável">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Responsável: todos</SelectItem>
            <SelectItem value="none">Sem responsável</SelectItem>
            {assignees.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input
            type="checkbox"
            className="accent-brand-600 h-4 w-4"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
          />
          Só prazo vencido
        </label>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {!list && !error && <p className="text-sm text-slate-500">Carregando...</p>}
      {list && filtered.length === 0 && (
        <p className="text-sm text-slate-500">Nenhuma ocorrência neste filtro.</p>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map((o) => (
          <Link key={o.id} href={`/admin/pedidos/ocorrencias/${o.id}`} className="block">
            <Card className="gap-1.5 p-4 transition-colors hover:border-slate-300">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">
                  {occurrenceCode(o.number)}
                </span>
                <span className="text-sm text-slate-700">{o.typeName}</span>
                <OccurrenceStatusBadge occurrence={o} />
                <OccurrenceDueBadge occurrence={o} />
              </div>
              <p className="line-clamp-2 text-sm text-slate-600">{o.description}</p>
              <p className="flex flex-wrap gap-x-3 text-xs text-slate-500">
                <span>
                  {OCCURRENCE_ACTOR_LABELS[o.openedKind]}
                  {o.openedByName && ` · ${o.openedByName}`}
                </span>
                {o.orderId && <span>Pedido #{orderCode(o.orderId)}</span>}
                {o.storeName && <span>{o.storeName}</span>}
                <span>Aberta {dateTime(o.createdAt)}</span>
                <span>Prazo {dateTime(o.dueAt)}</span>
                <span>
                  {o.assigneeName ? `Resp.: ${o.assigneeName}` : "Sem responsável"}
                </span>
                <span className="sr-only">
                  {OCCURRENCE_STATUS_LABELS[effectiveStatus(o)]}
                </span>
              </p>
            </Card>
          </Link>
        ))}
      </div>

      <NewOccurrenceDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(id) => router.push(`/admin/pedidos/ocorrencias/${id}`)}
      />
    </div>
  );
}

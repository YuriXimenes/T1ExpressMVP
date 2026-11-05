"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/lib/admin/access-provider";
import { fetchAdminOrders } from "@/lib/admin/api";
import { orderCode } from "@/lib/admin/order-moves";
import { FinanceError, fetchClaims, openClaim, type Claim } from "@/lib/finance/api";
import { CLAIM_STATUS_LABELS, claimCode, type ClaimStatus } from "@/lib/finance/rules";
import { cn } from "@/lib/utils";
import { StatusPill, dateBR, money } from "@/components/admin/financeiro/finance-ui";

type Tab = "abertos" | ClaimStatus | "todos";
const TABS: [Tab, string][] = [
  ["abertos", "Em andamento"],
  ["aprovado", "Aprovados (a pagar)"],
  ["pago", "Pagos"],
  ["negado", "Negados"],
  ["todos", "Todos"],
];
const inTab = (s: ClaimStatus, t: Tab) =>
  t === "todos" || (t === "abertos" ? s === "aberto" || s === "em_analise" : s === t);

/** Sinistros: perdas e danos, indenização sugerida e pagamento. */
export function SinistrosView() {
  const router = useRouter();
  const canCreate = useCan("sinistros", "create");
  const [list, setList] = useState<Claim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("abertos");
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      fetchClaims()
        .then(setList)
        .catch((err) =>
          setError(
            err instanceof FinanceError ? err.message : "Não foi possível carregar.",
          ),
        );
    });
  }, []);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        TABS.map(([t]) => [t, (list ?? []).filter((c) => inTab(c.status, t)).length]),
      ),
    [list],
  );

  async function create() {
    const wanted = code.trim().replace(/^#/, "").toUpperCase();
    if (!wanted) return setFormError("Informe o código do pedido.");
    if (description.trim().length < 5) return setFormError("Descreva o que aconteceu.");
    setBusy(true);
    setFormError(null);
    try {
      const matches = (await fetchAdminOrders()).filter((o) =>
        orderCode(o.id).startsWith(wanted),
      );
      if (matches.length !== 1) {
        setFormError(
          matches.length
            ? "Mais de um pedido começa assim: use o código completo."
            : "Pedido não encontrado.",
        );
        return;
      }
      const id = await openClaim(matches[0].id, description.trim());
      router.push(`/admin/financeiro/sinistros/${id}`);
    } catch (err) {
      setFormError(err instanceof FinanceError ? err.message : "Não foi possível abrir.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Sinistros</h1>
          <p className="text-sm text-slate-500">
            Perdas e danos de pedidos. A resolução &ldquo;Sinistro&rdquo; de uma
            ocorrência abre o sinistro sozinha; a indenização sugerida é o menor valor
            entre o declarado dos itens afetados e a cobertura do seguro do pedido.
          </p>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Abrir sinistro
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Situação">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium",
              tab === t
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            {label} <span className="opacity-70">{counts[t] ?? 0}</span>
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {!list && !error && <p className="text-sm text-slate-500">Carregando...</p>}
      {list && list.filter((c) => inTab(c.status, tab)).length === 0 && (
        <p className="text-sm text-slate-500">Nenhum sinistro neste filtro.</p>
      )}

      <div className="flex flex-col gap-2">
        {(list ?? [])
          .filter((c) => inTab(c.status, tab))
          .map((c) => (
            <Link key={c.id} href={`/admin/financeiro/sinistros/${c.id}`}>
              <Card className="flex-row flex-wrap items-center justify-between gap-2 p-4 transition-colors hover:border-slate-300">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">
                      {claimCode(c.number)}
                    </span>
                    <StatusPill status={c.status} label={CLAIM_STATUS_LABELS[c.status]} />
                  </p>
                  <p className="text-xs text-slate-500">
                    {c.customerName ?? c.customerEmail} · pedido #{orderCode(c.orderId)}
                    {c.occurrenceNumber && ` · OC-${c.occurrenceNumber}`} · aberto{" "}
                    {dateBR(c.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums">
                    {money(c.approvedAmount ?? c.suggestedAmount)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {c.approvedAmount !== undefined ? "aprovado" : "sugerido"} · cobertura{" "}
                    {money(c.coverage)}
                  </p>
                </div>
              </Card>
            </Link>
          ))}
      </div>

      <Dialog open={creating} onOpenChange={(o) => !o && !busy && setCreating(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Abrir sinistro</DialogTitle>
            <DialogDescription>
              Para casos sem ocorrência. Depois você marca os itens afetados no detalhe.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="claim-order">Pedido</Label>
              <Input
                id="claim-order"
                placeholder="Código, ex.: 1A2B3C4D"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="claim-desc">O que aconteceu</Label>
              <Textarea
                id="claim-desc"
                rows={3}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {formError && (
              <p role="alert" className="text-sm text-red-600">
                {formError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button disabled={busy} onClick={() => void create()}>
              {busy ? "Abrindo..." : "Abrir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

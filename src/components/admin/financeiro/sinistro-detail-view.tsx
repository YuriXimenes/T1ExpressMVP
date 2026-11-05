"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/lib/admin/access-provider";
import { orderCode } from "@/lib/admin/order-moves";
import {
  FinanceError,
  fetchClaim,
  payClaim,
  setClaimItems,
  setClaimStatus,
  type Claim,
} from "@/lib/finance/api";
import { CLAIM_STATUS_LABELS, claimCode, round2 } from "@/lib/finance/rules";
import {
  PaymentDialog,
  ReceiptLink,
  StatusPill,
  dateBR,
  money,
  toNumber,
} from "@/components/admin/financeiro/finance-ui";

const STATUS_EVENT: Record<string, string> = {
  aberto: "Aberto",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  negado: "Negado",
};

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

/** Detalhe do sinistro: itens afetados, sugestão, decisão e pagamento. */
export function SinistroDetailView({ id }: { id: string }) {
  const canEdit = useCan("sinistros", "edit");
  const [claim, setClaim] = useState<Claim | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deciding, setDeciding] = useState<"aprovado" | "negado" | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [paying, setPaying] = useState(false);

  async function load() {
    try {
      const c = await fetchClaim(id);
      setClaim(c);
      setQty(Object.fromEntries(c.items.map((i) => [i.itemId, String(i.qty)])));
    } catch (err) {
      setError(
        err instanceof FinanceError
          ? err.message
          : "Não foi possível carregar o sinistro.",
      );
    }
  }

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
      await load();
      setMessage(done);
      return true;
    } catch (err) {
      setError(err instanceof FinanceError ? err.message : "Não foi possível salvar.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!claim) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink />
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : (
          <p className="text-sm text-slate-500">Carregando...</p>
        )}
      </div>
    );
  }

  const open = claim.status !== "pago" && claim.status !== "negado";
  const items = claim.orderItems ?? [];
  const preview = round2(
    items.reduce((s, it) => s + it.unitValue * (Number(qty[it.itemId] ?? 0) || 0), 0),
  );

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900">
            Sinistro {claimCode(claim.number)}
          </h1>
          <StatusPill status={claim.status} label={CLAIM_STATUS_LABELS[claim.status]} />
        </div>
        <p className="text-sm text-slate-500">
          {claim.customerName ?? claim.customerEmail} ·{" "}
          <Link href={`/admin/pedidos/${claim.orderId}`} className="hover:underline">
            pedido #{orderCode(claim.orderId)}
          </Link>
          {claim.occurrenceId && (
            <>
              {" · "}
              <Link
                href={`/admin/pedidos/ocorrencias/${claim.occurrenceId}`}
                className="hover:underline"
              >
                ocorrência OC-{claim.occurrenceNumber}
              </Link>
            </>
          )}{" "}
          · aberto {dateBR(claim.createdAt)}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Value label="Declarado afetado" value={money(claim.declaredAmount)} />
        <Value
          label="Cobertura do seguro"
          value={money(claim.coverage)}
          detail={
            claim.insuranceOptedIn ? "seguro adicional contratado" : "cobertura básica"
          }
        />
        <Value
          label="Indenização sugerida"
          value={money(claim.suggestedAmount)}
          detail="menor dos dois"
        />
        <Value
          label="Aprovado"
          value={money(claim.approvedAmount)}
          detail={claim.paidAt ? `pago em ${dateBR(claim.paidAt)}` : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          {claim.description && (
            <Card className="gap-2 p-5">
              <h2 className="font-semibold text-slate-900">O que aconteceu</h2>
              <p className="text-sm whitespace-pre-wrap text-slate-700">
                {claim.description}
              </p>
            </Card>
          )}
          <Card className="gap-3 p-5">
            <h2 className="font-semibold text-slate-900">Itens afetados</h2>
            <p className="text-sm text-slate-500">
              Marque quantas unidades de cada item foram perdidas ou danificadas. O valor
              declarado e a sugestão são recalculados.
            </p>
            <fieldset
              disabled={!canEdit || !open || busy}
              className="flex flex-col gap-2"
            >
              {items.length === 0 && (
                <p className="text-sm text-slate-500">Pedido sem itens detalhados.</p>
              )}
              {items.map((it) => (
                <div
                  key={it.itemId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-slate-800">{it.label}</span>
                    <span className="text-xs text-slate-500">
                      {" "}
                      · {it.store} · {it.quantity} un. × {money(it.unitValue)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Label
                      htmlFor={`qty-${it.itemId}`}
                      className="text-xs text-slate-500"
                    >
                      afetadas
                    </Label>
                    <Input
                      id={`qty-${it.itemId}`}
                      inputMode="numeric"
                      className="h-8 w-16 text-center"
                      value={qty[it.itemId] ?? ""}
                      placeholder="0"
                      onChange={(e) =>
                        setQty((q) => ({
                          ...q,
                          [it.itemId]: e.target.value.replace(/\D/g, ""),
                        }))
                      }
                    />
                  </span>
                </div>
              ))}
              {canEdit && open && items.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-slate-600">
                    Declarado: {money(preview)} · sugestão{" "}
                    {money(Math.min(preview, claim.coverage))}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => {
                      const chosen = items
                        .map((it) => ({
                          kind: it.kind,
                          itemId: it.itemId,
                          qty: Number(qty[it.itemId] ?? 0),
                        }))
                        .filter((it) => it.qty > 0);
                      void run(() => setClaimItems(claim.id, chosen), "Itens salvos.");
                    }}
                  >
                    Salvar itens
                  </Button>
                </div>
              )}
            </fieldset>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          {canEdit && open && (
            <Card className="gap-2 p-5">
              <h2 className="font-semibold text-slate-900">Decisão</h2>
              {claim.status === "aberto" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(() => setClaimStatus(claim.id, "em_analise"), "Em análise.")
                  }
                >
                  Colocar em análise
                </Button>
              )}
              {claim.status !== "aprovado" && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    setAmount(String(claim.suggestedAmount).replace(".", ","));
                    setNote("");
                    setDeciding("aprovado");
                  }}
                >
                  Aprovar indenização
                </Button>
              )}
              {claim.status === "aprovado" && (
                <Button disabled={busy} onClick={() => setPaying(true)}>
                  Registrar pagamento
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setNote("");
                  setDeciding("negado");
                }}
              >
                Negar
              </Button>
            </Card>
          )}
          {claim.decisionNote && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {claim.decisionNote}
            </p>
          )}
          {claim.receiptPath && (
            <p className="text-sm">
              <ReceiptLink path={claim.receiptPath} label="comprovante do pagamento" />
            </p>
          )}
          <Card className="gap-2 p-5">
            <h2 className="font-semibold text-slate-900">Histórico</h2>
            <ol className="flex flex-col gap-2 text-sm">
              {(claim.events ?? []).map((e, i) => (
                <li key={i} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-slate-800">
                    {e.kind === "status"
                      ? (STATUS_EVENT[e.note?.split(" ")[0] ?? ""] ?? "Situação alterada")
                      : e.kind === "itens"
                        ? "Itens afetados"
                        : e.kind === "pago"
                          ? "Pago"
                          : e.kind === "aberto"
                            ? "Aberto"
                            : "Nota"}
                  </p>
                  {e.note && e.kind !== "status" && (
                    <p className="text-xs text-slate-600">{e.note}</p>
                  )}
                  {e.note && e.kind === "status" && e.note.includes(" · ") && (
                    <p className="text-xs text-slate-600">
                      {e.note.split(" · ").slice(1).join(" · ")}
                    </p>
                  )}
                  <p className="text-xs text-slate-400">
                    {e.actorName ?? "Sistema"} · {dateTime(e.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <Dialog
        open={deciding !== null}
        onOpenChange={(o) => !o && !busy && setDeciding(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deciding === "aprovado" ? "Aprovar indenização" : "Negar sinistro"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {deciding === "aprovado" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="claim-amount">Valor aprovado (R$)</Label>
                <Input
                  id="claim-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <p className="text-xs text-slate-500">
                  Sugerido: {money(claim.suggestedAmount)}
                </p>
              </div>
            )}
            <Textarea
              rows={3}
              aria-label="Observação"
              placeholder={
                deciding === "negado"
                  ? "Motivo (o cliente vê na ocorrência)"
                  : "Observação (opcional)"
              }
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setDeciding(null)}>
              Cancelar
            </Button>
            <Button
              variant={deciding === "negado" ? "destructive" : "default"}
              disabled={
                busy ||
                (deciding === "negado" ? note.trim().length < 3 : !(toNumber(amount) > 0))
              }
              onClick={() =>
                deciding &&
                void run(
                  () =>
                    setClaimStatus(
                      claim.id,
                      deciding,
                      deciding === "aprovado" ? toNumber(amount) : undefined,
                      note.trim() || undefined,
                    ),
                  deciding === "aprovado" ? "Indenização aprovada." : "Sinistro negado.",
                ).then((ok) => ok && setDeciding(null))
              }
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentDialog
        key={paying ? "open" : "closed"}
        open={paying}
        title={`Pagar ${claimCode(claim.number)} · ${money(claim.approvedAmount)}`}
        description="Indenização ao cliente."
        askAmount={false}
        onClose={() => setPaying(false)}
        onConfirm={async (input) => {
          await payClaim(claim.id, input);
          setMessage("Pagamento registrado.");
          await load();
        }}
      />
    </div>
  );
}

function Value({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900 tabular-nums">{value}</p>
      {detail && <p className="text-xs text-slate-400">{detail}</p>}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/financeiro/sinistros"
      className="inline-flex items-center gap-1 self-start text-sm text-slate-500 hover:text-slate-800"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Sinistros
    </Link>
  );
}

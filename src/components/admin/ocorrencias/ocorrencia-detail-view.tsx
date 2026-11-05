"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL } from "@/components/shared/price";
import { useCan } from "@/lib/admin/access-provider";
import { orderCode } from "@/lib/admin/order-moves";
import {
  OccurrenceError,
  addResolution,
  fetchAssignees,
  fetchOccurrence,
  reopenOccurrence,
  updateOccurrence,
  type Occurrence,
} from "@/lib/occurrences/api";
import {
  OCCURRENCE_ACTOR_LABELS,
  OCCURRENCE_STATUS_LABELS,
  RESOLUTIONS_WITH_AMOUNT,
  RESOLUTION_LABELS,
  effectiveStatus,
  occurrenceCode,
  resolutionAmountLabel,
  type OccurrenceStatus,
  type ResolutionKind,
} from "@/lib/occurrences/rules";
import { cn } from "@/lib/utils";
import {
  OccurrenceDueBadge,
  OccurrenceStatusBadge,
  OccurrenceThread,
  dateTime,
} from "@/components/occurrences/occurrence-thread";

const NONE = "none";
const errorText = (err: unknown, fallback: string) =>
  err instanceof OccurrenceError ? err.message : fallback;
const toNumber = (v: string) => Number(v.replace(",", "."));

export function OcorrenciaDetailView({ id }: { id: string }) {
  const canEdit = useCan("ocorrencias", "edit");
  const [occ, setOcc] = useState<Occurrence | null>(null);
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");
  const [res, setRes] = useState({
    kind: "" as ResolutionKind | "",
    amount: "",
    couponType: "flat" as "flat" | "percent",
    guardDate: "",
    note: "",
  });

  async function load() {
    try {
      const [o, a] = await Promise.all([fetchOccurrence(id), fetchAssignees()]);
      setOcc(o);
      setAssignees(a);
    } catch (err) {
      setError(errorText(err, "Não foi possível carregar a ocorrência."));
    }
  }

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await load();
      setMessage(done);
      return true;
    } catch (err) {
      setError(errorText(err, "Não foi possível salvar."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!occ) {
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

  const status = effectiveStatus(occ);
  const closed = status === "encerrada";
  const resolutions = occ.resolutions ?? [];

  async function saveResolution() {
    if (!res.kind || !occ) return;
    const needsAmount = RESOLUTIONS_WITH_AMOUNT.includes(res.kind);
    if (needsAmount && !(toNumber(res.amount) > 0)) {
      setError("Informe o valor.");
      return;
    }
    let coupon: string | undefined;
    const ok = await run(async () => {
      const result = await addResolution(occ.id, {
        kind: res.kind as ResolutionKind,
        amountBrl: needsAmount ? toNumber(res.amount) : undefined,
        couponType: res.kind === "cupom" ? res.couponType : undefined,
        newGuardDate: res.kind === "prorrogacao_guarda" ? res.guardDate : undefined,
        note: res.note.trim() || undefined,
      });
      coupon = result.couponCode;
    }, "Resolução registrada.");
    if (ok) {
      setRes({ kind: "", amount: "", couponType: "flat", guardDate: "", note: "" });
      if (coupon)
        setMessage(`Cupom ${coupon} criado. O cliente vê o código na ocorrência.`);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900">
            {occurrenceCode(occ.number)} · {occ.typeName}
          </h1>
          <OccurrenceStatusBadge occurrence={occ} />
          <OccurrenceDueBadge occurrence={occ} />
        </div>
        <p className="text-sm text-slate-500">
          Aberta por {OCCURRENCE_ACTOR_LABELS[occ.openedKind]}
          {occ.openedByName && ` (${occ.openedByName})`} em {dateTime(occ.createdAt)}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          <Card className="gap-3 p-5">
            <h2 className="font-semibold text-slate-900">Descrição</h2>
            <p className="text-sm whitespace-pre-wrap text-slate-700">
              {occ.description}
            </p>
          </Card>
          <Card className="gap-4 p-5">
            <h2 className="font-semibold text-slate-900">Atualizações</h2>
            <OccurrenceThread
              occurrence={occ}
              viewer="admin"
              canWrite={canEdit}
              onChanged={load}
            />
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="gap-3 p-5 text-sm">
            <h2 className="font-semibold text-slate-900">Dados</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              {occ.orderId && (
                <>
                  <dt className="text-slate-500">Pedido</dt>
                  <dd>
                    <Link
                      href={`/admin/pedidos/${occ.orderId}`}
                      className="text-brand-700 font-medium hover:underline"
                    >
                      #{orderCode(occ.orderId)}
                    </Link>
                  </dd>
                </>
              )}
              {occ.storeName && (
                <>
                  <dt className="text-slate-500">Loja</dt>
                  <dd>{occ.storeName}</dd>
                </>
              )}
              {occ.tripId && (
                <>
                  <dt className="text-slate-500">Viagem</dt>
                  <dd>
                    <Link
                      href={`/admin/pedidos/rotas/${occ.tripId}`}
                      className="text-brand-700 font-medium hover:underline"
                    >
                      Ver viagem
                    </Link>
                  </dd>
                </>
              )}
              <dt className="text-slate-500">Prazo</dt>
              <dd>{dateTime(occ.dueAt)}</dd>
              {occ.resolvedAt && (
                <>
                  <dt className="text-slate-500">Resolvida</dt>
                  <dd>{dateTime(occ.resolvedAt)}</dd>
                </>
              )}
              {status === "resolvida" && occ.autoCloseAt && (
                <>
                  <dt className="text-slate-500">Encerra</dt>
                  <dd>{dateTime(occ.autoCloseAt)}</dd>
                </>
              )}
              {occ.lat !== undefined && occ.lng !== undefined && (
                <>
                  <dt className="text-slate-500">Local</dt>
                  <dd>
                    <a
                      href={`https://www.google.com/maps?q=${occ.lat},${occ.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-700 inline-flex items-center gap-0.5 hover:underline"
                    >
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Ver no mapa
                    </a>
                  </dd>
                </>
              )}
            </dl>
          </Card>

          <Card className="gap-3 p-5">
            <h2 className="font-semibold text-slate-900">Tratamento</h2>
            {closed ? (
              canEdit && (
                <Button variant="outline" size="sm" onClick={() => setReopening(true)}>
                  Reabrir
                </Button>
              )
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-slate-500">Status</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        "aberta",
                        "em_analise",
                        "resolvida",
                        "encerrada",
                      ] as OccurrenceStatus[]
                    ).map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={!canEdit || busy || s === status}
                        aria-pressed={s === status}
                        onClick={() =>
                          void run(
                            () => updateOccurrence(occ.id, { status: s }),
                            `Status: ${OCCURRENCE_STATUS_LABELS[s]}.`,
                          )
                        }
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-medium disabled:cursor-default",
                          s === status
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50",
                        )}
                      >
                        {OCCURRENCE_STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                  {status === "resolvida" && (
                    <p className="text-xs text-slate-500">
                      Encerra sozinha 3 dias úteis depois de resolvida.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-slate-500">Responsável</Label>
                  <Select
                    value={occ.assigneeId ?? NONE}
                    disabled={!canEdit || busy}
                    onValueChange={(v) =>
                      void run(
                        () =>
                          updateOccurrence(occ.id, { assigneeId: v === NONE ? null : v }),
                        "Responsável atualizado.",
                      )
                    }
                  >
                    <SelectTrigger aria-label="Responsável">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem responsável</SelectItem>
                      {assignees.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </Card>

          <Card className="gap-3 p-5">
            <h2 className="font-semibold text-slate-900">Resoluções</h2>
            {resolutions.length === 0 && (
              <p className="text-sm text-slate-500">Nenhuma resolução registrada.</p>
            )}
            <ul className="flex flex-col gap-2 text-sm">
              {resolutions.map((r) => (
                <li key={r.id} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="font-medium text-slate-800">
                    {RESOLUTION_LABELS[r.kind]}
                    {resolutionAmountLabel(r, formatBRL) &&
                      ` · ${resolutionAmountLabel(r, formatBRL)}`}
                  </p>
                  {r.couponCode && (
                    <p className="text-xs text-slate-600">
                      Código:{" "}
                      <span className="font-mono font-semibold">{r.couponCode}</span>
                    </p>
                  )}
                  {r.newGuardUntil && (
                    <p className="text-xs text-slate-600">
                      Novo prazo: {dateTime(r.newGuardUntil)}
                    </p>
                  )}
                  {r.note && <p className="text-xs text-slate-500">{r.note}</p>}
                  <p className="text-xs text-slate-400">{dateTime(r.createdAt)}</p>
                </li>
              ))}
            </ul>
            {canEdit && !closed && (
              <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
                <Select
                  value={res.kind}
                  onValueChange={(v) =>
                    setRes((p) => ({ ...p, kind: v as ResolutionKind }))
                  }
                >
                  <SelectTrigger aria-label="Tipo de resolução">
                    <SelectValue placeholder="Adicionar resolução" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(RESOLUTION_LABELS) as ResolutionKind[])
                      .filter((k) => k !== "prorrogacao_guarda" || occ.orderId)
                      .map((k) => (
                        <SelectItem key={k} value={k}>
                          {RESOLUTION_LABELS[k]}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {res.kind === "cupom" && (
                  <div className="flex gap-1.5" role="group" aria-label="Tipo de cupom">
                    {(["flat", "percent"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={res.couponType === t}
                        onClick={() => setRes((p) => ({ ...p, couponType: t }))}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-medium",
                          res.couponType === t
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 text-slate-600",
                        )}
                      >
                        {t === "flat" ? "Valor em R$" : "Percentual"}
                      </button>
                    ))}
                  </div>
                )}
                {res.kind && RESOLUTIONS_WITH_AMOUNT.includes(res.kind) && (
                  <Input
                    inputMode="decimal"
                    aria-label="Valor"
                    placeholder={
                      res.kind === "cupom" && res.couponType === "percent"
                        ? "% de desconto"
                        : "Valor (R$)"
                    }
                    value={res.amount}
                    onChange={(e) => setRes((p) => ({ ...p, amount: e.target.value }))}
                  />
                )}
                {res.kind === "prorrogacao_guarda" && (
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="res-guard" className="text-xs text-slate-500">
                      Retirar até
                    </Label>
                    <Input
                      id="res-guard"
                      type="date"
                      value={res.guardDate}
                      onChange={(e) =>
                        setRes((p) => ({ ...p, guardDate: e.target.value }))
                      }
                    />
                  </div>
                )}
                {res.kind && (
                  <>
                    <Textarea
                      rows={2}
                      maxLength={500}
                      aria-label="Observação interna"
                      placeholder="Observação interna (opcional)"
                      value={res.note}
                      onChange={(e) => setRes((p) => ({ ...p, note: e.target.value }))}
                    />
                    {["reembolso", "credito", "sinistro"].includes(res.kind) && (
                      <p className="text-xs text-slate-500">
                        Fica registrado com o valor; o pagamento é feito no Financeiro.
                      </p>
                    )}
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void saveResolution()}
                    >
                      Registrar resolução
                    </Button>
                  </>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Dialog open={reopening} onOpenChange={setReopening}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reabrir ocorrência</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reopen-reason">Motivo</Label>
            <Textarea
              id="reopen-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopening(false)}>
              Cancelar
            </Button>
            <Button
              disabled={busy || reason.trim().length < 3}
              onClick={() =>
                void run(
                  () => reopenOccurrence(occ.id, reason.trim()),
                  "Ocorrência reaberta.",
                ).then((ok) => {
                  if (ok) {
                    setReopening(false);
                    setReason("");
                  }
                })
              }
            >
              Reabrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/pedidos/ocorrencias"
      className="inline-flex items-center gap-1 self-start text-sm text-slate-500 hover:text-slate-800"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Ocorrências
    </Link>
  );
}

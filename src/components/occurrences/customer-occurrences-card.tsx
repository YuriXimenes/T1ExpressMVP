"use client";

import { useEffect, useState } from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL } from "@/components/shared/price";
import {
  OccurrenceError,
  customerOpenOccurrence,
  fetchMyOrderOccurrences,
  fetchOccurrenceTypes,
  uploadOccurrenceFile,
  type Occurrence,
  type OccurrenceType,
} from "@/lib/occurrences/api";
import {
  RESOLUTION_LABELS,
  occurrenceCode,
  resolutionAmountLabel,
} from "@/lib/occurrences/rules";
import { cn } from "@/lib/utils";
import {
  OccurrenceStatusBadge,
  OccurrenceThread,
  dateTime,
} from "@/components/occurrences/occurrence-thread";

/** Ocorrências do pedido para o cliente: acompanhar e relatar um problema. */
export function CustomerOccurrencesCard({ orderId }: { orderId: string }) {
  const [list, setList] = useState<Occurrence[] | null>(null);
  const [types, setTypes] = useState<OccurrenceType[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    try {
      setList(await fetchMyOrderOccurrences(orderId));
    } catch {
      // Sem a migração ainda: o cartão não aparece.
      setList(null);
    }
  }

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => {
      void load();
      void fetchOccurrenceTypes("customer")
        .then(setTypes)
        .catch(() => setTypes([]));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (!list) return null;
  const selectedType = types.find((t) => t.id === typeId);

  async function submit() {
    if (busy) return;
    setError(null);
    if (!typeId) return setError("Escolha o que aconteceu.");
    if (description.trim().length < 10)
      return setError("Conte o que aconteceu (pelo menos 10 letras).");
    if (selectedType?.requiresPhoto && files.length === 0) {
      return setError("Envie pelo menos uma foto para este tipo de problema.");
    }
    setBusy(true);
    try {
      const created = await customerOpenOccurrence(orderId, typeId, description.trim());
      for (const file of files) await uploadOccurrenceFile(created.id, file);
      setReporting(false);
      setTypeId("");
      setDescription("");
      setFiles([]);
      setMessage(
        `Recebemos o seu relato (${occurrenceCode(created.number)}). Acompanhe por aqui.`,
      );
      setOpenId(created.id);
      await load();
    } catch (err) {
      setError(err instanceof OccurrenceError ? err.message : "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-3 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <TriangleAlert className="h-5 w-5 text-amber-600" aria-hidden="true" />
          Ocorrências
        </h2>
        {types.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setReporting(true)}>
            Relatar um problema
          </Button>
        )}
      </div>
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {list.length === 0 && (
        <p className="text-sm text-slate-600">
          Nenhum problema registrado neste pedido. Se algo der errado, relate aqui.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {list.map((o) => {
          const expanded = openId === o.id;
          return (
            <li key={o.id} className="rounded-xl border border-slate-200">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpenId(expanded ? null : o.id)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-slate-900">
                      {occurrenceCode(o.number)}
                    </span>
                    <span className="text-slate-700">{o.typeName}</span>
                    <OccurrenceStatusBadge occurrence={o} />
                  </span>
                  <span className="text-xs text-slate-500">
                    Aberta {dateTime(o.createdAt)}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-slate-400 transition-transform",
                    expanded && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>
              {expanded && (
                <div className="flex flex-col gap-4 border-t border-slate-100 px-4 py-4">
                  <p className="text-sm whitespace-pre-wrap text-slate-700">
                    {o.description}
                  </p>
                  {(o.resolutions ?? []).length > 0 && (
                    <div className="flex flex-col gap-1.5 rounded-lg bg-emerald-50 p-3 text-sm">
                      <p className="font-medium text-emerald-900">Solução</p>
                      {(o.resolutions ?? []).map((r) => (
                        <p key={r.id} className="text-emerald-800">
                          {RESOLUTION_LABELS[r.kind]}
                          {resolutionAmountLabel(r, formatBRL) &&
                            ` · ${resolutionAmountLabel(r, formatBRL)}`}
                          {r.couponCode && (
                            <>
                              {" · cupom "}
                              <span className="font-mono font-semibold">
                                {r.couponCode}
                              </span>
                            </>
                          )}
                          {r.newGuardUntil &&
                            ` · retire até ${dateTime(r.newGuardUntil)}`}
                        </p>
                      ))}
                    </div>
                  )}
                  {((o.refunds ?? []).length > 0 || (o.claims ?? []).length > 0) && (
                    <div className="flex flex-col gap-1 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
                      {(o.refunds ?? []).map((rf, i) => (
                        <p key={`rf${i}`}>
                          Reembolso de {formatBRL(rf.amount)}:{" "}
                          {rf.status === "pago"
                            ? `pago em ${rf.paidAt ? new Date(`${rf.paidAt}T12:00:00`).toLocaleDateString("pt-BR") : "—"}`
                            : rf.status === "cancelado"
                              ? "cancelado"
                              : "a pagar"}
                        </p>
                      ))}
                      {(o.claims ?? []).map((cl) => (
                        <p key={cl.number}>
                          Sinistro SN-{cl.number}:{" "}
                          {cl.status === "pago"
                            ? `indenização de ${formatBRL(cl.approvedAmount ?? 0)} paga em ${cl.paidAt ? new Date(`${cl.paidAt}T12:00:00`).toLocaleDateString("pt-BR") : "—"}`
                            : cl.status === "aprovado"
                              ? `indenização de ${formatBRL(cl.approvedAmount ?? 0)} aprovada, pagamento em andamento`
                              : cl.status === "negado"
                                ? "não aprovado"
                                : "em análise"}
                        </p>
                      ))}
                    </div>
                  )}
                  <OccurrenceThread occurrence={o} viewer="customer" onChanged={load} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={reporting} onOpenChange={setReporting}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Relatar um problema</DialogTitle>
            <DialogDescription>
              A equipe T1 analisa e responde por aqui. Você acompanha o status e as
              atualizações.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>O que aconteceu</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger aria-label="O que aconteceu">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedType?.description && (
                <p className="text-xs text-slate-500">{selectedType.description}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-desc">Conte os detalhes</Label>
              <Textarea
                id="report-desc"
                rows={4}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-files">
                Fotos {selectedType?.requiresPhoto ? "(obrigatório)" : "(opcional)"}
              </Label>
              <Input
                id="report-files"
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReporting(false)}>
              Cancelar
            </Button>
            <Button disabled={busy} onClick={() => void submit()}>
              {busy ? "Enviando..." : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

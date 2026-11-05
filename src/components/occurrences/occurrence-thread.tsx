"use client";

import { useRef, useState } from "react";
import { FileText, Lock, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  OccurrenceError,
  commentOccurrence,
  updateOccurrence,
  uploadOccurrenceFile,
  type Occurrence,
  type OccurrenceUpdate,
} from "@/lib/occurrences/api";
import {
  OCCURRENCE_ACTOR_LABELS,
  OCCURRENCE_STATUS_LABELS,
  RESOLUTION_LABELS,
  dueState,
  effectiveStatus,
  type OccurrenceStatus,
  type ResolutionKind,
} from "@/lib/occurrences/rules";
import { cn } from "@/lib/utils";

export const dateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    : "—";

const STATUS_STYLE: Record<OccurrenceStatus, string> = {
  aberta: "border-amber-200 bg-amber-50 text-amber-800",
  em_analise: "border-sky-200 bg-sky-50 text-sky-800",
  resolvida: "border-emerald-200 bg-emerald-50 text-emerald-800",
  encerrada: "border-slate-200 bg-slate-50 text-slate-600",
};

export function OccurrenceStatusBadge({
  occurrence,
}: {
  occurrence: Pick<Occurrence, "status" | "autoCloseAt">;
}) {
  const status = effectiveStatus(occurrence);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        STATUS_STYLE[status],
      )}
    >
      {OCCURRENCE_STATUS_LABELS[status]}
    </span>
  );
}

export function OccurrenceDueBadge({ occurrence }: { occurrence: Occurrence }) {
  const state = dueState({
    status: effectiveStatus(occurrence),
    dueAt: occurrence.dueAt,
  });
  if (!state || state === "ok") return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
        state === "overdue" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700",
      )}
    >
      {state === "overdue" ? "Prazo vencido" : "Vence em 24 h"}
    </span>
  );
}

function updateText(u: OccurrenceUpdate): string {
  switch (u.kind) {
    case "opened":
      return "Abriu a ocorrência";
    case "status":
      return `Status: ${OCCURRENCE_STATUS_LABELS[u.from as OccurrenceStatus] ?? u.from} → ${
        OCCURRENCE_STATUS_LABELS[u.to as OccurrenceStatus] ?? u.to
      }`;
    case "assign":
      return u.to ? `Responsável: ${u.to}` : "Tirou o responsável";
    case "resolution":
      return `Resolução: ${u.body ?? RESOLUTION_LABELS[u.to as ResolutionKind] ?? ""}`;
    case "attachment":
      return `Anexou ${u.body ?? "um arquivo"}`;
    case "reopened":
      return "Reabriu a ocorrência";
    default:
      return "";
  }
}

/**
 * Linha do tempo + anexos + caixa de mensagem. Serve ao admin (com nota interna),
 * ao cliente e ao entregador; o banco já filtra o que cada um pode ver.
 */
export function OccurrenceThread({
  occurrence,
  viewer,
  canWrite = true,
  onChanged,
}: {
  occurrence: Occurrence;
  viewer: "admin" | "customer" | "driver";
  canWrite?: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const closed = effectiveStatus(occurrence) === "encerrada";
  const updates = occurrence.updates ?? [];
  const attachments = occurrence.attachments ?? [];

  async function send() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (viewer === "admin") {
        await updateOccurrence(occurrence.id, { comment: body.trim(), internal });
      } else {
        await commentOccurrence(occurrence.id, body.trim());
      }
      setBody("");
      setInternal(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof OccurrenceError ? err.message : "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files))
        await uploadOccurrenceFile(occurrence.id, file);
      await onChanged();
    } catch (err) {
      setError(
        err instanceof OccurrenceError
          ? err.message
          : "Não foi possível enviar o arquivo.",
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) =>
            a.mime === "application/pdf" ? (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-center text-[10px] text-slate-600 hover:bg-slate-100"
              >
                <FileText className="h-5 w-5" aria-hidden="true" />
                <span className="line-clamp-2 break-all">{a.name ?? "PDF"}</span>
              </a>
            ) : (
              <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- link temporário do Storage */}
                <img
                  src={a.url}
                  alt={a.name ?? "Foto da ocorrência"}
                  className="h-20 w-20 rounded-lg border border-slate-200 object-cover"
                />
              </a>
            ),
          )}
        </div>
      )}

      <ol className="flex flex-col gap-3">
        {updates.map((u) => (
          <li
            key={u.id}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm",
              u.internal
                ? "border-amber-200 bg-amber-50"
                : u.kind === "comment"
                  ? "border-slate-200 bg-white"
                  : "border-transparent bg-slate-50",
            )}
          >
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span className="font-medium text-slate-700">
                {u.authorName ?? OCCURRENCE_ACTOR_LABELS[u.authorKind]}
              </span>
              {u.authorName && viewer === "admin" && (
                <span>· {OCCURRENCE_ACTOR_LABELS[u.authorKind]}</span>
              )}
              <span>· {dateTime(u.createdAt)}</span>
              {u.internal && (
                <span className="inline-flex items-center gap-0.5 font-medium text-amber-700">
                  <Lock className="h-3 w-3" aria-hidden="true" /> Nota interna
                </span>
              )}
            </p>
            {u.kind === "comment" ? (
              <p className="mt-1 whitespace-pre-wrap text-slate-800">{u.body}</p>
            ) : (
              <p className="mt-0.5 text-slate-700">
                {updateText(u)}
                {u.kind === "reopened" && u.body && (
                  <span className="text-slate-500"> · {u.body}</span>
                )}
              </p>
            )}
          </li>
        ))}
      </ol>

      {canWrite && !closed && (
        <div className="flex flex-col gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              viewer === "admin" ? "Escreva uma atualização" : "Escreva uma mensagem"
            }
            aria-label="Mensagem"
            maxLength={2000}
            rows={3}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => void upload(e.target.files)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" aria-hidden="true" />
                Anexar foto ou PDF
              </Button>
              {viewer === "admin" && (
                <label className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="accent-brand-600 h-4 w-4"
                    checked={internal}
                    onChange={(e) => setInternal(e.target.checked)}
                  />
                  Nota interna (só a equipe vê)
                </label>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              disabled={busy || !body.trim()}
              onClick={() => void send()}
            >
              {busy ? "Enviando..." : "Enviar"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      )}
      {closed && (
        <p className="text-xs text-slate-500">
          Ocorrência encerrada. {viewer === "admin" ? "Reabra para continuar." : ""}
        </p>
      )}
    </div>
  );
}

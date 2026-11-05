"use client";

import { useRef, useState } from "react";
import { Check, Copy, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PartnerDocument } from "@/lib/partners/api";
import {
  DOC_STATUS_LABELS,
  ONBOARDING_STATUS_LABELS,
  type DocStatus,
  type OnboardingStatus,
} from "@/lib/partners/rules";
import { cn } from "@/lib/utils";

export const shortDateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    : "—";

export const shortDate = (iso?: string) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

const STATUS_STYLE: Record<OnboardingStatus, string> = {
  aguardando_preenchimento: "border-slate-200 bg-slate-50 text-slate-700",
  em_analise: "border-sky-200 bg-sky-50 text-sky-800",
  pendencia: "border-amber-200 bg-amber-50 text-amber-800",
  aprovado: "border-emerald-200 bg-emerald-50 text-emerald-800",
  recusado: "border-red-200 bg-red-50 text-red-700",
};

export function OnboardingStatusBadge({ status }: { status: OnboardingStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        STATUS_STYLE[status],
      )}
    >
      {ONBOARDING_STATUS_LABELS[status]}
    </span>
  );
}

const DOC_STYLE: Record<DocStatus, string> = {
  pendente: "bg-sky-50 text-sky-800",
  aceito: "bg-emerald-50 text-emerald-800",
  recusado: "bg-red-50 text-red-700",
};

export function DocStatusBadge({ status }: { status: DocStatus }) {
  return (
    <span
      className={cn("rounded-full px-2 py-0.5 text-xs font-medium", DOC_STYLE[status])}
    >
      {DOC_STATUS_LABELS[status]}
    </span>
  );
}

/** Miniatura do arquivo (foto) ou ícone (PDF), abrindo em nova aba. */
export function DocThumb({ doc }: { doc: PartnerDocument }) {
  if (!doc.url) {
    return (
      <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[10px] text-slate-400">
        sem link
      </span>
    );
  }
  return doc.mime === "application/pdf" ? (
    <a
      href={doc.url}
      target="_blank"
      rel="noreferrer"
      className="flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 text-[10px] text-slate-600 hover:bg-slate-100"
    >
      <FileText className="h-5 w-5" aria-hidden="true" />
      PDF
    </a>
  ) : (
    <a href={doc.url} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element -- link temporário do Storage */}
      <img
        src={doc.url}
        alt={doc.name ?? "Documento"}
        className="h-14 w-14 rounded-lg border border-slate-200 object-cover"
      />
    </a>
  );
}

/** Campo com um link e o botão "Copiar". */
export function CopyLink({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      ref.current?.select();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="flex w-full items-center gap-2">
      <input
        ref={ref}
        readOnly
        value={value}
        aria-label={label ?? "Link"}
        className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700"
        onFocus={(e) => e.target.select()}
      />
      <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
        {copied ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
        {copied ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}

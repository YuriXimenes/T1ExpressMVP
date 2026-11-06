"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Price } from "@/components/shared/price";
import { useCan } from "@/lib/admin/access-provider";
import {
  AdminError,
  deletePricingVersion,
  fetchPricingVersions,
  savePricingVersion,
} from "@/lib/admin/api";
import { computeInsuranceInfo } from "@/lib/insurance";
import {
  classifyPricingVersions,
  orderFreightBRL,
  type Pricing,
  type PricingVersion,
  type PricingVersionStatus,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";

const FIELDS: { key: keyof Pricing; label: string; short: string; hint: string }[] = [
  {
    key: "baseBRL",
    label: "1ª loja do pedido",
    short: "1ª loja",
    hint: "Frete de um pedido com uma loja de coleta.",
  },
  {
    key: "extraStoreBRL",
    label: "Cada loja adicional",
    short: "Loja adicional",
    hint: "Somado ao valor da 1ª loja, por loja a mais na criação do pedido.",
  },
  {
    key: "addedStoreBRL",
    label: "Loja nova em pedido já aberto",
    short: "Loja em pedido aberto",
    hint: "Cobrado por loja adicionada depois que o pedido foi feito.",
  },
  {
    key: "insurancePer100BRL",
    label: "Seguro adicional (a cada R$ 100)",
    short: "Seguro a cada R$ 100",
    hint: "Custo a cada R$ 100 de cobertura acima dos R$ 100 já inclusos.",
  },
];

type Draft = Record<keyof Pricing, string>;

function toDraft(p: Pricing): Draft {
  return {
    baseBRL: p.baseBRL.toFixed(2),
    extraStoreBRL: p.extraStoreBRL.toFixed(2),
    addedStoreBRL: p.addedStoreBRL.toFixed(2),
    insurancePer100BRL: p.insurancePer100BRL.toFixed(2),
  };
}

/** null quando algum campo não é um número válido ≥ 0. */
function parseDraft(d: Draft): Pricing | null {
  const out = {} as Pricing;
  for (const { key } of FIELDS) {
    const raw = d[key].trim().replace(",", ".");
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n) || n < 0) return null;
    out[key] = Math.round(n * 100) / 100;
  }
  return out;
}

const dateTimeBR = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

const STATUS: Record<PricingVersionStatus, { label: string; tone: string }> = {
  vigente: {
    label: "Em vigor",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  agendado: { label: "Agendado", tone: "border-sky-200 bg-sky-50 text-sky-700" },
  anterior: { label: "Anterior", tone: "border-slate-200 text-slate-500" },
};

export function PrecosTab() {
  const canEdit = useCan("precos", "edit");
  const [versions, setVersions] = useState<PricingVersion[] | null>(null);
  const [statuses, setStatuses] = useState<Map<string, PricingVersionStatus>>(new Map());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [when, setWhen] = useState<"agora" | "agendar">("agora");
  const [scheduledAt, setScheduledAt] = useState("");
  const [minSchedule, setMinSchedule] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function load(resetDraft: boolean) {
    fetchPricingVersions()
      .then((list) => {
        const now = Date.now();
        const map = classifyPricingVersions(list, now);
        setVersions(list);
        setStatuses(map);
        // Mínimo do agendamento: daqui a 5 min, no fuso do navegador.
        const d = new Date(now + 5 * 60_000);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        setMinSchedule(d.toISOString().slice(0, 16));
        const current = list.find((v) => map.get(v.id) === "vigente");
        if (resetDraft && current) setDraft(toDraft(current));
      })
      .catch((err) =>
        setError(err instanceof AdminError ? err.message : "Não foi possível carregar."),
      );
  }
  useEffect(() => {
    queueMicrotask(() => load(true));
  }, []);

  if (!versions || !draft) {
    return error ? (
      <p className="text-sm text-red-600">{error}</p>
    ) : (
      <p className="text-sm text-slate-500">Carregando...</p>
    );
  }

  const parsed = parseDraft(draft);
  const current = versions.find((v) => statuses.get(v.id) === "vigente");
  const scheduled = versions.filter((v) => statuses.get(v.id) === "agendado");

  async function save() {
    if (isSaving) return;
    if (!parsed) return setError("Confira os valores: use números a partir de R$ 0.");
    if (when === "agendar" && !scheduledAt)
      return setError("Escolha a data e a hora em que o preço novo começa.");
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const iso = when === "agendar" ? new Date(scheduledAt).toISOString() : null;
      await savePricingVersion(parsed, iso, note.trim());
      setSuccess(
        iso
          ? `Preço agendado para ${dateTimeBR(iso)}. Até lá, o site continua com o atual.`
          : "Preço salvo e já aplicado no site.",
      );
      setNote("");
      setWhen("agora");
      setScheduledAt("");
      load(!iso);
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Não foi possível salvar.");
    } finally {
      setIsSaving(false);
    }
  }

  async function cancelScheduled(v: PricingVersion) {
    if (!window.confirm(`Cancelar o preço agendado para ${dateTimeBR(v.effectiveFrom)}?`))
      return;
    setError(null);
    try {
      await deletePricingVersion(v.id);
      setSuccess("Agendamento cancelado.");
      load(false);
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Não foi possível cancelar.");
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      {scheduled.length > 0 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          {scheduled.length === 1 ? "Há um preço agendado" : "Há preços agendados"}:{" "}
          {scheduled
            .map((v) => `${dateTimeBR(v.effectiveFrom)} (1ª loja ${brl(v.baseBRL)})`)
            .join(", ")}
          .
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
        <Card className="gap-4 p-6">
          <div>
            <h2 className="font-semibold text-slate-900">
              {canEdit ? "Novo preço" : "Preço em vigor"}
            </h2>
            <p className="text-sm text-slate-600">
              Vale para os <strong>novos</strong> pedidos. Pedidos já feitos mantêm o
              valor da época. Use R$ 0 para deixar gratuito.
              {current && ` Em vigor desde ${dateTimeBR(current.effectiveFrom)}.`}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map(({ key, label, hint }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`price-${key}`}>{label} (R$)</Label>
                <Input
                  id={`price-${key}`}
                  inputMode="decimal"
                  value={draft[key]}
                  disabled={!canEdit}
                  onChange={(e) => {
                    setDraft({ ...draft, [key]: e.target.value });
                    setSuccess(null);
                  }}
                />
                <p className="text-xs text-slate-500">{hint}</p>
              </div>
            ))}
          </div>

          {canEdit && (
            <>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-900">
                  Quando vale
                </legend>
                <div className="flex flex-wrap gap-4 text-sm">
                  {(
                    [
                      ["agora", "Agora"],
                      ["agendar", "Agendar para"],
                    ] as const
                  ).map(([v, label]) => (
                    <label key={v} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="price-when"
                        value={v}
                        checked={when === v}
                        onChange={() => setWhen(v)}
                        className="accent-brand-600"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {when === "agendar" && (
                  <Input
                    type="datetime-local"
                    aria-label="Data e hora em que o preço começa"
                    className="w-fit"
                    min={minSchedule}
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                )}
              </fieldset>
              <div className="space-y-1.5">
                <Label htmlFor="price-note">Observação (opcional)</Label>
                <Textarea
                  id="price-note"
                  rows={2}
                  maxLength={500}
                  value={note}
                  placeholder="Ex.: reajuste do combustível"
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="text-sm text-emerald-600">
              {success}
            </p>
          )}
          {canEdit && (
            <Button onClick={() => void save()} disabled={isSaving} className="w-fit">
              {isSaving
                ? "Salvando..."
                : when === "agendar"
                  ? "Agendar preço"
                  : "Salvar e aplicar agora"}
            </Button>
          )}
        </Card>

        <Card className="h-fit gap-2 p-5 text-sm">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Prévia
          </p>
          {parsed ? (
            <>
              {[1, 2, 3].map((n) => (
                <div key={n} className="flex items-center justify-between gap-2">
                  <span className="text-slate-600">
                    Pedido com {n} loja{n > 1 ? "s" : ""}
                  </span>
                  <Price value={orderFreightBRL(n, parsed)} className="font-medium" />
                </div>
              ))}
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-600">+1 loja em pedido aberto</span>
                <Price value={parsed.addedStoreBRL} className="font-medium" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-600">Seguro p/ R$ 500 em itens</span>
                <Price
                  value={
                    computeInsuranceInfo(500, parsed.insurancePer100BRL).extraCostBRL
                  }
                  className="font-medium"
                />
              </div>
            </>
          ) : (
            <p className="text-slate-400">Preencha valores válidos.</p>
          )}
        </Card>
      </div>

      <Card className="gap-3 p-6">
        <h2 className="font-semibold text-slate-900">Histórico de preços</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Vale a partir de</th>
                {FIELDS.map((f) => (
                  <th key={f.key} className="py-2 pr-4 font-medium">
                    {f.short}
                  </th>
                ))}
                <th className="py-2 pr-4 font-medium">Situação</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => {
                const st = STATUS[statuses.get(v.id) ?? "anterior"];
                return (
                  <tr key={v.id} className="border-t border-slate-100 align-top">
                    <td className="py-2.5 pr-4">
                      <p className="text-slate-900">{dateTimeBR(v.effectiveFrom)}</p>
                      {v.note && <p className="text-xs text-slate-500">{v.note}</p>}
                    </td>
                    {FIELDS.map((f) => (
                      <td key={f.key} className="py-2.5 pr-4 text-slate-700 tabular-nums">
                        {brl(v[f.key])}
                      </td>
                    ))}
                    <td className="py-2.5 pr-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                          st.tone,
                        )}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      {canEdit && statuses.get(v.id) === "agendado" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void cancelScheduled(v)}
                        >
                          Cancelar
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

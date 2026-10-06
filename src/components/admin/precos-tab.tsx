"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Price } from "@/components/shared/price";
import { AdminError, fetchPricing, updatePricing } from "@/lib/admin/api";
import { computeInsuranceInfo } from "@/lib/insurance";
import { orderFreightBRL, type Pricing } from "@/lib/pricing";

const FIELDS: { key: keyof Pricing; label: string; hint: string }[] = [
  {
    key: "baseBRL",
    label: "1ª loja do pedido",
    hint: "Frete de um pedido com uma loja de coleta.",
  },
  {
    key: "extraStoreBRL",
    label: "Cada loja adicional",
    hint: "Somado ao valor da 1ª loja, por loja a mais na criação do pedido.",
  },
  {
    key: "addedStoreBRL",
    label: "Loja nova em pedido já aberto",
    hint: "Cobrado por loja adicionada depois que o pedido foi feito.",
  },
  {
    key: "insurancePer100BRL",
    label: "Seguro adicional (a cada R$ 100)",
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

export function PrecosTab() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchPricing()
      .then((p) => setDraft(toDraft(p)))
      .catch((err) =>
        setError(err instanceof AdminError ? err.message : "Não foi possível carregar."),
      );
  }, []);

  if (!draft) {
    return error ? (
      <p className="text-sm text-red-600">{error}</p>
    ) : (
      <p className="text-sm text-slate-500">Carregando...</p>
    );
  }

  const parsed = parseDraft(draft);

  async function save() {
    if (isSaving) return;
    if (!parsed) {
      setError("Confira os valores: use números a partir de R$ 0.");
      return;
    }
    setIsSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await updatePricing(parsed);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Não foi possível salvar.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid max-w-3xl gap-4 md:grid-cols-[1fr_16rem]">
      <Card className="gap-4 p-6">
        <p className="text-sm text-slate-600">
          Valores cobrados nos <strong>novos</strong> pedidos. Pedidos já feitos mantêm o
          valor da época. Use R$ 0 para deixar gratuito: o site mostra &ldquo;R$
          0,00&rdquo; com o selo &ldquo;Grátis&rdquo;.
        </p>
        {FIELDS.map(({ key, label, hint }) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`price-${key}`}>{label} (R$)</Label>
            <Input
              id={`price-${key}`}
              inputMode="decimal"
              value={draft[key]}
              onChange={(e) => {
                setDraft({ ...draft, [key]: e.target.value });
                setSuccess(false);
              }}
            />
            <p className="text-xs text-slate-500">{hint}</p>
          </div>
        ))}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="text-sm text-emerald-600">
            Preços salvos e já aplicados no site.
          </p>
        )}
        <Button onClick={() => void save()} disabled={isSaving} className="w-fit">
          {isSaving ? "Salvando..." : "Salvar preços"}
        </Button>
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
                value={computeInsuranceInfo(500, parsed.insurancePer100BRL).extraCostBRL}
                className="font-medium"
              />
            </div>
          </>
        ) : (
          <p className="text-slate-400">Preencha valores válidos.</p>
        )}
      </Card>
    </div>
  );
}

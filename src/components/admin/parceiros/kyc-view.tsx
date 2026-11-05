"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCan } from "@/lib/admin/access-provider";
import {
  PartnerError,
  fetchOnboardings,
  startOnboarding,
  type OnboardingSummary,
} from "@/lib/partners/api";
import {
  ONBOARDING_STATUSES,
  ONBOARDING_STATUS_LABELS,
  PARTNER_KIND_LABELS,
  type OnboardingStatus,
} from "@/lib/partners/rules";
import { cn } from "@/lib/utils";
import {
  OnboardingStatusBadge,
  shortDateTime,
} from "@/components/admin/parceiros/partner-ui";

type Tab = OnboardingStatus | "todos";

/** KYC / Onboarding: cadastros de lojas parceiras por status. */
export function KycView() {
  const router = useRouter();
  const canCreate = useCan("kyc", "create");
  const [list, setList] = useState<OnboardingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("em_analise");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => {
      fetchOnboardings()
        .then(setList)
        .catch((err) =>
          setError(
            err instanceof PartnerError ? err.message : "Não foi possível carregar.",
          ),
        );
    });
  }, []);

  const counts = useMemo(() => {
    const c = Object.fromEntries(ONBOARDING_STATUSES.map((s) => [s, 0])) as Record<
      OnboardingStatus,
      number
    >;
    for (const o of list ?? []) c[o.status]++;
    return c;
  }, [list]);

  const filtered = (list ?? []).filter((o) => {
    if (tab !== "todos" && o.status !== tab) return false;
    const term = search.trim().toLowerCase();
    return (
      !term ||
      [o.tradeName, o.responsibleName, o.city, o.storeCode].some((v) =>
        (v ?? "").toLowerCase().includes(term),
      )
    );
  });

  async function startBlank() {
    setBusy(true);
    setError(null);
    try {
      const created = await startOnboarding();
      router.push(`/admin/parceiros/kyc/${created.id}`);
    } catch (err) {
      setError(err instanceof PartnerError ? err.message : "Não foi possível iniciar.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">KYC / Onboarding</h1>
          <p className="text-sm text-slate-500">
            Cadastro e verificação de novas lojas parceiras. Inicie pelo formulário de
            interesse (em Formulários) ou em branco, e envie o link para a loja.
          </p>
        </div>
        {canCreate && (
          <Button size="sm" disabled={busy} onClick={() => void startBlank()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Iniciar onboarding
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Status">
        {([...ONBOARDING_STATUSES, "todos"] as Tab[]).map((t) => (
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
            {t === "todos" ? "Todos" : ONBOARDING_STATUS_LABELS[t]}{" "}
            <span className="opacity-70">
              {t === "todos" ? (list?.length ?? 0) : counts[t]}
            </span>
          </button>
        ))}
      </div>

      <Input
        placeholder="Buscar loja, responsável ou cidade"
        aria-label="Buscar"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 w-full text-sm sm:w-72"
      />

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {!list && !error && <p className="text-sm text-slate-500">Carregando...</p>}
      {list && filtered.length === 0 && (
        <p className="text-sm text-slate-500">Nenhum cadastro neste filtro.</p>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map((o) => (
          <Link key={o.id} href={`/admin/parceiros/kyc/${o.id}`}>
            <Card className="gap-1 p-4 transition-colors hover:border-slate-300">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">
                  {o.tradeName || "Cadastro sem nome"}
                </span>
                <OnboardingStatusBadge status={o.status} />
                {o.pendingDocs > 0 && o.status === "em_analise" && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                    {o.pendingDocs} documento(s) para analisar
                  </span>
                )}
              </div>
              <p className="flex flex-wrap gap-x-3 text-xs text-slate-500">
                {o.kind && <span>{PARTNER_KIND_LABELS[o.kind]}</span>}
                {o.city && <span>{o.city}</span>}
                {o.responsibleName && <span>{o.responsibleName}</span>}
                {o.submittedAt && <span>Enviado {shortDateTime(o.submittedAt)}</span>}
                <span>Atualizado {shortDateTime(o.updatedAt)}</span>
                {o.storeCode && <span>Loja {o.storeCode}</span>}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

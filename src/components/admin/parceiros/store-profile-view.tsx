"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { formatBRL } from "@/components/shared/price";
import { useCan } from "@/lib/admin/access-provider";
import { dayKey } from "@/lib/admin/dashboard";
import {
  PartnerError,
  createStoreInvite,
  fetchStoreProfile,
  registerPayout,
  setStoreMemberActive,
  setStorePayRules,
  setStorePublished,
  storeInviteLink,
  type StorePayRule,
  type StoreProfile,
} from "@/lib/partners/api";
import {
  DOC_LABELS,
  PARTNER_KIND_LABELS,
  STORE_PAY_RULES,
  formatCnpj,
  formatCpf,
  type StorePayRuleKind,
} from "@/lib/partners/rules";
import {
  CopyLink,
  DocStatusBadge,
  DocThumb,
  OnboardingStatusBadge,
  shortDate,
} from "@/components/admin/parceiros/partner-ui";
import { FinancePanel } from "@/components/store/finance-panel";

const errorText = (err: unknown, fallback: string) =>
  err instanceof PartnerError ? err.message : fallback;
const toNumber = (v: string) => Number(v.replace(",", "."));

/** Ficha interna da loja: tudo do parceiro num lugar só. */
export function StoreProfileView({ code }: { code: string }) {
  const canEdit = useCan("lojas", "edit");
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState<(StorePayRule & { amountText: string })[]>([]);
  const [invite, setInvite] = useState<string | null>(null);
  const [payout, setPayout] = useState<{
    month: string;
    amount: string;
    paidAt: string;
    note: string;
    receipt?: File;
  } | null>(null);

  async function load() {
    try {
      const p = await fetchStoreProfile(code);
      setStore(p);
      setRules(p.payRules.map((r) => ({ ...r, amountText: String(r.amount) })));
    } catch (err) {
      setError(errorText(err, "Não foi possível carregar a ficha."));
    }
  }

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

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
      setError(errorText(err, "Não foi possível salvar."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!store) {
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

  const p = store.profile;
  const onb = store.onboarding;

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{store.name}</h1>
            <Badge variant={store.published ? "secondary" : "outline"}>
              {store.published ? "Publicada no site" : "Oculta no site"}
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            {store.code} ·{" "}
            {store.partnerKind
              ? PARTNER_KIND_LABELS[store.partnerKind]
              : store.isPickupPoint
                ? "Ponto de retirada"
                : "Coleta"}{" "}
            · {store.address}
            {store.neighborhood && ` · ${store.neighborhood}`} · {store.city}/
            {store.state}
          </p>
          {!store.hasCoordinates && (
            <p className="text-xs text-amber-700">
              Sem coordenadas: confira em Lojas antes de publicar (o km das rotas depende
              delas).
            </p>
          )}
        </div>
        {canEdit && (
          <Button
            variant={store.published ? "outline" : "default"}
            disabled={busy}
            onClick={() =>
              void run(
                () => setStorePublished(store.code, !store.published),
                store.published ? "Loja ocultada no site." : "Loja publicada no site.",
              )
            }
          >
            {store.published ? "Ocultar no site" : "Publicar no site"}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="gap-3 p-5 text-sm">
          <h2 className="font-semibold text-slate-900">Dados do parceiro</h2>
          {!p ? (
            <p className="text-slate-500">
              Loja sem cadastro de parceiro (anterior ao KYC). Os dados aparecem aqui
              quando ela passar pelo onboarding.
            </p>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              {(
                [
                  ["Razão social", p.legalName],
                  ["CNPJ", p.cnpj && formatCnpj(p.cnpj)],
                  ["Responsável", p.responsibleName],
                  ["CPF", p.responsibleCpf && formatCpf(p.responsibleCpf)],
                  ["E-mail", p.responsibleEmail],
                  ["Telefone", p.responsiblePhone],
                  [
                    "Recebimento",
                    p.payout?.method === "pix"
                      ? `Pix: ${p.payout.pixKey}`
                      : p.payout?.method === "conta"
                        ? `${p.payout.bank} · ag. ${p.payout.agency} · conta ${p.payout.account}`
                        : undefined,
                  ],
                ] as [string, string | undefined][]
              ).map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="break-words text-slate-800">{value || "—"}</dd>
                </div>
              ))}
            </dl>
          )}
          {store.openOccurrences > 0 && (
            <p className="text-xs text-amber-700">
              {store.openOccurrences} ocorrência(s) em aberto ligadas à loja.
            </p>
          )}
        </Card>

        <Card className="gap-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">KYC</h2>
            {onb && (
              <Link
                href={`/admin/parceiros/kyc/${onb.id}`}
                className="text-brand-700 text-sm font-medium hover:underline"
              >
                Ver cadastro
              </Link>
            )}
          </div>
          {!onb ? (
            <p className="text-sm text-slate-500">Sem onboarding registrado.</p>
          ) : (
            <>
              <OnboardingStatusBadge status={onb.status} />
              <ul className="flex flex-col gap-2">
                {onb.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-3">
                    <DocThumb doc={doc} />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700">{DOC_LABELS[doc.kind]}</p>
                      <DocStatusBadge status={doc.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      {!store.isPickupPoint && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Loja só de coleta: a T1 só paga pontos de retirada, então não há remuneração nem
          financeiro aqui. Se ela virar ponto de retirada, essas seções aparecem.
        </p>
      )}

      {store.isPickupPoint && (
        <Card className="gap-3 p-5">
          <h2 className="font-semibold text-slate-900">Remuneração</h2>
          <p className="text-sm text-slate-500">
            Como a loja ganha. A soma do mês é o valor a receber, pago no 5º dia útil do
            mês seguinte.
          </p>
          <fieldset disabled={!canEdit || busy} className="flex flex-col gap-2">
            {rules.length === 0 && (
              <p className="text-sm text-slate-500">
                Nenhuma regra: a loja não tem valor a receber.
              </p>
            )}
            {rules.map((r, i) => {
              const unit = STORE_PAY_RULES.find((x) => x.id === r.kind)?.unit;
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Select
                    value={r.kind}
                    onValueChange={(v) =>
                      setRules((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, kind: v as StorePayRuleKind } : x,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="w-64" aria-label="Tipo de regra">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STORE_PAY_RULES.map((k) => (
                        <SelectItem key={k.id} value={k.id}>
                          {k.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    inputMode="decimal"
                    aria-label="Valor"
                    className="w-28"
                    value={r.amountText}
                    onChange={(e) =>
                      setRules((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, amountText: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <span className="text-xs text-slate-500">{unit}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Tirar regra"
                    onClick={() => setRules((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              );
            })}
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setRules((prev) => [
                      ...prev,
                      { kind: "por_retirada", amount: 0, amountText: "" },
                    ])
                  }
                >
                  <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar regra
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    const parsed = rules.map((r) => ({
                      ...r,
                      amount: toNumber(r.amountText),
                    }));
                    if (parsed.some((r) => !Number.isFinite(r.amount) || r.amount < 0)) {
                      setError("Confira os valores das regras.");
                      return;
                    }
                    void run(
                      () => setStorePayRules(store.code, parsed),
                      "Remuneração salva.",
                    );
                  }}
                >
                  Salvar remuneração
                </Button>
              </div>
            )}
          </fieldset>
        </Card>
      )}

      {store.isPickupPoint && (
        <Card className="gap-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Financeiro</h2>
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setPayout({
                    month: store.finance.previous.month,
                    amount: String(store.finance.previous.total),
                    paidAt: dayKey(new Date()),
                    note: "",
                  })
                }
              >
                Registrar pagamento
              </Button>
            )}
          </div>
          <FinancePanel finance={store.finance} />
        </Card>
      )}

      <Card className="gap-3 p-5">
        <h2 className="font-semibold text-slate-900">Acessos da loja</h2>
        {store.members.length === 0 && (
          <p className="text-sm text-slate-500">
            Ninguém da loja tem acesso ainda. Gere um convite para o responsável.
          </p>
        )}
        <ul className="flex flex-col gap-1.5">
          {store.members.map((m) => (
            <li
              key={m.userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium text-slate-900">{m.name}</span>{" "}
                <span className="text-slate-500">· {m.email}</span>{" "}
                <Badge variant="outline">
                  {m.role === "responsavel" ? "Responsável" : "Funcionário"}
                </Badge>{" "}
                {!m.active && <Badge variant="secondary">Inativo</Badge>}
              </span>
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => setStoreMemberActive(store.code, m.userId, !m.active),
                      m.active ? "Acesso desativado." : "Acesso reativado.",
                    )
                  }
                >
                  {m.active ? "Desativar" : "Reativar"}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(
                  async () =>
                    setInvite(await createStoreInvite(store.code, "responsavel")),
                  "Convite criado.",
                )
              }
            >
              Convidar responsável
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(
                  async () =>
                    setInvite(await createStoreInvite(store.code, "funcionario")),
                  "Convite criado.",
                )
              }
            >
              Convidar funcionário
            </Button>
          </div>
        )}
        {invite && <CopyLink value={storeInviteLink(invite)} label="Link do convite" />}
        {store.invites.length > 0 && (
          <p className="text-xs text-slate-500">
            {store.invites.length} convite(s) em aberto, válidos até{" "}
            {shortDate(store.invites[0].expiresAt)}.
          </p>
        )}
      </Card>

      <Dialog open={payout !== null} onOpenChange={(o) => !o && !busy && setPayout(null)}>
        {payout && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Registrar pagamento</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-month">Mês de referência</Label>
                <Input
                  id="pay-month"
                  type="month"
                  value={payout.month}
                  onChange={(e) => {
                    const month = e.target.value;
                    const st = [
                      store.finance.current,
                      store.finance.previous,
                      ...store.finance.history,
                    ].find((s) => s.month === month);
                    setPayout({
                      ...payout,
                      month,
                      amount: st ? String(st.total) : payout.amount,
                    });
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pay-amount">Valor pago</Label>
                  <Input
                    id="pay-amount"
                    inputMode="decimal"
                    value={payout.amount}
                    onChange={(e) => setPayout({ ...payout, amount: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pay-date">Data do pagamento</Label>
                  <Input
                    id="pay-date"
                    type="date"
                    value={payout.paidAt}
                    onChange={(e) => setPayout({ ...payout, paidAt: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-receipt">Comprovante (opcional)</Label>
                <Input
                  id="pay-receipt"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setPayout({ ...payout, receipt: e.target.files?.[0] })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-note">Observação</Label>
                <Input
                  id="pay-note"
                  maxLength={500}
                  value={payout.note}
                  onChange={(e) => setPayout({ ...payout, note: e.target.value })}
                />
              </div>
              <p className="text-xs text-slate-500">
                Valor calculado para o mês:{" "}
                {formatBRL(
                  [
                    store.finance.current,
                    store.finance.previous,
                    ...store.finance.history,
                  ].find((s) => s.month === payout.month)?.total ?? 0,
                )}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={() => setPayout(null)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  busy ||
                  !payout.month ||
                  !payout.paidAt ||
                  !(toNumber(payout.amount) >= 0)
                }
                onClick={() =>
                  void run(
                    () =>
                      registerPayout(store, {
                        month: payout.month,
                        amount: toNumber(payout.amount),
                        paidAt: payout.paidAt,
                        note: payout.note.trim() || undefined,
                        receipt: payout.receipt,
                      }),
                    "Pagamento registrado.",
                  ).then((ok) => ok && setPayout(null))
                }
              >
                Registrar
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/parceiros/lojas"
      className="inline-flex items-center gap-1 self-start text-sm text-slate-500 hover:text-slate-800"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Lojas
    </Link>
  );
}

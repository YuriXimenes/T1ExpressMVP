"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCan } from "@/lib/admin/access-provider";
import {
  AdminError,
  fetchCouponOrders,
  fetchCoupons,
  upsertCoupon,
  type AdminCoupon,
  type CouponInput,
  type CouponOrder,
} from "@/lib/admin/api";
import { cn } from "@/lib/utils";

const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
const dayBR = (d: string) => d.split("-").reverse().join("/");
const dateBR = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

function formatValue(c: { type: "percent" | "flat"; value: number }) {
  return c.type === "percent" ? `${c.value}%` : brl(c.value);
}

/** Resumo das regras em etiquetas curtas. */
function ruleChips(c: AdminCoupon): string[] {
  const out: string[] = [];
  if (c.validFrom && c.validUntil)
    out.push(`${dayBR(c.validFrom)} a ${dayBR(c.validUntil)}`);
  else if (c.validFrom) out.push(`a partir de ${dayBR(c.validFrom)}`);
  else if (c.validUntil) out.push(`até ${dayBR(c.validUntil)}`);
  if (c.maxUsesPerUser) out.push(`${c.maxUsesPerUser}× por cliente`);
  if (c.minOrderBRL) out.push(`mínimo ${brl(c.minOrderBRL)}`);
  if (c.firstPurchaseOnly) out.push("só 1ª compra");
  return out;
}

/** Situação para o cliente hoje (além de ativo/inativo). */
function couponState(c: AdminCoupon, today: string): { label: string; tone: string } {
  if (!c.active) return { label: "Inativo", tone: "border-slate-200 text-slate-500" };
  if (c.validUntil && today > c.validUntil)
    return { label: "Vencido", tone: "border-amber-200 bg-amber-50 text-amber-700" };
  if (c.validFrom && today < c.validFrom)
    return { label: "Agendado", tone: "border-sky-200 bg-sky-50 text-sky-700" };
  if (c.maxUses && c.uses >= c.maxUses)
    return { label: "Esgotado", tone: "border-amber-200 bg-amber-50 text-amber-700" };
  return { label: "Ativo", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" };
}

type Draft = {
  code: string;
  type: "percent" | "flat";
  value: string;
  label: string;
  active: boolean;
  validFrom: string;
  validUntil: string;
  maxUses: string;
  maxUsesPerUser: string;
  minOrderBRL: string;
  firstPurchaseOnly: boolean;
  note: string;
};

function toDraft(c: AdminCoupon | null): Draft {
  if (!c) {
    return {
      code: "",
      type: "percent",
      value: "10",
      label: "",
      active: true,
      validFrom: "",
      validUntil: "",
      maxUses: "",
      maxUsesPerUser: "1",
      minOrderBRL: "",
      firstPurchaseOnly: false,
      note: "",
    };
  }
  return {
    code: c.code,
    type: c.type,
    value: String(c.value),
    label: c.label,
    active: c.active,
    validFrom: c.validFrom ?? "",
    validUntil: c.validUntil ?? "",
    maxUses: c.maxUses ? String(c.maxUses) : "",
    maxUsesPerUser: c.maxUsesPerUser ? String(c.maxUsesPerUser) : "",
    minOrderBRL: c.minOrderBRL ? String(c.minOrderBRL) : "",
    firstPurchaseOnly: c.firstPurchaseOnly,
    note: c.note ?? "",
  };
}

function num(s: string): number | undefined {
  const t = s.trim().replace(",", ".");
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function toInput(d: Draft): CouponInput | string {
  const value = num(d.value);
  if (value === undefined || Number.isNaN(value) || value <= 0)
    return "Informe o valor do desconto.";
  if (d.type === "percent" && value > 100) return "O percentual vai até 100%.";
  if (!d.label.trim()) return "Informe o rótulo mostrado ao cliente.";
  const maxUses = num(d.maxUses);
  const perUser = num(d.maxUsesPerUser);
  const min = num(d.minOrderBRL);
  for (const n of [maxUses, perUser])
    if (n !== undefined && (Number.isNaN(n) || n < 1 || !Number.isInteger(n)))
      return "Os limites de uso são números inteiros a partir de 1.";
  if (min !== undefined && (Number.isNaN(min) || min < 0))
    return "Confira o pedido mínimo.";
  if (d.validFrom && d.validUntil && d.validUntil < d.validFrom)
    return "A validade termina antes de começar.";
  return {
    type: d.type,
    value,
    label: d.label.trim(),
    active: d.active,
    validFrom: d.validFrom || undefined,
    validUntil: d.validUntil || undefined,
    maxUses,
    maxUsesPerUser: perUser,
    minOrderBRL: min,
    firstPurchaseOnly: d.firstPurchaseOnly,
    note: d.note.trim() || undefined,
  };
}

function CouponDialog({
  coupon,
  onClose,
  onSaved,
}: {
  coupon: AdminCoupon | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !coupon;
  const [d, setD] = useState<Draft>(() => toDraft(coupon));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setD((p) => ({ ...p, [k]: v }));

  async function save() {
    const input = toInput(d);
    if (typeof input === "string") return setError(input);
    if (!d.code.trim()) return setError("Informe o código.");
    setSaving(true);
    setError(null);
    try {
      await upsertCoupon(d.code, input);
      onSaved();
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Novo cupom" : `Editar ${coupon.code}`}</DialogTitle>
          {coupon?.ownerName && (
            <DialogDescription>
              Cupom de ocorrência: só {coupon.ownerName} pode usar, uma vez.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_8rem_7rem]">
            <div className="space-y-1.5">
              <Label htmlFor="coupon-code">Código</Label>
              <Input
                id="coupon-code"
                value={d.code}
                disabled={!isNew}
                placeholder="EX.: T1NATAL"
                onChange={(e) => set("code", e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coupon-type">Tipo</Label>
              <Select
                value={d.type}
                onValueChange={(v) => set("type", v as "percent" | "flat")}
              >
                <SelectTrigger id="coupon-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percentual</SelectItem>
                  <SelectItem value="flat">Valor fixo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coupon-value">{d.type === "percent" ? "%" : "R$"}</Label>
              <Input
                id="coupon-value"
                inputMode="decimal"
                value={d.value}
                onChange={(e) => set("value", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coupon-label">Rótulo (mostrado ao cliente)</Label>
            <Input
              id="coupon-label"
              value={d.label}
              placeholder="Ex.: 10% off no frete"
              onChange={(e) => set("label", e.target.value)}
            />
          </div>

          <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-xs font-medium text-slate-500">
              Regras (vazio = sem limite)
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="coupon-from">Vale de</Label>
                <Input
                  id="coupon-from"
                  type="date"
                  value={d.validFrom}
                  onChange={(e) => set("validFrom", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-until">Até (inclusive)</Label>
                <Input
                  id="coupon-until"
                  type="date"
                  value={d.validUntil}
                  onChange={(e) => set("validUntil", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="coupon-max">Usos no total</Label>
                <Input
                  id="coupon-max"
                  inputMode="numeric"
                  value={d.maxUses}
                  onChange={(e) => set("maxUses", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-per">Por cliente</Label>
                <Input
                  id="coupon-per"
                  inputMode="numeric"
                  value={d.maxUsesPerUser}
                  onChange={(e) => set("maxUsesPerUser", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-min">Frete mínimo</Label>
                <Input
                  id="coupon-min"
                  inputMode="decimal"
                  placeholder="R$"
                  value={d.minOrderBRL}
                  onChange={(e) => set("minOrderBRL", e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              O mínimo é o valor do frete antes do desconto. Pedido cancelado libera o
              uso.
            </p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="coupon-first"
                checked={d.firstPurchaseOnly}
                onCheckedChange={(c) => set("firstPurchaseOnly", c === true)}
              />
              <Label htmlFor="coupon-first" className="font-normal">
                Só na primeira compra do cliente
              </Label>
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="coupon-note">Observação interna</Label>
            <Textarea
              id="coupon-note"
              rows={2}
              maxLength={500}
              value={d.note}
              placeholder="Ex.: campanha de Natal no Instagram"
              onChange={(e) => set("note", e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="coupon-active"
              checked={d.active}
              onCheckedChange={(c) => set("active", c === true)}
            />
            <Label htmlFor="coupon-active" className="font-normal">
              Ativo
            </Label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ORDER_STATUS: Record<CouponOrder["status"], string> = {
  "pending-payment": "Aguardando pagamento",
  active: "Ativo",
  completed: "Concluído",
  cancelled: "Cancelado",
};

function CouponOrdersDialog({ code, onClose }: { code: string; onClose: () => void }) {
  const [orders, setOrders] = useState<CouponOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    queueMicrotask(() => {
      fetchCouponOrders(code)
        .then(setOrders)
        .catch((err) =>
          setError(
            err instanceof AdminError ? err.message : "Não foi possível carregar.",
          ),
        );
    });
  }, [code]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pedidos com {code}</DialogTitle>
          <DialogDescription>Os 100 mais recentes.</DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!orders && !error && <p className="text-sm text-slate-500">Carregando...</p>}
        {orders?.length === 0 && (
          <p className="text-sm text-slate-500">Nenhum pedido usou este cupom.</p>
        )}
        {orders && orders.length > 0 && (
          <ul className="divide-y divide-slate-100 text-sm">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/pedidos/${o.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-slate-900">
                      #{o.id.slice(0, 8).toUpperCase()}
                    </span>{" "}
                    <span className="text-slate-500">
                      · {o.customerName ?? "Cliente"} · {dateBR(o.createdAt)}
                    </span>
                    <span
                      className={cn(
                        "block text-xs",
                        o.status === "cancelled" ? "text-slate-400" : "text-slate-500",
                      )}
                    >
                      {ORDER_STATUS[o.status]}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium text-emerald-600 tabular-nums">
                    -{brl(o.discountBRL)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

type Filter = "gerais" | "ocorrencia";

export function CuponsTab() {
  const canCreate = useCan("cupons", "create");
  const canEdit = useCan("cupons", "edit");
  const [coupons, setCoupons] = useState<AdminCoupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    coupon: AdminCoupon | null;
    key: number;
  } | null>(null);
  const [ordersOf, setOrdersOf] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("gerais");
  const [today, setToday] = useState("");

  function load() {
    fetchCoupons()
      .then((list) => {
        setCoupons(list);
        setToday(
          new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }),
        );
      })
      .catch((err) =>
        setError(err instanceof AdminError ? err.message : "Não foi possível carregar."),
      );
  }
  useEffect(() => {
    queueMicrotask(load);
  }, []);

  const visible = useMemo(
    () =>
      (coupons ?? []).filter((c) =>
        filter === "ocorrencia" ? !!c.ownerUserId : !c.ownerUserId,
      ),
    [coupons, filter],
  );
  const totals = useMemo(() => {
    const list = coupons ?? [];
    return {
      gerais: list.filter((c) => !c.ownerUserId).length,
      ocorrencia: list.filter((c) => c.ownerUserId).length,
      paid: list.reduce((s, c) => s + c.paidUses, 0),
      discount: list.reduce((s, c) => s + c.discountTotal, 0),
    };
  }, [coupons]);

  async function toggleActive(c: AdminCoupon) {
    try {
      await upsertCoupon(c.code, { ...c, active: !c.active });
      load();
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Não foi possível salvar.");
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!coupons) return <p className="text-sm text-slate-500">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Tipo de cupom">
          {(
            [
              ["gerais", "Gerais", totals.gerais],
              ["ocorrencia", "De ocorrência", totals.ocorrencia],
            ] as const
          ).map(([f, label, n]) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm font-medium",
                filter === f
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {label} <span className="opacity-70">{n}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <p className="text-sm text-slate-500">
            {totals.paid} {totals.paid === 1 ? "uso pago" : "usos pagos"} ·{" "}
            <span className="font-medium text-slate-700">{brl(totals.discount)}</span> em
            desconto
          </p>
          {canCreate && (
            <Button
              size="sm"
              onClick={() => setEditing({ coupon: null, key: Date.now() })}
            >
              Novo cupom
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Código</th>
              <th className="px-4 py-2 font-medium">Desconto</th>
              <th className="px-4 py-2 font-medium">Regras</th>
              <th className="px-4 py-2 font-medium">Usos</th>
              <th className="px-4 py-2 font-medium">Concedido</th>
              <th className="px-4 py-2 font-medium">Situação</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  {filter === "ocorrencia"
                    ? "Nenhum cupom gerado por ocorrência."
                    : "Nenhum cupom cadastrado."}
                </td>
              </tr>
            )}
            {visible.map((c) => {
              const state = couponState(c, today);
              const chips = ruleChips(c);
              return (
                <tr key={c.code} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-900">{c.code}</p>
                    <p className="text-xs text-slate-500">{c.label}</p>
                    {c.ownerName && (
                      <p className="text-xs text-slate-500">Só para {c.ownerName}</p>
                    )}
                    {c.note && !c.ownerUserId && (
                      <p className="text-xs text-slate-400 italic">{c.note}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{formatValue(c)}</td>
                  <td className="px-4 py-2.5">
                    {chips.length === 0 ? (
                      <span className="text-xs text-slate-400">Sem limite</span>
                    ) : (
                      <div className="flex max-w-56 flex-wrap gap-1">
                        {chips.map((t) => (
                          <Badge key={t} variant="outline" className="font-normal">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 tabular-nums">
                    {c.uses}
                    {c.maxUses ? ` / ${c.maxUses}` : ""}
                    {c.lastUsedAt && (
                      <span className="block text-xs text-slate-400">
                        último {dateBR(c.lastUsedAt)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 tabular-nums">
                    {brl(c.discountTotal)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                        state.tone,
                      )}
                    >
                      {state.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setOrdersOf(c.code)}>
                      Pedidos
                    </Button>
                    {canEdit && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing({ coupon: c, key: Date.now() })}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void toggleActive(c)}
                        >
                          {c.active ? "Desativar" : "Ativar"}
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <CouponDialog
          key={editing.key}
          coupon={editing.coupon}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {ordersOf && (
        <CouponOrdersDialog code={ordersOf} onClose={() => setOrdersOf(null)} />
      )}
    </div>
  );
}

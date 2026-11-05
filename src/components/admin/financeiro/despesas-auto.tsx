"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/lib/admin/access-provider";
import { orderCode } from "@/lib/admin/order-moves";
import { PAY_RULE_KINDS, payRulesText } from "@/lib/admin/access";
import {
  FinanceError,
  addTeamAdjustment,
  cancelRefund,
  payRefund,
  payStore,
  payTeamMember,
  removeTeamAdjustment,
  type AutoExpenses,
} from "@/lib/finance/api";
import { claimCode, shiftMonth } from "@/lib/finance/rules";
import { nthBusinessDay, monthLabel } from "@/lib/partners/rules";
import { cn } from "@/lib/utils";
import {
  PaymentDialog,
  ReceiptLink,
  StatusPill,
  dateBR,
  money,
  toNumber,
} from "@/components/admin/financeiro/finance-ui";

const TEAM_KINDS = {
  entregador: "Entregador",
  funcionario: "Funcionário",
  prestador: "Prestador",
} as const;

type Paying =
  | { kind: "team"; id: string; name: string; amount: number }
  | { kind: "store"; id: string; code: string; name: string; amount: number }
  | { kind: "refund"; id: string; name: string; amount: number };

/**
 * Custos do mês que a plataforma já sabe, com o pagamento ao lado: equipe, lojas,
 * sinistros e reembolsos. É aqui que se vê e se paga (a permissão de Repasses
 * controla os botões de pagamento).
 */
export function AutoExpensesSection({
  auto,
  month,
  current,
  onChanged,
}: {
  auto: AutoExpenses;
  /** "AAAA-MM" escolhido na tela. */
  month: string;
  /** O mês escolhido é o mês corrente (valores ainda em andamento). */
  current: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const canPay = useCan("repasses", "edit");
  const [paying, setPaying] = useState<Paying | null>(null);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [adjAmount, setAdjAmount] = useState("");
  const [adjText, setAdjText] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelText, setCancelText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
      await onChanged();
      setMessage(done);
      return true;
    } catch (err) {
      setError(err instanceof FinanceError ? err.message : "Não foi possível concluir.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const due = nthBusinessDay(shiftMonth(month, 1), 5);
  const person = auto.team.people.find((p) => p.id === adjusting);

  return (
    <section className="flex flex-col gap-3" aria-label="Custos automáticos">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Puxado automaticamente</h2>
        <p className="text-sm text-slate-500">
          Estes custos já estão na plataforma e não precisam ser lançados.
          {current &&
            " O mês está em andamento: os valores sobem conforme as viagens são concluídas."}{" "}
          Equipe e lojas de {monthLabel(month).toLowerCase()} são pagas até {dateBR(due)}{" "}
          (5º dia útil do mês seguinte).
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      {/* 3 colunas: cada cartão rola por dentro, então a lista de um não empurra os outros. */}
      <div className="grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3">
        <AutoCard
          title="Combustível das viagens"
          tag="Operação"
          total={auto.fuel.total}
          hint="km ÷ consumo do veículo × preço do litro, das viagens concluídas no mês."
          link={{ href: "/admin/pedidos/rotas", label: "Ver viagens" }}
          empty={
            auto.fuel.trips.length === 0
              ? "Nenhuma viagem concluída neste mês."
              : undefined
          }
        >
          {auto.fuel.trips.map((t) => (
            <Row
              key={t.id}
              title={
                <Link href={`/admin/pedidos/rotas/${t.id}`} className="hover:underline">
                  {dateBR(t.day)} · {t.driverName ?? "—"}
                </Link>
              }
              detail={[t.vehicleName, t.km !== undefined ? `${t.km} km` : undefined]
                .filter(Boolean)
                .join(" · ")}
              value={t.cost !== undefined ? money(t.cost) : "sem veículo"}
            />
          ))}
        </AutoCard>

        <AutoCard
          title="Equipe"
          tag="Pessoal"
          total={auto.team.total}
          hint="Pelo formato de pagamento de cada pessoa na Equipe: fixo, por viagem e avulsos."
          link={{ href: "/admin/pessoas/equipe", label: "Formatos na Equipe" }}
          empty={
            !auto.team.detailed
              ? "O detalhe por pessoa fica com quem tem acesso a Repasses ou Pessoas."
              : auto.team.people.length === 0
                ? "Ninguém na Equipe com valor neste mês."
                : undefined
          }
        >
          {auto.team.people.map((p) => {
            const s = p.statement;
            const variable = p.rules.filter((r) => r.kind !== "fixo_mensal");
            const monthLine = [
              s.fixed > 0 ? `fixo ${money(s.fixed)}` : undefined,
              p.kind === "entregador"
                ? `${s.trips} viagem(ns) ${money(s.tripCost)}${
                    variable.length === 0 ? " (sem regra por viagem)" : ""
                  }`
                : undefined,
              s.adjustmentsTotal !== 0
                ? `avulsos ${money(s.adjustmentsTotal)}`
                : undefined,
            ]
              .filter(Boolean)
              .join(" · ");
            const onlyAsAdjustment =
              p.kind !== "entregador" && variable.some((r) => r.kind !== "bonus")
                ? `Regra por ${variable
                    .map((r) =>
                      PAY_RULE_KINDS.find((k) => k.id === r.kind)
                        ?.label.toLowerCase()
                        .replace("por ", ""),
                    )
                    .join(", ")} só entra como avulso.`
                : undefined;
            return (
              <Row
                key={p.id}
                title={p.name}
                badges={
                  <>
                    <Badge variant="outline">{TEAM_KINDS[p.kind]}</Badge>
                    {p.status !== "ativo" && <Badge variant="secondary">Inativo</Badge>}
                    <StatusPill
                      status={s.payout ? "pago" : "a_pagar"}
                      label={s.payout ? "Pago" : "A pagar"}
                    />
                  </>
                }
                detail={[
                  `Formato: ${payRulesText(p.rules)}`,
                  monthLine,
                  onlyAsAdjustment,
                ]}
                value={money(s.total)}
                paid={
                  s.payout ? (
                    <span className="text-xs text-emerald-700">
                      Pago {money(s.payout.amount)} em {dateBR(s.payout.paidAt)}{" "}
                      <ReceiptLink path={s.payout.receiptPath} />
                    </span>
                  ) : undefined
                }
                actions={
                  canPay ? (
                    <>
                      <Button
                        size="sm"
                        variant={s.payout ? "outline" : "default"}
                        disabled={busy}
                        onClick={() =>
                          setPaying({
                            kind: "team",
                            id: p.id,
                            name: p.name,
                            amount: s.total,
                          })
                        }
                      >
                        {s.payout ? "Corrigir pagamento" : "Registrar pagamento"}
                      </Button>
                      {!s.payout && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            setAdjAmount("");
                            setAdjText("");
                            setAdjusting(p.id);
                          }}
                        >
                          Avulsos
                        </Button>
                      )}
                    </>
                  ) : undefined
                }
              />
            );
          })}
        </AutoCard>

        <AutoCard
          title="Repasses a lojas"
          tag="Parceiros"
          total={auto.stores.total}
          hint="Pelas regras de remuneração de cada ponto de retirada."
          link={{ href: "/admin/parceiros/lojas", label: "Fichas das lojas" }}
          empty={
            auto.stores.items.length === 0
              ? "Nenhum ponto de retirada com remuneração cadastrada."
              : undefined
          }
        >
          {auto.stores.items.map((s) => (
            <Row
              key={s.code}
              title={
                <Link
                  href={`/admin/parceiros/lojas/${s.code}`}
                  className="hover:underline"
                >
                  {s.name}
                </Link>
              }
              badges={
                <StatusPill
                  status={s.paid ? "pago" : "a_pagar"}
                  label={s.paid ? "Pago" : "A pagar"}
                />
              }
              value={money(s.total)}
              paid={
                s.payout ? (
                  <span className="text-xs text-emerald-700">
                    Pago {money(s.payout.amount)} em {dateBR(s.payout.paidAt)}{" "}
                    <ReceiptLink path={s.payout.receiptPath} />
                  </span>
                ) : undefined
              }
              actions={
                canPay ? (
                  <Button
                    size="sm"
                    variant={s.payout ? "outline" : "default"}
                    disabled={busy}
                    onClick={() =>
                      setPaying({
                        kind: "store",
                        id: s.id,
                        code: s.code,
                        name: s.name,
                        amount: s.total,
                      })
                    }
                  >
                    {s.payout ? "Corrigir pagamento" : "Registrar pagamento"}
                  </Button>
                ) : undefined
              }
            />
          ))}
        </AutoCard>

        <AutoCard
          title="Sinistros"
          tag="Perdas"
          total={auto.claims.total}
          hint="Total pago no mês. Indenizações aprovadas e ainda a pagar aparecem primeiro na lista."
          extra={
            auto.claims.pending > 0 ? `A pagar: ${money(auto.claims.pending)}` : undefined
          }
          link={{ href: "/admin/financeiro/sinistros", label: "Ver sinistros" }}
          empty={
            auto.claims.items.length === 0
              ? "Nenhum sinistro a pagar ou pago neste mês."
              : undefined
          }
        >
          {auto.claims.items.map((c) => (
            <Row
              key={c.id}
              title={
                <Link
                  href={`/admin/financeiro/sinistros/${c.id}`}
                  className="hover:underline"
                >
                  {claimCode(c.number)}
                  {c.customerName ? ` · ${c.customerName}` : ""}
                </Link>
              }
              badges={
                <StatusPill
                  status={c.status === "pago" ? "pago" : "a_pagar"}
                  label={c.status === "pago" ? "Pago" : "A pagar"}
                />
              }
              detail={[
                c.orderId ? `Pedido #${orderCode(c.orderId)}` : undefined,
                c.paidAt
                  ? `pago em ${dateBR(c.paidAt)}`
                  : "aprovado, aguardando pagamento",
              ]
                .filter(Boolean)
                .join(" · ")}
              value={money(c.amount)}
              paid={c.receiptPath ? <ReceiptLink path={c.receiptPath} /> : undefined}
              actions={
                c.status === "aprovado" && canPay ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/admin/financeiro/sinistros/${c.id}`}>
                      Pagar no sinistro
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ))}
        </AutoCard>

        <AutoCard
          title="Reembolsos a clientes"
          tag="Perdas"
          total={auto.refunds.total}
          hint="Total pago no mês. Reembolsos ainda a pagar aparecem primeiro na lista."
          extra={
            auto.refunds.pending > 0
              ? `A pagar: ${money(auto.refunds.pending)}`
              : undefined
          }
          link={{ href: "/admin/pedidos/ocorrencias", label: "Ver ocorrências" }}
          empty={
            auto.refunds.items.length === 0
              ? "Nenhum reembolso a pagar ou pago neste mês."
              : undefined
          }
        >
          {auto.refunds.items.map((r) => (
            <Row
              key={r.id}
              title={
                r.customerName ??
                (r.orderId ? `Pedido #${orderCode(r.orderId)}` : "Reembolso")
              }
              badges={
                <StatusPill
                  status={r.status === "pago" ? "pago" : "a_pagar"}
                  label={r.status === "pago" ? "Pago" : "A pagar"}
                />
              }
              detail={[
                r.orderId ? `Pedido #${orderCode(r.orderId)}` : undefined,
                r.paidAt ? `pago em ${dateBR(r.paidAt)}` : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
              value={money(r.amount)}
              paid={r.receiptPath ? <ReceiptLink path={r.receiptPath} /> : undefined}
              actions={
                r.status === "a_pagar" && canPay ? (
                  <>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        setPaying({
                          kind: "refund",
                          id: r.id,
                          name: r.customerName ?? "cliente",
                          amount: r.amount,
                        })
                      }
                    >
                      Registrar pagamento
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setCancelText("");
                        setCancelling(r.id);
                      }}
                    >
                      Cancelar
                    </Button>
                  </>
                ) : undefined
              }
            />
          ))}
        </AutoCard>
      </div>

      <PaymentDialog
        key={paying ? `${paying.kind}-${paying.id}` : "closed"}
        open={paying !== null}
        title={
          paying?.kind === "refund"
            ? `Reembolso · ${paying.name}`
            : paying
              ? `${paying.name} · ${monthLabel(month).toLowerCase()}`
              : ""
        }
        suggestedAmount={paying?.kind === "refund" ? undefined : paying?.amount}
        askAmount={paying?.kind !== "refund"}
        onClose={() => setPaying(null)}
        onConfirm={async (input) => {
          if (!paying) return;
          if (paying.kind === "team") await payTeamMember(paying.id, month, input);
          else if (paying.kind === "store")
            await payStore({ id: paying.id, code: paying.code }, month, input);
          else await payRefund(paying.id, input);
          await onChanged();
          setMessage("Pagamento registrado.");
        }}
      />

      <Dialog
        open={adjusting !== null}
        onOpenChange={(o) => !o && !busy && setAdjusting(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Avulsos · {person?.name} · {monthLabel(month).toLowerCase()}
            </DialogTitle>
          </DialogHeader>
          <ul className="flex flex-col gap-1.5">
            {person?.statement.adjustments.length === 0 && (
              <li className="text-sm text-slate-500">Nenhum avulso neste mês.</li>
            )}
            {person?.statement.adjustments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{a.description}</span>
                <span className="flex items-center gap-1">
                  <span className={cn("tabular-nums", a.amount < 0 && "text-red-600")}>
                    {money(a.amount)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Tirar avulso"
                    disabled={busy}
                    onClick={() =>
                      void run(() => removeTeamAdjustment(a.id), "Avulso removido.")
                    }
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
            <Input
              aria-label="Descrição"
              placeholder="Descrição (ex.: diária extra, desconto de avaria)"
              maxLength={200}
              value={adjText}
              onChange={(e) => setAdjText(e.target.value)}
            />
            <div className="flex gap-2">
              <Input
                aria-label="Valor"
                inputMode="decimal"
                placeholder="Valor (negativo para desconto)"
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
              />
              <Button
                disabled={busy || !adjText.trim() || !toNumber(adjAmount)}
                onClick={() =>
                  adjusting &&
                  void run(async () => {
                    await addTeamAdjustment(
                      adjusting,
                      month,
                      toNumber(adjAmount),
                      adjText.trim(),
                    );
                    setAdjAmount("");
                    setAdjText("");
                  }, "Avulso lançado.")
                }
              >
                Adicionar
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjusting(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelling !== null}
        onOpenChange={(o) => !o && !busy && setCancelling(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar reembolso</DialogTitle>
          </DialogHeader>
          <Textarea
            rows={2}
            aria-label="Motivo"
            placeholder="Motivo"
            value={cancelText}
            onChange={(e) => setCancelText(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={busy || cancelText.trim().length < 3}
              onClick={() =>
                cancelling &&
                void run(
                  () => cancelRefund(cancelling, cancelText.trim()),
                  "Reembolso cancelado.",
                ).then((ok) => ok && setCancelling(null))
              }
            >
              Cancelar reembolso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Cartão em blocos fixos: título e total, etiquetas, explicação, lista e rodapé com o link. */
function AutoCard({
  title,
  tag,
  total,
  hint,
  extra,
  link,
  empty,
  children,
}: {
  title: string;
  tag: string;
  total: number;
  hint: string;
  /** Destaque curto sob a explicação (ex.: "A pagar: R$ 25,00"). */
  extra?: string;
  link: { href: string; label: string };
  empty?: string;
  children?: ReactNode;
}) {
  return (
    <Card className="h-full gap-0 overflow-hidden p-0">
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-base leading-tight font-semibold text-slate-900">
            {title}
          </h3>
          <p className="shrink-0 text-lg leading-tight font-semibold text-slate-900 tabular-nums">
            {money(total)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{tag}</Badge>
          <Badge variant="secondary">Automático</Badge>
        </div>
        <p className="text-xs leading-snug text-slate-500">{hint}</p>
        {extra && <p className="text-xs font-semibold text-amber-700">{extra}</p>}
      </div>
      <div className="flex-1 border-t border-slate-100 px-4">
        {empty ? (
          <p className="py-3 text-xs text-slate-400">{empty}</p>
        ) : (
          <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {children}
          </div>
        )}
      </div>
      <div className="border-t border-slate-100 px-4 py-2.5">
        <Link
          href={link.href}
          className="text-brand-700 text-xs font-medium hover:underline"
        >
          {link.label} →
        </Link>
      </div>
    </Card>
  );
}

/** Uma linha da lista: título e valor, etiquetas, detalhes, pagamento feito e ações. */
function Row({
  title,
  value,
  badges,
  detail,
  paid,
  actions,
}: {
  title: ReactNode;
  value: string;
  badges?: ReactNode;
  detail?: string | (string | undefined)[];
  paid?: ReactNode;
  actions?: ReactNode;
}) {
  const lines = (Array.isArray(detail) ? detail : [detail]).filter(Boolean) as string[];
  return (
    <div className="flex flex-col gap-1 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-medium text-slate-900">{title}</p>
        <p className="shrink-0 text-sm font-semibold text-slate-900 tabular-nums">
          {value}
        </p>
      </div>
      {badges && <div className="flex flex-wrap items-center gap-1.5">{badges}</div>}
      {lines.map((line) => (
        <p key={line} className="text-xs leading-snug text-slate-500">
          {line}
        </p>
      ))}
      {paid}
      {actions && <div className="mt-1 flex flex-wrap gap-1.5">{actions}</div>}
    </div>
  );
}

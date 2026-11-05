"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Settings2 } from "lucide-react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCatalog } from "@/lib/catalog/provider";
import { useCan } from "@/lib/admin/access-provider";
import { dayKey } from "@/lib/admin/dashboard";
import {
  FinanceError,
  deleteExpense,
  fetchAutoExpenses,
  fetchExpenseCategories,
  fetchExpenses,
  payExpense,
  reviewExpense,
  saveExpense,
  upsertExpenseCategory,
  type AutoExpenses,
  type Expense,
  type ExpenseCategory,
} from "@/lib/finance/api";
import {
  EXPENSE_GROUPS,
  EXPENSE_GROUP_LABELS,
  EXPENSE_STATUS_LABELS,
  autoTotal,
  currentMonthKey,
  expenseCode,
  manualCosts,
  shiftMonth,
  type ExpenseGroup,
  type ExpenseStatus,
} from "@/lib/finance/rules";
import { cn } from "@/lib/utils";
import { AutoExpensesSection } from "@/components/admin/financeiro/despesas-auto";
import {
  Kpi,
  MonthPicker,
  PaymentDialog,
  ReceiptLink,
  StatusPill,
  dateBR,
  money,
  toNumber,
} from "@/components/admin/financeiro/finance-ui";

const ALL = "all";
const NONE = "none";
const errorText = (err: unknown, fallback: string) =>
  err instanceof FinanceError ? err.message : fallback;

interface Form {
  categoryId: string;
  description: string;
  amount: string;
  competence: string;
  dueDate: string;
  storeCode: string;
  note: string;
  files: File[];
}

const emptyForm = (): Form => ({
  categoryId: "",
  description: "",
  amount: "",
  competence: dayKey(new Date()),
  dueDate: "",
  storeCode: NONE,
  note: "",
  files: [],
});

/** Despesas: lançar, aprovar (outra pessoa), pagar com comprovante. */
export function DespesasView() {
  const { stores } = useCatalog();
  const canCreate = useCan("despesas", "create");
  const canEdit = useCan("despesas", "edit");
  const canDelete = useCan("despesas", "delete");
  const [month, setMonth] = useState(currentMonthKey);
  const [list, setList] = useState<Expense[] | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [status, setStatus] = useState<ExpenseStatus | typeof ALL>(ALL);
  const [group, setGroup] = useState<ExpenseGroup | typeof ALL>(ALL);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Expense | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [paying, setPaying] = useState<Expense | null>(null);
  const [managing, setManaging] = useState(false);
  const [auto, setAuto] = useState<AutoExpenses | null>(null);
  const [view, setView] = useState<"tudo" | "automaticas" | "lancadas">("tudo");
  const [thisMonth, setThisMonth] = useState("");

  async function load() {
    try {
      const from = `${month}-01`;
      const to = `${shiftMonth(month, 1)}-01`;
      const [e, c] = await Promise.all([
        fetchExpenses(
          from,
          dayKey(new Date(new Date(`${to}T12:00:00`).getTime() - 86_400_000)),
        ),
        fetchExpenseCategories(),
      ]);
      setList(e);
      setCategories(c);
      setThisMonth(currentMonthKey());
      setError(null);
    } catch (err) {
      setError(errorText(err, "Não foi possível carregar."));
    }
  }

  useEffect(() => {
    // Custos automáticos (0022a): sem a migração ou sem permissão, a tela segue só com as lançadas.
    let cancelled = false;
    queueMicrotask(() => {
      setAuto(null);
      fetchAutoExpenses(month)
        .then((a) => !cancelled && setAuto(a))
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [month]);

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

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
      setError(errorText(err, "Não foi possível concluir."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(
    () =>
      (list ?? []).filter(
        (e) =>
          (status === ALL || e.status === status) && (group === ALL || e.group === group),
      ),
    [list, status, group],
  );
  const showManual = view !== "automaticas";
  const manual = useMemo(() => manualCosts(list ?? []), [list]);
  const totals = useMemo(() => {
    const t = { pendente: 0, aprovada: 0, paga: 0 };
    for (const e of list ?? [])
      if (e.status in t) t[e.status as keyof typeof t] += e.amount;
    return t;
  }, [list]);

  function openForm(e: Expense | "new") {
    setFormError(null);
    setForm(
      e === "new"
        ? emptyForm()
        : {
            categoryId: e.categoryId,
            description: e.description,
            amount: String(e.amount).replace(".", ","),
            competence: e.competence,
            dueDate: e.dueDate ?? "",
            storeCode: e.storeCode ?? NONE,
            note: e.note ?? "",
            files: [],
          },
    );
    setEditing(e);
  }

  async function submitForm() {
    if (!form.categoryId) return setFormError("Escolha a categoria.");
    if (form.description.trim().length < 3) return setFormError("Descreva a despesa.");
    const amount = toNumber(form.amount);
    if (!(amount > 0)) return setFormError("Informe o valor.");
    if (!form.competence) return setFormError("Informe a data de competência.");
    setBusy(true);
    setFormError(null);
    try {
      await saveExpense(
        editing === "new" || !editing ? null : editing.id,
        {
          categoryId: form.categoryId,
          description: form.description.trim(),
          amount,
          competence: form.competence,
          dueDate: form.dueDate || undefined,
          storeCode: form.storeCode === NONE ? undefined : form.storeCode,
          note: form.note.trim() || undefined,
        },
        form.files,
      );
      setEditing(null);
      setMessage(
        editing === "new"
          ? "Despesa lançada. Agora ela aguarda aprovação."
          : "Despesa atualizada.",
      );
      await load();
    } catch (err) {
      setFormError(errorText(err, "Não foi possível salvar."));
    } finally {
      setBusy(false);
    }
  }

  const activeCategories = categories.filter((c) => c.active);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Despesas</h1>
          <p className="text-sm text-slate-500">
            Quem lança cria a despesa pendente; outra pessoa com permissão aprova ou
            recusa; depois de aprovada, registre o pagamento com o comprovante.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setManaging(true)}>
              <Settings2 className="h-4 w-4" aria-hidden="true" /> Categorias
            </Button>
          )}
          {canCreate && (
            <Button size="sm" onClick={() => openForm("new")}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Nova despesa
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker value={month} onChange={setMonth} />
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="O que mostrar">
          {(
            [
              ["tudo", "Tudo"],
              ["automaticas", "Automáticas"],
              ["lancadas", "Lançadas"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm font-medium",
                view === id
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {showManual && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Situação">
            {([ALL, "pendente", "aprovada", "paga", "recusada"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={status === s}
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm font-medium",
                  status === s
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {s === ALL ? "Todas" : EXPENSE_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <Select
            value={group}
            onValueChange={(v) => setGroup(v as ExpenseGroup | typeof ALL)}
          >
            <SelectTrigger className="h-8 w-52 text-sm" aria-label="Grupo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os grupos</SelectItem>
              {EXPENSE_GROUPS.map((g) => (
                <SelectItem key={g} value={g}>
                  {EXPENSE_GROUP_LABELS[g]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {list && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Custos do mês"
            value={money(manual + (auto ? autoTotal(auto) : 0))}
            detail={
              auto
                ? "automáticos + lançadas aprovadas ou pagas (igual à Visão geral)"
                : "só as lançadas aprovadas ou pagas"
            }
          />
          <Kpi
            label="Puxado automaticamente"
            value={auto ? money(autoTotal(auto)) : "—"}
            detail="viagens, equipe, lojas, sinistros e reembolsos"
          />
          <Kpi label="Lançadas (aprovadas e pagas)" value={money(manual)} />
          <Kpi
            label="Aguardando aprovação"
            value={money(totals.pendente)}
            tone={totals.pendente > 0 ? "amber" : undefined}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {!list && !error && <p className="text-sm text-slate-500">Carregando...</p>}
      {auto && view !== "lancadas" && (
        <AutoExpensesSection
          auto={auto}
          month={month}
          current={month === thisMonth}
          onChanged={async () => setAuto(await fetchAutoExpenses(month))}
        />
      )}

      {showManual && view === "tudo" && (
        <div>
          <h2 className="text-base font-semibold text-slate-900">Lançadas manualmente</h2>
          <p className="text-sm text-slate-500">
            O que não está na plataforma: aluguel, contador, sistemas, anúncios,
            manutenção, embalagem… Salário e combustível das viagens vêm sozinhos, não
            lance aqui.
          </p>
        </div>
      )}
      {showManual && list && filtered.length === 0 && (
        <p className="text-sm text-slate-500">Nenhuma despesa lançada neste filtro.</p>
      )}

      {showManual && (
        <div className="flex flex-col gap-2">
          {filtered.map((e) => (
            <Card key={e.id} className="gap-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{e.description}</span>
                    <StatusPill
                      status={e.status}
                      label={EXPENSE_STATUS_LABELS[e.status]}
                    />
                  </p>
                  <p className="text-xs text-slate-500">
                    {expenseCode(e.number)} · {EXPENSE_GROUP_LABELS[e.group]} ›{" "}
                    {e.categoryName} · competência {dateBR(e.competence)}
                    {e.dueDate && ` · vence ${dateBR(e.dueDate)}`}
                    {e.storeName && ` · ${e.storeName}`}
                  </p>
                  <p className="text-xs text-slate-400">
                    Lançada por {e.createdByName ?? "—"}
                    {e.reviewedByName &&
                      ` · ${e.status === "recusada" ? "recusada" : "aprovada"} por ${e.reviewedByName}`}
                    {e.paidAt && ` · paga em ${dateBR(e.paidAt)}`}
                  </p>
                  {e.reviewNote && (
                    <p className="text-xs text-red-700">Motivo: {e.reviewNote}</p>
                  )}
                  {e.note && <p className="text-xs text-slate-500">{e.note}</p>}
                  <div className="mt-1 flex flex-wrap gap-3">
                    {e.files.map((f) => (
                      <ReceiptLink key={f.id} path={f.path} label={f.name ?? "anexo"} />
                    ))}
                    <ReceiptLink path={e.receiptPath} label="comprovante de pagamento" />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-lg font-semibold text-slate-900 tabular-nums">
                    {money(e.amount)}
                  </span>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {e.status === "pendente" && canEdit && (
                      <>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void run(() => reviewExpense(e.id, true), "Despesa aprovada.")
                          }
                        >
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setRejectNote("");
                            setRejecting(e);
                          }}
                        >
                          Recusar
                        </Button>
                      </>
                    )}
                    {e.status === "aprovada" && canEdit && (
                      <Button size="sm" disabled={busy} onClick={() => setPaying(e)}>
                        Registrar pagamento
                      </Button>
                    )}
                    {(e.status === "pendente" || e.status === "recusada") &&
                      (canCreate || canEdit) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => openForm(e)}
                        >
                          Editar
                        </Button>
                      )}
                    {(e.status === "pendente" || e.status === "recusada") &&
                      canDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            void run(() => deleteExpense(e.id), "Despesa apagada.")
                          }
                        >
                          Apagar
                        </Button>
                      )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && !busy && setEditing(null)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "Nova despesa" : "Editar despesa"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Categoria</Label>
              <Select
                value={form.categoryId}
                onValueChange={(v) => setForm({ ...form, categoryId: v })}
              >
                <SelectTrigger aria-label="Categoria">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_GROUPS.map((g) => (
                    <SelectGroup key={g}>
                      <SelectLabel>{EXPENSE_GROUP_LABELS[g]}</SelectLabel>
                      {activeCategories
                        .filter((c) => c.grp === g)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-desc">Descrição</Label>
              <Input
                id="exp-desc"
                maxLength={300}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exp-amount">Valor (R$)</Label>
                <Input
                  id="exp-amount"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exp-comp">Competência</Label>
                <Input
                  id="exp-comp"
                  type="date"
                  value={form.competence}
                  onChange={(e) => setForm({ ...form, competence: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exp-due">Vencimento</Label>
                <Input
                  id="exp-due"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Ligada a uma loja (opcional)</Label>
              <Select
                value={form.storeCode}
                onValueChange={(v) => setForm({ ...form, storeCode: v })}
              >
                <SelectTrigger aria-label="Loja">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhuma</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-note">Observação (opcional)</Label>
              <Textarea
                id="exp-note"
                rows={2}
                maxLength={1000}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-files">Nota ou recibo (foto ou PDF, opcional)</Label>
              <Input
                id="exp-files"
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={(e) =>
                  setForm({ ...form, files: Array.from(e.target.files ?? []) })
                }
              />
            </div>
            {editing !== "new" && editing?.status === "recusada" && (
              <p className="text-xs text-slate-500">
                Ao salvar, ela volta para aprovação.
              </p>
            )}
            {formError && (
              <p role="alert" className="text-sm text-red-600">
                {formError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button disabled={busy} onClick={() => void submitForm()}>
              {busy ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejecting !== null}
        onOpenChange={(o) => !o && !busy && setRejecting(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recusar despesa</DialogTitle>
          </DialogHeader>
          <Textarea
            rows={3}
            aria-label="Motivo"
            placeholder="Motivo (quem lançou vê e pode corrigir)"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setRejecting(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={busy || rejectNote.trim().length < 3}
              onClick={() =>
                rejecting &&
                void run(
                  () => reviewExpense(rejecting.id, false, rejectNote.trim()),
                  "Despesa recusada.",
                ).then((ok) => ok && setRejecting(null))
              }
            >
              Recusar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentDialog
        key={paying?.id ?? "closed"}
        open={paying !== null}
        title={
          paying ? `Pagar ${expenseCode(paying.number)} · ${money(paying.amount)}` : ""
        }
        description={paying?.description}
        askAmount={false}
        onClose={() => setPaying(null)}
        onConfirm={async (input) => {
          if (!paying) return;
          await payExpense(paying.id, input.paidAt, input.receipt);
          setMessage("Pagamento registrado.");
          await load();
        }}
      />

      <CategoriesDialog
        open={managing}
        categories={categories}
        onClose={() => setManaging(false)}
        onChanged={load}
      />
    </div>
  );
}

function CategoriesDialog({
  open,
  categories,
  onClose,
  onChanged,
}: {
  open: boolean;
  categories: ExpenseCategory[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [grp, setGrp] = useState<ExpenseGroup>("operacao");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(errorText(err, "Não foi possível salvar."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Categorias de despesa</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {EXPENSE_GROUPS.map((g) => (
            <div key={g} className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold text-slate-800">
                {EXPENSE_GROUP_LABELS[g]}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {categories
                  .filter((c) => c.grp === g)
                  .map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        disabled={busy}
                        title={
                          c.active ? "Clique para desativar" : "Clique para reativar"
                        }
                        onClick={() =>
                          void run(() =>
                            upsertExpenseCategory(c.id, {
                              grp: c.grp,
                              name: c.name,
                              active: !c.active,
                            }),
                          )
                        }
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs",
                          c.active
                            ? "border-slate-200 text-slate-700"
                            : "border-dashed border-slate-300 text-slate-400 line-through",
                        )}
                      >
                        {c.name}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
            <Select value={grp} onValueChange={(v) => setGrp(v as ExpenseGroup)}>
              <SelectTrigger className="w-48" aria-label="Grupo da nova categoria">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_GROUPS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {EXPENSE_GROUP_LABELS[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label="Nome da nova categoria"
              placeholder="Nova categoria"
              maxLength={60}
              className="w-48"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              size="sm"
              disabled={busy || name.trim().length < 2}
              onClick={() =>
                void run(async () => {
                  await upsertExpenseCategory(null, {
                    grp,
                    name: name.trim(),
                    active: true,
                  });
                  setName("");
                })
              }
            >
              Adicionar
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Clique numa categoria para desativar ou reativar.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

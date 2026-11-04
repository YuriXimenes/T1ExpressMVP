"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCan } from "@/lib/admin/access-provider";
import {
  PAY_RULE_KINDS,
  TEAM_KINDS,
  payRulesText,
  type PayRuleKind,
  type TeamKind,
} from "@/lib/admin/access";
import { AdminError } from "@/lib/admin/api";
import {
  fetchTeam,
  saveTeamMember,
  type TeamMember,
  type TeamMemberInput,
} from "@/lib/admin/people-api";
import { cn } from "@/lib/utils";

const ALL = "all";

interface RuleDraft {
  kind: PayRuleKind;
  amount: string;
  note: string;
}

const kindLabel = (kind: TeamKind) =>
  TEAM_KINDS.find((k) => k.id === kind)?.label ?? kind;

const EMPTY: TeamMemberInput = { name: "", kind: "entregador", status: "ativo" };

export function EquipeView() {
  const canCreate = useCan("pessoas", "create");
  const canEdit = useCan("pessoas", "edit");

  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<TeamKind | typeof ALL>(ALL);
  const [status, setStatus] = useState<"ativo" | "inativo" | typeof ALL>("ativo");

  const [editing, setEditing] = useState<TeamMember | "new" | null>(null);
  const [form, setForm] = useState<TeamMemberInput>(EMPTY);
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setTeam(await fetchTeam());
    } catch (err) {
      setError(
        err instanceof AdminError ? err.message : "Não foi possível carregar a equipe.",
      );
    }
  }

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => void load());
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (team ?? []).filter(
      (m) =>
        (kind === ALL || m.kind === kind) &&
        (status === ALL || m.status === status) &&
        (!term ||
          m.name.toLowerCase().includes(term) ||
          (m.email ?? "").toLowerCase().includes(term) ||
          (m.phone ?? "").includes(term)),
    );
  }, [team, search, kind, status]);

  function open(member: TeamMember | "new") {
    setFormError(null);
    if (member === "new") {
      setForm(EMPTY);
      setRules([]);
    } else {
      setForm({
        name: member.name,
        kind: member.kind,
        status: member.status,
        phone: member.phone,
        email: member.email,
        document: member.document,
        pixKey: member.pixKey,
        notes: member.notes,
        linkEmail: member.linkedUser?.email ?? "",
      });
      setRules(
        member.payRules.map((r) => ({
          kind: r.kind,
          amount: String(r.amountBRL).replace(".", ","),
          note: r.note ?? "",
        })),
      );
    }
    setEditing(member);
  }

  const set = (patch: Partial<TeamMemberInput>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  async function save() {
    if (!editing || busy) return;
    const parsed = rules.map((r) => ({
      kind: r.kind,
      amountBRL: Number(r.amount.replace(/\./g, "").replace(",", ".")),
      note: r.note.trim() || undefined,
    }));
    if (parsed.some((r) => !Number.isFinite(r.amountBRL) || r.amountBRL < 0)) {
      setFormError("Confira os valores da remuneração.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await saveTeamMember(editing === "new" ? null : editing.id, form, parsed);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof AdminError ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  const readOnly = editing !== "new" && !canEdit;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Equipe</h1>
          <p className="text-sm text-slate-500">
            Funcionários, prestadores e entregadores, com ou sem acesso ao sistema.
          </p>
        </div>
        {canCreate && (
          <Button type="button" onClick={() => open("new")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Adicionar pessoa
          </Button>
        )}
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="team-search" className="text-xs text-slate-500">
            Buscar
          </Label>
          <Input
            id="team-search"
            placeholder="Nome, e-mail ou telefone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="team-kind" className="text-xs text-slate-500">
            Tipo
          </Label>
          <Select value={kind} onValueChange={(v) => setKind(v as TeamKind | typeof ALL)}>
            <SelectTrigger id="team-kind" className="h-8 w-full bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {TEAM_KINDS.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="team-status" className="text-xs text-slate-500">
            Status
          </Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as "ativo" | "inativo" | typeof ALL)}
          >
            <SelectTrigger id="team-status" className="h-8 w-full bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="inativo">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!team && !error && <p className="text-sm text-slate-500">Carregando...</p>}

      {team && (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.length === 0 && (
            <li className="text-sm text-slate-400">Ninguém encontrado.</li>
          )}
          {filtered.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => open(member)}
                className="flex h-full w-full flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-slate-300"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{member.name}</p>
                  <Badge
                    variant={member.status === "ativo" ? "secondary" : "destructive"}
                  >
                    {member.status === "ativo" ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <p className="text-sm text-slate-600">
                  {kindLabel(member.kind)}
                  {member.phone && ` · ${member.phone}`}
                </p>
                <p className="text-xs text-slate-500">{payRulesText(member.payRules)}</p>
                {member.linkedUser && (
                  <p className="text-xs text-slate-400">
                    Conta: {member.linkedUser.email}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={!!editing}
        onOpenChange={(value) => !value && !busy && setEditing(null)}
      >
        {editing && (
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editing === "new" ? "Adicionar pessoa" : editing.name}
              </DialogTitle>
              <DialogDescription>
                Dados de contato e pagamento ficam visíveis só para quem tem acesso a
                Pessoas.
              </DialogDescription>
            </DialogHeader>

            <fieldset disabled={readOnly || busy} className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="tm-name" label="Nome">
                  <Input
                    id="tm-name"
                    maxLength={120}
                    value={form.name}
                    onChange={(e) => set({ name: e.target.value })}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="tm-kind" label="Tipo">
                    <Select
                      value={form.kind}
                      onValueChange={(v) => set({ kind: v as TeamKind })}
                    >
                      <SelectTrigger id="tm-kind" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEAM_KINDS.map((k) => (
                          <SelectItem key={k.id} value={k.id}>
                            {k.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field id="tm-status" label="Status">
                    <Select
                      value={form.status}
                      onValueChange={(v) => set({ status: v as "ativo" | "inativo" })}
                    >
                      <SelectTrigger id="tm-status" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field id="tm-phone" label="Telefone">
                  <Input
                    id="tm-phone"
                    maxLength={30}
                    value={form.phone ?? ""}
                    onChange={(e) => set({ phone: e.target.value })}
                  />
                </Field>
                <Field id="tm-email" label="E-mail">
                  <Input
                    id="tm-email"
                    type="email"
                    maxLength={200}
                    value={form.email ?? ""}
                    onChange={(e) => set({ email: e.target.value })}
                  />
                </Field>
                <Field id="tm-document" label="CPF ou CNPJ">
                  <Input
                    id="tm-document"
                    maxLength={30}
                    value={form.document ?? ""}
                    onChange={(e) => set({ document: e.target.value })}
                  />
                </Field>
                <Field id="tm-pix" label="Chave Pix">
                  <Input
                    id="tm-pix"
                    maxLength={120}
                    value={form.pixKey ?? ""}
                    onChange={(e) => set({ pixKey: e.target.value })}
                  />
                </Field>
              </div>
              <Field
                id="tm-link"
                label="Conta no sistema (opcional)"
                hint="E-mail da conta no site, para ligar esta pessoa ao login dela. Vazio = sem conta."
              >
                <Input
                  id="tm-link"
                  type="email"
                  value={form.linkEmail ?? ""}
                  onChange={(e) => set({ linkEmail: e.target.value })}
                />
              </Field>
              <Field id="tm-notes" label="Observações">
                <Textarea
                  id="tm-notes"
                  rows={2}
                  maxLength={1000}
                  value={form.notes ?? ""}
                  onChange={(e) => set({ notes: e.target.value })}
                />
              </Field>

              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">Remuneração</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setRules((prev) => [
                        ...prev,
                        { kind: "fixo_mensal", amount: "", note: "" },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Regra
                  </Button>
                </div>
                {rules.length === 0 && (
                  <p className="text-xs text-slate-500">
                    Combine quantas regras quiser: fixo, por rota, parada, coleta,
                    entrega, volume, km e bônus.
                  </p>
                )}
                {rules.map((rule, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[minmax(0,1fr)_7rem_auto] gap-2 sm:grid-cols-[12rem_7rem_minmax(0,1fr)_auto]"
                  >
                    <Select
                      value={rule.kind}
                      onValueChange={(v) =>
                        setRules((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, kind: v as PayRuleKind } : r,
                          ),
                        )
                      }
                    >
                      <SelectTrigger aria-label="Tipo de regra" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAY_RULE_KINDS.map((k) => (
                          <SelectItem key={k.id} value={k.id}>
                            {k.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      aria-label="Valor em reais"
                      inputMode="decimal"
                      placeholder="R$"
                      value={rule.amount}
                      onChange={(e) =>
                        setRules((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, amount: e.target.value } : r,
                          ),
                        )
                      }
                    />
                    <Input
                      aria-label="Observação da regra"
                      placeholder="Observação"
                      maxLength={200}
                      className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto"
                      value={rule.note}
                      onChange={(e) =>
                        setRules((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, note: e.target.value } : r,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="col-start-3 row-start-1 sm:col-start-auto"
                      onClick={() =>
                        setRules((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Remover regra</span>
                    </Button>
                  </div>
                ))}
                {rules.length > 0 && (
                  <p className="text-xs text-slate-500">
                    {payRulesText(
                      rules.map((r) => ({
                        kind: r.kind,
                        amountBRL:
                          Number(r.amount.replace(/\./g, "").replace(",", ".")) || 0,
                      })),
                    )}
                  </p>
                )}
              </div>
            </fieldset>

            {formError && (
              <p role="alert" className="text-sm text-red-600">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                {readOnly ? "Fechar" : "Cancelar"}
              </Button>
              {!readOnly && (
                <Button type="button" disabled={busy} onClick={() => void save()}>
                  {busy ? "Salvando..." : "Salvar"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5")}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

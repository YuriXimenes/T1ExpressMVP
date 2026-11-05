"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/lib/admin/access-provider";
import {
  OccurrenceError,
  fetchOccurrenceTypes,
  upsertOccurrenceType,
  type OccurrenceType,
} from "@/lib/occurrences/api";
import { deadlineLabel } from "@/lib/occurrences/rules";
import { cn } from "@/lib/utils";

const SYSTEM_LABELS: Record<NonNullable<OccurrenceType["systemKind"]>, string> = {
  conferencia: "Aberto sozinho quando a conferência tem diferença",
  loja_fechada: "Aberto sozinho quando a parada não sai por loja fechada",
  guarda_vencida: "Aberto sozinho quando vence o prazo de guarda no ponto",
};

interface Form {
  name: string;
  description: string;
  active: boolean;
  driverCan: boolean;
  customerCan: boolean;
  deadline: string;
  unit: "dias" | "horas";
  requiresPhoto: boolean;
  sort: string;
}

const emptyForm: Form = {
  name: "",
  description: "",
  active: true,
  driverCan: false,
  customerCan: false,
  deadline: "7",
  unit: "dias",
  requiresPhoto: false,
  sort: "100",
};

export function TiposOcorrenciaView() {
  const canCreate = useCan("ocorrencias", "create");
  const canEdit = useCan("ocorrencias", "edit");
  const [types, setTypes] = useState<OccurrenceType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<OccurrenceType | "new" | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setTypes(await fetchOccurrenceTypes("all"));
    } catch (err) {
      setError(
        err instanceof OccurrenceError ? err.message : "Não foi possível carregar.",
      );
    }
  }

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => void load());
  }, []);

  function open(t: OccurrenceType | "new") {
    setFormError(null);
    setForm(
      t === "new"
        ? emptyForm
        : {
            name: t.name,
            description: t.description ?? "",
            active: t.active,
            driverCan: t.driverCan,
            customerCan: t.customerCan,
            deadline: String(
              t.deadlineHours % 24 === 0 ? t.deadlineHours / 24 : t.deadlineHours,
            ),
            unit: t.deadlineHours % 24 === 0 ? "dias" : "horas",
            requiresPhoto: t.requiresPhoto,
            sort: String(t.sort),
          },
    );
    setEditing(t);
  }

  async function save() {
    const amount = Number(form.deadline);
    if (!Number.isInteger(amount) || amount < 1) {
      setFormError("Prazo: use um número inteiro a partir de 1.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await upsertOccurrenceType(editing === "new" || !editing ? null : editing.id, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        active: form.active,
        driverCan: form.driverCan,
        customerCan: form.customerCan,
        deadlineHours: form.unit === "dias" ? amount * 24 : amount,
        requiresPhoto: form.requiresPhoto,
        sort: Number(form.sort) || 100,
      });
      setEditing(null);
      setMessage("Tipo salvo.");
      await load();
    } catch (err) {
      setFormError(
        err instanceof OccurrenceError ? err.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy(false);
    }
  }

  const check = (key: keyof Form, label: string, hint?: string) => (
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        className="accent-brand-600 mt-0.5 h-4 w-4"
        checked={form[key] as boolean}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.checked }))}
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/admin/pedidos/ocorrencias"
        className="inline-flex items-center gap-1 self-start text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Ocorrências
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Tipos de ocorrência</h1>
          <p className="text-sm text-slate-500">
            Quem pode abrir cada tipo, o prazo para resolver e se exige foto. O admin abre
            qualquer tipo.
          </p>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => open("new")}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Novo tipo
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {!types && !error && <p className="text-sm text-slate-500">Carregando...</p>}

      <div className="flex flex-col gap-2">
        {(types ?? []).map((t) => (
          <Card key={t.id} className={cn("gap-1.5 p-4", !t.active && "opacity-60")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{t.name}</span>
                {!t.active && <Badge variant="secondary">Inativo</Badge>}
                {t.systemKind && <Badge variant="outline">Automático</Badge>}
              </div>
              {canEdit && (
                <Button size="sm" variant="ghost" onClick={() => open(t)}>
                  Editar
                </Button>
              )}
            </div>
            {t.description && <p className="text-sm text-slate-600">{t.description}</p>}
            <p className="flex flex-wrap gap-x-3 text-xs text-slate-500">
              <span>Prazo: {deadlineLabel(t.deadlineHours)}</span>
              <span>
                Abre: equipe
                {t.driverCan && ", entregador"}
                {t.customerCan && ", cliente"}
              </span>
              {t.requiresPhoto && <span>Exige foto</span>}
              {t.systemKind && <span>{SYSTEM_LABELS[t.systemKind]}</span>}
            </p>
          </Card>
        ))}
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Novo tipo" : "Editar tipo"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="type-name">Nome</Label>
              <Input
                id="type-name"
                maxLength={60}
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="type-desc">Descrição (opcional)</Label>
              <Textarea
                id="type-desc"
                rows={2}
                maxLength={300}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="type-deadline">Prazo para resolver</Label>
                <Input
                  id="type-deadline"
                  inputMode="numeric"
                  className="w-24"
                  value={form.deadline}
                  onChange={(e) => setForm((p) => ({ ...p, deadline: e.target.value }))}
                />
              </div>
              <div
                className="flex gap-1.5 pb-1"
                role="group"
                aria-label="Unidade do prazo"
              >
                {(["dias", "horas"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    aria-pressed={form.unit === u}
                    onClick={() => setForm((p) => ({ ...p, unit: u }))}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium",
                      form.unit === u
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 text-slate-600",
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {check(
                "customerCan",
                "Cliente pode abrir",
                "Aparece em “Relatar um problema” no pedido.",
              )}
              {check(
                "driverCan",
                "Entregador pode abrir",
                "Aparece na parada, na área do entregador.",
              )}
              {check("requiresPhoto", "Exige foto ao abrir")}
              {check("active", "Ativo")}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="type-sort">Ordem na lista</Label>
              <Input
                id="type-sort"
                inputMode="numeric"
                className="w-24"
                value={form.sort}
                onChange={(e) => setForm((p) => ({ ...p, sort: e.target.value }))}
              />
            </div>
            {formError && (
              <p role="alert" className="text-sm text-red-600">
                {formError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

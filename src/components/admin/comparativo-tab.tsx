"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  AdminError,
  fetchComparison,
  upsertComparisonCarrier,
  deleteComparisonCarrier,
  upsertComparisonRow,
  deleteComparisonRow,
  upsertComparisonValue,
  type AdminComparison,
} from "@/lib/admin/api";

const STATUS_LABEL: Record<string, string> = {
  positive: "Positivo",
  negative: "Negativo",
  neutral: "Neutro",
};

export function ComparativoTab() {
  const [data, setData] = useState<AdminComparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [carrierOpen, setCarrierOpen] = useState(false);
  const [carrierId, setCarrierId] = useState("");
  const [carrierForm, setCarrierForm] = useState({
    name: "",
    isHighlighted: false,
    sortOrder: 0,
  });
  const [carrierIsNew, setCarrierIsNew] = useState(true);

  const [rowOpen, setRowOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rowForm, setRowForm] = useState({ label: "", sortOrder: 0 });

  const [valueOpen, setValueOpen] = useState(false);
  const [valueTarget, setValueTarget] = useState<{
    rowId: string;
    carrierId: string;
  } | null>(null);
  const [valueForm, setValueForm] = useState<{
    status: "positive" | "negative" | "neutral" | "";
    text: string;
    detail: string;
  }>({ status: "", text: "", detail: "" });

  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function load() {
    fetchComparison()
      .then(setData)
      .catch((err) =>
        setError(err instanceof AdminError ? err.message : "Não foi possível carregar."),
      );
  }
  useEffect(load, []);

  function openNewCarrier() {
    setCarrierIsNew(true);
    setCarrierId("");
    setCarrierForm({ name: "", isHighlighted: false, sortOrder: 0 });
    setFormError(null);
    setCarrierOpen(true);
  }
  function openEditCarrier(c: AdminComparison["carriers"][number]) {
    setCarrierIsNew(false);
    setCarrierId(c.id);
    setCarrierForm({
      name: c.name,
      isHighlighted: c.isHighlighted,
      sortOrder: c.sortOrder,
    });
    setFormError(null);
    setCarrierOpen(true);
  }
  async function saveCarrier() {
    if (isSaving) return;
    setIsSaving(true);
    setFormError(null);
    try {
      await upsertComparisonCarrier(carrierId, carrierForm);
      setCarrierOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof AdminError ? err.message : "Não foi possível salvar.");
    } finally {
      setIsSaving(false);
    }
  }
  async function removeCarrier(id: string) {
    try {
      await deleteComparisonCarrier(id);
      load();
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Não foi possível remover.");
    }
  }

  function openNewRow() {
    setEditingRowId(null);
    setRowForm({ label: "", sortOrder: 0 });
    setFormError(null);
    setRowOpen(true);
  }
  function openEditRow(r: AdminComparison["rows"][number]) {
    setEditingRowId(r.id);
    setRowForm({ label: r.label, sortOrder: r.sortOrder });
    setFormError(null);
    setRowOpen(true);
  }
  async function saveRow() {
    if (isSaving) return;
    setIsSaving(true);
    setFormError(null);
    try {
      await upsertComparisonRow(editingRowId, rowForm);
      setRowOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof AdminError ? err.message : "Não foi possível salvar.");
    } finally {
      setIsSaving(false);
    }
  }
  async function removeRow(id: string) {
    try {
      await deleteComparisonRow(id);
      load();
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Não foi possível remover.");
    }
  }

  function openValue(rowId: string, carrierId: string) {
    const existing = data?.values.find(
      (v) => v.rowId === rowId && v.carrierId === carrierId,
    );
    setValueTarget({ rowId, carrierId });
    setValueForm({
      status: existing?.status ?? "",
      text: existing?.text ?? "",
      detail: existing?.detail ?? "",
    });
    setFormError(null);
    setValueOpen(true);
  }
  async function saveValue() {
    if (isSaving || !valueTarget) return;
    setIsSaving(true);
    setFormError(null);
    try {
      await upsertComparisonValue(valueTarget.rowId, valueTarget.carrierId, {
        status: valueForm.status || undefined,
        text: valueForm.text,
        detail: valueForm.detail || undefined,
      });
      setValueOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof AdminError ? err.message : "Não foi possível salvar.");
    } finally {
      setIsSaving(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Carregando...</p>;

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        Grade usada na comparação da home. Clique numa célula para editar.
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">
                <Button size="sm" variant="ghost" onClick={openNewRow}>
                  + Linha
                </Button>
              </th>
              {data.carriers.map((c) => (
                <th key={c.id} className="px-4 py-2 font-medium">
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => openEditCarrier(c)}
                  >
                    {c.name}
                  </button>
                </th>
              ))}
              <th className="px-4 py-2 font-medium">
                <Button size="sm" variant="ghost" onClick={openNewCarrier}>
                  + Operadora
                </Button>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-2.5 font-medium text-slate-900">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => openEditRow(row)}
                    >
                      {row.label}
                    </button>
                    <ConfirmDialog
                      trigger={
                        <button
                          type="button"
                          className="text-xs text-red-500 hover:underline"
                        >
                          apagar
                        </button>
                      }
                      title={`Apagar a linha "${row.label}"?`}
                      description="Remove também os valores dessa linha em todas as operadoras."
                      confirmLabel="Apagar"
                      onConfirm={() => void removeRow(row.id)}
                    />
                  </div>
                </td>
                {data.carriers.map((c) => {
                  const cell = data.values.find(
                    (v) => v.rowId === row.id && v.carrierId === c.id,
                  );
                  return (
                    <td key={c.id} className="px-4 py-2.5">
                      <button
                        type="button"
                        className="text-left text-slate-600 hover:underline"
                        onClick={() => openValue(row.id, c.id)}
                      >
                        {cell ? (
                          <>
                            {cell.status && (
                              <span className="mr-1 text-xs text-slate-400">
                                [{STATUS_LABEL[cell.status]}]
                              </span>
                            )}
                            {cell.text}
                          </>
                        ) : (
                          <span className="text-slate-300">definir</span>
                        )}
                      </button>
                    </td>
                  );
                })}
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Operadora */}
      <Dialog open={carrierOpen} onOpenChange={setCarrierOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {carrierIsNew ? "Nova operadora" : "Editar operadora"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {carrierIsNew && (
              <div className="space-y-1.5">
                <Label htmlFor="carrier-id">Identificador (ex.: uber-flash)</Label>
                <Input
                  id="carrier-id"
                  value={carrierId}
                  onChange={(e) => setCarrierId(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="carrier-name">Nome</Label>
              <Input
                id="carrier-name"
                value={carrierForm.name}
                onChange={(e) => setCarrierForm({ ...carrierForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="carrier-sort">Ordem</Label>
              <Input
                id="carrier-sort"
                type="number"
                value={carrierForm.sortOrder}
                onChange={(e) =>
                  setCarrierForm({ ...carrierForm, sortOrder: Number(e.target.value) })
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="carrier-highlight"
                checked={carrierForm.isHighlighted}
                onCheckedChange={(c) =>
                  setCarrierForm({ ...carrierForm, isHighlighted: c === true })
                }
              />
              <Label htmlFor="carrier-highlight" className="font-normal">
                Destacar (é a T1 Express)
              </Label>
            </div>
            {!carrierIsNew && (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" className="text-red-600">
                    Apagar operadora
                  </Button>
                }
                title="Apagar esta operadora?"
                description="Remove também todos os valores dela na grade."
                confirmLabel="Apagar"
                onConfirm={() => {
                  setCarrierOpen(false);
                  void removeCarrier(carrierId);
                }}
              />
            )}
            {formError && (
              <p role="alert" className="text-sm text-red-600">
                {formError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => void saveCarrier()} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Linha */}
      <Dialog open={rowOpen} onOpenChange={setRowOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRowId ? "Editar linha" : "Nova linha"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="row-label">Texto da linha</Label>
              <Input
                id="row-label"
                value={rowForm.label}
                onChange={(e) => setRowForm({ ...rowForm, label: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="row-sort">Ordem</Label>
              <Input
                id="row-sort"
                type="number"
                value={rowForm.sortOrder}
                onChange={(e) =>
                  setRowForm({ ...rowForm, sortOrder: Number(e.target.value) })
                }
              />
            </div>
            {formError && (
              <p role="alert" className="text-sm text-red-600">
                {formError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => void saveRow()} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Célula */}
      <Dialog open={valueOpen} onOpenChange={setValueOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar célula</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="value-status">Status (opcional)</Label>
              <Select
                value={valueForm.status || "none"}
                onValueChange={(v) =>
                  setValueForm({
                    ...valueForm,
                    status:
                      v === "none" ? "" : (v as "positive" | "negative" | "neutral"),
                  })
                }
              >
                <SelectTrigger id="value-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem status</SelectItem>
                  <SelectItem value="positive">Positivo</SelectItem>
                  <SelectItem value="negative">Negativo</SelectItem>
                  <SelectItem value="neutral">Neutro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="value-text">Texto</Label>
              <Input
                id="value-text"
                value={valueForm.text}
                onChange={(e) => setValueForm({ ...valueForm, text: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="value-detail">Detalhe (opcional)</Label>
              <Textarea
                id="value-detail"
                rows={2}
                value={valueForm.detail}
                onChange={(e) => setValueForm({ ...valueForm, detail: e.target.value })}
              />
            </div>
            {formError && (
              <p role="alert" className="text-sm text-red-600">
                {formError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => void saveValue()} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

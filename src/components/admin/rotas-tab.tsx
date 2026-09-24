"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  AdminError,
  fetchStores,
  fetchFreightRoutes,
  upsertFreightRoute,
  deleteFreightRoute,
  type AdminStore,
  type AdminFreightRoute,
  type FreightRouteInput,
} from "@/lib/admin/api";

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function emptyForm(): FreightRouteInput {
  return { originStoreId: "", destinationStoreId: "", loggiBrl: 0 };
}

export function RotasTab() {
  const [stores, setStores] = useState<AdminStore[] | null>(null);
  const [routes, setRoutes] = useState<AdminFreightRoute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminFreightRoute | null>(null);
  const [form, setForm] = useState<FreightRouteInput>(emptyForm());
  const [isSaving, setIsSaving] = useState(false);

  function load() {
    Promise.all([fetchStores(), fetchFreightRoutes()])
      .then(([s, r]) => {
        setStores(s);
        setRoutes(r);
      })
      .catch((err) =>
        setError(err instanceof AdminError ? err.message : "Não foi possível carregar."),
      );
  }
  useEffect(load, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setOpen(true);
  }

  function openEdit(route: AdminFreightRoute) {
    setEditing(route);
    setForm({
      originStoreId: route.originStoreId,
      destinationStoreId: route.destinationStoreId,
      loggiBrl: route.loggiBRL,
      uberBrl: route.uberBRL,
    });
    setFormError(null);
    setOpen(true);
  }

  async function save() {
    if (isSaving) return;
    setIsSaving(true);
    setFormError(null);
    try {
      await upsertFreightRoute(editing?.id ?? null, form);
      setOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof AdminError ? err.message : "Não foi possível salvar.");
    } finally {
      setIsSaving(false);
    }
  }

  async function remove(route: AdminFreightRoute) {
    try {
      await deleteFreightRoute(route.id);
      load();
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Não foi possível remover.");
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!stores || !routes) return <p className="text-sm text-slate-500">Carregando...</p>;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate}>
              Nova rota
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar rota" : "Nova rota"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="route-origin">Loja de origem</Label>
                <Select
                  value={form.originStoreId}
                  onValueChange={(v) => setForm({ ...form, originStoreId: v })}
                >
                  <SelectTrigger id="route-origin" className="w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="route-destination">Loja de retirada</Label>
                <Select
                  value={form.destinationStoreId}
                  onValueChange={(v) => setForm({ ...form, destinationStoreId: v })}
                >
                  <SelectTrigger id="route-destination" className="w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores
                      .filter((s) => s.isPickupPoint)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="route-loggi">Preço Loggi</Label>
                  <Input
                    id="route-loggi"
                    type="number"
                    step="0.01"
                    value={form.loggiBrl}
                    onChange={(e) =>
                      setForm({ ...form, loggiBrl: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="route-uber">Preço Uber (opcional)</Label>
                  <Input
                    id="route-uber"
                    type="number"
                    step="0.01"
                    value={form.uberBrl ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        uberBrl: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
              </div>
              {formError && (
                <p role="alert" className="text-sm text-red-600">
                  {formError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => void save()} disabled={isSaving}>
                {isSaving ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Origem</th>
              <th className="px-4 py-2 font-medium">Retirada</th>
              <th className="px-4 py-2 text-right font-medium">Loggi</th>
              <th className="px-4 py-2 text-right font-medium">Uber</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {routes.map((route) => (
              <tr key={route.id} className="border-t border-slate-100">
                <td className="px-4 py-2.5 text-slate-700">{route.originStoreCode}</td>
                <td className="px-4 py-2.5 text-slate-700">
                  {route.destinationStoreCode}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-900">
                  {formatBRL(route.loggiBRL)}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-900">
                  {route.uberBRL !== undefined ? formatBRL(route.uberBRL) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(route)}>
                    Editar
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button size="sm" variant="ghost" className="text-red-600">
                        Apagar
                      </Button>
                    }
                    title="Apagar esta rota?"
                    description="A cotação de frete para esse par de lojas deixa de existir."
                    confirmLabel="Apagar"
                    onConfirm={() => void remove(route)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

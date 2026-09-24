"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StateSelect } from "@/components/shared/state-select";
import {
  AdminError,
  fetchStores,
  upsertStore,
  deleteStore,
  type AdminStore,
  type StoreInput,
} from "@/lib/admin/api";

function emptyForm(): StoreInput {
  return {
    name: "",
    address: "",
    neighborhood: "",
    city: "",
    state: "RJ",
    logoOnDark: false,
    isPickupPoint: false,
  };
}

export function LojasTab() {
  const [stores, setStores] = useState<AdminStore[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminStore | null>(null);
  const [form, setForm] = useState<StoreInput>(emptyForm());
  const [isSaving, setIsSaving] = useState(false);

  function load() {
    fetchStores()
      .then(setStores)
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

  function openEdit(store: AdminStore) {
    setEditing(store);
    setForm({
      name: store.name,
      address: store.address,
      neighborhood: store.neighborhood ?? "",
      city: store.city,
      state: store.state,
      lat: store.lat,
      lng: store.lng,
      logoPath: store.logoPath ?? "",
      logoOnDark: store.logoOnDark,
      isPickupPoint: store.isPickupPoint,
      pickupSortOrder: store.pickupSortOrder,
    });
    setFormError(null);
    setOpen(true);
  }

  async function save() {
    if (isSaving) return;
    setIsSaving(true);
    setFormError(null);
    try {
      await upsertStore(editing?.id ?? null, form);
      setOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof AdminError ? err.message : "Não foi possível salvar.");
    } finally {
      setIsSaving(false);
    }
  }

  async function remove(store: AdminStore) {
    try {
      await deleteStore(store.id);
      load();
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Não foi possível remover.");
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!stores) return <p className="text-sm text-slate-500">Carregando...</p>;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate}>
              Nova loja
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar loja" : "Nova loja"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="store-name">Nome</Label>
                <Input
                  id="store-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="store-address">Endereço</Label>
                  <Input
                    id="store-address"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="store-neighborhood">Bairro</Label>
                  <Input
                    id="store-neighborhood"
                    value={form.neighborhood ?? ""}
                    onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="store-city">Cidade</Label>
                  <Input
                    id="store-city"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="store-state">Estado</Label>
                  <StateSelect
                    id="store-state"
                    value={form.state}
                    onChange={(uf) => setForm({ ...form, state: uf })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="store-lat">Latitude (opcional)</Label>
                  <Input
                    id="store-lat"
                    type="number"
                    step="any"
                    value={form.lat ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        lat: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="store-lng">Longitude (opcional)</Label>
                  <Input
                    id="store-lng"
                    type="number"
                    step="any"
                    value={form.lng ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        lng: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="store-logo">Caminho do logo (opcional)</Label>
                <Input
                  id="store-logo"
                  placeholder="/logos/loja.jpg"
                  value={form.logoPath ?? ""}
                  onChange={(e) => setForm({ ...form, logoPath: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="store-logo-dark"
                  checked={form.logoOnDark}
                  onCheckedChange={(c) => setForm({ ...form, logoOnDark: c === true })}
                />
                <Label htmlFor="store-logo-dark" className="font-normal">
                  Logo precisa de fundo escuro
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="store-pickup"
                  checked={form.isPickupPoint}
                  onCheckedChange={(c) => setForm({ ...form, isPickupPoint: c === true })}
                />
                <Label htmlFor="store-pickup" className="font-normal">
                  É ponto de retirada
                </Label>
              </div>
              {form.isPickupPoint && (
                <div className="space-y-1.5">
                  <Label htmlFor="store-sort">Ordem de exibição (retirada)</Label>
                  <Input
                    id="store-sort"
                    type="number"
                    value={form.pickupSortOrder ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        pickupSortOrder: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </div>
              )}
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
              <th className="px-4 py-2 font-medium">Código</th>
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Cidade/UF</th>
              <th className="px-4 py-2 font-medium"></th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr key={store.id} className="border-t border-slate-100">
                <td className="px-4 py-2.5 font-medium text-slate-900">{store.code}</td>
                <td className="px-4 py-2.5 text-slate-700">{store.name}</td>
                <td className="px-4 py-2.5 text-slate-500">
                  {store.city}/{store.state}
                </td>
                <td className="px-4 py-2.5">
                  {store.isPickupPoint && <Badge variant="secondary">Retirada</Badge>}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(store)}>
                    Editar
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button size="sm" variant="ghost" className="text-red-600">
                        Apagar
                      </Button>
                    }
                    title={`Apagar ${store.name}?`}
                    description="Só é possível apagar se a loja não estiver em uso em nenhuma rota ou pedido."
                    confirmLabel="Apagar"
                    onConfirm={() => void remove(store)}
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

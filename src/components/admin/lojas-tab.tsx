"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
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
  fetchFreightRoutes,
  upsertStore,
  deleteStore,
  uploadStoreLogo,
  STORE_LOGO_ACCEPT,
  type AdminFreightRoute,
  type AdminStore,
  type StoreInput,
} from "@/lib/admin/api";
import { isValidStoreLogo } from "@/lib/store-logo";

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
  const [routes, setRoutes] = useState<AdminFreightRoute[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [discardedLogo, setDiscardedLogo] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminStore | null>(null);
  const [form, setForm] = useState<StoreInput>(emptyForm());
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

  // Uma loja só pode ser origem de pedido para um ponto de retirada se houver
  // rota cadastrada (é de lá que sai a cotação dos concorrentes).
  const missingRoutes = useMemo(() => {
    const pickups = (stores ?? []).filter((s) => s.isPickupPoint);
    const has = new Set(routes.map((r) => `${r.originStoreId}>${r.destinationStoreId}`));
    return new Map(
      (stores ?? []).map((store) => [
        store.id,
        pickups.filter((p) => p.id !== store.id && !has.has(`${store.id}>${p.id}`)),
      ]),
    );
  }, [stores, routes]);

  async function handleLogoFile(file: File | undefined) {
    if (!file) return;
    setIsUploading(true);
    setFormError(null);
    try {
      const url = await uploadStoreLogo(file);
      setForm((f) => ({ ...f, logoPath: url }));
      setDiscardedLogo(false);
    } catch (err) {
      setFormError(
        err instanceof AdminError ? err.message : "Não foi possível enviar o logo.",
      );
    } finally {
      setIsUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setDiscardedLogo(false);
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
      // Logo antigo que o site não consegue exibir (ex.: caminho do computador)
      // é descartado aqui, senão o salvar seria recusado.
      logoPath: isValidStoreLogo(store.logoPath) ? store.logoPath : "",
      logoOnDark: store.logoOnDark,
      isPickupPoint: store.isPickupPoint,
      pickupSortOrder: store.pickupSortOrder,
    });
    setDiscardedLogo(!!store.logoPath && !isValidStoreLogo(store.logoPath));
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
      setNotice(
        editing
          ? null
          : `Loja "${form.name}" criada. Para ela poder ser escolhida em pedidos, cadastre as rotas dela até cada ponto de retirada na aba Rotas.`,
      );
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
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          {notice}
        </p>
      )}
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
                  <Label htmlFor="store-lat">Latitude</Label>
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
                  <Label htmlFor="store-lng">Longitude</Label>
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
              <p className="-mt-1 text-xs text-slate-500">
                Opcionais. Sem elas a loja só não aparece no mapa. No Google Maps, clique
                com o botão direito no local e copie os dois números.
              </p>
              <div className="space-y-1.5">
                <Label>Logo</Label>
                <div className="flex items-center gap-3">
                  {form.logoPath ? (
                    <div
                      className={
                        form.logoOnDark
                          ? "flex h-14 w-24 items-center justify-center rounded-md bg-slate-900 p-1.5"
                          : "flex h-14 w-24 items-center justify-center rounded-md border border-slate-200 p-1.5"
                      }
                    >
                      <Image
                        src={form.logoPath}
                        alt="Prévia do logo"
                        width={96}
                        height={56}
                        className="h-full w-auto object-contain"
                      />
                    </div>
                  ) : (
                    <div className="flex h-14 w-24 items-center justify-center rounded-md border border-dashed border-slate-300 text-xs text-slate-400">
                      Sem logo
                    </div>
                  )}
                  <div className="flex flex-col items-start gap-1">
                    <input
                      ref={fileInput}
                      type="file"
                      accept={STORE_LOGO_ACCEPT}
                      className="hidden"
                      onChange={(e) => void handleLogoFile(e.target.files?.[0])}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isUploading}
                      onClick={() => fileInput.current?.click()}
                    >
                      {isUploading
                        ? "Enviando..."
                        : form.logoPath
                          ? "Trocar logo"
                          : "Enviar logo"}
                    </Button>
                    {form.logoPath && !isUploading && (
                      <button
                        type="button"
                        className="text-xs text-slate-500 hover:text-red-600"
                        onClick={() => setForm({ ...form, logoPath: "" })}
                      >
                        Remover logo
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-500">PNG, JPG ou WEBP, até 2 MB.</p>
                {discardedLogo && (
                  <p className="text-xs text-amber-700">
                    O logo salvo antes não era uma imagem válida para o site. Envie o
                    arquivo pelo botão acima.
                  </p>
                )}
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
              <Button onClick={() => void save()} disabled={isSaving || isUploading}>
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
                <td className="px-4 py-2.5 text-slate-700">
                  {store.name}
                  {(missingRoutes.get(store.id)?.length ?? 0) > 0 && (
                    <p className="text-xs text-amber-700">
                      Sem rota para:{" "}
                      {missingRoutes
                        .get(store.id)
                        ?.map((p) => p.name)
                        .join(", ")}
                    </p>
                  )}
                </td>
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

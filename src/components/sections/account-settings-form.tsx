"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarUploader } from "@/components/shared/avatar-uploader";
import { GamesPicker } from "@/components/shared/games-picker";
import { StorePreferencesPicker } from "@/components/shared/store-preferences-picker";
import { useAuth } from "@/lib/auth";
import { AccountError } from "@/lib/account";
import { formatCep } from "@/lib/format-cep";
import { StateAvailabilityNotice, StateSelect } from "@/components/shared/state-select";
import { formatPhone } from "@/lib/format-phone";
import { initials } from "@/lib/initials";
import type { CustomPreferredStore, GameTag } from "@/lib/types/signup";

export function AccountSettingsForm() {
  const router = useRouter();
  const { user, saveProfile, logout, updateAvatar } = useAuth();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uf, setUf] = useState(user?.address?.state ?? "");

  const [phone, setPhone] = useState(user?.phone ?? "");
  const [games, setGames] = useState<GameTag[]>(user?.games ?? []);
  const [customGames, setCustomGames] = useState<string[]>(user?.otherGames ?? []);
  const [preferredStoreIds, setPreferredStoreIds] = useState<string[]>(
    user?.preferredStoreIds ?? [],
  );
  const [customStores, setCustomStores] = useState<CustomPreferredStore[]>(
    user?.customPreferredStores ?? [],
  );

  function markUnsaved() {
    setSaved(false);
  }

  return (
    <div className="space-y-4">
      <Card className="gap-6 p-6">
        <AvatarUploader
          value={user?.avatarUrl}
          onChange={async (dataUrl) => {
            setSaveError(null);
            try {
              await updateAvatar(dataUrl);
            } catch (err) {
              setSaveError(
                err instanceof AccountError
                  ? err.message
                  : "Não foi possível enviar a foto.",
              );
            }
          }}
          fallback={
            <span className="text-2xl text-slate-500">
              {user ? initials(user.name) : ""}
            </span>
          }
        />

        <form
          className="flex flex-col gap-8"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const value = (name: string) =>
              (form.elements.namedItem(name) as HTMLInputElement).value;

            setIsSaving(true);
            setSaveError(null);
            try {
              await saveProfile({
                name: value("name"),
                email: user?.email ?? value("email"),
                avatarUrl: user?.avatarUrl,
                phone,
                address: {
                  street: value("street"),
                  number: value("number") || undefined,
                  neighborhood: value("neighborhood"),
                  city: value("city"),
                  state: uf,
                  zip: value("zip"),
                  complement: value("complement") || undefined,
                },
                games,
                otherGames: games.includes("outro") ? customGames : undefined,
                preferredStoreIds,
                customPreferredStores: customStores.filter(
                  (store) => store.name.trim() && store.address.trim(),
                ),
              });
              setSaved(true);
            } catch (err) {
              setSaveError(
                err instanceof AccountError
                  ? err.message
                  : "Não foi possível salvar. Tente novamente.",
              );
            } finally {
              setIsSaving(false);
            }
          }}
        >
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Seus dados</h3>
            <div className="space-y-1.5">
              <Label htmlFor="settings-name">Nome</Label>
              <Input
                id="settings-name"
                name="name"
                type="text"
                defaultValue={user?.name}
                autoComplete="name"
                required
                onChange={markUnsaved}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="settings-email">E-mail</Label>
                <Input
                  id="settings-email"
                  name="email"
                  type="email"
                  defaultValue={user?.email}
                  autoComplete="email"
                  required
                  readOnly
                  className="bg-slate-50 text-slate-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settings-phone">Telefone</Label>
                <Input
                  id="settings-phone"
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="(21)91234-5678"
                  maxLength={14}
                  value={phone}
                  onChange={(event) => {
                    setPhone(formatPhone(event.target.value));
                    markUnsaved();
                  }}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Endereço</h3>
            <div className="grid grid-cols-[1fr_6.5rem] gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="settings-street">Rua</Label>
                <Input
                  id="settings-street"
                  name="street"
                  type="text"
                  defaultValue={user?.address?.street}
                  autoComplete="address-line1"
                  onChange={markUnsaved}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settings-number">Número</Label>
                <Input
                  id="settings-number"
                  name="number"
                  type="text"
                  maxLength={10}
                  defaultValue={user?.address?.number}
                  onChange={markUnsaved}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="settings-neighborhood">Bairro</Label>
                <Input
                  id="settings-neighborhood"
                  name="neighborhood"
                  type="text"
                  defaultValue={user?.address?.neighborhood}
                  onChange={markUnsaved}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settings-zip">CEP</Label>
                <Input
                  id="settings-zip"
                  name="zip"
                  type="text"
                  inputMode="numeric"
                  defaultValue={user?.address?.zip ? formatCep(user.address.zip) : ""}
                  autoComplete="postal-code"
                  placeholder="00000-000"
                  maxLength={9}
                  pattern="\d{5}-\d{3}"
                  title="Informe o CEP no formato 00000-000"
                  onChange={(event) => {
                    event.target.value = formatCep(event.target.value);
                    markUnsaved();
                  }}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="settings-city">Cidade</Label>
                <Input
                  id="settings-city"
                  name="city"
                  type="text"
                  defaultValue={user?.address?.city}
                  autoComplete="address-level2"
                  onChange={markUnsaved}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settings-state">Estado</Label>
                <StateSelect
                  id="settings-state"
                  value={uf}
                  onChange={(next) => {
                    setUf(next);
                    markUnsaved();
                  }}
                />
              </div>
            </div>
            <StateAvailabilityNotice uf={uf} />
            <div className="space-y-1.5">
              <Label htmlFor="settings-complement">
                Complemento <span className="text-slate-400">(opcional)</span>
              </Label>
              <Input
                id="settings-complement"
                name="complement"
                type="text"
                defaultValue={user?.address?.complement}
                onChange={markUnsaved}
              />
            </div>
          </section>

          <section className="space-y-6">
            <h3 className="text-sm font-semibold text-slate-900">Jogatina</h3>
            <GamesPicker
              games={games}
              setGames={(next) => {
                setGames(next);
                markUnsaved();
              }}
              customGames={customGames}
              setCustomGames={(next) => {
                setCustomGames(next);
                markUnsaved();
              }}
            />
            <StorePreferencesPicker
              preferredStoreIds={preferredStoreIds}
              setPreferredStoreIds={(next) => {
                setPreferredStoreIds(next);
                markUnsaved();
              }}
              customStores={customStores}
              setCustomStores={(next) => {
                setCustomStores(next);
                markUnsaved();
              }}
            />
          </section>

          <Button type="submit" size="lg" className="w-full" disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar alterações"}
          </Button>

          <p
            role="status"
            aria-live="polite"
            className="min-h-5 text-center text-sm text-emerald-600"
          >
            {saved && "Dados salvos."}
          </p>
          {saveError && (
            <p role="alert" className="text-center text-sm text-red-600">
              {saveError}
            </p>
          )}
        </form>
      </Card>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={async () => {
          await logout();
          router.push("/");
        }}
      >
        Sair da conta
      </Button>
    </div>
  );
}
